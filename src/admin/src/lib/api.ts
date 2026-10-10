/**
 * Backend API client.
 *
 * The backend answers with `{ status: 'success' | 'error', data?, message? }`.
 * `request()` unwraps that envelope and throws a typed `ApiError` on failure so
 * callers only ever deal with the payload.
 */

import { MOCK_ENABLED, mockLogin, mockResponse } from "@/lib/mock-data";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api"
).replace(/\/$/, "");

const TOKEN_KEY = "admin.token";

/**
 * With `NEXT_PUBLIC_MOCK=1` every call is answered from the local fixtures
 * instead of the network — for reviewing or demoing the console without a
 * database. A short delay keeps the loading states honest.
 */
function mockDelay() {
  return new Promise((resolve) => setTimeout(resolve, 120));
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }

  /** Session expired / not an admin — the shell redirects to login on this. */
  get isAuthError() {
    return this.status === 401 || this.status === 403;
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
  // Mirrored to a cookie so middleware can gate routes before React boots.
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
}

export function clearToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; samesite=lax`;
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

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { query, body, formData, anonymous, headers, ...init } = options;

  if (MOCK_ENABLED) {
    await mockDelay();
    const envelope = mockResponse(path, query) as { data?: unknown };
    return (envelope?.data ?? envelope) as T;
  }

  const finalHeaders = new Headers(headers);
  if (!anonymous) {
    const token = getToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
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
      "Cannot reach the API. Check that the backend is running.",
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
    throw new ApiError(message, response.status, parsed);
  }

  // Unwrap `{ status, data }`; endpoints that return a bare object pass through.
  const envelope = parsed as { status?: string; data?: unknown } | null;
  if (envelope && typeof envelope === "object" && "data" in envelope) {
    return envelope.data as T;
  }
  return parsed as T;
}

/**
 * Same as `request()` but returns the whole envelope. Paginated list endpoints
 * put `total` / `page` / `totalPages` *beside* `data`, so unwrapping would drop
 * exactly the fields the pager needs.
 */
export async function requestRaw<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  // Re-implemented rather than composed: `request()` unwraps unconditionally.
  const { query, body, formData, anonymous, headers, ...init } = options;

  if (MOCK_ENABLED) {
    await mockDelay();
    return mockResponse(path, query) as T;
  }

  const finalHeaders = new Headers(headers);
  if (!anonymous) {
    const token = getToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
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
      "Cannot reach the API. Check that the backend is running.",
      0
    );
  }

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new ApiError(
      (parsed as { message?: string })?.message ??
        `Request failed with status ${response.status}`,
      response.status,
      parsed
    );
  }

  return parsed as T;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Fetches a paginated list. `key` names the array inside `data`
 * (e.g. "orders", "users", "restaurants").
 */
export async function fetchList<T>(
  path: string,
  key: string,
  query?: Record<string, QueryValue>
): Promise<PaginatedResult<T>> {
  const envelope = await requestRaw<{
    data?: Record<string, unknown> | T[];
    total?: number;
    page?: number;
    totalPages?: number;
  }>(path, { method: "GET", query });

  const data = envelope?.data;
  let items: T[] = [];
  if (Array.isArray(data)) {
    items = data as T[];
  } else if (data && typeof data === "object") {
    const candidate = (data as Record<string, unknown>)[key];
    if (Array.isArray(candidate)) {
      items = candidate as T[];
    } else {
      // Some endpoints name the array differently; take the first array found.
      const firstArray = Object.values(data).find(Array.isArray);
      items = (firstArray as T[]) ?? [];
    }
  }

  const total = envelope?.total ?? items.length;
  const page = envelope?.page ?? 1;
  const totalPages =
    envelope?.totalPages ?? Math.max(1, Math.ceil(total / Math.max(items.length, 1)));

  return { items, total, page, totalPages };
}

/**
 * Fetch a file the API only hands to a logged-in admin, and save it.
 *
 * A plain link cannot do this. The browser navigates without the
 * Authorization header, the API sees an anonymous request and answers with
 * its "please log in" JSON - which is what downloads instead of the file.
 * So the file is fetched with the header on and turned into a download here.
 */
export async function downloadFile(
  path: string,
  fallbackName: string,
  options: RequestOptions = {}
): Promise<void> {
  // A download is a GET; `body` and `formData` have no place in it.
  const { query, anonymous, headers, body, formData, ...init } = options;
  void body;
  void formData;

  const finalHeaders = new Headers(headers);
  if (!anonymous) {
    const token = getToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      headers: finalHeaders,
    });
  } catch {
    throw new ApiError(
      "Cannot reach the API. Check that the backend is running.",
      0
    );
  }

  if (!response.ok) {
    // An error here is JSON, not a file; read it so the user sees the reason.
    let message = `Download failed (${response.status})`;
    try {
      const parsed = await response.json();
      if (parsed?.message) message = String(parsed.message);
    } catch {
      // Not JSON either. The status will have to do.
    }
    throw new ApiError(message, response.status);
  }

  // Prefer the name the server gave, so the file is called what it is.
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "GET" }),
  raw: requestRaw,
  list: fetchList,
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
  upload: <T>(path: string, formData: FormData, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", formData }),
  download: downloadFile,
};

/* ── Auth ───────────────────────────────────────────────────────────────── */

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  avatar?: string;
}

interface LoginResponse {
  status: string;
  token: string;
  data: { user: AdminUser };
}

/** Raised when the password was right but a code from the app is still needed. */
export class TwoFactorRequired extends Error {
  constructor(readonly challenge: string) {
    super("Enter the 6-digit code from your authenticator app.");
    this.name = "TwoFactorRequired";
  }
}

/** The second half of signing in: exchanges the challenge for a session. */
export async function completeTwoFactorLogin(challenge: string, code: string) {
  const response = await fetch(buildUrl("/admin/auth/2fa/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge, token: code }),
  }).catch(() => {
    throw new ApiError("Cannot reach the API. Check that the backend is running.", 0);
  });

  const parsed = (await response.json().catch(() => null)) as
    | (LoginResponse & { message?: string })
    | null;

  if (!response.ok || !parsed?.token) {
    throw new ApiError(parsed?.message ?? "That code was not accepted.", response.status);
  }

  setToken(parsed.token);
  return parsed.data.user;
}

export async function login(email: string, password: string) {
  if (MOCK_ENABLED) {
    await mockDelay();
    const mocked = mockLogin();
    setToken(mocked.token);
    return mocked.data.user;
  }

  // Login returns the token *outside* `data`, so it bypasses `request()`.
  const response = await fetch(buildUrl("/admin/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).catch(() => {
    throw new ApiError(
      "Cannot reach the API. Check that the backend is running.",
      0
    );
  });

  const parsed = (await response.json().catch(() => null)) as
    | (LoginResponse & { requiresTwoFactor?: boolean; challenge?: string })
    | null;

  /**
   * With two-step sign-in on, the password buys a challenge and no session.
   * Thrown rather than returned so every existing caller keeps its shape:
   * the login screen catches this one and asks for the code.
   */
  if (response.ok && parsed?.requiresTwoFactor && parsed.challenge) {
    throw new TwoFactorRequired(parsed.challenge);
  }

  if (!response.ok || !parsed?.token) {
    throw new ApiError(
      (parsed as { message?: string } | null)?.message ?? "Login failed",
      response.status,
      parsed
    );
  }

  setToken(parsed.token);
  return parsed.data.user;
}

export function logout() {
  clearToken();
}
