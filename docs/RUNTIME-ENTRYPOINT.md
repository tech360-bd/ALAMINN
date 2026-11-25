# Runtime / Entrypoint

## Canonical runtime
- **Canonical env files:** `.env.config`, `.env.config.local` (no `$` expansion).
- **Legacy fallback:** `.env`, `.env.local` only when canonical files are absent; deprecated warning emitted.
- **Precedence:** process env > `.env.config.local` > `.env.config` > `.env.local` > `.env`.

## Entrypoints
- **Repo-root `server.js`**: canonical wrapper for VPS/cPanel/Docker. Loads env with canonical precedence, validates required production secrets, locates standalone server, installs bounded shutdown safety net, then requires Next standalone server.
- **`.next/standalone/server.js`**: Next-generated server. Docker wrapper hands off to it as `server.standalone.js`.

## Docker
- Dockerfile copies standalone output, renames standalone `server.js` to `server.standalone.js`, then copies repo-root `server.js` wrapper.
- `CMD ["node", "server.js"]` runs the wrapper.
- Provide required secrets via `env_file` or deployment secret manager. Do not hardcode secrets in compose YAML.

## Graceful shutdown limitation
The wrapper installs SIGTERM/SIGINT handlers and an unref'd 10s safety-net timeout (forced exit code 1). It does not have direct access to the Next standalone HTTP server handle, so full in-flight drain is best-effort depending on runtime behavior.
