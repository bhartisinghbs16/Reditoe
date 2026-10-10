/**
 * Backend API client.
 *
 * The backend answers with `{ status: 'success' | 'error', data?, message? }` —
 * except a couple of vendor endpoints that answer `{ success: true, data }`.
 * `request()` unwraps either envelope and throws a typed `ApiError` on failure,
 * so callers only ever deal with the payload.
 *
 * Same contract as the admin console's client; kept as its own file because the
 * two apps store their tokens under different keys and must not sign each other
 * in or out.
 */

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api"
).replace(/\/$/, "");

/**
 * An uploaded file's absolute URL.
 *
 * The API reports uploads relative to its own origin — "/uploads/menu-items/…"
 * — so that an absolute http://localhost:5000 does not leak into everyone
 * else's browser. This console is served from a different origin, where that
 * path resolves against the console and 404s. Every uploaded hotel and menu
 * photograph was broken here for that reason.
 *
 * Anything already absolute (S3, a CDN) passes through untouched.
 */
export function mediaUrl(value?: string | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  return `${API_BASE_URL.replace(/\/api\/?$/, "")}/${raw.replace(/^\/+/, "")}`;
}

/**
 * The inverse of `mediaUrl`, for anything on its way back to the database.
 *
 * Display URLs are absolute; stored ones must not be. Saving what was rendered
 * would write this machine's own origin into the record — "http://localhost:5000/…"
 * — and that resolves to the reader's own machine, breaking the image for
 * everyone else. Only our own origin is stripped; an S3 or CDN URL is somebody
 * else's address and is stored as it stands.
 */
export function toStoredMedia(value?: string | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const origin = API_BASE_URL.replace(/\/api\/?$/, "");
  if (origin && raw.startsWith(`${origin}/`)) return raw.slice(origin.length);
  return raw;
}

const TOKEN_KEY = "vendor.token";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }

  /** Session expired / not a vendor — the shell redirects to login on this. */
  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  /** The backend was unreachable, as opposed to answering with an error. */
  get isOffline() {
    return this.status === 0;
  }
}

/* ── Token storage ──────────────────────────────────────────────────────── */

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Told when a request comes back unauthenticated, so the shell can sign out
 * and route to login. Registered by the auth provider; a module-level slot
 * rather than an import so this file stays free of React and routing.
 */
type AuthFailureHandler = (message: string) => void;
let authFailureHandler: AuthFailureHandler | null = null;

export function setAuthFailureHandler(handler: AuthFailureHandler | null) {
  authFailureHandler = handler;
}

function notifyAuthFailure(message: string) {
  authFailureHandler?.(message);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

/* ── Core request ───────────────────────────────────────────────────────── */

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** Serialised to a query string; null/undefined/"" entries are dropped. */
  query?: Record<string, QueryValue>;
  /** JSON body. Use `formData` for uploads instead. */
  body?: unknown;
  formData?: FormData;
  /** Skip the Authorization header (login, public endpoints). */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Returns the whole parsed body — used by login, which needs `token` too. */
export async function requestRaw<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { query, body, formData, anonymous, headers, ...init } = options;

  const finalHeaders = new Headers(headers);
  let sentToken = false;
  if (!anonymous) {
    const token = getToken();
    if (token) {
      finalHeaders.set("Authorization", `Bearer ${token}`);
      sentToken = true;
    }
  }
  // A free ngrok host answers browser requests with an HTML interstitial
  // unless this is present, which would reach us as a JSON parse failure on
  // every call. Harmless anywhere else.
  if (/\bngrok[-.]/.test(API_BASE_URL)) {
    finalHeaders.set("ngrok-skip-browser-warning", "1");
  }

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData; // let the browser set the multipart boundary
  } else if (body !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      headers: finalHeaders,
      body: payload,
    });
  } catch {
    throw new ApiError(
      "Cannot reach the API. Check that the backend is running on " +
        API_BASE_URL.replace(/\/api$/, "") +
        ".",
      0
    );
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      (parsed as { message?: string })?.message ??
      `Request failed with status ${response.status}`;

    /**
     * The session has stopped being one.
     *
     * A token can outlive the account it names — the user was deleted, the
     * signing secret rotated, the account suspended. The console checked for
     * that only at boot, so a vendor who was already looking at their orders
     * had it surface as a raw "the user belonging to this token does not
     * exist" the moment they pressed Accept, with no way out but a manual
     * reload.
     *
     * Announcing it here means any call, anywhere, ends the session cleanly
     * and lands them on sign-in.
     */
    // Only when a token was actually presented. A refused sign-in is also a
    // 401, and reporting "your session ended" to someone who mistyped their
    // password is both wrong and alarming.
    if (response.status === 401 && sentToken) {
      clearToken();
      notifyAuthFailure(message);
    }

    throw new ApiError(message, response.status, parsed);
  }

  return parsed as T;
}

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const parsed = await requestRaw<unknown>(path, options);

  // Unwrap `{ status, data }` and `{ success, data }`; endpoints that return a
  // bare object pass through untouched.
  const envelope = parsed as { data?: unknown } | null;
  if (envelope && typeof envelope === "object" && "data" in envelope) {
    return envelope.data as T;
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>) =>
    request<T>(path, { query }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
