import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CartLine } from "@/lib/store";
import type { Dish, Extra, Offer, Portion, Restaurant } from "@/lib/data";
import type { AccentKey } from "@/lib/theme";
import type { PhotoKey } from "@/lib/images";

/**
 * Client for the Reditoe API (`working/backend`).
 *
 * The backend is an Express + MongoDB service; this maps its responses onto the
 * shapes the screens already use, so nothing above this file knows whether the
 * catalogue came from the network or the bundled sample data.
 *
 * Point it somewhere else with EXPO_PUBLIC_API_URL — a device on the same
 * network needs your machine's LAN address, since localhost there is the phone.
 */

/**
 * Where the API lives.
 *
 * EXPO_PUBLIC_API_URL wins when it is set. Otherwise a web build served from
 * anywhere but a dev server talks to its own origin, so the same bundle works
 * behind a tunnel or a real domain without being rebuilt. Native and local dev
 * fall back to the dev API.
 */
/** Where the live platform runs. Compiled into every release build. */
const PRODUCTION_API = "https://api.reditoe.com/api";

function resolveApiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const origin =
    typeof globalThis !== "undefined" &&
    (globalThis as { location?: { origin?: string } }).location?.origin;

  if (origin && !/localhost|127\.0\.0\.1/.test(origin)) return `${origin}/api`;

  /**
   * A release build must never fall back to localhost.
   *
   * On a phone that address is the phone itself, so every request fails and
   * the app looks completely broken - which is what three signed builds did
   * before this was caught. EXPO_PUBLIC_API_URL is meant to carry the address
   * in, but it only reaches the bundler on some build paths, and a default
   * that is wrong everywhere except a developer's laptop is the wrong default
   * to trust.
   */
  if (!__DEV__) return PRODUCTION_API;
  return "http://localhost:5000/api";
}

export const API_BASE = resolveApiBase();

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


/**
 * An uploaded file's absolute URL.
 *
 * Uploads are stored under the API's own origin and reported relative —
 * "/uploads/menu-items/1786…png" — because an absolute http://localhost:5000
 * only resolves on the machine that ran the server. Relative is right on the
 * wire and wrong at the point of use: this app is not served from the API's
 * origin, so the path resolves against the phone (nothing) or the web bundle's
 * host (a 404). Either way the photo the vendor uploaded never appears, and the
 * caller falls through to a stand-in — which is why a *different* dish's
 * picture was showing.
 *
 * Anything already absolute (S3, a CDN) is returned untouched.
 */
export function mediaUrl(value?: string | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const origin = API_BASE.replace(/\/api\/?$/, "");

  if (raw.startsWith("data:")) return raw;

  // Older admin uploads could have been saved with a development localhost
  // URL. A real phone cannot reach the developer's localhost, so remap those
  // URLs to the current API origin while preserving the uploaded path.
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      // Fall through and return the original absolute URL.
    }
    return raw;
  }

  if (raw.startsWith("//")) return `https:${raw}`;
  // API_BASE ends in /api; uploads are served from the origin above it.
  return `${origin}/${raw.replace(/^\/+/, "")}`;
}

/**
 * A delivery address as the API stores it.
 *
 * It used to be sent as one line of text. The order schema keeps an object,
 * so every field of it was dropped and the address saved against the order
 * was `{}` - the rider was handed a delivery with nowhere to take it.
 */
export interface DeliveryAddress {
  street: string;
  city: string;
  state?: string;
  zipCode?: string;
  coordinates?: { latitude: number; longitude: number };
}

/**
 * How long a request is given before it is abandoned.
 *
 * Eight seconds was fine against a server on the same desk. On mobile data,
 * through a tunnel, against a server that may itself be waiting on a payment
 * gateway or an SMS provider, it fired constantly - and the customer was told
 * "Fetch request has been canceled", which sounds like a fault in the app
 * rather than a slow connection.
 *
 * Long enough now to outlast anything the server legitimately waits on, and
 * still short enough that a genuinely dead connection is reported rather than
 * spinning for ever.
 */
const TIMEOUT_MS = 20000;

const TOKEN_KEY = "reditoe.token";

/**
 * The session token.
 *
 * Held in memory, because every request needs it and reading storage is
 * asynchronous on a phone, and mirrored to storage so closing the app does
 * not sign the customer out.
 *
 * That mirror used to be localStorage alone. React Native has no
 * localStorage, so on a phone there was nothing behind the in-memory copy and
 * every restart was a fresh, signed-out app - which the web builds never
 * showed, because there localStorage is real.
 */
let authToken: string | null = null;

const storage: Storage | null =
  typeof globalThis !== "undefined" && "localStorage" in globalThis
    ? (globalThis as unknown as { localStorage: Storage }).localStorage
    : null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  try {
    if (token) storage?.setItem(TOKEN_KEY, token);
    else storage?.removeItem(TOKEN_KEY);
  } catch {
    // Private browsing can refuse writes; the in-memory token still works.
  }

  // Not awaited: the token is already in memory, so the next request has what
  // it needs whether or not the write has landed.
  if (!storage) {
    (token
      ? AsyncStorage.setItem(TOKEN_KEY, token)
      : AsyncStorage.removeItem(TOKEN_KEY)
    ).catch(() => {
      /* a failed write costs the session on next launch, nothing sooner */
    });
  }
};

export const getAuthToken = () => {
  if (authToken) return authToken;
  try {
    authToken = storage?.getItem(TOKEN_KEY) ?? null;
  } catch {
    authToken = null;
  }
  return authToken;
};

/**
 * Reads the stored token into memory. Call once before anything asks for it.
 *
 * Only phones need this - on the web `getAuthToken` reads localStorage
 * directly, which is synchronous - but it is safe to call anywhere.
 */
export const hydrateAuthToken = async (): Promise<string | null> => {
  if (authToken) return authToken;
  if (storage) return getAuthToken();
  try {
    authToken = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    authToken = null;
  }
  return authToken;
};

/* ── Remember this device ───────────────────────────────────────────────── */

const DEVICE_KEY = "reditoe.deviceId";
const REMEMBER_KEY = "reditoe.remember";

/**
 * What the server handed this phone when a code signed it in.
 *
 * It is what lets the same phone come back without another code, for a limited
 * time. The server fixes the date, counted from the code, and keeps only a few
 * phones per account; signing out throws this away on both sides.
 */
interface RememberedDevice {
  /** The ten digits it was remembered for. */
  phone: string;
  /** The secret. Only a hash of it exists on the server. */
  token: string;
  /** ISO date. Kept so a lapsed one is not sent just to be refused. */
  expiresAt: string;
}

const lastTenDigits = (value: string) => value.replace(/\D/g, "").slice(-10);

let deviceIdMemo: string | null = null;

/**
 * This install's identifier, made on first use and kept.
 *
 * It is not a secret - the secret is the token above - it only says which phone
 * a remembered session belongs to, so one phone's token is no good on another.
 */
export async function getDeviceId(): Promise<string> {
  if (deviceIdMemo) return deviceIdMemo;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_KEY);
    if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) {
      deviceIdMemo = stored;
      return stored;
    }
  } catch {
    // Fall through and make one; at worst the phone is remembered under a new id.
  }

  const randomUUID = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  const fresh = (
    randomUUID
      ? randomUUID.call((globalThis as { crypto?: unknown }).crypto)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  )
    .replace(/[^A-Za-z0-9_-]/g, "")
    .padEnd(16, "0")
    .slice(0, 64);

  deviceIdMemo = fresh;
  try {
    await AsyncStorage.setItem(DEVICE_KEY, fresh);
  } catch {
    // Kept in memory for this run.
  }
  return fresh;
}

async function readRemembered(): Promise<RememberedDevice | null> {
  try {
    const raw = await AsyncStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<RememberedDevice>;
    if (!record?.token || !record.phone || !record.expiresAt) return null;
    if (new Date(record.expiresAt).getTime() <= Date.now()) {
      await clearRemembered();
      return null;
    }
    return record as RememberedDevice;
  } catch {
    return null;
  }
}

async function saveRemembered(record: RememberedDevice) {
  try {
    await AsyncStorage.setItem(REMEMBER_KEY, JSON.stringify(record));
  } catch {
    // Not remembered; the next sign-in simply asks for a code.
  }
}

async function clearRemembered() {
  try {
    await AsyncStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Nothing more to do.
  }
}

export class ApiError extends Error {
  status: number;
  /** The server's machine-readable reason, where it sends one. */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /**
   * Worth asking again, a moment later.
   *
   * A connection that dropped, a proxy that was between processes while the
   * server restarted (502/503/504), or a request that reached a server that
   * had no handler for it yet - which is what the router's own 404 means, as
   * opposed to a handler answering "no such restaurant". All of these pass.
   * A timeout does not count: it has already cost the full wait once.
   */
  get transient() {
    return (
      this.code === "route_not_found" ||
      this.code === "unreachable" ||
      this.status === 502 ||
      this.status === 503 ||
      this.status === 504
    );
  }
}

/**
 * The server's own "nothing matched this path" answer - { message: "Route not
 * found" } or "API route not found" - as opposed to a handler saying "no such
 * restaurant". It carries no `code`; every handler's refusal does or is a
 * different message.
 */
const isRouteMiss = (status: number, payload: { message?: string; code?: string }) =>
  status === 404 && !payload.code && /route not found/i.test(payload.message ?? "");

/** How long to wait before each retry of a read that failed transiently. */
const RETRY_DELAYS_MS = [700, 2000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One call, with a couple of quiet retries for reads.
 *
 * Only GETs are repeated - they change nothing, so asking twice is safe, and a
 * repeated POST could place an order twice. A customer scrolling the home page
 * was being shown "Route not found" the moment one request landed on a server
 * that was restarting or an instance that did not have the route yet; asked
 * again a second later it answered. They never need to hear about that.
 */
async function request<T>(
  path: string,
  options: Parameters<typeof requestOnce>[1] = {}
): Promise<T> {
  const canRepeat = (options.method ?? "GET") === "GET";

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestOnce<T>(path, options);
    } catch (error) {
      const again =
        canRepeat &&
        attempt < RETRY_DELAYS_MS.length &&
        error instanceof ApiError &&
        error.transient;
      if (!again) throw error;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function requestOnce<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    /**
     * A multipart body, for the calls that carry a file. Sent as it is, with no
     * Content-Type: the runtime has to write that header itself, because it
     * carries the boundary the parts are separated by.
     */
    form?: FormData;
    auth?: boolean;
    /** Longer than the default for a photo on a slow connection. */
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.form ? {} : { "Content-Type": "application/json" }),
        ...NGROK_HEADERS,
        ...(options.auth && getAuthToken()
          ? { Authorization: `Bearer ${getAuthToken()}` }
          : {}),
      },
      body: options.form ?? (options.body ? JSON.stringify(options.body) : undefined),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    // A dropped connection, no network, or the request outliving TIMEOUT_MS.
    // Whatever the cause, the customer can only be told the same thing.
    const timedOut = cause instanceof Error && cause.name === "AbortError";
    throw new ApiError(
      timedOut
        ? "The server took too long to answer. Please try again."
        : "Could not reach the server. Please check your connection and try again.",
      0,
      timedOut ? "timeout" : "unreachable"
    );
  }

  try {
    const text = await response.text();

    /**
     * The body is only JSON when the API answered.
     *
     * When it did not - the server is down, a tunnel is closed, a proxy is in
     * the way - something else arrives, usually an HTML or plain-text error
     * page, and parsing it threw the parser's own words at the customer:
     * "JSON Parse error: Unexpected character: T", where the T began "The
     * endpoint is offline". That reads as a broken app rather than a server
     * that cannot be reached.
     */
    let payload: { status?: string; message?: string; code?: string } = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ApiError(
          "Could not reach the server. Please try again in a moment.",
          response.status
        );
      }
    }

    if (isRouteMiss(response.status, payload)) {
      // Never "Route not found": that is the server's wording about itself,
      // and it tells a customer nothing they can act on.
      throw new ApiError(
        "Reditoe is updating. Please try again in a moment.",
        response.status,
        "route_not_found"
      );
    }

    if (!response.ok || payload.status === "error") {
      throw new ApiError(
        payload.message || `Request failed (${response.status})`,
        response.status,
        payload.code
      );
    }
    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Wire shapes ────────────────────────────────────────────────────────── */

interface ApiRestaurant {
  _id: string;
  name: string;
  image?: string;
  /** The card's carousel: the restaurant's photo, then its best-selling food. */
  gallery?: string[];
  rating?: number;
  deliveryTime?: string;
  estimatedDeliveryMinutes?: number;
  deliveryFee?: number;
  categories?: string[];
  description?: string;
  isOpen?: boolean;
  phone?: string;
}

interface ApiCoupon {
  _id: string;
  code: string;
  name?: string;
  description?: string;
  type?: string;
  discountValue: number;
  minOrderValue?: number;
  maxDiscountValue?: number;
  endDate?: string;
  isActive?: boolean;
}

interface ApiModifierOption {
  _id: string;
  name: string;
  price?: number;
  isAvailable?: boolean;
  isDefault?: boolean;
}

interface ApiModifierGroup {
  _id: string;
  name: string;
  required?: boolean;
  /** "absolute" — the option is the dish's price at that size, not an extra. */
  priceMode?: string;
  options?: ApiModifierOption[];
}

interface ApiFoodItem {
  _id: string;
  name: string;
  price: number;
  description?: string;
  image?: string;
  category?: string;
  isVeg?: boolean;
  foodType?: string;
  isAvailable?: boolean;
  restaurantId?: string;
  restaurantName?: string;
  addons?: { _id?: string; name: string; price?: number }[];
  modifierGroups?: ApiModifierGroup[];
}

/* ── Adapters ───────────────────────────────────────────────────────────── */

/**
 * The seeded catalogue carries no photography, so dishes and restaurants are
 * given one of the verified stock photos by cuisine keyword. Real image URLs
 * from the API take precedence as soon as the catalogue has them.
 */
const PHOTO_BY_KEYWORD: [RegExp, PhotoKey][] = [
  [/biry?ani|pulao/i, "biryani"],
  [/pizza/i, "pizza"],
  [/burger/i, "burger"],
  [/noodle|hakka|chow|manchur|chinese|asian/i, "noodles"],
  [/cake|dessert|sweet|pastry/i, "cake"],
  [/idli|dosa|vada|south/i, "idli"],
  [/samosa|pakora|snack|starter/i, "samosa"],
  [/naan|roti|paratha|bread|pav|bun/i, "buns"],
  [/salad/i, "saladBowl"],
  [/pancake|jamun/i, "pancakes"],
  [/thali|combo|meal/i, "thali"],
  [/mutton|chicken|kebab|tikka|meat/i, "meatTomato"],
  [/paneer|curry|masala|gravy|butter/i, "curryBread"],
];

function photoFor(text: string, fallback: PhotoKey = "thali"): PhotoKey {
  for (const [pattern, key] of PHOTO_BY_KEYWORD) {
    if (pattern.test(text)) return key;
  }
  return fallback;
}

function minutesFrom(value?: string, fallback = 30): number {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

export function toRestaurant(api: ApiRestaurant, index: number): Restaurant {
  const eta = api.estimatedDeliveryMinutes || minutesFrom(api.deliveryTime);
  const cuisines =
    api.categories && api.categories.length > 0
      ? api.categories
      : ["Restaurant"];

  return {
    id: api._id,
    name: api.name,
    cuisines,
    rating: api.rating || 4.2,
    ratingCount: 0,
    etaMinutes: [Math.max(10, eta - 5), eta + 5],
    deliveryFee: api.deliveryFee ?? 0,
    priceForTwo: 400,
    area: "",
    distanceKm: 1.5,
    veg: false,
    imageUrl: mediaUrl(api.image),
    gallery: (api.gallery ?? []).map((url) => mediaUrl(url)).filter(Boolean) as string[],
    photo: photoFor(`${api.name} ${cuisines.join(" ")}`, "curryBread"),
    promoted: index === 0,
    closesAt: api.isOpen === false ? undefined : "11:00 PM",
    packagingFee: 10,
    freeDeliveryAbove: 199,
  };
}

export function toDish(api: ApiFoodItem, restaurantId: string): Dish {
  const veg = api.isVeg ?? api.foodType !== "non-veg";
  return {
    id: api._id,
    restaurantId,
    name: api.name,
    description: api.description || `${api.name} — freshly prepared.`,
    price: api.price,
    rating: 4.2,
    ratingCount: 0,
    veg,
    category: api.category || "Recommended",
    // The vendor's own photo when there is one; the keyword match is only a
    // stand-in for the seeded catalogue, which ships without photography.
    imageUrl: mediaUrl(api.image),
    photo: photoFor(`${api.name} ${api.category ?? ""}`),
    ...dishChoices(api),
  };
}

/**
 * The vendor's variants and add-ons, as the dish screen's portions and extras.
 *
 * These were dropped here, so a dish read from the API arrived with neither —
 * the portion cards and the extras checklist only ever had anything to show
 * for the seeded catalogue, and every variant a vendor created was invisible.
 *
 * A group priced absolutely is a size: each option is what the dish costs at
 * that size, so it becomes a portion. Anything else costs extra on top, so it
 * joins the add-ons in the extras list.
 */
function dishChoices(api: ApiFoodItem): { portions?: Portion[]; extras?: Extra[] } {
  const groups = (api.modifierGroups ?? []).filter(
    // The menu endpoint synthesises a group out of an item's add-ons; taking
    // it as well would list every add-on twice.
    (group) => String(group._id ?? "") !== "legacy-addons"
  );

  const sizeGroup = groups.find((group) => group.priceMode === "absolute");
  const available = (group: ApiModifierGroup) =>
    (group.options ?? []).filter((option) => option.isAvailable !== false);

  const portions: Portion[] = sizeGroup
    ? available(sizeGroup).map((option) => ({
        id: String(option._id),
        name: option.name,
        serves: "",
        price: Number(option.price ?? 0),
        groupId: String(sizeGroup._id),
        isDefault: Boolean(option.isDefault),
      }))
    : [];

  const extras: Extra[] = [
    ...groups
      .filter((group) => group !== sizeGroup)
      .flatMap((group) =>
        available(group).map((option) => ({
          id: String(option._id),
          name: option.name,
          price: Number(option.price ?? 0),
          groupId: String(group._id),
        }))
      ),
    // Plain add-ons carry no group; the API takes them as selectedAddons.
    ...(api.addons ?? []).map((addon, index) => ({
      id: String(addon._id ?? `addon-${index}`),
      name: addon.name,
      price: Number(addon.price ?? 0),
    })),
  ];

  return {
    portions: portions.length ? portions : undefined,
    extras: extras.length ? extras : undefined,
  };
}

const COUPON_ACCENTS: AccentKey[] = ["red", "green", "purple", "amber", "blue", "orange"];

/** A backend coupon becomes the ticket the Offers screen already draws. */
export function toOffer(api: ApiCoupon, index: number): Offer {
  const percent = api.type === "percentage" || api.type === "percent";
  const freeDelivery = api.type === "free_delivery" || api.type === "delivery";

  return {
    id: api._id,
    code: api.code,
    figure: freeDelivery ? "FREE" : percent ? `${api.discountValue}%` : `₹${api.discountValue}`,
    lead: freeDelivery || percent ? "" : "FLAT",
    trail: freeDelivery ? "DELIVERY" : "OFF",
    title: api.name || `${api.code} offer`,
    detail: api.description || `On orders above ₹${api.minOrderValue ?? 0}`,
    minOrder: api.minOrderValue ?? 0,
    maxDiscount: api.maxDiscountValue,
    kind: freeDelivery ? "delivery" : percent ? "percent" : "flat",
    value: api.discountValue,
    expiresOn: api.endDate ?? "",
    accent: COUPON_ACCENTS[index % COUPON_ACCENTS.length],
    // The API has no grouping, so everything lands under Restaurants and the
    // category row still filters to something.
    group: freeDelivery ? "Delivery" : "Restaurants",
  };
}

/* ── Endpoints ──────────────────────────────────────────────────────────── */

/** A picture chosen on the device, as the image picker reports it. */
export interface ProfilePhoto {
  uri: string;
  /** Falls back to a name made from the type when the picker reports none. */
  name?: string | null;
  mimeType?: string | null;
}

const EXTENSION_FOR: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Adds a picked image to a multipart body.
 *
 * The two platforms want different things in a part. A phone takes an object
 * with a uri and reads the file itself; a browser has no file to point at, so
 * the picture is fetched back out of its blob URL and appended as the bytes,
 * which is the only thing it will serialise as a file rather than as the text
 * "[object Object]".
 */
async function appendPhoto(form: FormData, field: string, photo: ProfilePhoto) {
  const type = photo.mimeType || "image/jpeg";
  const name = photo.name || `profile.${EXTENSION_FOR[type] ?? "jpg"}`;

  if (typeof document !== "undefined") {
    const blob = await (await fetch(photo.uri)).blob();
    form.append(field, blob, name);
    return;
  }

  form.append(field, { uri: photo.uri, name, type } as unknown as Blob);
}

/** One support conversation, with everything said in it so far. */
export interface SupportTicket {
  _id: string;
  subject: string;
  message: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  category?: string;
  createdAt?: string;
  updatedAt?: string;
  conversation?: {
    message: string;
    sender: 'user' | 'admin';
    timestamp?: string;
  }[];
}

/** The conversation between a customer and the partner delivering an order. */
export interface OrderChat {
  orderId: string;
  orderNumber?: string | null;
  status?: string;
  /** False once the order is finished; the thread is then read-only. */
  open: boolean;
  you: 'customer' | 'rider';
  messages: {
    sender: 'customer' | 'rider';
    message: string;
    sentAt?: string;
    mine: boolean;
  }[];
}

/**
 * An order as the server describes it.
 *
 * `orderNumber` is the one reference every app prints - the customer, vendor,
 * admin and rider views all read this same value, so an order is called the
 * same thing wherever it is looked at.
 */
export interface ApiOrder {
  id: string;
  orderNumber?: string;
  restaurantId?: { _id?: string; name?: string } | string | null;
  items?: Array<{
    foodItemId?: { _id?: string; name?: string; image?: string; price?: number } | string | null;
    name?: string;
    price?: number;
    quantity?: number;
  }>;
  subtotal?: number;
  gstAndPackaging?: number;
  tax?: number;
  platformFee?: number;
  deliveryFee?: number;
  packagingFee?: number;
  tip?: number;
  discount?: number;
  couponCode?: string;
  /** Reditoe Money taken off this order. */
  walletUsed?: number;
  total?: number;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  deliveryAddress?: { coordinates?: { latitude?: number; longitude?: number } } | null;
  estimatedDeliveryMinutes?: number;
  /** What the customer may still do with this order, decided by the server. */
  canCancel?: boolean;
  refundOnCancel?: boolean;
  canRequestRefund?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** A refund as the server describes it, for the Returns & Refunds screen. */
export interface RefundRequest {
  id: string;
  refundId?: string;
  orderId: string;
  orderCode: string | null;
  restaurantName: string | null;
  amount: number;
  reason: string;
  note: string | null;
  status: string;
  statusLabel: string;
  requestedAt: string;
  resolvedAt: string | null;
}

/**
 * A cart line as the order endpoint reads it.
 *
 * The server prices every line itself from the dish and the choices named
 * here — it does not trust `price`. Sending no choices meant it priced the
 * default size, so a customer who picked Family Pack was billed for Regular.
 *
 * Modifier options are grouped by their group; plain add-ons, which have no
 * group, go in selectedAddons where the API expects them.
 */
function orderLine(line: CartLine) {
  const byGroup = new Map<string, string[]>();
  if (line.portion) {
    byGroup.set(line.portion.groupId, [line.portion.optionId]);
  }
  for (const extra of line.extras) {
    if (!extra.groupId) continue;
    byGroup.set(extra.groupId, [...(byGroup.get(extra.groupId) ?? []), extra.id]);
  }

  return {
    foodItemId: line.dishId,
    quantity: line.quantity,
    price: line.unitPrice,
    selectedModifiers: [...byGroup].map(([groupId, optionIds]) => ({ groupId, optionIds })),
    selectedAddons: line.extras
      .filter((extra) => !extra.groupId)
      .map((extra) => ({ name: extra.name, price: extra.price })),
  };
}

export const api = {
  /** Where this device should receive its order updates. */
  registerPushToken: (token: string, deviceInfo: Record<string, unknown>) =>
    request("/push-notifications/token", { method: "POST", auth: true, body: { token, deviceInfo } }),

  forgetPushToken: (token: string) =>
    request("/push-notifications/token", { method: "DELETE", auth: true, body: { token } }),

  async restaurants(
    category?: string,
    coordinates?: { latitude: number; longitude: number }
  ): Promise<Restaurant[]> {
    // The server is the source of truth for the 10 km serviceability boundary.
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (coordinates) {
      params.set("lat", String(coordinates.latitude));
      params.set("lng", String(coordinates.longitude));
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await request<{ data: { restaurants: ApiRestaurant[] } }>(
      `/restaurants${query}`
    );
    return (res.data?.restaurants ?? []).map(toRestaurant);
  },

  async searchRestaurants(
    query: string,
    coordinates?: { latitude: number; longitude: number },
    city?: string
  ): Promise<{ restaurants: Restaurant[]; notServiceableRestaurants: { name: string; distanceKm: number | null; message: string }[] }> {
    const params = new URLSearchParams({ q: query, type: "restaurants" });
    if (coordinates) {
      params.set("lat", String(coordinates.latitude));
      params.set("lng", String(coordinates.longitude));
    }
    if (city) params.set("city", city);
    const res = await request<{
      data: {
        restaurants: ApiRestaurant[];
        notServiceableRestaurants?: { name: string; distanceKm: number | null; message: string }[];
      };
    }>(`/search?${params.toString()}`);
    return {
      restaurants: (res.data?.restaurants ?? []).map((item, index) => toRestaurant(item, index)),
      notServiceableRestaurants: res.data?.notServiceableRestaurants ?? [],
    };
  },

  /**
   * The kinds of food on sale right now.
   *
   * Read from the menus rather than a list in the bundle, so the row cannot
   * offer a category nobody sells or miss one they do.
   */
  /**
   * The posters the admin has scheduled for the home screen.
   *
   * Empty is a normal answer - nothing is scheduled - and the screen falls
   * back to the offers it draws itself.
   */
  async banners(position = "homepage"): Promise<
    {
      id: string;
      title: string;
      description: string | null;
      imageUrl: string;
      actionType: string | null;
      actionValue: string | null;
      actionUrl: string | null;
    }[]
  > {
    const res = await request<{
      data: {
        banners: {
          id: string;
          title: string;
          description: string | null;
          imageUrl: string;
          actionType: string | null;
          actionValue: string | null;
          actionUrl: string | null;
        }[];
      };
    }>(`/banners?position=${encodeURIComponent(position)}`);
    return res.data?.banners ?? [];
  },

  async foodCategories(): Promise<
    { id: string; name: string; items: number; restaurants: number; image: string | null }[]
  > {
    const res = await request<{
      data: {
        categories: {
          id: string;
          name: string;
          items: number;
          restaurants: number;
          image: string | null;
        }[];
      };
    }>("/restaurants/food-categories");
    return res.data?.categories ?? [];
  },

  /**
   * Who the stored token belongs to.
   *
   * Used on boot to turn a token that survived a restart back into a signed-in
   * session. A token the server no longer accepts throws, and the caller signs
   * out — which is the right answer for an expired or revoked one.
   */
  /**
   * The code the customer shows the rider at the door, and the QR encoding it.
   *
   * Served only to the customer who owns the order. Fetched rather than
   * derived: the rider verifies against what the server stored, so anything
   * computed here would simply be a different number.
   */
  /* ── Talking to the rider ──────────────────────────────────────────── */

  /**
   * The conversation about one order.
   *
   * Both sides call the same endpoints; the server decides who is asking
   * from the order itself, so neither can read a delivery they are not part
   * of.
   */
  async orderChat(orderId: string): Promise<OrderChat> {
    // Signed in, and the conversation is inside `data`: without the token the
    // server answers 401, and without unwrapping the screen read a chat with
    // no `open` flag and no messages.
    const res = await request<{ data: OrderChat }>(`/orders/${orderId}/chat`, { auth: true });
    return res.data;
  },

  async sendOrderChat(orderId: string, message: string): Promise<OrderChat> {
    const res = await request<{ data: OrderChat }>(`/orders/${orderId}/chat`, {
      method: 'POST',
      auth: true,
      body: { message },
    });
    return res.data;
  },

  /* ── Support ───────────────────────────────────────────────────────── */

  /**
   * The customer's own support conversations.
   *
   * Tickets rather than a live chat socket: a kitchen or a support desk is
   * not always at a screen, and a message that waits is better than one that
   * is lost because nobody was online to receive it. Each ticket carries its
   * whole thread, and the admin console answers on the other side.
   */
  async supportTickets(): Promise<SupportTicket[]> {
    // Every support route is behind `protect`, and the server wraps what it
    // returns in `data`: a call without the token was refused as signed-out
    // even for a signed-in customer.
    const res = await request<{ data?: { tickets?: SupportTicket[] } }>('/support/tickets', {
      auth: true,
    });
    return res.data?.tickets ?? [];
  },

  async supportTicket(id: string): Promise<SupportTicket> {
    const res = await request<{ data: { ticket: SupportTicket } }>(`/support/tickets/${id}`, {
      auth: true,
    });
    return res.data.ticket;
  },

  async openSupportTicket(input: {
    subject: string;
    message: string;
    category?: string;
    orderId?: string;
  }): Promise<SupportTicket> {
    const res = await request<{ data: { ticket: SupportTicket } }>('/support/tickets', {
      method: 'POST',
      auth: true,
      body: input,
    });
    return res.data.ticket;
  },

  async replyToSupportTicket(id: string, message: string): Promise<SupportTicket> {
    // The server answers with the message it stored, not the ticket, so the
    // thread is read again to show it with the reply in place.
    await request(`/support/tickets/${id}/message`, {
      method: 'POST',
      auth: true,
      body: { message },
    });
    return this.supportTicket(id);
  },

  async deliveryCode(orderId: string) {
    const res = await request<{
      data: { verified: boolean; code: string | null; qr: string | null; orderNumber?: string };
    }>(`/orders/${orderId}/delivery-code`, { auth: true });
    return res.data;
  },

  async me() {
    const res = await request<{
      data: {
        user: {
          name?: string;
          email?: string;
          phone?: string;
          /** Whether this account may pay cash; the admin switches it. */
          codEnabled?: boolean;
        };
      };
    }>("/auth/me", { auth: true });
    return res.data.user;
  },

  async menu(restaurantId: string, coordinates?: { latitude: number; longitude: number }): Promise<Dish[]> {
    const params = new URLSearchParams();
    if (coordinates) {
      params.set("lat", String(coordinates.latitude));
      params.set("lng", String(coordinates.longitude));
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const res = await request<{ data: { menu: ApiFoodItem[] } }>(
      `/restaurants/${restaurantId}/menu${suffix}`
    );
    return (res.data?.menu ?? []).map((item) => toDish(item, restaurantId));
  },

  async popularDishes(): Promise<Dish[]> {
    const res = await request<{ data: { items: ApiFoodItem[] } }>(
      "/restaurants/food-items/popular"
    );
    return (res.data?.items ?? []).map((item) =>
      toDish(item, item.restaurantId ?? "")
    );
  },

  async coupons(): Promise<Offer[]> {
    const res = await request<{ data: { coupons: ApiCoupon[] } }>("/orders/coupons");
    return (res.data?.coupons ?? [])
      .filter((coupon) => coupon.isActive !== false)
      .map(toOffer);
  },

  async referralCode(): Promise<string | null> {
    const res = await request<{ data: { referralCode?: string } }>("/referral/me", {
      auth: true,
    });
    return res.data?.referralCode ?? null;
  },

  async createReferralInvite(targetType: "user" | "vendor" | "delivery_partner") {
    const res = await request<{ data: { code: string; targetType: string; rewardAmount: number; link: string; status: string } }>(
      "/referral/invites", { method: "POST", auth: true, body: { targetType } }
    );
    return res.data;
  },

  async referralStatus() {
    const res = await request<{ data: { invites: Array<{ _id: string; targetType: string; code: string; rewardAmount: number; status: string; createdAt: string; registeredAt?: string | null; approvedAt?: string | null; rewardedAt?: string | null }>; totals: Record<string, number>; amounts: { user: number; vendor: number; delivery_partner: number } } }>(
      "/referral/invites", { auth: true }
    );
    return res.data;
  },

  /** Reditoe Plus status plus the marketing copy the Plus screens render. */
  async membership() {
    return request<{
      data: {
        membership: {
          active: boolean;
          planLabel: string | null;
          startedAt: string | null;
          validTill: string | null;
          autoRenewal: boolean;
          savings: {
            delivery: number;
            discounts: number;
            coupons: number;
            cashback: number;
            total: number;
          };
        };
        benefits: { key: string; title: string; detail: string; tag: string; icon: string }[];
        comparison: { label: string; regular: string; plus: string }[];
        faqs: string[];
      };
    }>("/membership", { auth: true });
  },

  async wallet() {
    return request<{
      data: {
        wallet: {
          balance: number;
          currency: string;
          minTransfer: number;
          heldAmount?: number;
          spendable?: number;
          isFrozen?: boolean;
        };
        transactions: {
          id: string;
          title: string;
          type: "credit" | "debit";
          amount: number;
          at: string;
        }[];
      };
    }>("/wallet", { auth: true });
  },

  /**
   * Starts a wallet top-up, and answers with the payment to put to the
   * customer.
   *
   * Money is added by paying for it, the same way an order is: the gateway
   * takes the card, and the server credits the wallet only once it has
   * Razorpay's signed word that it went through. There used to be an
   * `/wallet/add-money` call here that simply raised the balance — a button
   * wired to it would have handed out credit to anyone who pressed it.
   */
  /**
   * Rates a delivered order.
   *
   * The order screen drew five stars with no handler behind them, so the one
   * question it asked — how was your experience — could not be answered. The
   * server wants a title as well as a comment; the rating itself is the title
   * when the customer has not written one, rather than asking twice for the
   * same thing.
   */
  async submitReview(input: {
    orderId: string;
    restaurantId: string;
    rating: number;
    comment: string;
    title?: string;
  }) {
    return request<{ data: { _id: string } }>("/reviews", {
      method: "POST",
      auth: true,
      body: {
        orderId: input.orderId,
        restaurantId: input.restaurantId,
        rating: input.rating,
        title: input.title?.trim() || `Rated ${input.rating} out of 5`,
        comment: input.comment.trim(),
      },
    });
  },

  /** Saves the customer's own details. */
  async updateProfile(input: { name?: string; phone?: string }) {
    return request<{ data: { user: { name: string; phone: string } } }>("/auth/profile", {
      method: "PUT",
      auth: true,
      body: input,
    });
  },

  async createWalletTopUp(amount: number) {
    return request<{
      data: {
        keyId: string;
        razorpayOrderId: string;
        amount: number;
        currency: string;
      };
    }>("/orders/razorpay/wallet-topup", {
      method: "POST",
      auth: true,
      body: { amount },
    });
  },

  /** Hands the gateway's signed receipt back, which is what credits the wallet. */
  async verifyWalletTopUp(receipt: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    return request<{ data: { balance: number } }>("/orders/razorpay/wallet-topup/verify", {
      method: "POST",
      auth: true,
      body: receipt,
    });
  },

  /**
   * Saves a new delivery address.
   *
   * Coordinates are optional but wanted: without them the rider's map has no
   * destination and the customer's tracking screen cannot draw the last leg
   * of the journey.
   */
  async addAddress(input: {
    label: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    coordinates?: { latitude: number; longitude: number };
  }) {
    return request<{ data: { address: { id: string } } }>("/addresses", {
      method: "POST",
      auth: true,
      body: input,
    });
  },

  /** Corrects a saved address. Re-located by the server if the lines change. */
  async updateAddress(
    id: string,
    input: {
      label?: string;
      street?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      coordinates?: { latitude: number; longitude: number };
    }
  ) {
    return request<{ data: { address: { id: string } } }>(`/addresses/${id}`, {
      method: "PUT",
      auth: true,
      body: input,
    });
  },

  /** Removes a saved address. */
  async deleteAddress(id: string) {
    return request<{ status: string }>(`/addresses/${id}`, {
      method: "DELETE",
      auth: true,
    });
  },

  async addresses() {
    const res = await request<{
      data: {
        addresses: {
          id: string;
          label: string;
          street: string;
          city: string;
          state: string;
          zipCode: string;
          isDefault: boolean;
          coordinates?: { latitude: number; longitude: number };
        }[];
      };
    }>("/addresses", { auth: true });
    return res.data?.addresses ?? [];
  },

  async myRefunds() {
    const [list, summary] = await Promise.all([
      request<{ data: { refunds: RefundRequest[] } }>("/refunds/my", { auth: true }),
      request<{
        data: {
          summary: {
            raised: number;
            completed: number;
            inProgress: number;
            totalRefunded: number;
          };
        };
      }>("/refunds/my/summary", { auth: true }),
    ]);
    return { refunds: list.data?.refunds ?? [], summary: summary.data.summary };
  },

  /** Raises a refund on one of the customer's own orders. */
  async requestRefund(input: { orderId: string; reason: string; amount?: number }) {
    return request<{ message?: string; data: { refund: RefundRequest } }>(
      "/refunds/request",
      { method: "POST", auth: true, body: input }
    );
  },

  /**
   * Asks for a sign-in code to be texted to a mobile number.
   *
   * There is no password and no email sign-in: a mobile number and the code
   * sent to it are the only way in. The server answers the same way whether or
   * not the number has an account - that is for the person who proves they
   * hold it to find out.
   *
   * When the server has no way to send a text (never in production) it hands
   * the code back as `devOtp`, so the flow can still be completed.
   */
  async sendOtp(phone: string) {
    return request<{
      message?: string;
      devOtp?: string;
      data?: { phone?: string; expiresInSeconds?: number; resendAfterSeconds?: number };
    }>("/auth/send-otp", {
      method: "POST",
      body: { phone, role: "user" },
    });
  },

  /**
   * Checks the code. Two outcomes, told apart by `isNewUser`:
   *
   *  - the number has a customer account: a session, already stored;
   *  - it does not: no session, but a proof the sign-up screen trades for an
   *    account. Nothing is created until then.
   *
   * The role is sent so a vendor's or a partner's number cannot open the
   * customer app; the server refuses when the account is not a customer.
   */
  async verifyOtp(phone: string, otp: string) {
    const res = await request<{
      isNewUser: boolean;
      token?: string;
      phone?: string;
      phoneProof?: string;
      rememberToken?: string;
      rememberExpiresAt?: string;
      data?: { user?: unknown };
    }>("/auth/verify-otp", {
      method: "POST",
      body: { phone, otp, role: "user", deviceId: await getDeviceId() },
    });
    if (res.token) setAuthToken(res.token);
    if (res.token && res.rememberToken && res.rememberExpiresAt) {
      await saveRemembered({
        phone: lastTenDigits(phone),
        token: res.rememberToken,
        expiresAt: res.rememberExpiresAt,
      });
    }
    return res;
  },

  /**
   * Creates the account for a number that has just been verified.
   *
   * Multipart, because the profile photo travels with the details. The proof is
   * what the server issued when the code came back: an account is not created
   * on a number without it. Answers with a session.
   */
  async register(input: {
    name: string;
    email: string;
    phone: string;
    phoneProof: string;
    /** ISO date, YYYY-MM-DD. */
    dateOfBirth: string;
    photo: ProfilePhoto;
    referralCode?: string;
  }) {
    const deviceId = await getDeviceId();

    /*
     * Built again for every attempt: a multipart body streams the photo off
     * the disk and can only be sent once.
     */
    const send = async () => {
      const form = new FormData();
      form.append("name", input.name);
      form.append("email", input.email);
      form.append("phone", input.phone);
      form.append("phoneProof", input.phoneProof);
      form.append("dateOfBirth", input.dateOfBirth);
      form.append("deviceId", deviceId);
      if (input.referralCode) form.append("referralCode", input.referralCode);
      await appendPhoto(form, "profilePhoto", input.photo);

      return request<{
        token: string;
        rememberToken?: string;
        rememberExpiresAt?: string;
        data: { user: unknown };
      }>("/auth/register", {
        method: "POST",
        form,
        timeoutMs: 60000,
      });
    };

    /*
     * A dropped connection is asked again, which `request` only does for reads.
     *
     * This is the call that was seen dying as "Could not reach the server"
     * right after the code was verified on the same phone. The likely cause is
     * the customer spending a minute on the form: the connection that carried
     * the code has gone stale by the time the photo goes up, and a body that
     * has started to stream off the disk cannot be replayed on a fresh one.
     * Asked again from scratch it goes through.
     *
     * Sending it again cannot make a second account. The proof is spent by the
     * attempt that got through, so a repeat of one that did is refused rather
     * than creating anything.
     */
    let res: Awaited<ReturnType<typeof send>> | undefined;
    for (let attempt = 0; !res; attempt += 1) {
      try {
        res = await send();
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;

        if (attempt > 0 && error.code === "contact_not_verified") {
          // The earlier attempt reached the server and only its answer was lost.
          throw new ApiError(
            "Your account may already have been created. Go back and sign in with your mobile number.",
            error.status,
            "may_exist"
          );
        }
        if (error.code !== "unreachable" || attempt >= RETRY_DELAYS_MS.length) throw error;
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    setAuthToken(res.token);
    if (res.rememberToken && res.rememberExpiresAt) {
      await saveRemembered({
        phone: lastTenDigits(input.phone),
        token: res.rememberToken,
        expiresAt: res.rememberExpiresAt,
      });
    }
    return res;
  },

  /** The number this phone is remembered for, or null. */
  async rememberedPhone() {
    return (await readRemembered())?.phone ?? null;
  },

  /**
   * Signs this phone back in without a code, if it was remembered and that has
   * not lapsed. Null when there is nothing to use or the server will not accept
   * it (and then it is forgotten here too, so it is not tried again). A dropped
   * connection throws instead: that is not an answer, and the phone stays
   * remembered for the next try.
   */
  async rememberedLogin(phone?: string) {
    const record = await readRemembered();
    if (!record) return null;
    try {
      const res = await request<{ token: string; data: { user: unknown } }>(
        "/auth/remember-login",
        {
          method: "POST",
          body: {
            deviceId: await getDeviceId(),
            rememberToken: record.token,
            role: "user",
            ...(phone ? { phone } : {}),
          },
        }
      );
      setAuthToken(res.token);
      return res;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearRemembered();
        return null;
      }
      throw error;
    }
  },

  /** Signing out: forget this phone here and, best effort, on the server. */
  async forgetDevice() {
    const record = await readRemembered();
    await clearRemembered();
    if (!record) return;
    try {
      await request("/auth/forget-device", {
        method: "POST",
        body: { deviceId: await getDeviceId(), rememberToken: record.token },
      });
    } catch {
      // The server drops it on its own date regardless.
    }
  },

  async myOrders() {
    const res = await request<{ data: { orders: ApiOrder[] } }>(
      "/orders/my-orders",
      { auth: true }
    );
    return res.data?.orders ?? [];
  },

  /**
   * What the order will cost, worked out by the server.
   *
   * The app used to price the basket itself, with its own platform fee, its
   * own GST rate and a flat charge on top. The server priced it differently -
   * GST on the delivery and platform fees as well as on the food, a delivery
   * fee that depends on distance - so the customer was quoted one figure on
   * the checkout screen and charged another when the order was created. This
   * asks the server what it will charge, so the two agree - coupon and Reditoe
   * Money included, which the quote used to leave out.
   */
  async pricingPreview(input: {
    restaurantId: string;
    lines: CartLine[];
    address: DeliveryAddress;
    couponCode?: string;
    useWallet?: boolean;
  }) {
    return request<{
      data: {
        subtotal: number;
        totalGST: number;
        platformFee: number;
        packagingFee: number;
        deliveryFee: number;
        tip?: number;
        /** The bill before any coupon or Reditoe Money comes off it. */
        grossTotal?: number;
        couponCode?: string;
        discount?: number;
        /** Set when the code sent does not apply to this basket. */
        couponError?: { code?: string; message: string } | null;
        walletUsed?: number;
        /** The most Reditoe Money this bill could take, switched on or not. */
        walletCap?: number;
        /** What the customer pays. */
        finalTotal: number;
        distanceKmUsed?: number;
        distanceSource?: string;
        deliveryFeeBreakdown?: { baseFee: number; extraKm: number; extraFee: number; totalDeliveryFee: number };
        estimatedDeliveryMinutes?: number;
      };
    }>("/orders/pricing-preview", {
      method: "POST",
      auth: true,
      body: {
        restaurantId: input.restaurantId,
        items: input.lines.map(orderLine),
        deliveryAddress: input.address,
        couponCode: input.couponCode ?? "",
        useWallet: Boolean(input.useWallet),
      },
    });
  },

  async createOrder(input: {
    restaurantId: string;
    lines: CartLine[];
    address: DeliveryAddress;
    paymentMethod: string;
    couponCode?: string;
    /** Put the customer's Reditoe Money towards this order as well. */
    useWallet?: boolean;
    /** What the customer wants the kitchen to know. */
    notes?: string;
  }) {
    // orderNumber is the reference every other app shows ("AAA-119"). It is
    // read back rather than invented here so the customer, the vendor, the
    // rider and the admin console all name the same order the same way.
    return request<{
      data: { order: ApiOrder & { _id: string } };
    }>("/orders/create", {
      method: "POST",
      auth: true,
      body: {
        restaurantId: input.restaurantId,
        items: input.lines.map(orderLine),
        deliveryAddress: input.address,
        paymentMethod: input.paymentMethod,
        // Sent so the discount the customer was shown is the discount they
        // get. Without it the server priced every order at full price while
        // the app went on displaying the reduced one.
        couponCode: input.couponCode ?? "",
        // The server decides how much of the balance may actually go towards
        // this order; this only says the customer asked for it to be used.
        useWallet: Boolean(input.useWallet),
        notes: input.notes ?? "",
      },
    });
  },

  /**
   * Asks the server to open a payment for an order it already holds.
   *
   * Only the order's id is sent. The amount is the server's to decide - it
   * reads it from the order - because an amount sent from here is an amount a
   * customer can edit.
   */
  /**
   * Where the rider is, and where they are going.
   *
   * `riderLocation` is absent until the rider's app has sent a position for
   * this order - before pickup, or if they denied the permission - so the map
   * has to cope with having only the two fixed ends of the journey.
   */
  async orderTracking(orderId: string) {
    return request<{
      success: boolean;
      data: {
        /** The order's status as the vendor, delivery and admin apps see it. */
        status?: string;
        /**
         * Where the customer is told the order is: preparing, picked_up,
         * on_the_way, completed or cancelled. Worked out by the server from
         * `status`, so it moves when the vendor, the rider or the admin moves
         * the order.
         */
        stage?: string;
        /** When each stage began, ISO; null where nothing recorded it. */
        stageTimes?: Record<string, string | null>;
        riderLocation?: { latitude: number; longitude: number } | null;
        restaurantLocation?: { latitude: number; longitude: number };
        deliveryLocation?: { latitude: number; longitude: number };
        routeCoordinates?: { latitude: number; longitude: number }[];
        estimatedTime?: number;
        riderInfo?: { name?: string; phone?: string; vehicleNumber?: string } | null;
        lastUpdate?: string;
        /**
         * Where this delivery sits in the rider's run, when they are carrying
         * more than one. Null when there is no queue to describe.
         */
        batch?: {
          totalStops: number;
          yourStop: number;
          stopsBefore: number;
          isNext: boolean;
          stops: { position: number; isYours: boolean; status?: string }[];
        } | null;
      };
    }>(`/orders/${orderId}/tracking`, { auth: true });
  },

  async createPayment(orderId: string) {
    return request<{
      success: boolean;
      data: {
        razorpayOrderId: string;
        amount: number;
        currency: string;
        keyId: string;
      };
    }>("/orders/razorpay/create-order", {
      method: "POST",
      auth: true,
      body: { orderId },
    });
  },

  /**
   * Hands Razorpay's signed receipt to the server, which is the only party
   * that can tell a real one from an invented one.
   */
  async verifyPayment(input: {
    orderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    return request<{ success: boolean; message?: string }>(
      "/orders/razorpay/verify",
      { method: "POST", auth: true, body: input }
    );
  },

  /**
   * Withdraws an order whose online payment never completed.
   *
   * The server only allows this while the order is still unpaid, which is the
   * whole window this is used in - the customer cancelled the payment sheet,
   * the card was declined, or the gateway never opened.
   */
  async abandonOrder(orderId: string) {
    return request<{ status: string }>(`/orders/${orderId}/pending`, {
      method: "DELETE",
      auth: true,
    });
  },
};

/**
 * Runs `work` over every item, at most `limit` at a time, keeping the order.
 *
 * The menus used to be asked for all at once - one request per restaurant,
 * every time the catalogue refreshed. With thirty restaurants that is thirty
 * connections opened in the same instant, from every phone, every two
 * minutes, and the server answers a burst like that by dropping some of it.
 */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

/** How many menus are fetched at once. */
const MENU_CONCURRENCY = 5;

/**
 * Loads the whole catalogue: the restaurant list, then each restaurant's menu.
 *
 * A restaurant whose menu fails still appears — a missing menu is better than
 * a missing restaurant — and keeps the dishes it had the last time they were
 * read (`previous`), rather than appearing empty until the next refresh gets
 * lucky. The list itself is the one call whose failure matters: it throws, and
 * the caller decides whether to keep what is already on screen.
 */
export async function loadCatalogue(
  coordinates?: { latitude: number; longitude: number },
  previous: Dish[] = []
): Promise<{
  restaurants: Restaurant[];
  dishes: Dish[];
}> {
  const restaurants = await api.restaurants(undefined, coordinates);
  const menus = await mapWithLimit(restaurants, MENU_CONCURRENCY, (restaurant) =>
    api
      .menu(restaurant.id, coordinates)
      .catch(() => previous.filter((dish) => dish.restaurantId === restaurant.id))
  );
  return { restaurants, dishes: menus.flat() };
}
