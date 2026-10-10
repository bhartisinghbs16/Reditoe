/**
 * The vendor API, and the translation between it and the screens.
 *
 * Everything the backend actually serves is defined here: the raw response
 * shapes on the left, the view models the screens already speak on the right,
 * and one mapper between them. Screens never see a raw API object, so a change
 * in the backend's field names is a change to this file alone.
 *
 * What is live: orders, menu, categories, restaurant profile, dashboard stats,
 * documents/KYC, withdrawals. What is not: offers and reviews, which have no
 * vendor endpoint on this backend — those screens still read fixtures, and say
 * so on the page.
 */

import {
  api,
  request,
  requestRaw,
  API_BASE_URL,
  getToken,
  mediaUrl,
  toStoredMedia,
} from "@/lib/api";

/* ── Orders ─────────────────────────────────────────────────────────────── */

/**
 * The backend's own order states. Kept verbatim rather than renamed: these are
 * the strings `PATCH /vendor/orders/:id/status` accepts, and inventing our own
 * vocabulary would mean translating twice and guessing once.
 */
export type OrderStatus =
  | "Waiting for Confirmation"
  | "Order Confirmed"
  | "Processing"
  | "Ready"
  | "OnWay"
  | "Delivered"
  | "Cancelled";

/** The buckets the reference's tab strip filters by. */
export type OrderStage =
  | "new"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "completed"
  | "cancelled";

export const ORDER_STAGES: OrderStage[] = [
  "new",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
];

export const STAGE_LABEL: Record<OrderStage, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * "Order Confirmed" collapses into Preparing: it is the instant between the
 * vendor accepting and the kitchen starting, and the reference has no column
 * for it.
 */
const STAGE_FOR_STATUS: Record<OrderStatus, OrderStage> = {
  "Waiting for Confirmation": "new",
  "Order Confirmed": "preparing",
  Processing: "preparing",
  Ready: "ready",
  OnWay: "out_for_delivery",
  Delivered: "completed",
  Cancelled: "cancelled",
};

export function stageForStatus(status: string): OrderStage {
  return STAGE_FOR_STATUS[status as OrderStatus] ?? "new";
}

/**
 * The vendor's next move at each state, mirroring the backend's state machine
 * exactly — every transition here is one the server will accept, so a button
 * can never produce a 400.
 *
 *   Waiting for Confirmation → Order Confirmed → Processing → Ready
 *
 * It stops at Ready. `Ready → OnWay` and `OnWay → Delivered` used to be here,
 * and both belong to the rider now: the order goes out when the rider verifies
 * the pickup code at the counter, and is delivered when the customer verifies
 * theirs at the door. The API refuses either from a vendor, so leaving the
 * buttons would only produce a 403 on every press.
 */
export const NEXT_STATUS: Partial<
  Record<OrderStatus, { to: OrderStatus; label: string }>
> = {
  "Waiting for Confirmation": { to: "Order Confirmed", label: "Accept Order" },
  "Order Confirmed": { to: "Processing", label: "Start Preparing" },
  Processing: { to: "Ready", label: "Mark as Ready" },
};

/**
 * The pickup code the rider verifies at the counter.
 *
 * Shown as digits and as a QR encoding the same value, so the vendor can read
 * it out or hold up the screen and the rider can type or scan either way.
 */
export interface PickupCode {
  verified: boolean;
  verifiedAt?: string;
  code?: string;
  qr?: string;
  orderNumber?: string;
}

export function getPickupCode(orderId: string): Promise<PickupCode> {
  return request<PickupCode>(`/vendor/orders/${orderId}/pickup-code`);
}

/* ── Application ────────────────────────────────────────────────────────── */

/**
 * Where the vendor's application stands, and what the console should therefore
 * show. `access` is the server's own answer — the console does not re-derive it
 * from the status, so the two cannot disagree.
 */
export interface VendorApplication {
  hasApplication: boolean;
  access: "dashboard" | "review" | "rejected" | "correction" | "none";
  headline: string;
  body?: string;
  applicationStatus?: string;
  reason?: string | null;
  canResubmit?: boolean;
  restaurantName?: string;
  decidedAt?: string | null;
  history?: { status: string; reason: string | null; by: string | null; at: string }[];
}

export function fetchApplication(): Promise<VendorApplication> {
  return request<VendorApplication>("/vendor/application");
}

export function resubmitApplication(note?: string) {
  return request<{ applicationStatus: string }>("/vendor/application/resubmit", {
    method: "POST",
    body: { note },
  });
}

/** States the vendor is still allowed to cancel from. */
export const CANCELLABLE: OrderStatus[] = [
  "Waiting for Confirmation",
  "Order Confirmed",
  "Processing",
];

interface RawOrderItem {
  name?: string;
  quantity?: number;
  price?: number;
  foodItemId?: { _id?: string; name?: string; price?: number; image?: string } | string;
}

interface RawOrder {
  id?: string;
  _id?: string;
  orderNumber?: string;
  userId?: { _id?: string; name?: string; email?: string; phone?: string } | string;
  items?: RawOrderItem[];
  itemCount?: number;
  subtotal?: number;
  tax?: number;
  deliveryFee?: number;
  total?: number;
  status?: string;
  deliveryAddress?: {
    addressLine?: string;
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  paymentMethod?: string;
  paymentStatus?: string;
  cancellationReason?: string;
  createdAt?: string;
}

export interface OrderLine {
  name: string;
  quantity: number;
  price: number;
  image?: string;
}

export interface Order {
  id: string;
  /** The human reference — "AAA-114" — shown as #AAA-114. */
  reference: string;
  customer: string;
  phone: string;
  address: string;
  placedAt: string;
  status: OrderStatus;
  stage: OrderStage;
  lines: OrderLine[];
  itemCount: number;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  payment: "Online" | "COD";
  paid: boolean;
  cancelReason?: string;
}

function joinAddress(address: RawOrder["deliveryAddress"]) {
  if (!address) return "No address on the order";
  const parts = [
    address.addressLine ?? address.street,
    address.city,
    address.state,
    address.pincode,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "No address on the order";
}

function toOrder(raw: RawOrder): Order {
  const customer = typeof raw.userId === "object" ? raw.userId : undefined;
  const status = (raw.status as OrderStatus) ?? "Waiting for Confirmation";
  const method = (raw.paymentMethod ?? "").toLowerCase();

  const lines: OrderLine[] = (raw.items ?? []).map((item) => {
    const food = typeof item.foodItemId === "object" ? item.foodItemId : undefined;
    return {
      name: item.name ?? food?.name ?? "Item",
      quantity: item.quantity ?? 1,
      price: item.price ?? food?.price ?? 0,
      image: mediaUrl(food?.image),
    };
  });

  return {
    id: raw.id ?? raw._id ?? "",
    // The API's own reference, verbatim. Slicing the _id here produced a
    // different string from the one the customer, admin and rider saw for
    // the same order.
    reference: raw.orderNumber ?? "",
    customer: customer?.name ?? "Guest",
    phone: customer?.phone ?? "—",
    address: joinAddress(raw.deliveryAddress),
    placedAt: raw.createdAt ?? new Date().toISOString(),
    status,
    stage: stageForStatus(status),
    lines,
    itemCount:
      raw.itemCount ?? lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: raw.subtotal ?? 0,
    tax: raw.tax ?? 0,
    deliveryFee: raw.deliveryFee ?? 0,
    total: raw.total ?? 0,
    payment: method === "cod" ? "COD" : "Online",
    paid: (raw.paymentStatus ?? "").toLowerCase() === "paid",
    cancelReason: raw.cancellationReason,
  };
}

export async function fetchOrders(): Promise<Order[]> {
  const data = await api.get<{ orders?: RawOrder[] }>("/vendor/orders");
  return (data.orders ?? []).map(toOrder);
}

export function updateOrderStatus(orderId: string, status: OrderStatus) {
  return api.patch(`/vendor/orders/${orderId}/status`, { status });
}

export async function fetchOrder(orderId: string): Promise<Order> {
  const data = await api.get<{ order?: RawOrder } | RawOrder>(
    `/vendor/orders/${orderId}`
  );
  const raw = (data as { order?: RawOrder }).order ?? (data as RawOrder);
  return toOrder(raw);
}

/**
 * The invoice is a PDF the server streams, so it is fetched as a blob and
 * handed to the browser — a plain link would drop the Authorization header
 * and come back 401.
 */
export async function downloadInvoice(orderId: string, reference: string) {
  const response = await fetch(
    `${API_BASE_URL}/vendor/orders/${orderId}/invoice`,
    {
      headers: {
        Authorization: `Bearer ${getToken() ?? ""}`,
        // Same interstitial dodge the JSON client uses.
        ...(/\bngrok[-.]/.test(API_BASE_URL)
          ? { "ngrok-skip-browser-warning": "1" }
          : {}),
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Could not fetch the invoice (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `invoice-${reference}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ── Menu ───────────────────────────────────────────────────────────────── */

interface RawMenuItem {
  _id?: string;
  name?: string;
  price?: number;
  description?: string;
  image?: string;
  category?: string;
  isVeg?: boolean;
  foodType?: string;
  isAvailable?: boolean;
  preparationTime?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  veg: boolean;
  available: boolean;
  image?: string;
  prepMinutes: number;
}

function toMenuItem(raw: RawMenuItem): MenuItem {
  return {
    id: raw._id ?? "",
    name: raw.name ?? "Untitled item",
    description: raw.description ?? "",
    category: raw.category || "Uncategorised",
    price: raw.price ?? 0,
    // `foodType` is the authoritative field; `isVeg` is legacy and the demo
    // seed disagrees with itself on it.
    veg: raw.foodType ? raw.foodType === "veg" : Boolean(raw.isVeg),
    available: raw.isAvailable !== false,
    image: mediaUrl(raw.image),
    prepMinutes: raw.preparationTime ?? 0,
  };
}

export async function fetchMenu(): Promise<MenuItem[]> {
  const data = await api.get<{ menu?: RawMenuItem[] }>("/vendor/menu");
  return (data.menu ?? []).map(toMenuItem);
}

export function setMenuItemAvailability(id: string, isAvailable: boolean) {
  return api.patch(`/vendor/menu/${id}`, { isAvailable });
}

/**
 * What the add/edit form sends. `foodType` is the field the backend validates
 * against `veg | non-veg | egg`; `isVeg` is legacy and is not written.
 */
/** An extra a customer can add to a dish — "Extra cheese, ₹30". */
export interface MenuAddon {
  name: string;
  price: number;
}

export interface MenuItemDraft {
  name: string;
  price: number;
  description: string;
  category: string;
  cuisine?: string;
  foodType: "veg" | "non-veg" | "egg";
  preparationTime: number;
  isAvailable: boolean;
  image?: string;
  /**
   * `price` stays the list price. The customer-facing figure is derived from
   * these by the API, so a stale discounted price cannot outlive its discount.
   */
  discountType?: "none" | "percent" | "flat";
  discountValue?: number;
  addons?: MenuAddon[];
  /**
   * When the dish can be ordered, as "HH:MM" local time. Both empty means
   * always. A window ending before it starts crosses midnight.
   */
  availableFrom?: string;
  availableTo?: string;
}


/**
 * The image is stored as the API reported it, not as the page displayed it.
 * `toStoredMedia` undoes the display-time resolution so this machine's origin
 * never reaches the database.
 */
function forStorage<T extends { image?: string }>(draft: T): T {
  return draft.image === undefined ? draft : { ...draft, image: toStoredMedia(draft.image) };
}

export function createMenuItem(draft: MenuItemDraft) {
  return api.post("/vendor/menu", forStorage(draft));
}

export function updateMenuItem(id: string, draft: Partial<MenuItemDraft>) {
  return api.patch(`/vendor/menu/${id}`, forStorage(draft));
}

export function deleteMenuItem(id: string) {
  return api.del(`/vendor/menu/${id}`);
}

/** Multipart upload; the server answers with the hosted URL. */
export async function uploadMenuImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const data = await request<{ imageUrl?: string }>("/vendor/menu/upload-image", {
    method: "POST",
    formData: form,
  });
  return mediaUrl(data.imageUrl) ?? "";
}

export interface MenuCategory {
  id: string;
  name: string;
  itemCount: number;
  active: boolean;
}

export async function fetchCategories(): Promise<MenuCategory[]> {
  const data = await api.get<{
    categories?: Array<{ _id?: string; name?: string; itemCount?: number; isActive?: boolean }>;
  }>("/vendor/categories");
  return (data.categories ?? []).map((c) => ({
    id: c._id ?? "",
    name: c.name ?? "Uncategorised",
    itemCount: c.itemCount ?? 0,
    active: c.isActive !== false,
  }));
}

export function createCategory(name: string) {
  return api.post("/vendor/categories", { name });
}

export function renameCategory(id: string, name: string) {
  return api.patch(`/vendor/categories/${id}`, { name });
}

export function toggleCategory(id: string) {
  return api.patch(`/vendor/categories/${id}/toggle`);
}

export function deleteCategory(id: string) {
  return api.del(`/vendor/categories/${id}`);
}

/* ── Restaurant ─────────────────────────────────────────────────────────── */

interface RawRestaurant {
  _id?: string;
  name?: string;
  image?: string;
  rating?: number;
  deliveryTime?: string;
  deliveryFee?: number;
  estimatedDeliveryMinutes?: number;
  currentPrepTimeMinutes?: number | null;
  deliveryRadius?: number;
  commissionPercent?: number;
  phone?: string;
  description?: string;
  status?: string;
  kycStatus?: string;
  isOpen?: boolean;
  isEnabled?: boolean;
  foodType?: string;
  address?: {
    addressLine?: string;
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  storeTimings?: { openTime?: string; closeTime?: string };
  gstInfo?: { gstNumber?: string; fssaiNumber?: string };
  settlementInfo?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    branch?: string;
    upiId?: string;
    accountHolderName?: string;
  };
}

export interface Restaurant {
  id: string;
  name: string;
  image?: string;
  rating: number;
  address: string;
  city: string;
  pincode: string;
  phone: string;
  description: string;
  deliveryTime: string;
  deliveryRadiusKm: number;
  commissionPercent: number;
  prepMinutes: number;
  approved: boolean;
  kycStatus: string;
  isOpen: boolean;
  openFrom: string;
  openTo: string;
  foodType: string;
  gstin: string;
  fssai: string;
  bank: {
    name: string;
    accountMasked: string;
    ifsc: string;
    branch: string;
    upi: string;
  };
}

function maskAccount(account?: string) {
  if (!account) return "—";
  return account.length <= 4 ? account : `XXXX XXXX ${account.slice(-4)}`;
}

function toRestaurant(raw: RawRestaurant): Restaurant {
  return {
    id: raw._id ?? "",
    name: raw.name ?? "Your restaurant",
    image: mediaUrl(raw.image),
    rating: raw.rating ?? 0,
    address: joinAddress(raw.address),
    city: raw.address?.city ?? "—",
    pincode: raw.address?.pincode ?? "—",
    phone: raw.phone ?? "—",
    description: raw.description ?? "",
    deliveryTime: raw.deliveryTime ?? "—",
    deliveryRadiusKm: raw.deliveryRadius ?? 0,
    commissionPercent: raw.commissionPercent ?? 0,
    prepMinutes: raw.currentPrepTimeMinutes ?? raw.estimatedDeliveryMinutes ?? 0,
    approved: raw.status === "approved",
    kycStatus: raw.kycStatus ?? "pending",
    isOpen: raw.isOpen !== false,
    openFrom: raw.storeTimings?.openTime ?? "—",
    openTo: raw.storeTimings?.closeTime ?? "—",
    foodType: raw.foodType ?? "both",
    gstin: raw.gstInfo?.gstNumber ?? "—",
    fssai: raw.gstInfo?.fssaiNumber ?? "—",
    bank: {
      name: raw.settlementInfo?.bankName ?? "Not added",
      accountMasked: maskAccount(raw.settlementInfo?.accountNumber),
      ifsc: raw.settlementInfo?.ifscCode ?? "—",
      branch: raw.settlementInfo?.branch ?? "—",
      upi: raw.settlementInfo?.upiId ?? "—",
    },
  };
}

export async function fetchRestaurant(): Promise<Restaurant> {
  const data = await api.get<{ restaurant?: RawRestaurant }>("/vendor/restaurant");
  return toRestaurant(data.restaurant ?? {});
}

/** The documents endpoint returns the fuller restaurant record plus its files. */
export async function fetchRestaurantDetail(): Promise<{
  restaurant: Restaurant;
  documents: Array<{ type?: string; status?: string; url?: string; uploadedAt?: string }>;
}> {
  const data = await api.get<{
    restaurant?: RawRestaurant;
    documents?: Array<{ type?: string; status?: string; url?: string; uploadedAt?: string }>;
  }>("/vendor/documents");
  return {
    restaurant: toRestaurant(data.restaurant ?? {}),
    documents: data.documents ?? [],
  };
}

export function setRestaurantOpen(isOpen: boolean) {
  return api.patch("/vendor/restaurant/availability", { isOpen });
}

/**
 * The outlet fields `PATCH /vendor/restaurant` will accept. Anything not on
 * this list is ignored by the server's own allow-list, so the form doesn't
 * offer it.
 */
export interface RestaurantDraft {
  name: string;
  phone: string;
  description: string;
  deliveryFee: number;
  address: {
    addressLine?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}

// No image here: the logo has its own upload endpoint, which stores it server
// side, so nothing on this path can write a display URL back.
export function updateRestaurant(draft: Partial<RestaurantDraft>) {
  return api.patch("/vendor/restaurant", draft);
}

/**
 * Opening hours and the vendor-level settings live on the *profile* endpoint
 * rather than the restaurant one — a split in the backend, not in the UI.
 */
export interface VendorProfileDraft {
  openingHours?: string;
  foodType?: string;
  storeCharge?: number;
  dailyPackagingFee?: number;
  upiId?: string;
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
  };
}

export function updateVendorProfile(draft: VendorProfileDraft) {
  return api.put("/vendor/profile", draft);
}

export async function uploadRestaurantLogo(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const data = await request<{ imageUrl?: string; image?: string }>(
    "/vendor/restaurant/logo",
    { method: "POST", formData: form }
  );
  return mediaUrl(data.imageUrl ?? data.image) ?? "";
}

/* ── Dashboard stats ────────────────────────────────────────────────────── */

export interface VendorStats {
  totalSales: number;
  completedOrderCount: number;
  pendingOrdersCount: number;
  newLeads: number;
  daily: Array<{ label: string; value: number }>;
  weekly: Array<{ label: string; value: number }>;
  monthly: Array<{ label: string; value: number }>;
  restaurantStatus: string;
  isOpen: boolean;
}

export async function fetchStats(): Promise<VendorStats> {
  const data = await api.get<{
    totalSales?: number;
    completedOrderCount?: number;
    pendingOrdersCount?: number;
    newLeads?: number;
    dailyChartData?: Array<{ label?: string; value?: number }>;
    weeklyChartData?: Array<{ label?: string; value?: number }>;
    monthlyChartData?: Array<{ label?: string; value?: number }>;
    restaurantStatus?: string;
    isOpen?: boolean;
  }>("/vendor/stats");

  const series = (rows?: Array<{ label?: string; value?: number }>) =>
    (rows ?? []).map((row) => ({ label: row.label ?? "", value: row.value ?? 0 }));

  return {
    totalSales: data.totalSales ?? 0,
    completedOrderCount: data.completedOrderCount ?? 0,
    pendingOrdersCount: data.pendingOrdersCount ?? 0,
    newLeads: data.newLeads ?? 0,
    daily: series(data.dailyChartData),
    weekly: series(data.weeklyChartData),
    monthly: series(data.monthlyChartData),
    restaurantStatus: data.restaurantStatus ?? "pending",
    isOpen: data.isOpen !== false,
  };
}

/* ── Money ──────────────────────────────────────────────────────────────── */

export interface WithdrawalSummary {
  withdrawable: number;
  confirmedEarnings: number;
  alreadyWithdrawn: number;
  pendingWithdrawals: number;
  unsettledEarnings: number;
}

export function fetchWithdrawalSummary() {
  return api.get<WithdrawalSummary>("/vendor/withdrawals/summary");
}

export interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  processedAt?: string;
  reference?: string;
}

export async function fetchWithdrawals(): Promise<Withdrawal[]> {
  const data = await api.get<{
    withdrawals?: Array<{
      _id?: string;
      amount?: number;
      status?: string;
      createdAt?: string;
      processedAt?: string;
      transactionId?: string;
    }>;
  }>("/vendor/withdrawals");
  return (data.withdrawals ?? []).map((w) => ({
    id: w._id ?? "",
    amount: w.amount ?? 0,
    status: w.status ?? "pending",
    createdAt: w.createdAt ?? "",
    processedAt: w.processedAt,
    reference: w.transactionId,
  }));
}

export function requestWithdrawal(amount: number) {
  return api.post("/vendor/withdrawals", { amount });
}

/* ── KYC ────────────────────────────────────────────────────────────────── */

export interface KycStatus {
  kycStatus: string;
  isComplete: boolean;
  uploadedDocuments: string[];
  requiredDocuments: string[];
}

export async function fetchKycStatus(): Promise<KycStatus> {
  const data = await api.get<{
    kycStatus?: string;
    isComplete?: boolean;
    uploadedDocuments?: string[];
    requiredDocuments?: string[];
  }>("/vendor/kyc/status");
  return {
    kycStatus: data.kycStatus ?? "pending",
    isComplete: Boolean(data.isComplete),
    uploadedDocuments: data.uploadedDocuments ?? [],
    requiredDocuments: data.requiredDocuments ?? [],
  };
}

/* ── Coupons ────────────────────────────────────────────────────────────── */

export type CouponType = "flat" | "percentage" | "bogo";

interface RawCoupon {
  _id?: string;
  id?: string;
  code?: string;
  name?: string;
  description?: string;
  type?: string;
  discountType?: string;
  discountValue?: number;
  minOrderValue?: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount?: number;
  startDate?: string;
  endDate?: string;
  expiryDate?: string;
  isActive?: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  name: string;
  description: string;
  type: CouponType;
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  /** Derived: what the tab strip filters by. */
  status: "Active" | "Scheduled" | "Expired" | "Paused";
  /** The two lines printed in the coupon tile, e.g. "20%" / "OFF". */
  couponTop: string;
  couponBottom: string;
}

function couponStatus(raw: RawCoupon): Coupon["status"] {
  const now = Date.now();
  const end = raw.endDate ?? raw.expiryDate;
  if (end && new Date(end).getTime() < now) return "Expired";
  if (raw.isActive === false) return "Paused";
  if (raw.startDate && new Date(raw.startDate).getTime() > now) return "Scheduled";
  return "Active";
}

function couponFace(type: CouponType, value: number): [string, string] {
  if (type === "percentage") return [`${value}%`, "OFF"];
  if (type === "bogo") return ["BUY 1", "GET 1"];
  return [`₹${value}`, "OFF"];
}

function toCoupon(raw: RawCoupon): Coupon {
  const type = ((raw.type ?? raw.discountType ?? "flat") as CouponType);
  const discountValue = raw.discountValue ?? 0;
  const [couponTop, couponBottom] = couponFace(type, discountValue);
  return {
    id: raw._id ?? raw.id ?? "",
    code: raw.code ?? "",
    name: raw.name ?? raw.code ?? "",
    description: raw.description ?? "",
    type,
    discountValue,
    minOrderValue: raw.minOrderValue ?? raw.minOrderAmount ?? 0,
    maxDiscount: raw.maxDiscount,
    usageLimit: raw.usageLimit,
    usedCount: raw.usedCount ?? 0,
    startDate: raw.startDate,
    endDate: raw.endDate ?? raw.expiryDate,
    isActive: raw.isActive !== false,
    status: couponStatus(raw),
    couponTop,
    couponBottom,
  };
}

export async function fetchCoupons(): Promise<Coupon[]> {
  const data = await api.get<{ coupons?: RawCoupon[] }>("/vendor/coupons");
  return (data.coupons ?? []).map(toCoupon);
}

export interface CouponDraft {
  code: string;
  name: string;
  description: string;
  type: CouponType;
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  usageLimit?: number;
  endDate: string;
}

export function createCoupon(draft: CouponDraft) {
  return api.post("/vendor/coupons", draft);
}

export function toggleCoupon(id: string) {
  return api.patch(`/vendor/coupons/${id}/toggle`);
}

export function deleteCoupon(id: string) {
  return api.del(`/vendor/coupons/${id}`);
}

/* ── Auth ───────────────────────────────────────────────────────────────── */

export interface VendorUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
}

/** Uses the raw request: the token sits beside `data`, not inside it. */
export function login(email: string, password: string) {
  return requestRaw<{ token?: string; data?: { user?: VendorUser } }>(
    "/auth/login",
    { method: "POST", body: { email, password }, anonymous: true }
  );
}

/**
 * What a new vendor tells us. The restaurant is created alongside the account,
 * which is why this cannot go through the generic /auth/register: that makes a
 * user with role "vendor" and no restaurant, and every vendor endpoint then
 * answers "Restaurant not found. Please complete your restaurant setup."
 */
export interface VendorSignUpDraft {
  restaurantName: string;
  contactPersonName: string;
  email: string;
  phone: string;
  password: string;
  city: string;
  street?: string;
  zipCode?: string;
  cuisine?: string;
}

/**
 * Registers the vendor and their restaurant in one call, returning a token so
 * they land in the console rather than being bounced back to sign in.
 *
 * `alreadyRegistered` comes back when the email is a vendor who already exists
 * — the API signs them in instead of refusing, and the caller says so rather
 * than reporting a successful "signup" for an account they did not just make.
 */
export function register(draft: VendorSignUpDraft) {
  return requestRaw<{
    token?: string;
    data?: { user?: VendorUser };
    user?: VendorUser;
    alreadyRegistered?: boolean;
  }>("/vendor/register", {
    method: "POST",
    anonymous: true,
    body: {
      restaurantName: draft.restaurantName.trim(),
      contactPersonName: draft.contactPersonName.trim(),
      contactPersonNumber: draft.phone.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      password: draft.password,
      city: draft.city.trim(),
      street: draft.street?.trim() || undefined,
      zipCode: draft.zipCode?.trim() || undefined,
      cuisine: draft.cuisine?.trim() || undefined,
    },
  });
}

export async function fetchMe(): Promise<VendorUser> {
  const data = await api.get<{ user?: VendorUser } | VendorUser>("/auth/me");
  return ((data as { user?: VendorUser }).user ?? data) as VendorUser;
}

/**
 * The cuisines a dish can be tagged with.
 *
 * This endpoint answers with a bare array of strings rather than the
 * usual { data: { cuisines: [...] } }, so it is unwrapped here instead of
 * leaving each caller to discover that.
 */
export async function fetchCuisines(): Promise<string[]> {
  const body = await requestRaw<{ data?: string[] | { cuisines?: string[] } }>(
    "/cuisines",
    { method: "GET" }
  );
  const data = body?.data;
  if (Array.isArray(data)) return data.filter(Boolean);
  return (data?.cuisines ?? []).filter(Boolean);
}