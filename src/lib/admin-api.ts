/**
 * Admin API client — frontend only (Rule 1d / Rule 9.7).
 * ----------------------------------------------------
 * Every admin request goes through here so that:
 *
 *   - `credentials: "include"` is always set, and the httpOnly
 *     `auth_token` cookie authenticates the request.
 *   - A 401 sends the browser to `/admin/login` (once), instead of
 *     leaving the UI in a half-loaded state.
 *   - No token is ever read from localStorage and no
 *     `Authorization: Bearer` header is ever sent. There is ONE auth
 *     mechanism: the JWT session cookie.
 *
 * Usage (client components):
 *   const { data } = await adminApi.get<Contact[]>("/api/v1/admin/contacts");
 *   await adminApi.post("/api/v1/admin/contacts", { name: "..." });
 *
 * Server-side route helpers live in `@/lib/admin-api-server`; do not import
 * this module from a route handler.
 */

export type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  meta?: Record<string, unknown>;
  message?: string;
  error?: string | null;
  errors?: unknown[];
};

export class ApiError extends Error {
  status: number;
  errors: unknown[];

  constructor(message: string, status: number, errors: unknown[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

function adminLoginUrl(): string {
  if (typeof window === "undefined") return "/admin/login";
  const next = window.location.pathname + window.location.search;
  const safeNext = next.startsWith("/admin") && next !== "/admin/login" ? next : "/admin";
  return `/admin/login?next=${encodeURIComponent(safeNext)}`;
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/admin/login") return;
  window.location.assign(adminLoginUrl());
}

/** Resolve a path: full `/api/...` paths pass through, bare names are admin-scoped. */
function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    throw new ApiError("Absolute URLs are not allowed in the admin client.", 400);
  }
  if (path.startsWith("/")) return path;
  return `/api/v1/admin/${path.replace(/^\/+/, "")}`;
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Plain object — serialized as JSON automatically. */
  body?: unknown;
  /** Query string parameters. */
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /** Set false to handle 401 yourself (defaults to true). */
  redirectOn401?: boolean;
};

/**
 * Low-level request helper. Throws `ApiError` for non-2xx responses.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiEnvelope<T>> {
  const { method = "GET", body, query, signal, redirectOn401 = true } = options;

  let url = resolveUrl(path);
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const headers: Record<string, string> = { accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      payload = body; // browser sets the multipart boundary
    } else {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: payload,
      signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Network error — check your connection and try again.", 0);
  }

  if (res.status === 401) {
    if (redirectOn401) redirectToLogin();
    throw new ApiError("Your session has expired. Please sign in again.", 401, ["unauthenticated"]);
  }

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !json || json.success !== true) {
    const message =
      json?.error ||
      json?.message ||
      (res.status === 403
        ? "You do not have permission to do that."
        : `Request failed (${res.status}).`);
    throw new ApiError(message, res.status, json?.errors ?? []);
  }

  return json;
}

export const adminApi = {
  request: apiRequest,
  /**
   * GET a resource. `path` may be a full `/api/v1/admin/...` path or a bare
   * resource name such as `"contacts"`.
   */
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    apiRequest<T>(path, { method: "GET", query, signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "DELETE", body }),
};
