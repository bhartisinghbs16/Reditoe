"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import type { PhotoKey } from "@/lib/images";
import type { TintName } from "@/lib/theme";
import {
  announceNewOrders,
  prepareOrderAlerts,
  resetOrderAlerts,
} from "@/lib/order-alerts";
import {
  ApiError,
  api,
  loadToken,
  login as apiLogin,
  sendOtp as apiSendOtp,
  verifyOtp as apiVerifyOtp,
  logout as apiLogout,
  setToken,
  setUnauthorizedHandler,
  type SessionUser,
} from "@/lib/api";
import { registerForPush, unregisterForPush } from "@/lib/push";
import {
  STATUS_BY_STAGE,
  fromMenuItemDraft,
  toMenuItem,
  toOffer,
  toOrder,
  toPayments,
  toVendorProfile,
  transitionPath,
} from "@/lib/adapters";
import { currencyCompact } from "@/lib/format";

/**
 * Vendor state.
 *
 * Every screen reads through this provider, so it is the only place that knows
 * the app talks to an API at all. It owns the session, everything the backend
 * serves (restaurant, orders, menu, coupons, payouts) and the writes that
 * change them.
 */

/* ── Types ──────────────────────────────────────────────────────────────── */

/** The lifecycle a vendor actually drives, in order. */
export type OrderStage = "new" | "preparing" | "ready" | "picked" | "delivered" | "cancelled";

export interface OrderLine {
  name: string;
  quantity: number;
  price: number;
  veg: boolean;
  /** Resolved URL — an uploaded photo, or a deterministic stand-in. */
  image: string;
  note?: string;
}

export interface VendorOrder {
  /** Database id, used for routing and writes. */
  id: string;
  /** The number the customer and the kitchen say out loud. */
  reference: string;
  customer: string;
  phone: string;
  address: string;
  placedAt: string;
  stage: OrderStage;
  /** The API's own status. Several map to one stage, and its transition
   *  rules are written in these, not in stages. */
  apiStatus: string;
  lines: OrderLine[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  packaging: number;
  total: number;
  payment: "Online" | "COD";
  paid: boolean;
  prepMinutes: number;
  rider?: { name: string; phone: string };
  cancelReason?: string;
  notes?: string[];
}

export type ItemTag = "Bestseller" | "Popular" | "New" | "Chef's Special";

/** Matches FoodItem.foodType on the API. */
export type FoodType = "veg" | "non-veg" | "egg";

export interface ItemAddon {
  name: string;
  price: number;
  /** On sale right now. An extra that has run out is switched off, not deleted. */
  available: boolean;
}

/** A choice group — "Size" with Half / Full / Family Pack. */
export interface ItemVariantGroup {
  name: string;
  required: boolean;
  /** The option the customer starts on, and the price the menu quotes. */
  options: { name: string; price: number; isDefault?: boolean }[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  subCategory: string;
  price: number;
  veg: boolean;
  foodType: FoodType;
  available: boolean;
  inStock: boolean;
  image: string;
  prepMinutes: number;
  /**
   * The daily window this dish can be ordered in, as "HH:mm" in the store's own
   * time. Both empty means all day, which is what most dishes are. A window
   * that ends before it starts crosses midnight — the API reads it that way.
   */
  availableFrom: string;
  /** Days of the week this item is sold on; empty means every day. */
  availableDays?: string[];
  availableTo: string;
  addons: ItemAddon[];
  variants: ItemVariantGroup[];
  createdAt?: string;
  updatedAt?: string;
  soldToday: number;
  tag?: ItemTag;
}

/** What the wizard sends when creating or editing an item. */
export interface MenuItemDraft {
  name: string;
  description: string;
  category: string;
  price: number;
  foodType: FoodType;
  prepMinutes: number;
  available: boolean;
  availableFrom: string;
  /** Days of the week this item is sold on; empty means every day. */
  availableDays?: string[];
  availableTo: string;
  addons: ItemAddon[];
  variants: ItemVariantGroup[];
}

/** What the customer pays. The API owns these figures; nothing is derived. */
export function orderTotals(order: VendorOrder) {
  return {
    items: order.subtotal,
    delivery: order.deliveryFee,
    packaging: order.packaging,
    gst: order.tax,
    total: order.total,
  };
}

/** When the rider should be at the door: prep time plus a travel allowance. */
export function estimatedDelivery(order: VendorOrder) {
  return new Date(new Date(order.placedAt).getTime() + (order.prepMinutes + 15) * 60_000);
}

/**
 * What the next button says, and what it does. One place decides.
 *
 * The kitchen's half of the order and no further. "Handed to Rider" and "Mark
 * Delivered" used to live here; both are the rider's to make now, and the API
 * refuses them from a vendor — the handover happens when the rider verifies
 * the pickup code, and the delivery when the customer verifies theirs. A
 * button that always errors is worse than no button, so the ready stage shows
 * the pickup code instead of trying to advance the order.
 */
export const NEXT_STAGE: Partial<Record<OrderStage, { to: OrderStage; label: string }>> = {
  new: { to: "preparing", label: "Accept Order" },
  preparing: { to: "ready", label: "Mark as Ready" },
};

export const STAGE_LABEL: Record<OrderStage, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  picked: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export interface Offer {
  id: string;
  code: string;
  badge: string;
  badgeSub: string;
  description: string;
  validityLabel: "Valid till" | "Starts on";
  validity: string;
  time: string;
  minOrder: number;
  used: number;
  discountGiven: number;
  status: "Active" | "Scheduled" | "Expired";
  tint: TintName;
  startsIn?: { days: number; hours: number; mins: number };
  /** The switch on the card — a coupon can be paused without expiring. */
  active: boolean;
}

export interface Payments {
  walletBalance: number;
  today: { earnings: number; orders: number; items: number; deltaPct: number };
  availableBalance: number;
  week: { earnings: number; orders: number };
  month: { earnings: number; orders: number };
  lifetime: number;
  nextPayoutDate: string;
  bank: { name: string; account: string; ifsc: string };
  weekSeries: { label: string; value: number }[];
  breakup: { label: string; value: number }[];
  /** The platform's own bottom line, not a figure this app computed. */
  netLabel: string;
  net: number;
  transactions: {
    id: string;
    at: string;
    ref: string;
    type: string;
    sub: string;
    amount: number;
    status: "Completed" | "Settled" | "Pending";
  }[];
}

export interface PerformanceCell {
  label: string;
  value: string;
  icon: "bag-handle" | "cash" | "checkmark-circle" | "hourglass";
  tint: TintName;
}

const emptyPayments: Payments = {
  walletBalance: 0,
  today: { earnings: 0, orders: 0, items: 0, deltaPct: 0 },
  availableBalance: 0,
  week: { earnings: 0, orders: 0 },
  month: { earnings: 0, orders: 0 },
  lifetime: 0,
  nextPayoutDate: "—",
  bank: { name: "—", account: "—", ifsc: "—" },
  weekSeries: [{ label: "—", value: 0 }],
  breakup: [],
  netLabel: "Available to withdraw",
  net: 0,
  transactions: [],
};

const emptyProfile = {
  name: "—",
  outletId: "—",
  id: "—",
  rating: 0,
  reviews: 0,
  eta: "—",
  cuisines: "—",
  address: "—",
  hours: "—",
  email: "—",
  photo: "thali" as PhotoKey,
  image: undefined as string | undefined,
  verified: false,
  isOpen: true,
  profileViews: 0,

  /** Minutes the kitchen needs before a rider should arrive. */
  prepMinutes: null as number | null,
  /** Added to every order and shown to the customer separately. */
  packagingFee: null as number | null,

  /** When the kitchen is open, by day and slot. Empty until the vendor sets it. */
  workingHours: [] as {
    day: string;
    closed?: boolean;
    slots: { opensAt: string; closesAt: string; label?: string }[];
  }[],

  /** The delivery area: how far, and the point it is measured from. */
  deliveryRadiusKm: null as number | null,
  latitude: null as number | null,
  longitude: null as number | null,
};

/* ── Context ────────────────────────────────────────────────────────────── */

interface StoreValue {
  /** The initial session check has finished — render the app or the login. */
  authReady: boolean;
  session: SessionUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Asks the server to send a one-time code to an email or mobile number. */
  requestOtp: (emailOrPhone: string) => Promise<void>;
  /** Exchanges that code for a session. */
  signInWithOtp: (emailOrPhone: string, otp: string) => Promise<void>;
  signOut: () => Promise<void>;

  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  storeOpen: boolean;
  setStoreOpen: (open: boolean, prepMinutes?: number) => void;
  orders: VendorOrder[];
  advance: (id: string, stage: OrderStage) => void;
  menu: MenuItem[];
  toggleAvailability: (id: string) => void;
  /** Resolves to the saved item's id so the caller can navigate to it. */
  saveItem: (draft: MenuItemDraft, id?: string) => Promise<string>;
  deleteItem: (id: string) => Promise<void>;
  vendor: typeof emptyProfile;

  payments: Payments;
  offers: Offer[];
  offerStats: { couponsUsed: number; discountGiven: number; revenueFromOffers: number };
  toggleOffer: (id: string) => void;
  weekPerformance: PerformanceCell[];
  notifications: number;
  today: { orders: number; earnings: number; averageOrder: number; itemsSold: number };
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);

  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [vendor, setVendor] = useState(emptyProfile);
  const [stats, setStats] = useState<{ totalSales: number; completedOrderCount: number } | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [payments, setPayments] = useState<Payments>(emptyPayments);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Session ──────────────────────────────────────────────────────── */

  const signOut = useCallback(async () => {
    // Before the token goes: this phone should stop receiving this vendor's
    // orders the moment they sign out of it.
    await unregisterForPush();
    await apiLogout();
    // Otherwise the next vendor to sign in on this device is told nothing
    // about orders this one had already been shown.
    resetOrderAlerts();
    setSession(null);
    setOrders([]);
    setMenu([]);
    setVendor(emptyProfile);
    setStats(null);
    setOffers([]);
    setPayments(emptyPayments);
    setError(null);
  }, []);

  /**
   * `background` is a poll rather than something the vendor asked for, so it
   * does not raise the loading flag: a screen that shows a spinner while
   * loading would blink every fifteen seconds all day.
   */
  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      // One failure shouldn't blank the whole app, so each is settled
      // separately and the first real error is reported.
      const results = await Promise.allSettled([
        api.get<any>("/vendor/restaurant"),
        api.get<any>("/vendor/orders"),
        api.get<any>("/vendor/menu"),
        api.get<any>("/vendor/stats"),
        api.get<any>("/vendor/coupons"),
        api.get<any>("/vendor/withdrawals/summary"),
        api.get<any>("/vendor/withdrawals"),
      ]);

      const [
        restaurantResult,
        ordersResult,
        menuResult,
        statsResult,
        couponsResult,
        summaryResult,
        withdrawalsResult,
      ] = results;

      if (restaurantResult.status === "fulfilled") {
        const raw = restaurantResult.value?.restaurant ?? restaurantResult.value;
        setVendor(toVendorProfile(raw, session?.email ?? "—"));
      }

      // Orders feed the payments ledger, so hold them rather than relying on
      // the state update having landed.
      let loadedOrders: VendorOrder[] = [];
      if (ordersResult.status === "fulfilled") {
        loadedOrders = (ordersResult.value?.orders ?? []).map(toOrder);
        setOrders(loadedOrders);
      }

      if (menuResult.status === "fulfilled") {
        const list: any[] = menuResult.value?.menu ?? menuResult.value?.items ?? [];
        setMenu(list.map(toMenuItem));
      }

      const statsValue = statsResult.status === "fulfilled" ? statsResult.value : null;
      if (statsValue) {
        setStats({
          totalSales: Number(statsValue?.totalSales ?? 0),
          completedOrderCount: Number(statsValue?.completedOrderCount ?? 0),
        });
      }

      if (couponsResult.status === "fulfilled") {
        const list: any[] = couponsResult.value?.coupons ?? [];
        setOffers(list.map(toOffer));
      }

      setPayments(
        toPayments(
          statsValue,
          summaryResult.status === "fulfilled" ? summaryResult.value : null,
          withdrawalsResult.status === "fulfilled"
            ? (withdrawalsResult.value?.withdrawals ?? [])
            : [],
          loadedOrders
        )
      );

      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );

      if (failure) {
        const reason = failure.reason;
        if (reason instanceof ApiError && reason.unauthorized) {
          await signOut();
          return;
        }
        setError(reason?.message ?? "Something went wrong loading your data.");
      }
    } finally {
      setLoading(false);
    }
  }, [session?.email, signOut]);

  /**
   * Any call coming back unauthenticated ends the session.
   *
   * The refresh path already did this, but it only covered loading — pressing
   * Accept on an order whose token had died raised a raw API error instead of
   * signing the vendor out, and there was no way forward from that screen.
   */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
      setError("Your session has ended. Please sign in again.");
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // Restore a saved session on boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await loadToken();
      if (cancelled) return;
      if (!token) {
        setAuthReady(true);
        return;
      }
      try {
        const me = await api.get<any>("/auth/me");
        if (cancelled) return;
        const user = me?.user ?? me;
        if (user?.role === "vendor") setSession(user as SessionUser);
        else await setToken(null);
      } catch {
        await setToken(null);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load data whenever a session appears.
  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  /**
   * Keep looking for new orders while the vendor is signed in.
   *
   * Nothing polled before, so an order placed while the app was open stayed
   * invisible until the vendor closed and reopened it - which is no use to a
   * kitchen, and is how orders went unnoticed until the customer rang.
   *
   * Fifteen seconds is often enough that a vendor notices within a sensible
   * time, and rare enough not to hammer a tablet on a shop counter all day.
   */
  useEffect(() => {
    if (!session) return;
    void prepareOrderAlerts();

    const timer = setInterval(() => {
      // Only while the app is actually in front. A timer in the background is
      // throttled by the OS anyway, and answering it wakes the network for
      // nothing.
      if (AppState.currentState === "active") void load(true);
    }, 15_000);

    /*
     * Catch up the moment the app comes back.
     *
     * The interval is the only thing that looked for orders, and the OS stops
     * or slows it while the app is in the background - so a vendor who put
     * their phone down and picked it up again saw whatever was on screen when
     * they left, and orders that arrived in between only appeared after a
     * close and reopen. That is the "have to restart the app" complaint.
     */
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void load(true);
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [session, load]);

  /**
   * Ring for orders that have just arrived.
   *
   * Watches what the poll produced rather than hooking into the request, so
   * an order that appears by any route - a refresh, a screen pull, the timer -
   * is announced exactly once.
   */
  useEffect(() => {
    if (!session) return;
    const waiting = orders.filter((order) => order.stage === "new");
    if (waiting.length === 0) return;
    void announceNewOrders(
      waiting.map((order) => ({
        id: order.id,
        reference: order.reference,
        total: order.total,
      }))
    );
  }, [orders, session]);

  const signIn = useCallback(async (email: string, password: string) => {
    const user = await apiLogin(email, password);
    setSession(user);
  }, []);

  const requestOtp = useCallback(async (emailOrPhone: string) => {
    await apiSendOtp(emailOrPhone);
  }, []);

  const signInWithOtp = useCallback(async (emailOrPhone: string, otp: string) => {
    const user = await apiVerifyOtp(emailOrPhone, otp);
    setSession(user);
  }, []);

  /*
   * Tell the server where to send this vendor's notifications.
   *
   * On the session rather than on each sign-in path, so a restored session
   * registers too — the token can change on its own (reinstall, restore,
   * Play Services refresh), and a stale one reaches nobody.
   */
  useEffect(() => {
    if (!session) return;
    void registerForPush();
  }, [session]);

  /* ── Writes ───────────────────────────────────────────────────────── */

  /**
   * Opens or closes the store.
   *
   * Coming online needs a preparation time. The server works the customer's
   * delivery estimate out from it, so it will not accept the change without
   * one - and this used to send only `isOpen`, so every attempt to go online
   * was refused, the optimistic flip was rolled back, and the switch appeared
   * to turn itself off again a moment after being turned on.
   *
   * Closing needs nothing; a shut kitchen has no estimate to give.
   */
  const setStoreOpen = useCallback(
    (open: boolean, prepMinutes?: number) => {
      setVendor((current) => ({ ...current, isOpen: open }));
      api
        .patch("/vendor/restaurant/availability", {
          isOpen: open,
          ...(open ? { prepMinutes: prepMinutes ?? 20 } : {}),
        })
        .catch((reason) => {
          setVendor((current) => ({ ...current, isOpen: !open }));
          setError(reason?.message ?? "Couldn't change your store status.");
        });
    },
    []
  );

  const advance = useCallback(
    (id: string, stage: OrderStage) => {
      const order = orders.find((entry) => entry.id === id);
      if (!order) return;

      const target = STATUS_BY_STAGE[stage];
      const path = transitionPath(order.apiStatus, target);

      if (path === null) {
        setError(`This order can't move from ${order.apiStatus} to ${target}.`);
        return;
      }
      if (path.length === 0) return;

      // Optimistic: the kitchen taps this mid-service and can't wait for a
      // round trip. Roll back and say so if the API disagrees.
      const previous = { stage: order.stage, apiStatus: order.apiStatus };
      setOrders((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, stage, apiStatus: target } : entry
        )
      );

      // The API rejects any PATCH that skips a hop, so walk the path.
      (async () => {
        for (const status of path) {
          await api.patch(`/vendor/orders/${id}/status`, { status });
        }
      })().catch((reason) => {
        setOrders((current) =>
          current.map((entry) => (entry.id === id ? { ...entry, ...previous } : entry))
        );
        setError(reason?.message ?? "Couldn't update that order.");
        // The order may have moved part-way; re-read rather than guess.
        void load();
      });
    },
    [orders, load]
  );

  const toggleAvailability = useCallback(
    (id: string) => {
      const item = menu.find((entry) => entry.id === id);
      if (!item) return;
      const next = !item.available;

      setMenu((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, available: next, inStock: next } : entry
        )
      );

      api.patch(`/vendor/menu/${id}`, { isAvailable: next }).catch((reason) => {
        setMenu((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, available: !next, inStock: !next } : entry
          )
        );
        setError(reason?.message ?? `Couldn't update ${item.name}.`);
      });
    },
    [menu]
  );

  /**
   * Create or update a menu item. Unlike the toggles this is not optimistic —
   * the wizard waits for the write so it can show a real failure and keep the
   * vendor's typing rather than throwing it away.
   */
  const saveItem = useCallback(
    async (draft: MenuItemDraft, id?: string) => {
      const body = fromMenuItemDraft(draft);
      const saved = id
        ? await api.patch<any>(`/vendor/menu/${id}`, body)
        : await api.post<any>("/vendor/menu", body);

      const raw = saved?.foodItem ?? saved?.item ?? saved?.menu ?? saved;
      const item = toMenuItem(raw?._id ? raw : { ...raw, _id: id });

      setMenu((current) => {
        const exists = current.some((entry) => entry.id === item.id);
        return exists
          ? current.map((entry) => (entry.id === item.id ? item : entry))
          : [item, ...current];
      });

      return item.id;
    },
    []
  );

  const deleteItem = useCallback(async (id: string) => {
    const removed = menu.find((entry) => entry.id === id);
    setMenu((current) => current.filter((entry) => entry.id !== id));
    try {
      await api.delete(`/vendor/menu/${id}`);
    } catch (reason: any) {
      if (removed) setMenu((current) => [removed, ...current]);
      setError(reason?.message ?? "Couldn't delete that item.");
      throw reason;
    }
  }, [menu]);

  const toggleOffer = useCallback(
    (id: string) => {
      const offer = offers.find((entry) => entry.id === id);
      if (!offer) return;
      const next = !offer.active;

      setOffers((current) =>
        current.map((entry) =>
          entry.id === id
            ? { ...entry, active: next, status: next ? "Active" : "Expired" }
            : entry
        )
      );

      api.patch(`/vendor/coupons/${id}/toggle`).catch((reason) => {
        setOffers((current) =>
          current.map((entry) =>
            entry.id === id
              ? { ...entry, active: !next, status: offer.status }
              : entry
          )
        );
        setError(reason?.message ?? `Couldn't update ${offer.code}.`);
      });
    },
    [offers]
  );

  /* ── Derived ──────────────────────────────────────────────────────── */

  /**
   * This week's headline figures.
   *
   * Only what `/vendor/stats` and the loaded orders can actually support. An
   * earlier version showed new/repeat customer counts, which no vendor
   * endpoint provides — they were invented, and sat on the dashboard looking
   * as authoritative as the real numbers beside them.
   */
  const weekPerformance = useMemo<PerformanceCell[]>(() => {
    const live = orders.filter((order) => order.stage !== "cancelled");
    const awaiting = orders.filter(
      (order) => order.stage === "new" || order.stage === "preparing"
    ).length;

    return [
      { label: "Orders", value: String(live.length), icon: "bag-handle", tint: "blue" },
      {
        label: "Sales",
        value: currencyCompact(payments.week.earnings),
        icon: "cash",
        tint: "green",
      },
      {
        label: "Completed",
        value: String(orders.filter((order) => order.stage === "delivered").length),
        icon: "checkmark-circle",
        tint: "violet",
      },
      { label: "Awaiting action", value: String(awaiting), icon: "hourglass", tint: "amber" },
    ];
  }, [orders, payments.week.earnings]);

  /** Programme totals, summed from the coupons themselves. */
  const offerStats = useMemo(
    () => ({
      couponsUsed: offers.reduce((sum, offer) => sum + offer.used, 0),
      discountGiven: offers.reduce((sum, offer) => sum + offer.discountGiven, 0),
      revenueFromOffers: orders
        .filter((order) => order.stage === "delivered")
        .reduce((sum, order) => sum + order.total, 0),
    }),
    [offers, orders]
  );

  const today = useMemo(() => {
    const billed = orders.filter((order) => order.stage !== "cancelled");
    const earnings = stats?.totalSales ?? billed.reduce((sum, order) => sum + order.total, 0);
    const count = billed.length;
    const itemsSold = billed.reduce(
      (sum, order) => sum + order.lines.reduce((lines, line) => lines + line.quantity, 0),
      0
    );
    return {
      orders: count,
      earnings,
      averageOrder: count > 0 ? Math.round(earnings / count) : 0,
      itemsSold,
    };
  }, [orders, stats]);

  const value = useMemo<StoreValue>(
    () => ({
      authReady,
      session,
      signIn,
      requestOtp,
      signInWithOtp,
      signOut,
      loading,
      error,
      refresh: () => load(),
      storeOpen: vendor.isOpen,
      setStoreOpen,
      orders,
      advance,
      menu,
      toggleAvailability,
      saveItem,
      deleteItem,
      vendor,
      payments,
      offers,
      offerStats,
      toggleOffer,
      weekPerformance,
      notifications: orders.filter((order) => order.stage === "new").length,
      today,
    }),
    [
      authReady,
      session,
      signIn,
      requestOtp,
      signInWithOtp,
      signOut,
      loading,
      error,
      load,
      vendor,
      setStoreOpen,
      orders,
      advance,
      menu,
      toggleAvailability,
      saveItem,
      deleteItem,
      payments,
      offers,
      offerStats,
      toggleOffer,
      weekPerformance,
      today,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
