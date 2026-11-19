import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [address, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, bits, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, bits] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) {
  blocked.addSubnet(address, bits, "ipv6");
}

export function isPublicSourceAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  return family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

export function approvedSourceUrl(value: string, source: URL): URL {
  const url = new URL(value, source);
  if (url.protocol !== "https:" || url.hostname.endsWith(".") || isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
      url.origin !== source.origin || url.port || url.username || url.password) {
    throw new Error("URL must belong to the approved public HTTPS source");
  }
  url.hash = "";
  return url;
}

async function resolvePublicHost(host: string, signal: AbortSignal) {
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  try {
    const addresses = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
    if (!addresses.length || addresses.some(({ address }) => !isPublicSourceAddress(address))) {
      throw new Error("Source does not resolve exclusively to public addresses");
    }
    return addresses[0];
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export async function fetchApprovedSource(target: URL, source: URL, options: { userAgent: string; maxBytes: number; timeout: number; allowPath?: (url: URL) => void }) {
  const signal = AbortSignal.timeout(options.timeout);
  let url = target;
  for (let redirects = 0; redirects <= 3; redirects++) {
    url = approvedSourceUrl(url.href, source);
    options.allowPath?.(url);
    const pinned = await resolvePublicHost(url.hostname, signal);
    // Pin the validated address to this connection while retaining hostname TLS validation.
    // Disable pooled sockets so a previously established connection cannot bypass the check.
    const result = await new Promise<{ status: number; location?: string; body: Buffer }>((resolve, reject) => {
      const req = request(url, {
        signal,
        agent: false,
        family: pinned.family,
        lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
        headers: { "User-Agent": options.userAgent, Accept: "text/html,text/plain,application/xhtml+xml" },
      }, (res) => {
        const status = res.statusCode ?? 502;
        if (status < 200 || status >= 300) {
          resolve({ status, location: res.headers.location, body: Buffer.alloc(0) });
          res.destroy();
          return;
        }
        if (Number(res.headers["content-length"]) > options.maxBytes) {
          reject(new Error("Source response exceeds size limit"));
          res.destroy();
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("error", reject);
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            reject(new Error("Source response exceeds size limit"));
            res.destroy();
          } else chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, body: Buffer.concat(chunks) }));
      });
      req.on("error", reject);
      req.end();
    });
    if (![301, 302, 303, 307, 308].includes(result.status)) return { ...result, finalUrl: url.href };
    if (!result.location || redirects === 3) throw new Error("Source redirect limit reached or missing destination");
    url = approvedSourceUrl(new URL(result.location, url).href, source);
  }
  throw new Error("Source redirect limit reached");
}
