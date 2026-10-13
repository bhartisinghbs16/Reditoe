"use client";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  addresses as seedAddresses,
  combos as seedCombos,
  customer as seedCustomer,
  dishes as seedDishes,
  offers,
  restaurants as seedRestaurants,
  type Combo,
  type Dish,
  type Offer,
  type Restaurant,
} from "@/lib/data";
// Pricing and order seeding run outside render, so they read the module
// catalogue directly; the reactive copy above is what the screens draw from.
import {
  restaurantById as lookupRestaurant,
  setCatalogue,
  type CatalogueSource,
} from "@/lib/catalogue";
import type { ApiOrder, DeliveryAddress, RefundRequest } from "@/lib/api";
import { useHere, type Here } from "@/lib/here";
import { registerForPush, unregisterForPush } from "@/lib/push";
import {
  type ProfilePhoto,
  api,
  getAuthToken,
  hydrateAuthToken,
  loadCatalogue,
  setAuthToken,
} from "@/lib/api";
import { humanName } from "@/lib/format";

/**
 * The signed-in account as the screens see it.
 *
 * The name goes through humanName, so an id or key that ended up in the
 * account's name field is dropped here once instead of being filtered at every
 * place a name is drawn. Nothing else from the API response is kept: the
 * server's address, tokens and ids stay in this file and in api.ts.
 */
function toAuthUser(user?: { name?: string; email?: string; phone?: string } | null) {
  return {
    name: humanName(user?.name),
    email: user?.email ?? "",
    phone: user?.phone ?? "",
  };
}

/** What a customer without a usable name is called on screen. */
const FALLBACK_NAME = "Customer";

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface CartLine {
  /** Distinct per dish + portion + extras, so two variants sit apart. */
  key: string;
  dishId: string;
  name: string;
  restaurantId: string;
  veg: boolean;
  portionName?: string;
  /**
   * The portion as the API knows it, so the order can name the choice rather
   * than leaving the server to price the default. Absent for a dish with no
   * variants, and for the seeded catalogue.
   */
  portion?: { groupId: string; optionId: string };
  extras: { id: string; name: string; price: number; groupId?: string }[];
  unitPrice: number;
  quantity: number;
}

export interface PlacedOrder {
  id: string;
  /** The customer-facing reference the reference screens print, "#RT…". */
  code: string;
  restaurantId: string;
  lines: CartLine[];
  status: string;
  /** Decided by the server, so the app and the API cannot disagree. */
  canCancel?: boolean;
  canRequestRefund?: boolean;
  placedAt: string;
  etaAt: string;
  deliveredAt?: string;
  totals: Totals;
  addressId: string;
  paymentMethod: string;
  paymentDetail: string;
}

/**
 * One bill. Every line is to the paisa and the lines add up exactly:
 *
 *   toPay = itemTotal + packaging + delivery + platformFee + taxes + tip
 *           - discount - walletUsed
 *
 * When the server has priced it these are the server's own figures, so the
 * cart, the payment screen, the order screen and the admin console all print
 * the same numbers.
 */
export interface Totals {
  itemTotal: number;
  packaging: number;
  delivery: number;
  platformFee: number;
  /** GST on the food, and on the delivery and platform fees. */
  taxes: number;
  tip?: number;
  /** Coupon discount, taken off the item total. */
  discount: number;
  /** The coupon the discount belongs to, if one applied. */
  couponCode?: string;
  /** Why the coupon the customer chose is not taking anything off, if so. */
  couponError?: string | null;
  /** Reditoe Money going towards this order. */
  walletUsed?: number;
  /** The most Reditoe Money this bill could take, switched on or not. */
  walletCap?: number;
  /** The bill before the coupon and Reditoe Money come off it. */
  grossTotal?: number;
  /** What the customer saved - the coupon discount. */
  saved: number;
  /** The net payable amount. */
  toPay: number;
  distanceKmUsed?: number;
}

/* ── Pricing ────────────────────────────────────────────────────────────── */

/** To the paisa, the way the server rounds every line of a bill. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * An estimate of the bill, for when the server has not priced it - signed out,
 * offline, or a moment before its answer arrives. The payment screen never
 * charges against this: Pay waits for the server's own figures.
 *
 * It follows the server's rules so an estimate lands close to the real thing:
 * the coupon comes off the item total, the platform fee is 2% of it (minimum
 * 8), and GST is 5% on the food and 18% on the delivery and platform fees.
 * What it cannot know is the distance, so delivery is the restaurant's flat
 * fee. It no longer waives delivery above a threshold or for Plus members -
 * the server charges delivery to everyone, and an estimate promising "FREE"
 * was a figure nobody was ever billed.
 */
export function computeTotals(
  lines: CartLine[],
  restaurantId: string | null,
  offer: Offer | null
): Totals {
  const restaurant = restaurantId ? lookupRestaurant(restaurantId) : null;
  const hasItems = lines.length > 0;

  const itemTotal = round2(
    lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  );

  let discount = 0;
  if (offer && itemTotal >= offer.minOrder) {
    if (offer.kind === "flat") discount = offer.value;
    else if (offer.kind === "percent") {
      const raw = (itemTotal * offer.value) / 100;
      discount = offer.maxDiscount ? Math.min(raw, offer.maxDiscount) : raw;
    }
  }
  // Whole rupees, and never more than the food - as the server does it.
  discount = Math.min(Math.round(discount), Math.round(itemTotal));

  const delivery = hasItems ? round2(restaurant?.deliveryFee ?? 0) : 0;
  const packaging = hasItems ? round2(restaurant?.packagingFee ?? 0) : 0;
  const platformFee = hasItems ? round2(Math.max(itemTotal * 0.02, 8)) : 0;
  const taxes = hasItems
    ? round2(
        round2(itemTotal * 0.05) +
          round2(delivery * 0.18) +
          round2(platformFee * 0.18)
      )
    : 0;

  const grossTotal = round2(itemTotal + packaging + delivery + platformFee + taxes);

  return {
    itemTotal,
    packaging,
    delivery,
    platformFee,
    taxes,
    discount,
    couponCode: discount > 0 ? offer?.code : undefined,
    walletUsed: 0,
    grossTotal,
    saved: discount,
    toPay: Math.max(0, round2(grossTotal - discount)),
  };
}

/**
 * An order's bill as the server stored it.
 *
 * `gstAndPackaging` is the whole tax charge - GST on the food plus GST on the
 * delivery and platform fees. Packaging is its own line, not part of it.
 */
function totalsFromApiOrder(raw: ApiOrder, fallbackItemTotal = 0): Totals {
  const discount = Number(raw.discount ?? 0);
  const walletUsed = Number(raw.walletUsed ?? 0);
  const toPay = Number(raw.total ?? 0);
  return {
    itemTotal: Number(raw.subtotal ?? fallbackItemTotal),
    packaging: Number(raw.packagingFee ?? 0),
    delivery: Number(raw.deliveryFee ?? 0),
    platformFee: Number(raw.platformFee ?? 0),
    taxes: Number(raw.gstAndPackaging ?? raw.tax ?? 0),
    tip: Number(raw.tip ?? 0),
    discount,
    couponCode: raw.couponCode || undefined,
    walletUsed,
    grossTotal: round2(toPay + discount + walletUsed),
    saved: discount,
    toPay,
  };
}

/* ── Context ────────────────────────────────────────────────────────────── */

interface StoreValue {
  lines: CartLine[];
  cartRestaurantId: string | null;
  itemCount: number;
  appliedOffer: Offer | null;
  /** Live coupons when the API has them, the sample list otherwise. */
  offers: Offer[];

  /* Auth. Everything below the catalogue and coupons needs a signed-in user. */
  signedIn: boolean;
  /**
   * False until the stored token has been checked. The gate waits on this:
   * routing on `signedIn` alone would bounce a returning customer to the
   * sign-in screen for the moment before their session is restored.
   */
  authReady: boolean;
  authUser: { name: string; email: string; phone: string } | null;
  /**
   * Whether this account may pay cash on delivery.
   *
   * The admin switches it per customer and the order endpoint enforces it,
   * but the app was never told — so cash was never offered and turning the
   * switch on looked like it did nothing.
   */
  codEnabled: boolean;
  authError: string | null;
  signingIn: boolean;
  /**
   * Texts a sign-in code to a mobile number. There is no password: the number
   * and the code are the only way in. Resolves with the code when the server
   * could not deliver it (never in production), so the flow can still finish.
   */
  requestOtp: (
    phone: string
  ) => Promise<{ ok: boolean; code?: string; resendAfterSeconds?: number }>;
  /**
   * Checks the code. A number with an account is signed in ("signed-in"); one
   * without is sent to sign up ("new"), with the number held as verified until
   * the sign-up screen has what it needs.
   */
  verifyOtp: (phone: string, otp: string) => Promise<"signed-in" | "new" | "failed">;
  /**
   * The number that has just been verified and has no account yet, or null.
   * Held in memory only: it is a proof the server issued, good for one account,
   * and there is nothing to be gained by it surviving a restart.
   */
  pendingSignup: { phone: string } | null;
  /** Gives up on signing up, so the next attempt starts from the number again. */
  cancelSignUp: () => void;
  /** Creates the account for the verified number, and signs it in. */
  completeSignUp: (input: {
    name: string;
    email: string;
    /** ISO date, YYYY-MM-DD. */
    dateOfBirth: string;
    photo: ProfilePhoto;
    referralCode?: string;
  }) => Promise<boolean>;
  signOut: () => void;
  /**
   * The number this phone was remembered for - signed in with a code here
   * recently, and not signed out since - or null.
   */
  rememberedPhone: string | null;
  /**
   * Signs the remembered number back in without a code. False when that is not
   * possible (lapsed, revoked, no connection), in which case a code is the way.
   */
  signInRemembered: (phone: string) => Promise<boolean>;

  /** Populated once signed in; null while anonymous. */
  wallet: {
    balance: number;
    minTransfer: number;
    /** Held back by support; part of the balance but not spendable. */
    heldAmount: number;
    spendable: number;
  } | null;
  walletTransactions: { id: string; title: string; amount: number; at: string }[];
  membershipInfo: { active: boolean; planLabel: string | null; validTill: string | null;
    autoRenewal: boolean; savings: { delivery: number; discounts: number; coupons: number;
    cashback: number; total: number } } | null;
  /** Re-reads everything that only exists for a signed-in customer. */
  reloadAuthedData: () => Promise<void>;

  savedAddresses: { id: string; label: string; street: string; city: string;
    state: string; zipCode: string; isDefault: boolean;
    /** Set once the address has been located; the map needs a point. */
    latitude?: number; longitude?: number }[];
  refundSummary: { raised: number; completed: number; inProgress: number;
    totalRefunded: number } | null;
  /** The customer's own refunds. The screen listed a sample set before. */
  refundRequests: RefundRequest[];
  /** What the customer wants the kitchen to know. Sent with the order. */
  orderNotes: string;
  setOrderNotes: (notes: string) => void;

  /** Raises a refund and folds it into the list on success. */
  requestRefund: (input: { orderId: string; reason: string; amount?: number }) =>
    Promise<{ ok: boolean; message: string }>;
  totals: Totals;
  addLine: (
    dish: Dish,
    options?: {
      portionName?: string;
      portion?: CartLine["portion"];
      unitPrice?: number;
      extras?: CartLine["extras"];
    }
  ) => { replacedCart: boolean };
  setQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
  applyOffer: (offer: Offer | null) => void;
  /**
   * Whether the customer wants Reditoe Money put towards this order. It lives
   * here, not on the payment screen, because it changes the bill - the server
   * prices it - and the bill is read from several screens.
   */
  useWallet: boolean;
  setUseWallet: (on: boolean) => void;
  /**
   * Whether `totals` is the server's own price for the basket as it stands.
   *
   * 'ready' - it is; 'pending' - a new quote is on its way, so the figures
   * shown are about to change; 'failed' - the server could not price it, and
   * the figures are an estimate; 'idle' - nothing to price, or signed out.
   * Payment only proceeds on 'ready': the amount charged is the server's, and
   * a customer should never pay a number they were not shown.
   */
  billStatus: "idle" | "pending" | "ready" | "failed";
  /** Asks the server to price the basket again. */
  refreshBill: () => void;

  addresses: typeof seedAddresses;
  selectedAddressId: string;
  selectAddress: (id: string) => void;

  /**
   * Where the phone is, refreshed while the app is open. Null until the
   * customer allows it, or forever if they do not.
   */
  here: Here | null;
  /**
   * True while the header and the order are following the detected position
   * rather than a saved address the customer picked.
   */
  usingHere: boolean;
  /** Go back to the detected position after picking an address. */
  useHereAsAddress: () => void;
  /**
   * What to call the destination, wherever it is shown.
   *
   * Home, cart and checkout each derived this for themselves, so making the
   * home screen follow the detected position would have left the other two
   * naming a saved address for the same order.
   */
  destination: { label: string; line: string; city: string; latitude?: number; longitude?: number };

  favourites: string[];
  toggleFavourite: (restaurantId: string) => void;

  orders: PlacedOrder[];
  /**
   * True only once we know: the history has been read and it is empty.
   *
   * Anything for first-time customers hangs off this rather than off
   * `orders.length === 0`, which is also true while the history is loading.
   */
  isFirstTimeCustomer: boolean;
  /**
   * `deferCommit` places the order on the server but leaves the basket alone
   * and keeps the order off this list. Online payments use it: until the money
   * is actually taken the order is not one the customer has placed, and the
   * restaurant is not shown it either. Call `commitPlacedOrder` once the
   * payment verifies, or `discardPlacedOrder` when it doesn't.
   */
  placeOrder: (
    paymentMethod: string,
    paymentDetail?: string,
    options?: { deferCommit?: boolean; useWallet?: boolean }
  ) => Promise<PlacedOrder>;
  commitPlacedOrder: (order: PlacedOrder) => void;
  /**
   * Records a status the server has just reported for an order, so every
   * screen reading this list agrees with the one that heard it. The tracking
   * screen polls far more often than the list does, and uses this to hand
   * what it learns to the rest of the app.
   */
  syncOrderStatus: (orderId: string, status: string) => void;

  customer: typeof seedCustomer;
  plusMember: boolean;

  /** Where the catalogue on screen came from, and why if the API was skipped. */
  dataSource: CatalogueSource;
  apiError: string | null;
  reloadCatalogue: () => void;

  /**
   * The catalogue lives in React state rather than a module variable so the
   * screens re-render when the API answers. Reading module state during render
   * looks constant to the React Compiler, which the project has enabled, and
   * the swap never reaches the screen.
   */
  restaurants: Restaurant[];
  /**
   * The kinds of food on sale, and the one being filtered by.
   *
   * `restaurants` above always holds the full list; `visibleRestaurants` is
   * what a screen honouring the filter should show. Keeping both means the
   * choice never hides a restaurant from somewhere that does not filter.
   */
  /** Posters from the admin panel, newest placement order first. */
  banners: {
    id: string;
    title: string;
    description: string | null;
    imageUrl: string;
    actionType: string | null;
    actionValue: string | null;
    actionUrl: string | null;
  }[];
  foodCategories: {
    id: string;
    name: string;
    items: number;
    restaurants: number;
    image: string | null;
  }[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  visibleRestaurants: Restaurant[];
  dishes: Dish[];
  restaurantById: (id: string) => Restaurant | undefined;
  dishById: (id: string) => Dish | undefined;
  dishesForRestaurant: (restaurantId: string) => Dish[];
  combosForRestaurant: (restaurantId: string) => Combo[];
  popularDishes: () => Dish[];
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

function lineKey(dishId: string, portionName?: string, extras: CartLine["extras"] = []) {
  return [dishId, portionName ?? "-", ...extras.map((e) => e.id).sort()].join("|");
}


/**
 * Turns an order as the server describes it into the shape the screens read.
 *
 * The order list, the order screen and tracking all read from this store, and
 * the store was only ever written to when an order was placed in this session
 * - it started from a hard-coded sample history and never asked the server for
 * anything. So a brand new customer saw somebody else's biryani, an order's
 * status never moved once the screen had been opened, and the reference shown
 * to the customer ("#RTo1") was not the one the restaurant, the rider and the
 * admin console were all using for the same order ("AAA-119").
 */
function toPlacedOrder(raw: ApiOrder): PlacedOrder {
  const restaurantId =
    typeof raw.restaurantId === "string"
      ? raw.restaurantId
      : (raw.restaurantId?._id ?? "");

  const lines: CartLine[] = (raw.items ?? []).map((item, index) => {
    const food = typeof item.foodItemId === "string" ? null : item.foodItemId;
    const dishId = (typeof item.foodItemId === "string" ? item.foodItemId : food?._id) ?? "";
    return {
      key: `${dishId || "item"}-${index}`,
      dishId,
      restaurantId,
      name: item.name ?? food?.name ?? "Item",
      veg: false,
      unitPrice: Number(item.price ?? food?.price ?? 0),
      quantity: Number(item.quantity ?? 1),
      extras: [],
    };
  });

  const itemTotal = Number(
    raw.subtotal ?? lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  );
  const placedAt = raw.createdAt ?? new Date().toISOString();
  const etaMinutes = Number(raw.estimatedDeliveryMinutes ?? 30);

  return {
    id: String(raw.id),
    // The one reference every app prints for this order.
    code: raw.orderNumber ?? "",
    restaurantId,
    lines,
    status: raw.status ?? "Waiting for Confirmation",
    canCancel: raw.canCancel,
    canRequestRefund: raw.canRequestRefund,
    placedAt,
    etaAt: new Date(new Date(placedAt).getTime() + etaMinutes * 60_000).toISOString(),
    totals: totalsFromApiOrder(raw, itemTotal),
    addressId: "",
    paymentMethod: raw.paymentMethod ?? "",
    paymentDetail: raw.paymentMethod ?? "",
  };
}


const CART_KEY = "reditoe.cart";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  /**
   * The food categories on sale, and which one the customer is filtering by.
   *
   * Both live here rather than on the home screen so the choice survives
   * moving between tabs, and so the row is fetched once.
   */
  const [foodCategories, setFoodCategories] = useState<
    { id: string; name: string; items: number; restaurants: number; image: string | null }[]
  >([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  /** Posters set in the admin panel. Empty until they are fetched, or if none. */
  const [banners, setBanners] = useState<
    {
      id: string;
      title: string;
      description: string | null;
      imageUrl: string;
      actionType: string | null;
      actionValue: string | null;
      actionUrl: string | null;
    }[]
  >([]);
  const [categoryRestaurants, setCategoryRestaurants] = useState<Restaurant[] | null>(null);
  const [appliedOffer, setAppliedOffer] = useState<Offer | null>(null);
  /** Whether Reditoe Money is to be put towards the order. See StoreValue. */
  const [useWallet, setUseWallet] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState(seedAddresses[0].id);

  /**
   * The detected position, and whether it is what we are delivering to.
   *
   * Detection starts on launch, so a fresh open follows the customer's
   * current location. Choosing an address from the book turns it off for the
   * rest of the session — a deliberate choice outranks a guess — and the
   * next launch starts on the detected position again.
   */
  const here = useHere();
  const [pickedAddress, setPickedAddress] = useState(false);
  const selectAddress = useCallback((id: string) => {
    setSelectedAddressId(id);
    setPickedAddress(true);
  }, []);
  // Otherwise picking an address once would hold until the app was restarted.
  const useHereAsAddress = useCallback(() => setPickedAddress(false), []);
  const [favourites, setFavourites] = useState<string[]>(["r1", "r6"]);
  /*
   * Empty until the server says otherwise. This began as a hard-coded sample
   * history, so a customer who had never ordered was shown four orders that
   * were not theirs - with references that did not match the ones the
   * restaurant and the admin console were using for the same orders.
   */
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  /*
   * Whether the customer's order history has actually been read yet.
   *
   * An empty list means two different things - "never ordered" and "not
   * fetched yet" - and anything shown only to first-time customers would
   * otherwise appear for a moment on every launch and then vanish.
   */
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [dataSource, setDataSource] = useState<CatalogueSource>("fixtures");
  const [apiError, setApiError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [couponList, setCouponList] = useState<Offer[]>(offers);
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<{
    name: string;
    email: string;
    phone: string;
  } | null>(null);
  const [codEnabled, setCodEnabled] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [rememberedPhone, setRememberedPhone] = useState<string | null>(null);
  const refreshRemembered = useCallback(() => {
    void api
      .rememberedPhone()
      .then(setRememberedPhone)
      .catch(() => {});
  }, []);
  const [wallet, setWallet] = useState<StoreValue["wallet"]>(null);
  const [walletTransactions, setWalletTransactions] = useState<StoreValue["walletTransactions"]>([]);
  const [membershipInfo, setMembershipInfo] = useState<StoreValue["membershipInfo"]>(null);
  const [savedAddresses, setSavedAddresses] = useState<StoreValue["savedAddresses"]>([]);

  // Discovery and checkout use the same destination. A selected saved address
  // takes precedence over the phone's current GPS position.
  const catalogueCoordinates = useMemo(() => {
    const usingCurrentLocation = Boolean(here) && (!pickedAddress || savedAddresses.length === 0);
    if (usingCurrentLocation && here) {
      return { latitude: here.latitude, longitude: here.longitude };
    }
    const entry = savedAddresses.find((a) => a.id === selectedAddressId) ?? savedAddresses[0];
    return entry?.latitude != null && entry?.longitude != null
      ? { latitude: entry.latitude, longitude: entry.longitude }
      : undefined;
  }, [here, pickedAddress, savedAddresses, selectedAddressId]);
  const [refundSummary, setRefundSummary] = useState<StoreValue["refundSummary"]>(null);
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [orderNotes, setOrderNotes] = useState("");
  const [catalogue, setCatalogueState] = useState<{
    restaurants: Restaurant[];
    dishes: Dish[];
    combos: Combo[];
  }>({ restaurants: seedRestaurants, dishes: seedDishes, combos: seedCombos });

  /**
   * Turn a stored token back into a session.
   *
   * The token outlives the process on web; without this the customer was
   * signed out by every refresh, and with the sign-in gate in front of the
   * app that would mean signing in again on every visit. A token the server
   * rejects is discarded rather than kept around failing.
   */
  useEffect(() => {
    let cancelled = false;

    /**
     * Back in without a code, if this phone was signed in with one recently and
     * not signed out since. A dead connection is not an answer: the phone stays
     * remembered and the sign-in screen offers it again.
     */
    const viaRememberedDevice = async () => {
      try {
        const res = await api.rememberedLogin();
        if (!res || cancelled) return false;
        await afterAuth(res);
        return true;
      } catch {
        return false;
      }
    };

    // Reading storage is asynchronous on a phone, so the token has to be
    // fetched before anything can conclude that nobody is signed in.
    hydrateAuthToken().then(async (stored) => {
      if (cancelled) return;
      if (!stored) {
        await viaRememberedDevice();
        if (!cancelled) setAuthReady(true);
        refreshRemembered();
        return;
      }

      api
        .me()
        .then((user) => {
          if (cancelled) return;
          setToken(stored);
          setAuthUser(toAuthUser(user));
          setCodEnabled(user?.codEnabled === true);
        })
        .catch(async () => {
          if (cancelled) return;
          setAuthToken(null);
          // The session token lasts a week; a remembered phone outlasts it.
          const back = await viaRememberedDevice();
          if (cancelled || back) return;
          setToken(null);
          setAuthUser(null);
        })
        .finally(() => {
          if (!cancelled) setAuthReady(true);
          refreshRemembered();
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The home posters, kept current while the app is open.
   *
   * They were read once at launch, so a poster the admin added, changed or
   * took down never reached a phone that was already open. They are asked for
   * again when the app returns to the foreground and every half minute while
   * it is being used - far more often than the catalogue, because the list is
   * a few small rows and a campaign going live is something the admin watches
   * for. Polling rather than a socket, for the same reason as the catalogue.
   *
   * The list is replaced only when it actually differs, so the carousel is
   * not rebuilt - and sent back to its first poster - on every poll.
   */
  useEffect(() => {
    let cancelled = false;
    const POLL_MS = 30 * 1000;

    const pull = () => {
      api
        .banners()
        .then((rows) => {
          if (cancelled) return;
          setBanners((current) =>
            JSON.stringify(current) === JSON.stringify(rows) ? current : rows
          );
        })
        .catch(() => {
          /* keep what is showing; with nothing, the screen draws its own offers */
        });
    };

    pull();

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") pull();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") pull();
    }, POLL_MS);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  /** The categories on sale. Quietly absent if the call fails; the row hides. */
  useEffect(() => {
    let cancelled = false;
    api
      .foodCategories()
      .then((rows) => {
        if (!cancelled) setFoodCategories(rows);
      })
      .catch(() => {
        /* the row simply does not appear */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The restaurants for the chosen category.
   *
   * Asked of the server rather than filtered on the device, because whether a
   * restaurant sells pizza is a question about its menu, and the menus are
   * not all on the phone. Null means no category is chosen and the full list
   * stands.
   */
  useEffect(() => {
    let cancelled = false;
    if (!selectedCategory) {
      setCategoryRestaurants(null);
      return;
    }
    api
      .restaurants(selectedCategory, catalogueCoordinates)
      .then((rows) => {
        if (!cancelled) setCategoryRestaurants(rows);
      })
      .catch(() => {
        // A failed serviceability request must not expose an unfiltered list.
        if (!cancelled) setCategoryRestaurants([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCategory, catalogueCoordinates?.latitude, catalogueCoordinates?.longitude]);

  /**
   * Whether a real list of restaurants has ever arrived from the server, and the
   * dishes that came with it. A refresh that fails consults these before it
   * touches what is on screen.
   */
  const hasLiveCatalogue = React.useRef(false);
  const dishesOnScreen = React.useRef<Dish[]>([]);
  dishesOnScreen.current = catalogue.dishes;

  /**
   * Pull the catalogue from the API once on boot, and again as it goes stale.
   *
   * A failure here is a problem with one request, not a verdict on the
   * restaurants. The catalogue refreshes when the app comes back to the
   * foreground, every two minutes, and whenever the customer moves; wiping the
   * list on any one of those failing meant a single dropped connection, a 429,
   * or a server restart emptied the home screen under somebody who was
   * scrolling it. What is on screen now stays until the server actually says
   * something different.
   */
  useEffect(() => {
    let cancelled = false;

    loadCatalogue(catalogueCoordinates, dishesOnScreen.current)
      .then(({ restaurants, dishes }) => {
        if (cancelled) return;
        hasLiveCatalogue.current = true;
        if (restaurants.length === 0) {
          // An empty live result is a valid serviceability result. Never fall
          // back to seeded restaurants here: that would reintroduce hotels in
          // other cities/states after the server correctly filtered them out.
          setCatalogueState({ restaurants: [], dishes: [], combos: [] });
          setCatalogue({ restaurants: [], dishes: [] });
          setDataSource("api");
          setApiError(null);
          return;
        }
        // Combos have no API equivalent yet, so the seeded ones are dropped
        // rather than shown against restaurants that never offered them.
        setCatalogueState({ restaurants, dishes, combos: [] });
        setCatalogue({ restaurants, dishes });
        setDataSource("api");
        setApiError(null);

        /**
         * Drop anything in the basket the real catalogue does not have.
         *
         * When the API cannot be reached the app shows sample restaurants,
         * whose ids are "r1", "r6" and so on rather than the ids the server
         * issues. Ordering one got as far as the payment screen and failed
         * there with "Invalid ObjectId provided for restaurantId", which
         * names a database detail at a customer who only picked a biryani.
         *
         * Now that the basket outlives the app, one built against sample data
         * would fail that way on every attempt until it was emptied by hand.
         */
        const liveRestaurants = new Set(restaurants.map((entry) => entry.id));
        const liveDishes = new Set(dishes.map((entry) => entry.id));
        setLines((current) => {
          /**
           * Both ends have to still exist.
           *
           * Checking only the restaurant left baskets holding dishes that had
           * since been renamed, removed by the vendor, or reissued with new
           * ids when the catalogue was rebuilt. The restaurant was still
           * there, so the line stayed, and the order failed at the payment
           * screen with "Food item not found with ID" - a database message,
           * shown to someone whose only mistake was leaving the app open.
           */
          const usable = current.filter(
            (line) => liveRestaurants.has(line.restaurantId) && liveDishes.has(line.dishId)
          );
          return usable.length === current.length ? current : usable;
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setApiError(message);
        // A refresh that failed leaves the last good list where it is.
        if (hasLiveCatalogue.current) return;
        // Nothing real has ever loaded. Never show bundled/sample restaurants
        // in its place: doing so can expose restaurants outside the customer's
        // 10 km service area. The home screen says it could not load, with a
        // way to try again, rather than claiming there is nothing nearby.
        setCatalogueState({ restaurants: [], dishes: [], combos: [] });
        setCatalogue({ restaurants: [], dishes: [] });
        setDataSource("api");
      });

    // A stored token means the customer was already signed in before this load.
    const restored = getAuthToken();
    if (restored && !token) {
      setToken(restored);
      loadAuthedData();
    }

    api
      .coupons()
      .then((live) => {
        if (!cancelled && live.length > 0) setCouponList(live);
      })
      .catch(() => {
        // Coupons are a nicety; the sample ones stay if the call fails.
      });

    return () => {
      cancelled = true;
    };
  }, [reloadCount, catalogueCoordinates?.latitude, catalogueCoordinates?.longitude]);

  /*
   * Keep prices current while the app is open.
   *
   * The catalogue was fetched once at startup and never again, so a price a
   * vendor changed did not reach anyone who already had the app open - they
   * had to close and reopen it to see it. The checkout was never wrong about
   * it (the server prices every order), but the menu was, which is worse: the
   * customer was quoted one price and charged another.
   *
   * Refreshed when the app comes back to the foreground, and every few
   * minutes while it is being used. Polling rather than a socket, because the
   * app holds no connection of its own and a menu price does not need one.
   */
  useEffect(() => {
    const REFRESH_EVERY_MS = 2 * 60 * 1000;

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") setReloadCount((n) => n + 1);
    });

    const timer = setInterval(() => {
      if (AppState.currentState === "active") setReloadCount((n) => n + 1);
    }, REFRESH_EVERY_MS);

    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  /**
   * The basket, kept across launches.
   *
   * It used to live only in React state, so closing the app - or the app
   * being reloaded - emptied it, and a customer who came back found the
   * checkout screen saying there was nothing to pay for. Restored once on
   * open and written on every change after that.
   */
  const [cartReady, setCartReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CART_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw) as CartLine[];
        if (Array.isArray(saved) && saved.length) setLines(saved);
      })
      .catch(() => {
        /* an unreadable basket is an empty one */
      })
      .finally(() => {
        if (!cancelled) setCartReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Held back until the restore has run, or the empty starting state would
    // be written over the basket before it was read.
    if (!cartReady) return;
    AsyncStorage.setItem(CART_KEY, JSON.stringify(lines)).catch(() => {
      /* the basket on screen is still right; only the next launch loses it */
    });
  }, [lines, cartReady]);

  /*
   * Re-price the basket against the catalogue whenever it refreshes.
   *
   * A line holds the price it was added at. Once the catalogue started
   * refreshing, a vendor's price change would leave the basket showing what
   * the item used to cost while the server charged what it costs now - the
   * customer quoted one figure and billed another. The line follows the menu.
   *
   * Only the price moves. Quantity, portion and extras are the customer's
   * choices and are left alone, and a dish that has left the menu keeps its
   * last known price rather than dropping to zero.
   */
  useEffect(() => {
    if (!cartReady || lines.length === 0) return;
    setLines((current) => {
      let changed = false;
      const next = current.map((line) => {
        const dish = catalogue.dishes.find((d) => d.id === line.dishId);
        if (!dish || dish.price === line.unitPrice) return line;
        changed = true;
        return { ...line, unitPrice: dish.price };
      });
      return changed ? next : current;
    });
  }, [catalogue.dishes, cartReady, lines.length]);

  const cartRestaurantId = lines[0]?.restaurantId ?? null;

  const addLine = useCallback<StoreValue["addLine"]>((dish, options) => {
    const extras = options?.extras ?? [];
    const unitPrice =
      (options?.unitPrice ?? dish.price) +
      extras.reduce((sum, extra) => sum + extra.price, 0);
    const key = lineKey(dish.id, options?.portionName, extras);

    let replacedCart = false;
    setLines((current) => {
      // A cart holds one restaurant at a time — mixing them can't be delivered
      // as a single order, so adding from another kitchen starts fresh.
      const differentRestaurant =
        current.length > 0 && current[0].restaurantId !== dish.restaurantId;
      if (differentRestaurant) {
        replacedCart = true;
        return [
          {
            key,
            dishId: dish.id,
            name: dish.name,
            restaurantId: dish.restaurantId,
            veg: dish.veg,
            portionName: options?.portionName,
            portion: options?.portion,
            extras,
            unitPrice,
            quantity: 1,
          },
        ];
      }

      const existing = current.find((l) => l.key === key);
      if (existing) {
        return current.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...current,
        {
          key,
          dishId: dish.id,
          name: dish.name,
          restaurantId: dish.restaurantId,
          veg: dish.veg,
          portionName: options?.portionName,
          portion: options?.portion,
          extras,
          unitPrice,
          quantity: 1,
        },
      ];
    });

    if (replacedCart) setAppliedOffer(null);
    return { replacedCart };
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.key !== key)
        : current.map((l) => (l.key === key ? { ...l, quantity } : l))
    );
  }, []);

  const clearCart = useCallback(() => {
    setLines([]);
    setAppliedOffer(null);
    setOrderNotes("");
    setUseWallet(false);
  }, []);

  const toggleFavourite = useCallback((restaurantId: string) => {
    setFavourites((current) =>
      current.includes(restaurantId)
        ? current.filter((id) => id !== restaurantId)
        : [...current, restaurantId]
    );
  }, []);


  /** Pulls everything that only exists for a signed-in customer. */
  const loadAuthedData = useCallback(async () => {
    const settle = async <T,>(work: Promise<T>, onOk: (value: T) => void) => {
      try {
        onOk(await work);
      } catch {
        // One failing section must not blank the others.
      }
    };

    await Promise.all([
      // The name and contact details, so an edit on the profile screen - or
      // one made by support - shows up without signing out and back in.
      settle(api.me(), (user) => setAuthUser(toAuthUser(user))),
      settle(api.wallet(), (res) => {
        setWallet({
          balance: res.data.wallet.balance,
          minTransfer: res.data.wallet.minTransfer,
          heldAmount: res.data.wallet.heldAmount ?? 0,
          spendable:
            res.data.wallet.spendable ?? res.data.wallet.balance,
        });
        setWalletTransactions(
          res.data.transactions.map((txn) => ({
            id: txn.id,
            title: txn.title,
            amount: txn.amount,
            at: txn.at,
          }))
        );
      }),
      settle(api.membership(), (res) => setMembershipInfo(res.data.membership)),
      settle(api.addresses(), setSavedAddresses),
      settle(api.myRefunds(), (res) => {
        setRefundSummary(res.summary);
        setRefundRequests(res.refunds);
      }),
      // The customer's real order history, replacing the sample one outright -
      // an account with no orders should show none, not somebody else's.
      settle(api.myOrders(), (rows) => {
        setOrders(rows.map(toPlacedOrder));
        setOrdersLoaded(true);
      }),
    ]);
  }, []);

  const afterAuth = useCallback(
    async (result: { token: string; data: { user: unknown } }) => {
      setToken(result.token);
      const user = result.data?.user as
        | { name?: string; email?: string; phone?: string; codEnabled?: boolean }
        | undefined;
      setAuthUser(toAuthUser(user));
      setCodEnabled(user?.codEnabled === true);
      setAuthError(null);
      await loadAuthedData();
    },
    [loadAuthedData]
  );

  /**
   * The verified number waiting for a sign-up, with the proof the server issued
   * for it. The proof stays in this ref rather than in state or in the route:
   * nothing renders from it, and a route parameter would put it in the address
   * bar and the history of the web build.
   */
  const signupProof = React.useRef<{ phone: string; proof: string } | null>(null);
  const [pendingSignup, setPendingSignup] = useState<{ phone: string } | null>(null);

  const requestOtp = useCallback<StoreValue["requestOtp"]>(async (phone) => {
    setAuthError(null);
    setSigningIn(true);
    try {
      const res = await api.sendOtp(phone.trim());
      // Present only when the server had no way to send it.
      return {
        ok: true,
        code: res?.devOtp,
        resendAfterSeconds: res?.data?.resendAfterSeconds,
      };
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not send the code");
      return { ok: false };
    } finally {
      setSigningIn(false);
    }
  }, []);

  const verifyOtp = useCallback<StoreValue["verifyOtp"]>(
    async (phone, otp) => {
      setAuthError(null);
      setSigningIn(true);
      try {
        const res = await api.verifyOtp(phone.trim(), otp.trim());
        if (res.isNewUser) {
          if (!res.phoneProof) throw new Error("The server did not confirm that number.");
          signupProof.current = { phone: res.phone ?? phone, proof: res.phoneProof };
          setPendingSignup({ phone: res.phone ?? phone });
          return "new";
        }
        await afterAuth(res as { token: string; data: { user: unknown } });
        refreshRemembered();
        return "signed-in";
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "That code was not accepted");
        return "failed";
      } finally {
        setSigningIn(false);
      }
    },
    [afterAuth, refreshRemembered]
  );

  const cancelSignUp = useCallback(() => {
    signupProof.current = null;
    setPendingSignup(null);
    setAuthError(null);
  }, []);

  const signInRemembered = useCallback<StoreValue["signInRemembered"]>(
    async (phone) => {
      setAuthError(null);
      setSigningIn(true);
      try {
        const res = await api.rememberedLogin(phone);
        if (!res) return false;
        await afterAuth(res);
        return true;
      } catch {
        return false;
      } finally {
        setSigningIn(false);
        refreshRemembered();
      }
    },
    [afterAuth, refreshRemembered]
  );

  const completeSignUp = useCallback<StoreValue["completeSignUp"]>(
    async (input) => {
      const held = signupProof.current;
      if (!held) {
        setAuthError("Verify your mobile number first.");
        return false;
      }
      setAuthError(null);
      setSigningIn(true);
      try {
        const result = await api.register({
          ...input,
          phone: held.phone,
          phoneProof: held.proof,
        });
        // Signed in first, so the sign-up screen - which sends anybody with no
        // number pending and no session back to the start - never sees the gap.
        await afterAuth(result);
        signupProof.current = null;
        setPendingSignup(null);
        refreshRemembered();
        return true;
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "Could not create your account");
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    [afterAuth, refreshRemembered]
  );

  const signOut = useCallback(() => {
    // Before the token goes, so this phone stops receiving this customer's
    // order updates the moment they sign out of it.
    void unregisterForPush();
    // Signing out means signing out: this phone is forgotten too, so typing the
    // number again asks for a code rather than walking back in.
    void api.forgetDevice().finally(() => setRememberedPhone(null));
    setAuthToken(null);
    setToken(null);
    setAuthUser(null);
    setCodEnabled(false);
    setWallet(null);
    setWalletTransactions([]);
    setMembershipInfo(null);
    setSavedAddresses([]);
    setRefundSummary(null);
    /*
     * The basket goes too. It is kept on the device, so leaving it behind
     * would hand the next person to sign in on this phone the last one's
     * food - and price it against their account.
     */
    setLines([]);
    setAppliedOffer(null);
  }, []);

  /**
   * The server's price for the basket as it stands.
   *
   * Null until it answers, and null again if it cannot - the locally computed
   * figures stand in for it then, so a basket still shows a price with the
   * sample catalogue or a dead connection. It is only a quote; the amount
   * actually charged is read from the order the server creates.
   */
  const [serverPricing, setServerPricing] = useState<Totals | null>(null);
  const [billStatus, setBillStatus] = useState<StoreValue["billStatus"]>("idle");
  const [billNonce, setBillNonce] = useState(0);

  /**
   * Whether the detected position is the delivery destination.
   *
   * It is, unless the customer picked an address from the book this session.
   * With no saved addresses there is nothing to pick, so the detected place
   * is the only real answer.
   */
  const usingHere = Boolean(here) && (!pickedAddress || savedAddresses.length === 0);

  /**
   * Where the order is going, in the shape the API stores.
   *
   * The header and this must be the same place. The header used to show the
   * detected area while every order went to a saved address, so the screen
   * named one destination and the bill another.
   */
  const deliveryAddress = useMemo<DeliveryAddress>(() => {
    if (usingHere && here) {
      return {
        street: here.line ?? here.area ?? "Current location",
        city: here.city ?? here.area ?? "",
        state: here.state,
        zipCode: here.postalCode,
        coordinates: { latitude: here.latitude, longitude: here.longitude },
      };
    }
    const entry =
      savedAddresses.find((a) => a.id === selectedAddressId) ?? savedAddresses[0];
    return {
      street: entry?.street ?? "",
      city: entry?.city ?? "",
      state: entry?.state,
      zipCode: entry?.zipCode,
      ...(entry?.latitude != null && entry?.longitude != null
        ? { coordinates: { latitude: entry.latitude, longitude: entry.longitude } }
        : {}),
    };
  }, [savedAddresses, selectedAddressId, usingHere, here]);

  useEffect(() => {
    if (!token || !cartRestaurantId || lines.length === 0) {
      setServerPricing(null);
      setBillStatus("idle");
      return;
    }

    let cancelled = false;
    setBillStatus("pending");
    // Settles briefly first: a customer tapping + on an item would otherwise
    // fire a quote for every tap.
    const timer = setTimeout(() => {
      api
        .pricingPreview({
          restaurantId: cartRestaurantId,
          lines,
          address: deliveryAddress,
          couponCode: appliedOffer?.code,
          useWallet,
        })
        .then((res) => {
          if (cancelled) return;
          const d = res.data;
          const discount = d.discount ?? 0;
          const walletUsed = d.walletUsed ?? 0;
          setServerPricing({
            itemTotal: d.subtotal,
            packaging: d.packagingFee,
            delivery: d.deliveryFee,
            platformFee: d.platformFee,
            taxes: d.totalGST,
            tip: d.tip ?? 0,
            discount,
            couponCode: d.couponCode || undefined,
            couponError: d.couponError?.message ?? null,
            walletUsed,
            walletCap: d.walletCap ?? 0,
            grossTotal: d.grossTotal ?? round2(d.finalTotal + discount + walletUsed),
            saved: discount,
            toPay: d.finalTotal,
            distanceKmUsed: d.distanceKmUsed,
          });
          setBillStatus("ready");
        })
        .catch(() => {
          // Out of range, signed out, offline - the estimate stands, and
          // payment waits for a real price.
          if (cancelled) return;
          setServerPricing(null);
          setBillStatus("failed");
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, cartRestaurantId, lines, deliveryAddress, appliedOffer, useWallet, billNonce]);

  /**
   * The bill on screen: the server's own figures when it has priced the
   * basket, an estimate before that.
   *
   * This used to splice the two - the server's total with a coupon discount
   * the app had worked out for itself subtracted from it, the preview not
   * knowing about coupons. The app's rule and the server's differed (the app
   * took the coupon off the food, the server off the whole bill), so the
   * figure shown was not the figure charged. Now the server prices the coupon
   * and the wallet too, and nothing here is recomputed.
   */
  const totals = useMemo<Totals>(
    () => serverPricing ?? computeTotals(lines, cartRestaurantId, appliedOffer),
    [lines, cartRestaurantId, appliedOffer, serverPricing]
  );

  const itemCount = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity, 0),
    [lines]
  );

  /**
   * The person the app is for.
   *
   * This used to be the sample profile regardless of who had signed in, so
   * every customer saw the fixture's name, email address and phone number in
   * their own account screen - and had them prefilled into the payment sheet.
   * The sample only fills in what the account does not carry, like the wallet
   * balances the API has no field for yet.
   */
  const customer = useMemo(
    () =>
      authUser
        ? {
            ...seedCustomer,
            // Never the fixture's name: an account without a usable one is
            // "Customer", not somebody else's name on this person's screen.
            name: authUser.name || FALLBACK_NAME,
            email: authUser.email,
            phone: authUser.phone,
            /*
             * The real wallet, not the fixture's.
             *
             * These two carried the sample's numbers for signed-in customers
             * as well: a balance of 250 nobody had, and Reditoe Money fixed
             * at zero, which is what checkout reads. So money added by
             * support was never offered at payment - the customer saw
             * "balance 0, nothing to apply" against a wallet that had money
             * in it.
             */
            walletBalance: wallet?.balance ?? seedCustomer.walletBalance,
            // Only what is not on hold can be paid with.
            reditoeMoney: wallet?.spendable ?? seedCustomer.reditoeMoney,
          }
        : seedCustomer,
    [authUser, wallet]
  );

  const placeOrder = useCallback<StoreValue["placeOrder"]>(
    async (paymentMethod, paymentDetail, options) => {
      const now = new Date();
      const restaurant = cartRestaurantId ? lookupRestaurant(cartRestaurantId) : null;
      const eta = restaurant?.etaMinutes[1] ?? 35;

      /**
       * Place the order on the server and take its reference back.
       *
       * This used to invent one locally - `#RT` followed by a serial counted
       * from how many orders were already on screen - and never call the API
       * at all. The customer was shown a number for an order the kitchen had
       * never heard of, and the admin console, vendor console and rider app
       * each showed something different again because they were describing a
       * real order while this described nothing.
       */
      /**
       * Sample restaurants cannot be ordered from.
       *
       * They are shown so the app is never blank when the API is unreachable,
       * but they exist nowhere but this bundle - the server has never heard of
       * them and rejects the id outright. Saying so here is the difference
       * between "the server is not reachable" and the server's own
       * "Invalid ObjectId provided for restaurantId".
       */
      if (dataSource !== "api") {
        throw new Error(
          "These restaurants are sample data — the server could not be reached. " +
            "Please check your connection and try again."
        );
      }

      const created = await api.createOrder({
        restaurantId: cartRestaurantId ?? "",
        lines,
        address: deliveryAddress,
        paymentMethod,
        // Only a coupon the server said applies. One it refused would refuse
        // the whole order, and the bill on screen already shows it as not
        // taking anything off.
        couponCode: totals.couponError ? undefined : appliedOffer?.code,
        useWallet: options?.useWallet ?? useWallet,
        notes: orderNotes.trim() || undefined,
      });

      const placed = created?.data?.order;
      if (!placed?._id) {
        throw new Error("The order was not accepted by the server.");
      }

      const order: PlacedOrder = {
        id: String(placed._id ?? placed.id),
        // The same reference every other app shows. No fallback: the API
        // derives one for orders that lack it, so an empty value here would
        // mean something is wrong rather than something to paper over.
        code: placed.orderNumber ?? "",
        restaurantId: typeof placed.restaurantId === "string" ? placed.restaurantId : (placed.restaurantId?._id ?? cartRestaurantId ?? ""),
        lines,
        status: placed.status ?? "Waiting for Confirmation",
        placedAt: now.toISOString(),
        etaAt: new Date(now.getTime() + eta * 60_000).toISOString(),
        // What the server created the order at - its charge, not the app's
        // idea of it. The payment screen compares this with what it showed.
        totals: totalsFromApiOrder(placed, totals.itemTotal),
        addressId: selectedAddressId,
        paymentMethod,
        paymentDetail: paymentDetail ?? paymentMethod,
      };

      /*
       * An order paid online is not the customer's yet. The server has written
       * it as "Payment Pending" so the gateway has something to charge
       * against, but no kitchen has seen it. Emptying the basket and listing
       * it here would tell the customer they had ordered when a cancelled or
       * declined payment leaves them with nothing - which is exactly what they
       * reported. The checkout screen commits it once the payment verifies.
       */
      if (!options?.deferCommit) {
        setOrders((current) => [order, ...current]);
        setLines([]);
        setAppliedOffer(null);
        setOrderNotes("");
      }
      return order;
    },
    [
      cartRestaurantId,
      lines,
      totals,
      selectedAddressId,
      savedAddresses,
      appliedOffer,
      dataSource,
      deliveryAddress,
      loadAuthedData,
      useWallet,
      orderNotes,
    ]
  );

  /**
   * The address book the screens show.
   *
   * Once signed in this is the customer's own saved addresses, mapped into the
   * shape the screens already expect. The sample book stands in only while
   * anonymous, so the screen is never blank before an account exists.
   *
   * This used to hand every screen the sample book unconditionally, so the
   * cart, checkout and account screens showed one hard-coded Tirupati address
   * to every customer no matter who was signed in - and the checkout priced
   * the delivery against its coordinates rather than the customer's.
   */
  const addressBook = useMemo<StoreValue["addresses"]>(() => {
    if (!token || savedAddresses.length === 0) return seedAddresses;
    return savedAddresses.map((a) => {
      const type =
        a.label === "Office" || a.label === "Work"
          ? "Work"
          : a.label === "Home"
            ? "Home"
            : "Other";
      return {
        id: a.id,
        label: type,
        type,
        receiver: authUser?.name ?? "",
        phone: authUser?.phone ?? "",
        line: a.street,
        city: [a.city, a.zipCode].filter(Boolean).join(" - ") +
          (a.state ? `, ${a.state}` : ""),
        isDefault: a.isDefault,
        latitude: a.latitude,
        longitude: a.longitude,
      };
    }) as StoreValue["addresses"];
  }, [token, savedAddresses, authUser]);

  /*
   * Keep the selection pointing at an address the customer actually has.
   * It starts on a sample id, which belongs to nobody once they sign in.
   */
  useEffect(() => {
    if (addressBook.length === 0) return;
    if (addressBook.some((a) => a.id === selectedAddressId)) return;
    const preferred = addressBook.find((a) => a.isDefault) ?? addressBook[0];
    setSelectedAddressId(preferred.id);
  }, [addressBook, selectedAddressId]);

  /*
   * Tell the server where to send this customer's order updates.
   *
   * On the token rather than on each sign-in path, so a restored session
   * registers too — the token can change on its own (reinstall, restore,
   * Play Services refresh), and a stale one reaches nobody.
   */
  useEffect(() => {
    if (!token) return;
    void registerForPush();
  }, [token]);

  const destination = useMemo(() => {
    if (usingHere && here) {
      return {
        label: here.area ?? "Current location",
        line: here.line ?? here.area ?? "Using your current location",
        city: here.city ?? here.area ?? "",
        latitude: here.latitude,
        longitude: here.longitude,
      };
    }
    const entry = addressBook.find((a) => a.id === selectedAddressId) ?? addressBook[0];
    return {
      label: entry?.label ?? "",
      line: entry?.line ?? "",
      city: entry?.city ?? "",
      latitude: entry?.latitude,
      longitude: entry?.longitude,
    };
  }, [usingHere, here, addressBook, selectedAddressId]);

  const requestRefund = useCallback<StoreValue["requestRefund"]>(async (input) => {
    try {
      const res = await api.requestRefund(input);
      const raised = res.data?.refund;
      if (raised) setRefundRequests((current) => [raised, ...current]);
      // The three figures at the top of the screen move with it.
      setRefundSummary((current) =>
        current
          ? { ...current, raised: current.raised + 1, inProgress: current.inProgress + 1 }
          : current
      );
      return {
        ok: true,
        message: res.message ?? "Your refund request has been raised.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Could not raise the request.",
      };
    }
  }, []);

  /** When each order's status was last written from the tracking feed. */
  const statusSyncedAt = React.useRef(new Map<string, number>());

  const syncOrderStatus = useCallback<StoreValue["syncOrderStatus"]>((orderId, status) => {
    statusSyncedAt.current.set(orderId, Date.now());
    setOrders((current) =>
      current.some((o) => o.id === orderId && o.status !== status)
        ? current.map((o) => (o.id === orderId ? { ...o, status } : o))
        : current
    );
  }, []);

  /**
   * Order statuses, kept current while an order is still moving.
   *
   * The order list was read once, when the customer signed in, and never
   * again. Whatever the restaurant, the rider or the admin console did to an
   * order afterwards - confirmed it, handed it over, delivered it - reached
   * this app only if the customer signed out and back in, so the Orders tab
   * and the tracking screen went on describing the order as it had been at
   * launch. That is the "still shows Preparing" report.
   *
   * Asked for again when the app returns to the foreground and every ten
   * seconds while it is open, and only while some order is unfinished: once
   * everything has been delivered or cancelled there is nothing left to change.
   * Polling rather than a socket, as for the posters; the tracking screen asks
   * more often than this for the one order it is showing.
   *
   * Only status and what the server allows (cancel, refund) are taken from the
   * answer. The rest of a placed order - the address chosen, the dish details -
   * is richer here than the server's list returns, and replacing it would lose
   * that.
   */
  const hasLiveOrder = orders.some(
    (o) => o.status !== "Delivered" && o.status !== "Cancelled" && o.status !== "Refunded"
  );

  useEffect(() => {
    if (token === null || !hasLiveOrder) return;
    let cancelled = false;
    const POLL_MS = 10 * 1000;

    const pull = () => {
      const askedAt = Date.now();
      api
        .myOrders()
        .then((rows) => {
          if (cancelled) return;
          const fresh = new Map(rows.map((row) => [String(row.id), row]));
          setOrders((current) => {
            let changed = false;
            const next = current.map((o) => {
              const row = fresh.get(o.id);
              if (!row?.status) return o;
              // The tracking screen has heard something newer than this
              // answer was asked about; taking it would wind the status back.
              if ((statusSyncedAt.current.get(o.id) ?? 0) > askedAt) return o;
              if (
                row.status === o.status &&
                row.canCancel === o.canCancel &&
                row.canRequestRefund === o.canRequestRefund
              ) {
                return o;
              }
              changed = true;
              return {
                ...o,
                status: row.status,
                canCancel: row.canCancel,
                canRequestRefund: row.canRequestRefund,
              };
            });
            return changed ? next : current;
          });
        })
        .catch(() => {
          /* keep what is showing; the next poll is soon */
        });
    };

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") pull();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") pull();
    }, POLL_MS);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(timer);
    };
  }, [token, hasLiveOrder]);

  /** Accept a deferred order once its payment has gone through. */
  const commitPlacedOrder = useCallback<StoreValue["commitPlacedOrder"]>((order) => {
    setOrders((current) =>
      current.some((o) => o.id === order.id) ? current : [order, ...current]
    );
    setLines([]);
    setAppliedOffer(null);
    setOrderNotes("");
    setUseWallet(false);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      lines,
      cartRestaurantId,
      itemCount,
      appliedOffer,
      offers: couponList,
      totals,
      addLine,
      setQuantity,
      clearCart,
      applyOffer: setAppliedOffer,
      useWallet,
      setUseWallet,
      billStatus,
      refreshBill: () => setBillNonce((n) => n + 1),
      addresses: addressBook,
      selectedAddressId,
      selectAddress,
      here,
      usingHere,
      useHereAsAddress,
      destination,
      favourites,
      toggleFavourite,
      orders,
      placeOrder,
      commitPlacedOrder,
      syncOrderStatus,
      customer,
      /*
       * Plus waives the delivery fee, so defaulting it to true handed free
       * delivery to every customer who did not have a membership - including
       * everyone signed out, and everyone whose membership call had not
       * answered yet. The server charged the real fee regardless, so the
       * basket showed 0 delivery and the payment screen showed the true
       * amount. Nobody is a member until the server says so.
       */
      plusMember: membershipInfo?.active === true,
      signedIn: token !== null,
      authReady,
      authUser,
      codEnabled,
      authError,
      signingIn,
      requestOtp,
      verifyOtp,
      pendingSignup,
      cancelSignUp,
      completeSignUp,
      signOut,
      rememberedPhone,
      signInRemembered,
      wallet,
      walletTransactions,
      membershipInfo,
      savedAddresses,
      reloadAuthedData: loadAuthedData,
      refundSummary,
      refundRequests,
      requestRefund,
      orderNotes,
      setOrderNotes,
      dataSource,
      apiError,
      reloadCatalogue: () => setReloadCount((n) => n + 1),
      restaurants: catalogue.restaurants,
      /*
       * Signed out counts as first-time: they have placed no order with this
       * app, and the welcome offers are exactly what should greet them.
       */
      isFirstTimeCustomer: token === null || (ordersLoaded && orders.length === 0),
      banners,
      foodCategories,
      selectedCategory,
      setSelectedCategory,
      // The filtered list when a category is chosen, the whole list otherwise.
      visibleRestaurants: categoryRestaurants ?? catalogue.restaurants,
      dishes: catalogue.dishes,
      restaurantById: (id: string) =>
        catalogue.restaurants.find((r) => r.id === id),
      dishById: (id: string) => catalogue.dishes.find((d) => d.id === id),
      dishesForRestaurant: (restaurantId: string) =>
        catalogue.dishes.filter((d) => d.restaurantId === restaurantId),
      combosForRestaurant: (restaurantId: string) =>
        catalogue.combos.filter((c) => c.restaurantId === restaurantId),
      popularDishes: () => {
        const tagged = catalogue.dishes.filter((d) => d.tag);
        // The API has no "tag" concept yet, so fall back to the first few
        // dishes rather than rendering an empty rail.
        return (tagged.length > 0 ? tagged : catalogue.dishes).slice(0, 6);
      },
    }),
    [
      lines,
      cartRestaurantId,
      itemCount,
      appliedOffer,
      couponList,
      totals,
      useWallet,
      billStatus,
      addLine,
      setQuantity,
      clearCart,
      selectedAddressId,
      selectAddress,
      here,
      usingHere,
      useHereAsAddress,
      destination,
      favourites,
      toggleFavourite,
      orders,
      placeOrder,
      commitPlacedOrder,
      syncOrderStatus,
      addressBook,
      customer,
      dataSource,
      apiError,
      catalogue,
      couponList,
      token,
      authReady,
      authUser,
      codEnabled,
      authError,
      signingIn,
      requestOtp,
      verifyOtp,
      pendingSignup,
      cancelSignUp,
      completeSignUp,
      signOut,
      rememberedPhone,
      signInRemembered,
      wallet,
      walletTransactions,
      membershipInfo,
      savedAddresses,
      refundSummary,
      refundRequests,
      requestRefund,
      orderNotes,
      setOrderNotes,
      loadAuthedData,
      foodCategories,
      selectedCategory,
      categoryRestaurants,
      ordersLoaded,
      banners,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Quantity already in the cart for a dish, across all its variants. */
export function useDishQuantity(dishId: string) {
  const { lines } = useStore();
  return lines
    .filter((l) => l.dishId === dishId)
    .reduce((sum, l) => sum + l.quantity, 0);
}

export { offers };
