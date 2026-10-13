import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The single door to the backend.
 *
 * Every screen goes through the store, and the store goes through here, so
 * the base URL, the bearer token and error handling live in one place.
 *
 * Point the app at a different API by setting EXPO_PUBLIC_API_URL — Expo
 * inlines EXPO_PUBLIC_* at build time, so it must be a literal member access,
 * not a computed lookup.
 */

/**
 * Where the live platform runs.
 *
 * A release build must never fall back to localhost: on a phone that address
 * is the phone itself, so every request fails and the app looks completely
 * broken. EXPO_PUBLIC_API_URL is meant to carry the address in, but it only
 * reaches the bundler on some build paths, and a default that is right only
 * on a developer's laptop is the wrong default to trust.
 */
const PRODUCTION_API = "https://api.reditoe.com/api";

const DEFAULT_BASE = __DEV__ ? "http://localhost:5000/api" : PRODUCTION_API;

export const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_BASE).replace(/\/+$/, "");

/** The host of an API base, whatever shape it takes ("/api" included). */
function apiHost(base: string) {
  try {
    return new URL(base, "http://localhost").hostname;
  } catch {
    return "";
  }
}

/**
 * The ngrok interstitial header, and only when it is needed.
 *
 * A free ngrok tunnel answers browser-shaped requests with an HTML page
 * instead of the response. This header suppresses that — but sending it to
 * every host is not free in a browser: it is not a CORS-safelisted header, so
 * it turns every call into a preflighted one, and any API that does not name
 * it in Access-Control-Allow-Headers blocks the lot. That is exactly what
 * happened on the web builds: nothing loaded and sign-in reported the server
 * as unreachable. Sent to ngrok hosts alone now.
 */
export const NGROK_HEADERS: Record<string, string> =
  /(^|\.)ngrok(-free)?\.(app|dev|io)$/.test(apiHost(API_BASE))
    ? { "ngrok-skip-browser-warning": "true" }
    : {};


/** How long any one request is given before it is abandoned. */
const TIMEOUT_MS = 20000;

/**
 * An uploaded file's absolute URL.
 *
 * The API stores uploads under its own origin and reports them relative —
 * "/uploads/menu-items/1786…png" — since an absolute http://localhost:5000 only
 * resolves on the machine that ran the server. This app is not served from that
 * origin, so a relative path loads nothing, and the caller falls through to a
 * stand-in photograph: the vendor uploads a picture of their dish and the app
 * shows a stock picture of a different one.
 *
 * Anything already absolute (S3, a CDN) passes through untouched.
 */
export function mediaUrl(value?: string | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  // API_BASE ends in /api; uploads are served from the origin above it.
  return `${API_BASE.replace(/\/api\/?$/, "")}/${raw.replace(/^\/+/, "")}`;
}

const TOKEN_KEY = "reditoe.vendor.token";

/* ── Token ──────────────────────────────────────────────────────────────── */

let cachedToken: string | null = null;

/**
 * Told when a request comes back unauthenticated, so the store can sign out.
 * A module-level slot rather than an import, to keep this file free of React.
 */
let unauthorizedHandler: ((message: string) => void) | null = null;

export function setUnauthorizedHandler(handler: ((message: string) => void) | null) {
  unauthorizedHandler = handler;
}

function notifyUnauthorized(message: string) {
  unauthorizedHandler?.(message);
}

export async function loadToken() {
  if (cachedToken !== null) return cachedToken;
  cachedToken = (await AsyncStorage.getItem(TOKEN_KEY)) ?? "";
  return cachedToken;
}

export async function setToken(token: string | null) {
  cachedToken = token ?? "";
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

export class ApiError extends Error {
  status: number;
  /** True when the session is gone and the user has to sign in again. */
  unauthorized: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.unauthorized = status === 401;
  }
}

/**
 * The API answers with `{ status: 'error', message }` on failure and either
 * `{ data: … }` or a bare object on success, so unwrap both shapes here rather
 * than making every caller check.
 */
async function requestRaw(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal } = {}
): Promise<any> {
  const { method = "GET", body, auth = true, signal } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...NGROK_HEADERS,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let sentToken = false;
  if (auth) {
    const token = await loadToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      sentToken = true;
    }
  }

  /**
   * Every request gets a deadline.
   *
   * Without one a stalled connection - a tunnel that has gone away, a phone
   * that has drifted off the network - leaves the screen spinning with
   * nothing said, for as long as the vendor is willing to look at it. Twenty
   * seconds is long enough to outlast anything the server legitimately waits
   * on, including an SMS provider or a payment gateway.
   *
   * A signal from the caller still cancels: whichever fires first wins.
   */
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), TIMEOUT_MS);
  const timedOut = () => deadline.signal.aborted && !signal?.aborted;
  const relay = () => deadline.abort();
  signal?.addEventListener("abort", relay);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: deadline.signal,
    });
  } catch (error) {
    // fetch only rejects on network failure or an abort — say which, because
    // "Failed to fetch" tells a vendor nothing.
    throw new ApiError(
      timedOut()
        ? "The server took too long to answer. Please try again."
        : `Can't reach the server at ${API_BASE}. Check that the backend is running.`,
      0
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.message ??
      payload?.error ??
      `Request failed (${response.status} ${response.statusText})`;

    /**
     * The session has stopped being one — the account was removed, the signing
     * secret rotated, the token expired. Announced here so it ends the session
     * wherever it happens: the store only checked while loading data, so a
     * token that died mid-session surfaced as a raw API error on whatever the
     * vendor pressed next rather than as "sign in again".
     *
     * Only when a token was actually sent: a refused sign-in is also a 401,
     * and it is not a session ending.
     */
    if (response.status === 401 && sentToken) {
      notifyUnauthorized(message);
    }

    throw new ApiError(message, response.status);
  }

  return payload;
}

/** Most callers want the `data` envelope unwrapped. */
async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal } = {}
): Promise<T> {
  const payload = await requestRaw(path, options);
  return (payload?.data ?? payload) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "POST", body, auth }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  // Takes a body: withdrawing a push token names the token being withdrawn.
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body }),
};

/* ── Auth ───────────────────────────────────────────────────────────────── */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
}

/**
 * Sign-in is by mobile number and a one-time code, and nothing else. There is no
 * password: a kitchen phone is shared and passwords get lost.
 */

/**
 * Asks for a code to be texted to a mobile number.
 *
 * The role is sent so the server knows which door was knocked on. It answers the
 * same way whether or not the number has an account - that is for the person who
 * proves they hold it to find out - and hands the code back as `devOtp` only
 * when it has no way to send a text, which is never the case in production.
 */
export async function sendOtp(
  phone: string
): Promise<{ devOtp?: string; resendAfterSeconds?: number }> {
  const body = await requestRaw("/auth/send-otp", {
    method: "POST",
    body: { phone, role: "vendor" },
    auth: false,
  });
  return { devOtp: body?.devOtp, resendAfterSeconds: body?.data?.resendAfterSeconds };
}

/** What checking a code can come to. */
export type VerifyResult =
  /** The number has a vendor account: signed in, session stored. */
  | { isNewUser: false; user: SessionUser }
  /**
   * It does not: nothing exists yet, and this proof is what sign-up trades on.
   * `resume` is set when the number does have an account - one whose sign-up
   * stopped before the restaurant was saved - and says whose, so the form can
   * finish it rather than start again.
   */
  | { isNewUser: true; phone: string; phoneProof: string; resume?: { name: string; email: string } | null };

/**
 * Exchanges the code for a session - or, for a number nobody has registered, a
 * proof that it was verified.
 *
 * `role` is what stops a customer's code opening the vendor app; the server
 * refuses when the account is not a vendor, and the check belongs there rather
 * than here where it could simply be skipped.
 */
export async function verifyOtp(phone: string, otp: string): Promise<VerifyResult> {
  const body = await requestRaw("/auth/verify-otp", {
    method: "POST",
    body: { phone, otp, role: "vendor" },
    auth: false,
  });

  if (body?.isNewUser) {
    if (!body.phoneProof) throw new ApiError("The server did not confirm that number.", 500);
    return {
      isNewUser: true,
      phone: body.phone ?? phone,
      phoneProof: body.phoneProof,
      resume: body.resumeRegistration
        ? { name: body.account?.name ?? "", email: body.account?.email ?? "" }
        : null,
    };
  }

  if (!body?.token) throw new ApiError("Sign-in succeeded but no token was returned.", 500);

  const user = body?.data?.user as SessionUser | undefined;
  if (!user || user.role !== "vendor") {
    throw new ApiError("That account isn't a vendor account.", 403);
  }

  await setToken(body.token);
  return { isNewUser: false, user };
}

/** One support conversation, with everything said in it so far. */
export interface SupportTicket {
  _id: string;
  subject: string;
  message: string;
  status: "open" | "in-progress" | "resolved" | "closed";
  category?: string;
  createdAt?: string;
  conversation?: {
    message: string;
    sender: "user" | "admin";
    timestamp?: string;
  }[];
}

/**
 * Support, as conversations rather than a live chat socket.
 *
 * A support desk is not always at a screen, and a message that waits is
 * better than one lost because nobody was online to catch it. Each is
 * answered from the admin console and the reply lands back here.
 */
export async function supportTickets(): Promise<SupportTicket[]> {
  const body = await request<{ tickets?: SupportTicket[] } | SupportTicket[]>(
    "/support/tickets"
  );
  return Array.isArray(body) ? body : (body.tickets ?? []);
}

export async function supportTicket(id: string): Promise<SupportTicket> {
  const body = await request<{ ticket?: SupportTicket } & SupportTicket>(
    `/support/tickets/${id}`
  );
  return body.ticket ?? body;
}

export async function openSupportTicket(input: {
  subject: string;
  message: string;
  category?: string;
}): Promise<SupportTicket> {
  const body = await request<{ ticket?: SupportTicket } & SupportTicket>(
    "/support/tickets",
    { method: "POST", body: input }
  );
  return body.ticket ?? body;
}

export async function replyToSupportTicket(
  id: string,
  message: string
): Promise<SupportTicket> {
  const body = await request<{ ticket?: SupportTicket } & SupportTicket>(
    `/support/tickets/${id}/message`,
    { method: "POST", body: { message } }
  );
  return body.ticket ?? body;
}

/**
 * Uploads one KYC document.
 *
 * Multipart, so the JSON helpers do not apply: the boundary has to be set by
 * the runtime, which means not setting Content-Type here at all.
 */
/**
 * Sends a menu spreadsheet to the vendor's own restaurant.
 *
 * No restaurant id: the route resolves it from the signed-in vendor, so one
 * vendor cannot import a menu into another's kitchen.
 */
export async function uploadMenuSheet(body: FormData) {
  const token = await loadToken();
  const response = await fetch(`${API_BASE}/vendor/menu/import`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...NGROK_HEADERS,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(payload?.message ?? `Import failed (${response.status})`, response.status);
  }
  return payload;
}

export async function uploadKycDocument(body: FormData) {
  const token = await loadToken();
  const response = await fetch(`${API_BASE}/vendor/kyc/upload`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...NGROK_HEADERS,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(
      payload?.message ?? `Upload failed (${response.status})`,
      response.status
    );
  }
  return payload?.data ?? payload;
}

export async function logout() {
  await setToken(null);
}

export interface RegistrationDraft {
  /** Proof from the verification endpoints; registration is refused without it. */
  emailProof?: string | null;
  phoneProof?: string | null;
  referralCode?: string;
  restaurantName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  zipCode: string;
  cuisine: string;
  contactPersonName: string;
  /** Captured on the first step, from the device. */
  latitude?: string;
  longitude?: string;
  /** Optional: collected on the sign-up wizard's bank step. */
  accountHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  accountType?: string;
}

/**
 * Register a restaurant.
 *
 * `POST /vendor/register` returns a token when it creates or recognises the
 * account, so a successful registration signs the vendor straight in — which
 * is what "Go to Login" on the confirmation step then has nothing to do.
 */
export async function registerVendor(draft: RegistrationDraft) {
  const body = await requestRaw("/vendor/register", {
    method: "POST",
    body: {
      restaurantName: draft.restaurantName.trim(),
      // Proof the server issued when each contact detail was confirmed.
      emailProof: draft.emailProof,
      phoneProof: draft.phoneProof,
      referralCode: draft.referralCode?.trim() || undefined,
      email: draft.email.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      street: draft.street.trim(),
      city: draft.city.trim(),
      zipCode: draft.zipCode.trim(),
      cuisine: draft.cuisine.trim(),
      contactPersonName: draft.contactPersonName.trim(),
      contactPersonNumber: draft.phone.trim() || undefined,
      // Where the restaurant is. Dispatch measures rider distance from these.
      ...(draft.latitude && draft.longitude
        ? { latitude: Number(draft.latitude), longitude: Number(draft.longitude) }
        : {}),
      // Only when there is something to send — an empty object would
      // overwrite nothing but says the vendor supplied details they did not.
      ...(draft.accountNumber || draft.bankName
        ? {
            bankDetails: {
              accountHolderName: draft.accountHolderName,
              bankName: draft.bankName,
              accountNumber: draft.accountNumber,
              ifsc: draft.ifsc,
              accountType: draft.accountType,
            },
          }
        : {}),
    },
    auth: false,
  });

  if (body?.token) await setToken(body.token);

  return {
    token: body?.token as string | undefined,
    user: (body?.data?.user ?? body?.user) as SessionUser | undefined,
    /*
     * The reference the vendor quotes and the admin searches for - the
     * server's own, not one derived here. The completion screen used to cut
     * twelve characters off the Mongo id, which matched nothing else.
     */
    applicationId: String(
      body?.data?.restaurant?.outletId ??
        body?.restaurant?.outletId ??
        body?.data?.restaurant?._id ??
        body?.restaurant?._id ??
        ""
    ),
    message: String(body?.message ?? "Registration submitted."),
  };
}
