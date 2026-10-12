/**
 * Backend API client.
 *
 * The backend answers with `{ status: 'success' | 'error', data?, message? }`.
 * `request()` unwraps that envelope and throws a typed `ApiError` on failure, so
 * callers only ever deal with the payload.
 *
 * The base URL comes from `EXPO_PUBLIC_API_URL` (see `.env`). On a phone,
 * `localhost` is the phone itself — point that variable at your machine's LAN
 * address when running on a device.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

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

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? "http://localhost:5000/api" : PRODUCTION_API)
).replace(/\/$/, "");

/** How long any one request is given before it is abandoned. */
const TIMEOUT_MS = 20000;

const TOKEN_KEY = "delivery.token";


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
  /(^|\.)ngrok(-free)?\.(app|dev|io)$/.test(apiHost(API_BASE_URL))
    ? { "ngrok-skip-browser-warning": "true" }
    : {};

/** Headers every request carries. */
const BASE_HEADERS: Record<string, string> = {
  Accept: "application/json",
  ...NGROK_HEADERS,
};

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }

  /** Session expired, or the account is not a rider — callers sign out on this. */
  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  /** The request never reached the server. */
  get isOffline() {
    return this.status === 0;
  }
}

/* ── Token ──────────────────────────────────────────────────────────────── */

/**
 * Kept in memory as well as on disk: every request reads it, and hitting
 * storage on each one is both slow and needless.
 */
let token: string | null = null;

export async function loadToken() {
  if (token) return token;
  token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  return token;
}

export async function setToken(next: string | null) {
  token = next;
  if (next) await AsyncStorage.setItem(TOKEN_KEY, next).catch(() => {});
  else await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}

export function currentToken() {
  return token;
}

/* ── Request ────────────────────────────────────────────────────────────── */

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header — login and register. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export async function request<T = unknown>(
  path: string,
  { method = "GET", body, anonymous, signal }: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (!anonymous) {
    const bearer = await loadToken();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
  }

  /**
   * Every request gets a deadline.
   *
   * Without one a stalled connection leaves a rider watching a spinner with
   * nothing said - and a rider is usually the one on the worst connection,
   * outdoors and moving. Twenty seconds outlasts anything the server
   * legitimately waits on.
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
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: deadline.signal,
    });
  } catch (cause) {
    // A network failure has no status; surface it as one so callers can tell
    // "the server said no" from "the server was never reached".
    throw new ApiError(
      timedOut()
        ? "The server took too long to answer. Please try again."
        : `Could not reach the server at ${API_BASE_URL}. Is the backend running?`,
      0,
      cause
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
      payload = text;
    }
  }

  if (!response.ok || payload?.status === "error" || payload?.status === "fail") {
    throw new ApiError(
      payload?.message || `Request failed (${response.status})`,
      response.status,
      payload
    );
  }

  // Most endpoints nest the useful part under `data`; a few return it flat.
  return (payload?.data ?? payload) as T;
}

/* ── Endpoints ──────────────────────────────────────────────────────────── */

export interface LoginResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    riderId?: string;
    isOnline?: boolean;
  };
}

/**
 * Sign-in is by mobile number and a one-time code, and nothing else. There is no
 * password: a rider on the road loses one more often than they lose their phone.
 */
const authCall = async (path: string, body: Record<string, unknown>) => {
  const raw = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((cause) => {
    throw new ApiError(
      `Could not reach the server at ${API_BASE_URL}. Is the backend running?`,
      0,
      cause
    );
  });

  // A proxy's error page is not JSON; say so plainly rather than "Unexpected token <".
  const payload = await raw.json().catch(() => null);
  if (!raw.ok || payload?.success === false || payload?.status === "error") {
    throw new ApiError(
      payload?.message || "Something went wrong. Please try again.",
      raw.status,
      payload
    );
  }
  return payload ?? {};
};

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
  const payload = await authCall("/auth/send-otp", { phone, role: "rider" });
  return {
    devOtp: payload.devOtp,
    resendAfterSeconds: payload.data?.resendAfterSeconds,
  };
}

/** What checking a code can come to. */
export type VerifyResult =
  /** The number has a partner account: signed in, session stored. */
  | { isNewUser: false; user: LoginResult["user"] }
  /** It does not: nothing exists yet, and this proof is what sign-up trades on. */
  | { isNewUser: true; phone: string; phoneProof: string };

/**
 * Exchanges the code for a session - or, for a number nobody has registered, a
 * proof that it was verified.
 *
 * The role is what stops a customer's code opening the partner app: the server
 * refuses when the account is not a partner, and that check belongs there
 * rather than here where it could simply be skipped.
 */
export async function verifyOtp(phone: string, otp: string): Promise<VerifyResult> {
  const payload = await authCall("/auth/verify-otp", { phone, otp, role: "rider" });

  if (payload.isNewUser) {
    if (!payload.phoneProof) {
      throw new ApiError("The server did not confirm that number.", 500, payload);
    }
    return { isNewUser: true, phone: payload.phone ?? phone, phoneProof: payload.phoneProof };
  }

  if (!payload.token || payload.data?.user?.role !== "rider") {
    throw new ApiError("This account is not a delivery partner.", 403, payload);
  }

  await setToken(payload.token);
  return { isNewUser: false, user: payload.data.user };
}

export async function logout() {
  await setToken(null);
}

/** The conversation between a customer and the partner delivering an order. */
export interface OrderChat {
  orderId: string;
  orderNumber?: string | null;
  status?: string;
  /** False once the order is finished; the thread is then read-only. */
  open: boolean;
  you: "customer" | "rider";
  messages: {
    sender: "customer" | "rider";
    message: string;
    sentAt?: string;
    mine: boolean;
  }[];
}

/** One support conversation, with everything said in it so far. */
export interface SupportTicket {
  _id: string;
  /** The reference a rider can quote to support, e.g. CHT-NYQJQ78TY. */
  ticketNumber?: string;
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

const unwrapTicket = (body: any): SupportTicket => body?.ticket ?? body;

export const api = {
  /** The conversation with the customer about one order. */
  orderChat: (orderId: string) => request<OrderChat>(`/orders/${orderId}/chat`),
  sendOrderChat: (orderId: string, message: string) =>
    request<OrderChat>(`/orders/${orderId}/chat`, {
      method: "POST",
      body: { message },
    }),

  /**
   * Support, as conversations rather than a live chat socket.
   *
   * A rider on the road cannot wait for somebody to be online, and a support
   * desk is not always at a screen. A message that waits is better than one
   * lost because nobody was there to catch it; each is answered from the
   * admin console and the reply lands back in the app.
   */
  supportTickets: async (): Promise<SupportTicket[]> => {
    const body = await request<any>("/support/tickets");
    return Array.isArray(body) ? body : (body?.tickets ?? []);
  },
  supportTicket: async (id: string): Promise<SupportTicket> =>
    unwrapTicket(await request<any>(`/support/tickets/${id}`)),
  openSupportTicket: async (input: {
    subject: string;
    message: string;
    category?: string;
  }): Promise<SupportTicket> =>
    unwrapTicket(
      await request<any>("/support/tickets", { method: "POST", body: input })
    ),
  replyToSupportTicket: async (id: string, message: string): Promise<SupportTicket> =>
    unwrapTicket(
      await request<any>(`/support/tickets/${id}/message`, {
        method: "POST",
        body: { message },
      })
    ),

  profile: () => request<{ profile: any; stats: any }>("/rider/profile"),

  /** Change details the rider owns - their emergency contact, for one. */
  updateProfile: (body: Record<string, unknown>) =>
    request<{ profile: any }>("/rider/profile", { method: "PUT", body }),
  stats: () => request<any>("/rider/stats"),
  wallet: () => request<any>("/rider/wallet"),
  earnings: () => request<any>("/rider/earnings"),
  analytics: () => request<any>("/rider/analytics"),
  unreadCount: () => request<{ unreadCount: number }>("/rider/notifications/unread-count"),
  orders: () => request<{ orders: any[]; count?: number }>("/rider/orders"),
  availableOrders: () => request<any>("/rider/orders/available"),
  documents: () => request<any>("/rider/documents"),

  /* ── Verification ──────────────────────────────────────────────────────
   *
   * The three verify screens each drew a button with no handler, so a new
   * partner could type their PAN, Aadhaar or licence number and had no way to
   * submit it — onboarding could be filled in but never finished. The
   * endpoints behind these have been there the whole time.
   */
  verifyPan: (pan: string, name?: string, dob?: string) =>
    request<{ message?: string; data?: { verified?: boolean } }>("/rider/verify/pan", {
      method: "POST",
      body: { pan, name, dob },
    }),
  initiateAadhaar: (aadhaar: string) =>
    request<{ message?: string; data?: { requestId?: string; verified?: boolean } }>(
      "/rider/verify/aadhaar/initiate",
      { method: "POST", body: { aadhaar } }
    ),
  verifyAadhaar: (requestId: string, otp: string) =>
    request<{ message?: string; data?: { verified?: boolean } }>(
      "/rider/verify/aadhaar/verify",
      { method: "POST", body: { requestId, otp } }
    ),
  verifyDrivingLicence: (licenceNumber: string, dob: string) =>
    request<{ message?: string; data?: { verified?: boolean } }>(
      "/rider/verify/driving-licence",
      { method: "POST", body: { licenceNumber, dob } }
    ),

  /** Removes a document the partner has uploaded. */
  deleteDocument: (documentType: string) =>
    request<{ message?: string }>(`/rider/documents/${documentType}`, { method: "DELETE" }),

  bankDetails: () => request<any>("/rider/bank-details"),
  withdrawals: () => request<any>("/rider/withdrawals"),
  incentives: () => request<any>("/rider/incentives"),
  notifications: () =>
    request<{
      notifications: {
        id: string;
        category: string;
        title: string;
        body: string;
        time: string;
        unread: boolean;
      }[];
    }>("/rider/notifications"),
  markNotificationRead: (id: string) =>
    request(`/rider/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () =>
    request("/rider/notifications/mark-all-read", { method: "PATCH" }),

  /**
   * Everything the rider is carrying, first stop first.
   *
   * The order they are worked in is the server's, not the app's: the customer
   * on each one has been told where they sit in this run, so the sequence has
   * to be the same in both places.
   */
  run: () =>
    request<{
      totalStops: number;
      stops: {
        position: number;
        orderId: string;
        orderNumber: string;
        status: string;
        address?: { street?: string; city?: string } | null;
      }[];
    }>("/rider/run"),

  /** One position fix for an order the rider is carrying. */
  shareLocation: (
    orderId: string,
    body: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      heading?: number;
      speed?: number;
    }
  ) => request<any>(`/tracking/location/${orderId}`, { method: "POST", body }),

  /** Where the rider is, for dispatch to measure against the restaurant. */
  updateRiderLocation: (body: { latitude: number; longitude: number }) =>
    request<any>("/rider/location", { method: "PUT", body }),

  setDutyStatus: (isOnline: boolean) =>
    request<any>("/rider/status", { method: "PATCH", body: { isOnline } }),
  acceptOrder: (orderId: string) =>
    request<any>(`/rider/orders/${orderId}/accept`, { method: "PATCH" }),
  rejectOrder: (orderId: string) =>
    request<any>(`/rider/orders/${orderId}/reject`, { method: "PATCH" }),
  deliverOrder: (orderId: string) =>
    request<any>(`/rider/orders/${orderId}/deliver`, { method: "PATCH" }),

  /**
   * Handover verification.
   *
   * `code` takes either the four digits read off the vendor's or customer's
   * screen, or the whole payload a QR scanner returns — the server reads both,
   * so the scanner does not need to know which it got.
   *
   * These are the only ways an order reaches "out for delivery" and
   * "delivered"; nothing else moves it.
   */
  verifyPickup: (orderId: string, code: string) =>
    request<{ status: string; orderNumber?: string }>(
      `/rider/orders/${orderId}/pickup-verify`,
      { method: "PATCH", body: { code } }
    ),
  verifyDelivery: (orderId: string, code: string) =>
    request<{ status: string; orderNumber?: string }>(
      `/rider/orders/${orderId}/delivery-verify`,
      { method: "PATCH", body: { code } }
    ),
};
