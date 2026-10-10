import { img, type PhotoKey } from "@/lib/images";
import { mediaUrl } from "@/lib/api";
import type {
  FoodType,
  MenuItem,
  MenuItemDraft,
  Offer,
  OrderStage,
  VendorOrder,
} from "@/lib/store";

/**
 * Backend shapes → the app's domain types.
 *
 * The API and the screens disagree in small ways — the API spells statuses
 * "Waiting for Confirmation" and lowercases payment methods, and its documents
 * carry fields the screens don't use. Translating in one place keeps that
 * disagreement out of the components, and means a backend rename is a change
 * here rather than across eleven screens.
 */

/* ── Photography ────────────────────────────────────────────────────────── */

const PHOTO_KEYS: PhotoKey[] = [
  "biryani",
  "curryBread",
  "buns",
  "meatTomato",
  "samosa",
  "thali",
  "noodles",
  "idli",
];

/**
 * The seeded catalogue has no photographs yet. Rather than leave grey holes,
 * fall back to a stand-in chosen by the item's name — deterministic, so an
 * item keeps the same picture between renders and screens.
 */
function fallbackPhoto(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return img(PHOTO_KEYS[hash % PHOTO_KEYS.length], 400);
}

/**
 * A real uploaded image wins; otherwise the stand-in.
 *
 * The upload is resolved first. It arrives relative ("/uploads/…"), and the
 * test used to be for an absolute URL alone — so every genuine photograph
 * failed it and was replaced by a stand-in chosen from the item's name. That
 * is the "a different image appears" fault: the upload had worked, and the
 * screen was throwing it away.
 */
export function photoFor(name: string, image?: string | null) {
  return mediaUrl(image) ?? fallbackPhoto(name);
}

/* ── Orders ─────────────────────────────────────────────────────────────── */

/** API status → the five stages a vendor actually drives. */
const STAGE_BY_STATUS: Record<string, OrderStage> = {
  Pending: "new",
  "Waiting for Confirmation": "new",
  "Order Confirmed": "preparing",
  "In Progress": "preparing",
  Processing: "preparing",
  Ready: "ready",
  OnWay: "picked",
  Delivered: "delivered",
  Cancelled: "cancelled",
  RiderRejected: "cancelled",
};

/** The stage the vendor is moving to → the status the API settles on. */
export const STATUS_BY_STAGE: Record<OrderStage, string> = {
  new: "Waiting for Confirmation",
  preparing: "Processing",
  ready: "Ready",
  picked: "OnWay",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * The order lifecycle the API enforces, mirrored from the state machine in
 * `controllers/vendorController.js`. It rejects any PATCH that skips a hop —
 * a new order cannot go straight to Processing, it has to be confirmed first.
 */
const TRANSITIONS: Record<string, string[]> = {
  "Waiting for Confirmation": ["Order Confirmed", "Cancelled"],
  Pending: ["Order Confirmed", "Processing", "Cancelled"],
  "Order Confirmed": ["Processing", "Cancelled"],
  Processing: ["Ready", "Cancelled"],
  Ready: ["OnWay"],
  OnWay: ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

/**
 * The statuses to walk through to get from `current` to `target`.
 *
 * One vendor tap ("Accept Order") can be two API hops, so this returns the
 * whole path and the caller PATCHes it in order. Empty when already there;
 * null when the API offers no route at all, which is how a terminal order
 * refuses to move.
 */
export function transitionPath(current: string, target: string): string[] | null {
  if (current === target) return [];

  const queue: string[][] = [[current]];
  const seen = new Set([current]);

  while (queue.length) {
    const path = queue.shift()!;
    const last = path[path.length - 1];

    for (const next of TRANSITIONS[last] ?? []) {
      if (seen.has(next)) continue;
      const extended = [...path, next];
      if (next === target) return extended.slice(1);
      seen.add(next);
      queue.push(extended);
    }
  }

  return null;
}

export function toStage(status: string | undefined): OrderStage {
  return (status && STAGE_BY_STATUS[status]) || "new";
}

/**
 * Addresses arrive in three shapes: a plain string, an order's delivery
 * address (`address`/`city`/`pincode`), and a restaurant's nested document
 * (`street`/`city`/`state`/`zipCode`). Flatten all three.
 */
function joinAddress(address: any, fallback = "No address on file"): string {
  if (!address) return fallback;
  if (typeof address === "string") return address.trim() || fallback;

  const parts = [
    address.address ?? address.street,
    address.landmark,
    address.city,
    address.state,
    address.pincode ?? address.zipCode,
  ]
    .filter(Boolean)
    .map(String);

  return parts.length ? parts.join(", ") : fallback;
}

export function toOrder(raw: any): VendorOrder {
  const items: any[] = Array.isArray(raw?.items) ? raw.items : [];
  const customer = raw?.userId ?? {};
  const rider = raw?.riderId;

  const subtotal = Number(raw?.subtotal ?? 0);
  /**
   * `gstAndPackaging` is the whole tax charge on the order - GST on the food,
   * GST on the delivery and platform fees, and packaging. `tax` is only the
   * food's share of it, so it is the fallback rather than the first choice.
   * This used to read the full figure as the packaging charge while showing
   * `tax` beside it, which billed the food's GST twice over.
   */
  const tax = Number(raw?.gstAndPackaging ?? raw?.tax ?? 0);
  const deliveryFee = Number(raw?.deliveryFee ?? 0);
  const packaging = Number(raw?.packagingFee ?? 0);

  return {
    // The routable id and the human one are different things on this API.
    id: String(raw?.id ?? raw?._id ?? ""),
    reference: String(raw?.orderNumber ?? raw?.id ?? raw?._id ?? ""),
    customer: customer?.name ?? "Customer",
    phone: customer?.phone ?? "—",
    address: joinAddress(raw?.deliveryAddress, "No address on the order"),
    placedAt: raw?.createdAt ?? new Date().toISOString(),
    stage: toStage(raw?.status),
    // Kept raw because the API's transition rules are expressed in its own
    // statuses, and several of them collapse into one vendor stage.
    apiStatus: String(raw?.status ?? "Waiting for Confirmation"),
    lines: items.map((line) => {
      const food = line?.foodItemId ?? {};
      const name = line?.name ?? food?.name ?? "Item";
      return {
        name,
        quantity: Number(line?.quantity ?? 1),
        price: Number(line?.price ?? food?.price ?? 0),
        veg: Boolean(food?.isVeg ?? true),
        image: photoFor(name, food?.image),
        note: line?.note || undefined,
      };
    }),
    subtotal,
    tax,
    deliveryFee,
    packaging,
    total: Number(raw?.total ?? subtotal + tax + deliveryFee + packaging),
    payment: raw?.paymentMethod === "cod" ? "COD" : "Online",
    paid: raw?.paymentStatus === "paid",
    prepMinutes: Number(raw?.preparationTime ?? 20),
    rider: rider?.name ? { name: rider.name, phone: rider.phone ?? "—" } : undefined,
    cancelReason: raw?.cancellationReason || raw?.adminNotes || undefined,
    notes: raw?.notes ? [String(raw.notes)] : undefined,
  };
}

/* ── Menu ───────────────────────────────────────────────────────────────── */

const FOOD_TYPE_LABEL: Record<FoodType, string> = {
  veg: "Veg",
  "non-veg": "Non-Veg",
  egg: "Eggetarian",
};

export function toMenuItem(raw: any): MenuItem {
  const name = raw?.name ?? "Item";
  const available = raw?.isAvailable !== false;

  const foodType: FoodType =
    raw?.foodType === "non-veg" || raw?.foodType === "egg" ? raw.foodType : "veg";

  return {
    id: String(raw?._id ?? raw?.id ?? ""),
    name,
    description: String(raw?.description ?? ""),
    category: raw?.category || "Uncategorised",
    subCategory: FOOD_TYPE_LABEL[foodType],
    price: Number(raw?.price ?? 0),
    veg: foodType === "veg",
    foodType,
    available,
    // The API has one availability flag, not separate visibility and stock.
    inStock: available,
    image: photoFor(name, raw?.image),
    prepMinutes: Number(raw?.preparationTime ?? 0),
    availableFrom: String(raw?.availableFrom ?? ""),
    availableTo: String(raw?.availableTo ?? ""),
    availableDays: Array.isArray(raw?.availableDays) ? raw.availableDays.map(String) : [],
    addons: (Array.isArray(raw?.addons) ? raw.addons : []).map((addon: any) => ({
      name: String(addon?.name ?? ""),
      price: Number(addon?.price ?? 0),
      // Read as "not false" so add-ons stored before the field existed stay
      // on sale rather than all switching off at once.
      available: addon?.isAvailable !== false,
    })),
    // Variants live in the API's modifierGroups.
    variants: (Array.isArray(raw?.modifierGroups) ? raw.modifierGroups : [])
      // The menu endpoint synthesises a group out of an item's add-ons when it
      // has no real variants. Reading that back would turn every add-on into a
      // variant on the next save, and leave the item carrying both.
      .filter((group: any) => String(group?._id ?? "") !== "legacy-addons")
      .map((group: any) => ({
        name: String(group?.name ?? ""),
        required: Boolean(group?.required),
        options: (Array.isArray(group?.options) ? group.options : []).map((option: any) => ({
          name: String(option?.name ?? ""),
          price: Number(option?.price ?? 0),
          isDefault: Boolean(option?.isDefault),
        })),
      })),
    createdAt: raw?.createdAt ?? undefined,
    updatedAt: raw?.updatedAt ?? undefined,
    soldToday: Number(raw?.soldToday ?? 0),
    tag: undefined,
  };
}

/** The app's draft → the body `POST/PATCH /vendor/menu` expects. */
export function fromMenuItemDraft(draft: MenuItemDraft) {
  return {
    name: draft.name.trim(),
    price: draft.price,
    description: draft.description.trim(),
    category: draft.category.trim() || "Uncategorised",
    foodType: draft.foodType,
    preparationTime: draft.prepMinutes,
    isAvailable: draft.available,
    // Sent even when blank: clearing a window has to reach the API as "no
    // window" rather than being dropped and leaving yesterday's hours in place.
    availableFrom: draft.availableFrom.trim(),
    availableTo: draft.availableTo.trim(),
    // Sent even when empty, for the same reason as the window: clearing
    // "Specific Days" has to reach the API rather than leaving last week's
    // days in place.
    availableDays: draft.availableDays ?? [],
    addons: draft.addons
      .filter((addon) => addon.name.trim())
      .map((addon) => ({
        name: addon.name.trim(),
        price: addon.price,
        isAvailable: addon.available,
      })),
    modifierGroups: draft.variants
      .filter((group) => group.name.trim() && group.options.length > 0)
      .map((group) => {
        const options = group.options.filter((option) => option.name.trim());
        // Exactly one default. The API enforces this too, but sending a group
        // with none would let it pick, and the vendor would see a different
        // answer than the one they left on screen.
        const chosen = options.findIndex((option) => option.isDefault);
        const defaultIndex = chosen === -1 ? 0 : chosen;
        return {
          name: group.name.trim(),
          required: group.required,
          minSelect: group.required ? 1 : 0,
          maxSelect: 1,
          // The wizard prices variants the way a menu does — "Half ₹120, Full
          // ₹220" is what each size costs, not what it adds. Without this the
          // API added the size's price to the dish's and billed both.
          priceMode: "absolute" as const,
          options: options.map((option, index) => ({
            name: option.name.trim(),
            price: option.price,
            isAvailable: true,
            isDefault: index === defaultIndex,
          })),
        };
      }),
  };
}

/* ── Coupons ────────────────────────────────────────────────────────────── */

const OFFER_TINTS = ["violet", "green", "amber", "red", "blue", "teal"] as const;

function shortDate(value: string | Date | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  // Two-digit year: the offer card gives this a third of a phone's width,
  // and a four-digit year pushed the date into an ellipsis.
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

/**
 * A coupon carries dates, not a status, so the three tabs the Offers screen
 * shows are derived here: scheduled before it starts, expired after it ends or
 * once switched off, active in between.
 */
export function toOffer(raw: any, index: number): Offer {
  const start = raw?.startDate ? new Date(raw.startDate) : null;
  const end = raw?.endDate ?? raw?.expiryDate ? new Date(raw.endDate ?? raw.expiryDate) : null;
  const now = Date.now();

  const scheduled = !!start && start.getTime() > now;
  const expired = (!!end && end.getTime() < now) || raw?.isActive === false;
  const status: Offer["status"] = scheduled ? "Scheduled" : expired ? "Expired" : "Active";

  const percentage = (raw?.discountType ?? raw?.type) === "percentage";
  const value = Number(raw?.discountValue ?? 0);
  const used = Number(raw?.usedCount ?? 0);

  // The API tracks redemptions, not rupees given away, so the headline figure
  // is the best available estimate: each redemption at its cap.
  const perRedemption = percentage
    ? Number(raw?.maxDiscountAmount ?? raw?.maxDiscount ?? value)
    : value;

  let startsIn: Offer["startsIn"];
  if (scheduled && start) {
    const minutes = Math.max(0, Math.round((start.getTime() - now) / 60_000));
    startsIn = {
      days: Math.floor(minutes / 1440),
      hours: Math.floor((minutes % 1440) / 60),
      mins: minutes % 60,
    };
  }

  return {
    id: String(raw?._id ?? raw?.id ?? raw?.code ?? index),
    code: String(raw?.code ?? "—"),
    badge: percentage ? `${value}%` : `₹${value}`,
    badgeSub: "OFF",
    description: raw?.description || raw?.name || "",
    validityLabel: scheduled ? "Starts on" : "Valid till",
    validity: shortDate(scheduled ? (start ?? undefined) : (end ?? undefined)),
    time: "All Time",
    minOrder: Number(raw?.minOrderAmount ?? raw?.minOrderValue ?? 0),
    used,
    discountGiven: used * perRedemption,
    status,
    tint: OFFER_TINTS[index % OFFER_TINTS.length],
    startsIn,
    active: raw?.isActive !== false,
  };
}

/* ── Payments ───────────────────────────────────────────────────────────── */

function dayLabel(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function clockLabel(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

/**
 * The Payments screen from three sources: `/vendor/stats` for the series and
 * today's total, `/vendor/withdrawals/summary` for balances, and the orders
 * already loaded for the transaction ledger.
 *
 * Every figure below is one the API returns. An earlier pass derived a
 * commission breakdown from a 10% rate, which read plausibly but did not
 * reconcile with the platform's own `unsettledEarnings` — so the breakup now
 * reports the settlement fields verbatim rather than inventing arithmetic.
 * The API exposes no per-order settlement, so ledger rows show the order
 * total, not a computed share.
 */
export function toPayments(
  stats: any,
  summary: any,
  withdrawals: any[],
  orders: VendorOrder[]
) {
  const daily: { label: string; value: number }[] = Array.isArray(stats?.dailyChartData)
    ? stats.dailyChartData.map((point: any) => ({
        label: String(point?.label ?? ""),
        value: Number(point?.value ?? 0),
      }))
    : [];

  const weekEarnings = daily.reduce((sum, point) => sum + point.value, 0);
  const monthEarnings = Array.isArray(stats?.monthlyChartData)
    ? stats.monthlyChartData.reduce((sum: number, p: any) => sum + Number(p?.value ?? 0), 0)
    : weekEarnings;

  const withdrawable = Number(summary?.withdrawable ?? 0);
  const unsettled = Number(summary?.unsettledEarnings ?? 0);
  const withdrawn = Number(summary?.alreadyWithdrawn ?? 0);
  const confirmed = Number(summary?.confirmedEarnings ?? 0);

  const settled = orders.filter((order) => order.stage === "delivered");
  const grossThisPeriod = settled.reduce((sum, order) => sum + order.total, 0);
  const pending = Number(summary?.pendingWithdrawals ?? 0);

  const orderRows = settled.map((order) => ({
    id: `order-${order.id}`,
    at: `${dayLabel(order.placedAt)}\n${clockLabel(order.placedAt)}`,
    ref: `#${order.reference}`,
    type: "Order",
    sub: `${order.lines.reduce((sum, line) => sum + line.quantity, 0)} Items`,
    amount: order.total,
    status: "Completed" as const,
    sortAt: new Date(order.placedAt).getTime(),
  }));

  const payoutRows = withdrawals.map((entry: any, index: number) => ({
    id: `payout-${entry?._id ?? entry?.id ?? index}`,
    at: `${dayLabel(entry?.createdAt ?? Date.now())}\n${clockLabel(entry?.createdAt ?? Date.now())}`,
    ref: String(entry?.reference ?? entry?._id ?? "PAYOUT").slice(-18).toUpperCase(),
    type: "Payout",
    sub: "To Bank",
    amount: -Math.abs(Number(entry?.amount ?? 0)),
    status: (entry?.status === "completed" ? "Settled" : "Pending") as "Settled" | "Pending",
    sortAt: new Date(entry?.createdAt ?? Date.now()).getTime(),
  }));

  const transactions = [...orderRows, ...payoutRows]
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, 12)
    .map(({ sortAt, ...row }) => row);

  const bank = withdrawals[0]?.bankAccount ?? null;

  return {
    walletBalance: withdrawable,
    today: {
      earnings: Number(stats?.totalSales ?? 0),
      orders: Number(stats?.completedOrderCount ?? settled.length),
      items: settled.reduce(
        (sum, order) => sum + order.lines.reduce((lines, line) => lines + line.quantity, 0),
        0
      ),
      deltaPct: 0,
    },
    availableBalance: withdrawable,
    week: { earnings: weekEarnings, orders: settled.length },
    month: { earnings: monthEarnings, orders: Number(stats?.completedOrderCount ?? 0) },
    lifetime: confirmed + withdrawn + unsettled,
    nextPayoutDate: "Next working day",
    bank: bank
      ? {
          name: String(bank.bankName ?? "Your bank"),
          account: `XXXX XXXX ${String(bank.accountNumber ?? "----").slice(-4)}`,
          ifsc: String(bank.ifscCode ?? "—"),
        }
      : { name: "No bank account", account: "Add one to receive payouts", ifsc: "—" },
    weekSeries: daily.length ? daily : [{ label: "—", value: 0 }],
    // Settlement fields exactly as the API names them, so the total below is
    // the platform's own figure rather than one this app worked out.
    breakup: [
      { label: "Gross sales (delivered)", value: grossThisPeriod },
      { label: "Unsettled — in transit", value: unsettled },
      { label: "Confirmed earnings", value: confirmed },
      { label: "Already withdrawn", value: withdrawn },
      { label: "Withdrawals pending", value: pending },
    ],
    /** What the payout system says is actually withdrawable right now. */
    netLabel: "Available to withdraw",
    net: withdrawable,
    transactions,
  };
}

/* ── Restaurant ─────────────────────────────────────────────────────────── */

export function toVendorProfile(raw: any, fallbackEmail: string) {
  const address = raw?.address;

  return {
    name: raw?.name ?? "Your restaurant",
    /*
     * The reference the server holds, not one derived here.
     *
     * This took the last twelve characters of the Mongo id while the admin
     * console took the last eight with a prefix, so the same outlet was
     * called two different things depending on which screen you were on.
     */
    outletId: String(
      raw?.outletId ?? `RES-${String(raw?._id ?? raw?.id ?? "").slice(-8).toUpperCase()}`
    ),
    id: String(raw?._id ?? raw?.id ?? "—"),
    rating: Number(raw?.rating ?? 0),
    // Restaurant has no review counter of its own; the count comes from the
    // reviews collection, which the vendor API does not expose yet.
    reviews: Number(raw?.numReviews ?? raw?.totalReviews ?? raw?.reviewCount ?? 0),
    eta: raw?.deliveryTime ?? `${raw?.estimatedDeliveryMinutes ?? 30} min`,
    cuisines: Array.isArray(raw?.cuisine) ? raw.cuisine.join(", ") : (raw?.cuisine ?? "—"),
    address: joinAddress(address) || "No address set",
    hours: raw?.openingTime && raw?.closingTime ? `${raw.openingTime} - ${raw.closingTime}` : "—",
    email: raw?.email ?? fallbackEmail,
    photo: "thali" as PhotoKey,
    image: mediaUrl(raw?.image),
    workingHours: Array.isArray(raw?.workingHours) ? raw.workingHours : [],
    prepMinutes: Number.isFinite(Number(raw?.currentPrepTimeMinutes))
      ? Number(raw.currentPrepTimeMinutes)
      : null,
    packagingFee: Number.isFinite(Number(raw?.dailyPackagingFee))
      ? Number(raw.dailyPackagingFee)
      : null,
    verified: raw?.status === "approved" || raw?.isApproved === true,
    isOpen: raw?.isOpen !== false,
    profileViews: Number(raw?.profileViews ?? 0),

    /**
     * The delivery area, which decides who may order here at all.
     *
     * The coordinates are the centre it is measured from; without them the
     * restaurant is not serviceable to anybody, however small the radius.
     */
    deliveryRadiusKm: Number(raw?.deliveryRadius ?? 0) || null,
    latitude: Number(address?.coordinates?.latitude) || null,
    longitude: Number(address?.coordinates?.longitude) || null,
  };
}
