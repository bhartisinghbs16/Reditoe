"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api, type PaginatedResult, type QueryValue } from "@/lib/api";
import type {
  ActivityLog,
  AdminTask,
  Banner,
  Campaign,
  Coupon,
  Customer,
  CustomerGroup,
  DashboardAnalytics,
  Dispute,
  Invoice,
  MenuItem,
  NotificationRecord,
  Order,
  Payout,
  Refund,
  ReferralRecord,
  Restaurant,
  Review,
  RevenueTrend,
  Rider,
  Role,
  SupportTicket,
  Taxonomy,
  Transaction,
  WalletRecord,
} from "@/lib/types";

export type ListParams = Record<string, QueryValue>;

/**
 * Builds a paginated list hook for an endpoint. Every list screen in the
 * console is one of these, so filters, paging and caching behave identically.
 */
function listHook<T>(path: string, dataKey: string, scope: string) {
  return function useList(
    params: ListParams = {},
    options?: { enabled?: boolean }
  ) {
    return useQuery<PaginatedResult<T>>({
      queryKey: [scope, "list", params],
      queryFn: () => api.list<T>(path, dataKey, params),
      placeholderData: (previous) => previous, // no skeleton flash on refetch
      enabled: options?.enabled ?? true,
    });
  };
}

function detailHook<T>(path: (id: string) => string, dataKey: string, scope: string) {
  return function useDetail(id: string | undefined) {
    return useQuery<T>({
      queryKey: [scope, "detail", id],
      queryFn: async () => {
        const data = await api.get<Record<string, unknown> | T>(path(id!));
        // Detail endpoints wrap the document under a named key.
        if (data && typeof data === "object" && dataKey in data) {
          return (data as Record<string, unknown>)[dataKey] as T;
        }
        return data as T;
      },
      enabled: Boolean(id),
    });
  };
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */

export function useDashboardAnalytics() {
  return useQuery<DashboardAnalytics>({
    queryKey: ["dashboard", "analytics"],
    queryFn: () => api.get<DashboardAnalytics>("/admin/dashboard/analytics"),
  });
}

export function useRevenueTrend(period: string = "7days") {
  return useQuery<RevenueTrend>({
    queryKey: ["dashboard", "revenue-trend", period],
    queryFn: () =>
      api.get<RevenueTrend>("/admin/dashboard/revenue-trend", { query: { period } }),
    placeholderData: (previous) => previous,
  });
}

export function useLiveOrders() {
  return useQuery<PaginatedResult<Order>>({
    queryKey: ["orders", "live"],
    queryFn: () => api.list<Order>("/admin/orders/live", "orders"),
    refetchInterval: 20_000, // live board — poll rather than wait for a reload
  });
}

/* ── Lists ──────────────────────────────────────────────────────────────── */

export const useOrders = listHook<Order>("/admin/orders", "orders", "orders");
export const useCustomers = listHook<Customer>("/admin/users", "users", "customers");
export const useRestaurants = listHook<Restaurant>(
  "/admin/restaurants",
  "restaurants",
  "restaurants"
);
export const useRiders = listHook<Rider>("/admin/riders", "riders", "riders");
export const useMenuItems = listHook<MenuItem>("/admin/menu-items", "menuItems", "menu");
export const useCoupons = listHook<Coupon>("/admin/coupons", "coupons", "coupons");
export const useCampaigns = listHook<Campaign>(
  "/admin/campaigns",
  "campaigns",
  "campaigns"
);
export const useBanners = listHook<Banner>("/admin/marketing/banners", "banners", "banners");
/** Create, change or remove a poster, and upload the image for one. */
/*
 * Creating the things the console could only list.
 *
 * Every one of these had a "New …" button with no handler behind it, so the
 * page looked finished and the button did nothing. The endpoints existed
 * already; nothing had ever called them.
 */
export function useCreateTask() {
  return useInvalidating<Record<string, unknown>, unknown>(
    (body) => api.post("/admin/tasks", body),
    ["tasks"]
  );
}

export function useCreateRole() {
  return useInvalidating<Record<string, unknown>, unknown>(
    (body) => api.post("/admin/rbac/roles", body),
    ["roles"]
  );
}

export function useCreateBanner() {
  return useInvalidating<Partial<Banner>, unknown>(
    (body) => api.post("/admin/marketing/banners", body),
    ["banners"]
  );
}

export function useUpdateBanner() {
  return useInvalidating<{ id: string } & Partial<Banner>, unknown>(
    ({ id, ...body }) => api.put(`/admin/marketing/banners/${id}`, body),
    ["banners"]
  );
}

export function useDeleteBanner() {
  return useInvalidating<{ id: string }, unknown>(
    ({ id }) => api.delete(`/admin/marketing/banners/${id}`),
    ["banners"]
  );
}

/** Stores the image and returns its URL, which the banner then points at. */
/**
 * Stores a poster and answers with its address.
 *
 * The result is the unwrapped `data` — `request()` strips the `{ status, data }`
 * envelope — so this is `{ url }`, not `{ data: { url } }`. Typing it the other
 * way is what made every upload look like it had failed: the address was read
 * from a level that is never there, and the screen reported an upload with no
 * address for a file the server had in fact saved.
 */
export function useUploadBannerImage() {
  return useInvalidating<{ file: File }, { url?: string }>(({ file }) => {
    const form = new FormData();
    form.append("image", file);
    return api.upload<{ url?: string }>("/admin/marketing/banners/image", form);
  }, ["banners"]);
}

export const useReviews = listHook<Review>("/admin/reviews", "reviews", "reviews");
export const useSupportTickets = listHook<SupportTicket>(
  "/admin/user-support",
  "tickets",
  "support"
);
/**
 * The cities and states this platform has data for.
 *
 * Read from the data rather than a maintained list: a filter offering a city
 * with nothing in it, or missing one that has orders, is worse than no filter.
 */
export function useKnownLocations() {
  return useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<{ cities: string[]; states: string[] }>("/admin/locations"),
    staleTime: 5 * 60 * 1000,
  });
}

/** What the API is actually wired up to. Booleans and provider names only. */
export interface IntegrationStatus {
  razorpay: { configured: boolean; mode: "live" | "test" | null; keyEnding: string | null };
  email: { configured: boolean; provider: string | null; from: string | null };
  sms: { configured: boolean; provider: string | null };
  push: { configured: boolean; provider: string | null };
  maps: { configured: boolean; provider: string };
  wallet: { configured: boolean; provider: string };
}

/**
 * Read from the API rather than from the settings document.
 *
 * The settings document records what somebody ticked; this reports what the
 * server can actually do. They are not the same thing, and the screen was
 * showing the first while claiming to show the second.
 */
export function useIntegrationStatus() {
  return useQuery({
    queryKey: ["integrations"],
    queryFn: () => api.get<IntegrationStatus>("/admin/system/integrations"),
  });
}

/* ── Two-step sign-in ─────────────────────────────────────────────────── */

export interface TwoFactorStatus {
  enabled: boolean;
  enrolledAt: string | null;
  recoveryCodesRemaining: number;
}

/** Whether this admin has two-step sign-in switched on. */
export function useTwoFactorStatus() {
  return useQuery({
    queryKey: ["2fa"],
    queryFn: () => api.get<TwoFactorStatus>("/admin/auth/2fa"),
  });
}

/** Produces a secret and its QR code. Switches nothing on by itself. */
export function useStartTwoFactorSetup() {
  return useInvalidating<void, { qr: string; secret: string }>(
    () => api.post<{ qr: string; secret: string }>("/admin/auth/2fa/setup"),
    ["2fa"]
  );
}

/** Confirms a code from the app and returns the recovery codes, once. */
export function useEnableTwoFactor() {
  return useInvalidating<{ token: string }, { recoveryCodes: string[] }>(
    ({ token }) => api.post<{ recoveryCodes: string[] }>("/admin/auth/2fa/enable", { token }),
    ["2fa"]
  );
}

/** Switches it off. The password is asked for again. */
export function useDisableTwoFactor() {
  return useInvalidating<{ password: string }, unknown>(
    ({ password }) => api.post("/admin/auth/2fa/disable", { password }),
    ["2fa"]
  );
}

/** One ticket with everything said on it, for the thread view. */
export interface SupportThread {
  _id: string;
  subject: string;
  message: string;
  status: "open" | "in-progress" | "resolved" | "closed";
  priority?: string;
  category?: string;
  createdAt?: string;
  userId?: { _id?: string; name?: string; email?: string; phone?: string } | string;
  conversation?: {
    message: string;
    sender: "user" | "admin";
    timestamp?: string;
  }[];
}

/**
 * One support ticket, opened from the list.
 *
 * Refetched on an interval while the drawer is open: the person on the other
 * end is often replying in the same minutes, and an answer that only appears
 * after a manual refresh reads as no answer at all.
 */
export function useSupportTicket(id: string | null) {
  return useQuery({
    queryKey: ["support", id],
    queryFn: () => api.get<{ ticket?: SupportThread } & SupportThread>(
      `/admin/user-support/${id}`
    ),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  });
}

/** Answers one ticket. */
export function useReplyToTicket() {
  return useInvalidating<{ id: string; message: string }, unknown>(
    ({ id, message }) => api.post(`/admin/user-support/${id}/messages`, { message }),
    ["support"]
  );
}

/** Moves a ticket along - being looked at, resolved, closed. */
export function useSetTicketStatus() {
  return useInvalidating<{ id: string; status: string }, unknown>(
    ({ id, status }) => api.patch(`/admin/user-support/${id}/status`, { status }),
    ["support"]
  );
}

export const useDisputes = listHook<Dispute>("/admin/disputes", "disputes", "disputes");
export const usePayouts = listHook<Payout>("/admin/payouts", "payouts", "payouts");
export const useTransactions = listHook<Transaction>(
  "/admin/payments",
  "payments",
  "transactions"
);
export const useInvoices = listHook<Invoice>("/admin/invoices", "invoices", "invoices");
export const useRefunds = listHook<Refund>("/admin/refunds", "refunds", "refunds");

/**
 * Refund totals for the window on screen.
 *
 * The cards counted only the rows the current page happened to hold, so the
 * figure changed as you paged and could not answer "how much did we refund
 * last week". The server totals the whole filtered set.
 */
export function useRefundTotals(params: Record<string, unknown>) {
  return useQuery<{
    overview?: { totalRefunds?: number; totalAmount?: number; averageAmount?: number };
    byStatus?: { _id?: string; count?: number; totalAmount?: number }[];
  }>({
    queryKey: ["refunds", "totals", params],
    queryFn: () =>
      api.get("/admin/refunds/stats/summary", { query: params as Record<string, never> }),
    placeholderData: (previous) => previous,
  });
}
export const useRoles = listHook<Role>("/admin/rbac/roles", "roles", "roles");
export const useActivityLogs = listHook<ActivityLog>(
  "/activity-logs",
  "logs",
  "activity"
);
export const useNotifications = listHook<NotificationRecord>(
  "/admin/notifications",
  "notifications",
  "notifications"
);
export const useVendorWithdrawals = listHook<Payout>(
  "/admin/vendor-withdrawals",
  "withdrawals",
  "vendor-withdrawals"
);
export const useRiderWithdrawals = listHook<Payout>(
  "/admin/rider-withdrawals",
  "withdrawals",
  "rider-withdrawals"
);
export const useSettlements = listHook<Payout>(
  "/admin/vendor-settlements",
  "settlements",
  "settlements"
);
export const useTasks = listHook<AdminTask>("/admin/tasks", "tasks", "tasks");
export const useReferrals = listHook<ReferralRecord>(
  "/referrals",
  "referrals",
  "referrals"
);
export const useCategories = listHook<Taxonomy>(
  "/admin/restaurants/categories",
  "categories",
  "categories"
);
export const useCuisines = listHook<Taxonomy>("/cuisines", "cuisines", "cuisines");
export const useCustomerGroups = listHook<CustomerGroup>(
  "/admin/users/groups",
  "groups",
  "customer-groups"
);
export const useWallets = listHook<WalletRecord>(
  "/admin/payments/wallets",
  "wallets",
  "wallets"
);

/* ── Details ────────────────────────────────────────────────────────────── */

export const useOrder = detailHook<Order>((id) => `/admin/orders/${id}`, "order", "orders");
/**
 * The customer detail endpoint returns the document alongside stats, wallet
 * totals and payment methods worked out from their own orders and reviews.
 * `detailHook` would unwrap `user` and drop those, so this keeps them, folded
 * onto the customer the page already reads.
 */
export function useCustomer(id: string | undefined) {
  return useQuery<Customer>({
    queryKey: ["customers", "detail", id],
    queryFn: async () => {
      const payload = await api.get<{
        user: Customer;
        stats?: Customer["stats"];
        wallet?: Customer["wallet"];
        walletActivity?: Customer["walletActivity"];
        membership?: Customer["membership"];
        paymentMethods?: Customer["paymentMethods"];
      }>(`/admin/users/${id!}`);
      return {
        ...payload.user,
        stats: payload.stats,
        wallet: payload.wallet,
        walletActivity: payload.walletActivity,
        membership: payload.membership,
        paymentMethods: payload.paymentMethods,
      };
    },
    enabled: Boolean(id),
  });
}
export const useRestaurant = detailHook<Restaurant>(
  (id) => `/admin/restaurants/${id}`,
  "restaurant",
  "restaurants"
);
export const useRider = detailHook<Rider>((id) => `/admin/riders/${id}`, "rider", "riders");

export const useCampaign = detailHook<Campaign>(
  (id) => `/admin/campaigns/${id}`,
  "campaign",
  "campaigns"
);

export const useRefund = detailHook<Refund>(
  (id) => `/admin/refunds/${id}`,
  "refund",
  "refunds"
);

export function useCustomerOrders(id: string | undefined) {
  return useQuery<PaginatedResult<Order>>({
    queryKey: ["customers", "orders", id],
    queryFn: () => api.list<Order>(`/admin/users/${id}/orders`, "orders"),
    enabled: Boolean(id),
  });
}

export function useRiderOrders(id: string | undefined) {
  return useQuery<PaginatedResult<Order>>({
    queryKey: ["riders", "orders", id],
    queryFn: () => api.list<Order>(`/admin/riders/${id}/orders`, "orders"),
    enabled: Boolean(id),
  });
}

/* ── Settings ───────────────────────────────────────────────────────────── */

export function useSettings<T = Record<string, unknown>>(
  options?: Partial<UseQueryOptions<T>>
) {
  return useQuery<T>({
    queryKey: ["settings"],
    queryFn: () => api.get<T>("/admin/settings"),
    ...options,
  });
}

/* ── Mutations ──────────────────────────────────────────────────────────── */

/**
 * Wraps a write with cache invalidation for the scopes it can affect. Callers
 * pass the scopes rather than invalidating everything, so unrelated screens
 * don't refetch.
 */
function useInvalidating<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  scopes: string[]
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const scope of scopes) {
        queryClient.invalidateQueries({ queryKey: [scope] });
      }
    },
  });
}

export function useUpdateOrderStatus() {
  return useInvalidating<{ id: string; status: string }, unknown>(
    ({ id, status }) => api.patch(`/admin/orders/${id}/status`, { status }),
    ["orders", "dashboard"]
  );
}

export function useCancelOrder() {
  return useInvalidating<{ id: string; reason?: string }, unknown>(
    ({ id, reason }) => api.patch(`/admin/orders/${id}/cancel`, { reason }),
    ["orders", "dashboard"]
  );
}

export function useAssignRider() {
  return useInvalidating<{ id: string; riderId: string }, unknown>(
    ({ id, riderId }) => api.patch(`/admin/orders/${id}/assign-rider`, { riderId }),
    ["orders", "riders"]
  );
}

export function useRefundOrder() {
  return useInvalidating<{ id: string; amount?: number; reason?: string }, unknown>(
    ({ id, amount, reason }) =>
      api.patch(`/admin/orders/${id}/refund`, { amount, reason }),
    ["orders", "refunds"]
  );
}

export function useUpdateOrderNotes() {
  return useInvalidating<{ id: string; adminNotes: string }, unknown>(
    ({ id, adminNotes }) => api.patch(`/admin/orders/${id}/admin-notes`, { adminNotes }),
    ["orders"]
  );
}

export function useSetCustomerBlocked() {
  return useInvalidating<{ id: string; isBlocked: boolean }, unknown>(
    ({ id, isBlocked }) => api.patch(`/admin/users/${id}/status`, { isBlocked }),
    ["customers"]
  );
}

/**
 * Correct a customer's name, email or phone.
 *
 * The console could show a customer but never change one - "Edit Customer"
 * was a button with nothing behind it.
 */
export function useUpdateCustomer() {
  return useInvalidating<
    { id: string; name?: string; email?: string; phone?: string; codEnabled?: boolean },
    unknown
  >(({ id, ...fields }) => api.patch(`/admin/users/${id}`, fields), ["customers"]);
}

/**
 * Grant or withdraw Reditoe Plus for one customer.
 *
 * Plus waives the delivery fee, so this is a commercial decision rather than
 * a profile field - it lives on its own endpoint and its own button.
 */
export function useSetCustomerMembership() {
  return useInvalidating<{ id: string; active: boolean; months?: number }, unknown>(
    ({ id, ...body }) => api.patch(`/admin/users/${id}/membership`, body),
    ["customers"]
  );
}

/**
 * Confirm the codes sent when staff created a rider, or send fresh ones.
 *
 * The rider stays blocked until both the email and the mobile code are in.
 */
export function useVerifyRiderContact(id: string | undefined) {
  return useInvalidating<{ emailOtp?: string; phoneOtp?: string }, unknown>(
    (body) => api.post(`/admin/riders/${id}/verify-contact`, body),
    ["riders", "rider"]
  );
}

export function useResendRiderVerification(id: string | undefined) {
  return useInvalidating<void, unknown>(
    () => api.post(`/admin/riders/${id}/resend-verification`, {}),
    ["riders", "rider"]
  );
}

/**
 * Put money into one customer's wallet.
 *
 * Never a field on the profile form: money moves through the wallet ledger so
 * there is a record of who credited what and why.
 */
/**
 * Add, remove, hold or release money in one customer's wallet.
 *
 * A reason is required by the server, not merely encouraged, because these
 * are the movements someone asks about weeks later.
 */
export type WalletAction = "add" | "remove" | "hold" | "unhold";

export function useAdjustCustomerWallet(id: string | undefined) {
  return useInvalidating<
    { action: WalletAction; amount: number; comment: string },
    unknown
  >((body) => api.post(`/admin/users/${id}/wallet/adjust`, body), ["customers"]);
}

/**
 * A spreadsheet of wallet credits.
 *
 * Every row is checked before any money moves, so a file with one bad row
 * credits nobody - a half-applied upload cannot be told from a complete one
 * without reading the ledger row by row.
 */
/**
 * Credits many wallets from a spreadsheet.
 *
 * Raw, unlike the uploads around it: the caller shows the server's own summary
 * and lists the rows that failed, and both live *beside* `data` in the
 * envelope that `request()` would throw away. Unwrapped, a partial run - some
 * rows credited, some refused - reported plain success and named none of the
 * failures.
 */
export function useBulkCreditWallets() {
  return useInvalidating<{ file: File }, BulkCreditResult>(({ file }) => {
    const form = new FormData();
    form.append("file", file);
    return api.raw<BulkCreditResult>("/admin/users/wallet/bulk-credit", {
      method: "POST",
      formData: form,
    });
  }, ["customers"]);
}

export interface BulkCreditResult {
  status?: string;
  message?: string;
  data?: {
    applied?: { line: number; customer: string; amount: number }[];
    problems?: string[];
    failures?: string[];
  };
}

/** Confirm the codes sent when staff created a vendor, or send fresh ones. */
export function useVerifyVendorContact(id: string | undefined) {
  return useInvalidating<{ emailOtp?: string; phoneOtp?: string }, unknown>(
    (body) => api.post(`/admin/restaurants/vendors/${id}/verify-contact`, body),
    ["restaurants", "restaurant"]
  );
}

export function useResendVendorVerification(id: string | undefined) {
  return useInvalidating<void, unknown>(
    () => api.post(`/admin/restaurants/vendors/${id}/resend-verification`, {}),
    ["restaurants", "restaurant"]
  );
}

/**
 * Order analytics for a date range, counted from the orders themselves.
 *
 * The screen this feeds was written against fixed numbers - a week in May
 * 2024 - so it reported the same figures whatever had happened, and its date
 * filter had nothing to filter.
 */
/**
 * Customer analytics for a window, with the previous window of equal length
 * for comparison. Counted from customers and their orders.
 */
export function useCustomerAnalytics(range: { from?: string; to?: string }) {
  return useQuery<CustomerAnalytics>({
    queryKey: ["customers", "analytics", range.from, range.to],
    queryFn: () =>
      api.get<CustomerAnalytics>(
        `/admin/users/analytics?${new URLSearchParams(
          Object.entries(range).filter(([, v]) => Boolean(v)) as [string, string][]
        ).toString()}`
      ),
  });
}

export interface CustomerAnalytics {
  range: { from: string; to: string; previousFrom: string; previousTo: string };
  totals: {
    totalCustomers: number;
    newCustomers: number;
    activeCustomers: number;
    returningCustomers: number;
    orders: number;
    revenue: number;
    ordersPerCustomer: number;
    revenuePerCustomer: number;
    previous: {
      newCustomers: number;
      activeCustomers: number;
      returningCustomers: number;
      revenue: number;
      ordersPerCustomer: number;
    };
    /** Null where the previous period had nothing to compare against. */
    change: {
      newCustomers: number | null;
      activeCustomers: number | null;
      returningCustomers: number | null;
      revenue: number | null;
      ordersPerCustomer: number | null;
    };
  };
  growth: { date: string; newCustomers: number; totalCustomers: number }[];
  acquisition: { label: string; value: number }[];
  cities: { label: string; value: number }[];
  segments: {
    high: number;
    medium: number;
    low: number;
    atRisk: number;
    neverOrdered: number;
  };
  customerValue: {
    averageLifetimeSpend: number;
    customersWithOrders: number;
    totalLifetimeSpend: number;
  };
  cohorts: { week: string; size: number; retention: (number | null)[] }[];
  cohortWindows: number[];
  topCustomers: {
    id: string;
    name: string;
    email: string;
    phone: string;
    orders: number;
    spent: number;
    averageOrderValue: number;
    lastOrderAt: string;
    customerSince: string | null;
  }[];
}

export function useOrderAnalytics(range: { from?: string; to?: string }) {
  return useQuery<OrderAnalytics>({
    queryKey: ["orders", "analytics", range.from, range.to],
    queryFn: () =>
      api.get<OrderAnalytics>(
        `/admin/orders/analytics?${new URLSearchParams(
          Object.entries(range).filter(([, v]) => Boolean(v)) as [string, string][]
        ).toString()}`
      ),
  });
}

export interface OrderAnalytics {
  range: { from: string; to: string; previousFrom: string; previousTo: string };
  totals: {
    orders: number;
    revenue: number;
    delivered: number;
    cancelled: number;
    averageOrderValue: number;
    cancellationRate: number;
  };
  /** Null where there is no previous period to compare against. */
  change: Record<string, number | null>;
  daily: { date: string; orders: number; revenue: number }[];
  statusBreakdown: { status: string; count: number; percentage: number }[];
  paymentBreakdown: { method: string; count: number; revenue: number }[];
  topRestaurants: { restaurantId: string; name: string; orders: number; revenue: number }[];
  cancellationReasons: { reason: string; count: number }[];
}

/** The decisions an admin can take on a vendor application. */
export type ApplicationDecision =
  | "approved"
  | "rejected"
  | "correction_requested"
  | "pending";

/**
 * Decide a vendor application.
 *
 * `isApproved` is still accepted for the screens that send a boolean; anything
 * that needs to reject with a reason or ask for a correction sends `status`.
 * The API refuses a rejection or a correction with no reason, because the
 * vendor is shown it verbatim and has nothing else to act on.
 */
export function useApproveRestaurant() {
  return useInvalidating<
    { id: string; isApproved?: boolean; status?: ApplicationDecision; reason?: string },
    unknown
  >(
    ({ id, isApproved, status, reason }) =>
      api.patch(`/admin/restaurants/${id}/approve`, {
        ...(status ? { status } : { isApproved }),
        reason,
      }),
    ["restaurants", "restaurant"]
  );
}

/**
 * Change a restaurant's own details.
 *
 * The overview had five Edit buttons and none of them did anything. This
 * covers the two panels whose fields actually live on the restaurant record.
 */
export function useUpdateRestaurant(id: string | undefined) {
  return useInvalidating<Record<string, unknown>, unknown>(
    (fields) => api.put(`/admin/restaurants/${id}`, fields),
    ["restaurants", "restaurant"]
  );
}

export function useUpdateRestaurantStatus() {
  return useInvalidating<{ id: string; status: string }, unknown>(
    ({ id, status }) => api.patch(`/admin/restaurants/${id}/status`, { status }),
    ["restaurants"]
  );
}

export function useUpdateRestaurantCommission() {
  return useInvalidating<{ id: string; commissionPercent: number }, unknown>(
    ({ id, commissionPercent }) =>
      api.patch(`/admin/restaurants/${id}/commission`, { commissionPercent }),
    ["restaurants"]
  );
}

/** A charge that can be a percentage of the food or a flat amount. */
export interface ScaledCharge {
  enabled: boolean;
  mode: "percentage" | "fixed";
  percentage: number;
  amount: number;
  gstEnabled: boolean;
  gstPercentage: number;
}

/** What one restaurant is charged. GST sits on top of each line, never inside it. */
export interface VendorCharges {
  configured: boolean;
  commission: ScaledCharge;
  convenience: ScaledCharge;
  packing: {
    enabled: boolean;
    amount: number;
    gstEnabled: boolean;
    gstPercentage: number;
  };
  gst: { enabled: boolean; percentage: number };
}

export function useRestaurantCharges(id: string) {
  return useQuery({
    queryKey: ["restaurants", id, "charges"],
    queryFn: () =>
      api.get<{ charges: VendorCharges }>(`/admin/restaurants/${id}/charges`),
    enabled: Boolean(id),
  });
}

/** Sets a restaurant's own terms. Only the sections sent are changed. */
export function useUpdateRestaurantCharges(id: string) {
  return useInvalidating<Partial<Omit<VendorCharges, "configured">>, unknown>(
    (charges) => api.patch(`/admin/restaurants/${id}/charges`, charges),
    ["restaurants"]
  );
}

/**
 * Changes how far a restaurant will deliver.
 *
 * Goes through the general restaurant update rather than its own endpoint,
 * which already accepts the field. Invalidates the list as well as the
 * record, because the radius decides who sees the restaurant at all.
 */
export function useUpdateRestaurantRadius() {
  return useInvalidating<{ id: string; deliveryRadius: number }, unknown>(
    ({ id, deliveryRadius }) =>
      api.put(`/admin/restaurants/${id}`, { deliveryRadius }),
    ["restaurants"]
  );
}

/* ── Global search ────────────────────────────────────────────────────── */

export interface SearchHit {
  id: string;
  type: string;
  displayName: string;
  subText?: string;
  /** Where the record lives, as the server names it. */
  url: string;
}

/**
 * Searches records - orders, vendors, riders, customers - rather than page
 * names. The palette matches its own list of sections locally; this is for
 * everything that is not a page.
 */
export function useGlobalSearch(query: string) {
  const term = query.trim();
  return useQuery<{ results: SearchHit[]; total: number }>({
    queryKey: ["global-search", term],
    queryFn: () => api.get(`/admin/search?q=${encodeURIComponent(term)}`),
    // Two characters is the point where results stop being everything.
    enabled: term.length >= 2,
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
}

/* ── Where the platform trades ────────────────────────────────────────── */

export interface ServiceArea {
  /** Optional: the platform ran on state and city alone before this. */
  district?: string;
  stateOffice?: StateOffice;
  _id: string;
  state: string;
  city: string;
  isActive: boolean;
  stateActive: boolean;
  radiusKm: number;
  center?: { latitude?: number; longitude?: number };
}

export function useServiceAreas() {
  return useQuery<{
    areas: ServiceArea[];
    states: {
      state: string;
      stateActive: boolean;
      office?: StateOffice;
      districts?: string[];
      cities: ServiceArea[];
    }[];
    summary: { states: number; cities: number; activeCities: number };
  }>({
    queryKey: ["service-areas", "list"],
    queryFn: () => api.get("/admin/service-areas"),
    placeholderData: (previous) => previous,
  });
}

/** Saving a city that already exists in that state changes it. */
export interface StateOffice {
  gst?: string;
  officeAddress?: string;
  contactPerson?: string;
  contactPhone?: string;
  email?: string;
}

/**
 * Everything the coverage map draws: cities the platform trades in, and the
 * restaurants inside them with the range each will ride.
 */
export function useServiceMap() {
  return useQuery<ServiceMap>({
    queryKey: ["service-areas", "map"],
    queryFn: () => api.get<ServiceMap>("/admin/service-areas/map"),
    placeholderData: (previous) => previous,
  });
}

export interface ServiceMap {
  states: {
    state: string;
    stateActive: boolean;
    office: StateOffice;
    districts: string[];
    restaurants: number;
    cities: {
      id: string;
      city: string;
      district: string | null;
      isActive: boolean;
      radiusKm: number;
      center: { latitude?: number; longitude?: number } | null;
    }[];
  }[];
  restaurants: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    district: string | null;
    pincode: string | null;
    address: string | null;
    phone: string | null;
    gst: string | null;
    radiusKm: number | null;
    status: string | null;
    registeredOn: string | null;
    latitude: number | null;
    longitude: number | null;
    plotted: boolean;
  }[];
  summary: {
    states: number;
    cities: number;
    activeCities: number;
    restaurants: number;
    /** Vendors with no coordinates: counted, never guessed onto the map. */
    unplotted: number;
  };
}

/** Who and where the business is in one state. Blank until somebody fills it. */
export function useSetStateOffice() {
  return useInvalidating<{ state: string } & StateOffice, unknown>(
    (body) => api.patch("/admin/service-areas/state-office", body),
    ["service-areas"]
  );
}

export function useSaveServiceArea() {
  return useInvalidating<Partial<ServiceArea>, unknown>(
    (body) => api.post("/admin/service-areas", body),
    ["service-areas"]
  );
}

/** Applies to every city in the state. */
export function useSetStateActive() {
  return useInvalidating<{ state: string; stateActive: boolean }, unknown>(
    (body) => api.patch("/admin/service-areas/state", body),
    ["service-areas"]
  );
}

export function useDeleteServiceArea() {
  return useInvalidating<{ id: string }, unknown>(
    ({ id }) => api.delete(`/admin/service-areas/${id}`),
    ["service-areas"]
  );
}

/* ── GST registrations, one per state ─────────────────────────────────── */

export interface StateGst {
  _id: string;
  stateName: string;
  stateCode: string;
  gstin: string;
  isActive: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  gstType?: string;
  address?: string;
  updatedAt?: string;
}

export function useStateGst() {
  return useQuery<{
    gst: StateGst[];
    summary: { total: number; active: number; inactive: number; lastUpdated: string | null };
  }>({
    queryKey: ["gst", "list"],
    queryFn: () =>
      api.get<{ gst: StateGst[]; summary: any }>("/admin/gst"),
    placeholderData: (previous) => previous,
  });
}

/** Saving a state that already has a registration replaces it. */
export function useSaveStateGst() {
  return useInvalidating<Partial<StateGst>, unknown>(
    (body) => api.post("/admin/gst", body),
    ["gst"]
  );
}

export function useDeleteStateGst() {
  return useInvalidating<{ id: string }, unknown>(
    ({ id }) => api.delete(`/admin/gst/${id}`),
    ["gst"]
  );
}

export interface MenuItemDraft {
  restaurantId: string;
  name: string;
  category?: string;
  cuisine?: string;
  description?: string;
  isVeg?: boolean;
  price?: number;
  originalPrice?: number;
  isActive?: boolean;
  isAvailable?: boolean;
}

/**
 * Adds a category to the catalogue.
 *
 * The "Add category" buttons — on the categories page, in its empty state and
 * beside a restaurant's menu — all had no handler, so a category could only
 * ever appear by a vendor typing one on an item. The endpoint behind this has
 * been there all along.
 */
/** Removes a campaign. The menu entry offering this had no handler. */
export function useDeleteCampaign() {
  return useInvalidating<{ id: string }, unknown>(
    ({ id }) => api.delete(`/admin/campaigns/${id}`),
    ["campaigns"]
  );
}

export function useCreateCategory() {
  return useInvalidating<{ name: string; restaurantId?: string }, unknown>(
    (body) => api.post("/admin/restaurants/categories", body),
    ["categories"]
  );
}

export function useCreateMenuItem() {
  return useInvalidating<MenuItemDraft, unknown>(
    (draft) => api.post("/admin/menu-items", draft),
    ["menu"]
  );
}

/** Save changes to a menu item. The row's edit button had nothing behind it. */
export function useUpdateMenuItem() {
  return useInvalidating<MenuItemDraft & { id: string }, unknown>(
    ({ id, ...draft }) => api.put(`/admin/menu-items/${id}`, draft),
    ["menu"]
  );
}

/**
 * Take an item off the menu, or put it back.
 *
 * Separate from the full update so "Mark out of stock" is one click and
 * cannot overwrite the rest of the item with whatever the row happened to
 * know about it.
 */
export function useSetMenuItemStatus() {
  return useInvalidating<
    { id: string; isAvailable?: boolean; isActive?: boolean },
    unknown
  >(({ id, ...body }) => api.patch(`/admin/menu-items/${id}/status`, body), ["menu"]);
}

/** Remove a menu item outright. */
export function useDeleteMenuItem() {
  return useInvalidating<{ id: string }, unknown>(
    ({ id }) => api.delete(`/admin/menu-items/${id}`),
    ["menu"]
  );
}

/**
 * The Campaign model's own shape. `campaignType` is the delivery channel, and
 * the API validates it against this exact set — a campaign's *purpose*
 * (awareness, retention) has nowhere to live, so it goes in the description
 * rather than being invented as a type the API would reject.
 */
export type CampaignChannel =
  | "PUSH_NOTIFICATION"
  | "BANNER"
  | "EMAIL"
  | "MULTI_CHANNEL";

export interface CampaignDraft {
  name: string;
  campaignType: CampaignChannel;
  description?: string;
  /** Title and message are required by the API for push and email. */
  content?: {
    title?: string;
    message?: string;
    imageUrl?: string;
    actionUrl?: string;
    actionText?: string;
  };
  targeting?: {
    userRoles?: string[];
    cities?: string[];
  };
  schedule?: {
    type?: "IMMEDIATE" | "SCHEDULED";
    scheduledAt?: string;
    timezone?: string;
  };
  budget?: { total?: number };
  status?: "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
}

export function useCreateCampaign() {
  return useInvalidating<CampaignDraft, unknown>(
    (draft) => api.post("/admin/campaigns", draft),
    ["campaigns"]
  );
}

export interface NotificationDraft {
  title: string;
  message: string;
  type?: string;
  audience?: string;
  status?: string;
  sentAt?: string;
}

export function useCreateNotification() {
  return useInvalidating<NotificationDraft, unknown>(
    (draft) => api.post("/admin/notifications", draft),
    ["notifications"]
  );
}

export function useSetRiderBlocked() {
  return useInvalidating<{ id: string; isBlocked: boolean }, unknown>(
    ({ id, isBlocked }) => api.patch(`/admin/riders/${id}/block`, { isBlocked }),
    ["riders"]
  );
}

export function useUpdateRiderKyc() {
  return useInvalidating<{ id: string; kycStatus: string }, unknown>(
    ({ id, kycStatus }) => api.patch(`/admin/riders/${id}/kyc-status`, { kycStatus }),
    ["riders"]
  );
}

export function useSaveSettings() {
  return useInvalidating<Record<string, unknown>, unknown>(
    (payload) => api.put("/admin/settings", payload),
    ["settings"]
  );
}

export interface CouponDraft {
  code: string;
  title: string;
  description?: string;
  discountType?: string;
  discountValue?: number;
  maxDiscount?: number;
  minOrderValue?: number;
  usageLimit?: number;
  validFrom?: string;
  validTill?: string;
  applicableFor?: string;
  isActive?: boolean;
}

export function useCreateCoupon() {
  return useInvalidating<CouponDraft, unknown>(
    (draft) => api.post("/admin/coupons", draft),
    ["coupons"]
  );
}

/** Changes an existing coupon. The pencil beside each row had no handler. */
export function useUpdateCoupon() {
  return useInvalidating<{ id: string } & Record<string, unknown>, unknown>(
    ({ id, ...body }) => api.put(`/admin/coupons/${id}`, body),
    ["coupons"]
  );
}

export function useDeleteCoupon() {
  return useInvalidating<{ id: string }, unknown>(
    ({ id }) => api.delete(`/admin/coupons/${id}`),
    ["coupons"]
  );
}

/**
 * Bulk menu import from a spreadsheet.
 *
 * `dryRun` validates without writing, so the operator can be told what will
 * happen before it happens. The API rejects a file whole if any row is bad,
 * so a failure here means nothing changed.
 */
export function useImportMenu(restaurantId: string | undefined) {
  return useInvalidating<{ file: File; dryRun?: boolean }, ImportMenuResult>(
    ({ file, dryRun }) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload<ImportMenuResult>(
        `/admin/restaurants/${restaurantId}/menu/import${dryRun ? "?dryRun=1" : ""}`,
        form
      );
    },
    ["menu-items", "restaurants"]
  );
}

export interface ImportMenuResult {
  created?: number;
  updated?: number;
  total?: number;
  accepted?: number;
  dryRun?: boolean;
  rejected?: Array<{ row: number; name: string; problems: string[] }>;
}

/** Where to download the spreadsheet the import expects. */
export const MENU_IMPORT_TEMPLATE = "/admin/restaurants/menu/import-template";

/**
 * Vendor documents.
 *
 * Every type the screen lists is stored and verifiable under its own name, so
 * there is no longer a mapping table here and no type the buttons cannot act
 * on. The API keeps the older `kycDocuments` / `documentVerificationStatus`
 * fields in step for the screens that still read them.
 */
export function useUploadRestaurantDocument(restaurantId: string | undefined) {
  return useInvalidating<
    { type: string; file: File; number?: string; expiryDate?: string },
    unknown
  >(
    ({ type, file, number, expiryDate }) => {
      const form = new FormData();
      // The endpoint reads this field name specifically.
      form.append("document", file);
      if (number) form.append("number", number);
      if (expiryDate) form.append("expiryDate", expiryDate);
      return api.upload(
        `/admin/restaurants/${restaurantId}/documents/${type}`,
        form
      );
    },
    ["restaurants", "restaurant"]
  );
}

/**
 * Correct the details recorded against one document.
 *
 * Separate from approving or rejecting it: this fixes what was written down -
 * the number, the dates, who checked it - rather than deciding the document.
 * Only the fields passed are changed, so editing one does not blank the rest.
 */
/**
 * A delivery partner's documents, with everything recorded against each one.
 *
 * Partners used to carry only file URLs, so the console could open a document
 * and say nothing else about it.
 */
export function useRiderDocuments(riderId: string | undefined) {
  return useQuery<{ kycStatus: string; documents: RiderDocument[] }>({
    queryKey: ["riders", riderId, "documents"],
    queryFn: () => api.get(`/admin/riders/${riderId}/documents`),
    enabled: Boolean(riderId),
  });
}

export interface RiderDocument {
  key: string;
  label: string;
  required: boolean;
  expires: boolean;
  url: string | null;
  number: string | null;
  uploadedAt: string | null;
  expiryDate: string | null;
  status: "pending" | "verified" | "rejected" | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  note: string | null;
}

/** Correct what was recorded against one of a partner's documents. */
export function useUpdateRiderDocument(riderId: string | undefined) {
  return useInvalidating<
    {
      type: string;
      number?: string;
      uploadedAt?: string;
      expiryDate?: string;
      status?: "pending" | "verified" | "rejected";
      verifiedBy?: string;
    },
    unknown
  >(({ type, ...body }) =>
    api.patch(`/admin/riders/${riderId}/documents/${type}`, body),
    ["riders"]
  );
}

/** Where one partner stands: earnings, withdrawals and the account paid into. */
export function useRiderPayouts(riderId: string | undefined) {
  return useQuery<RiderPayouts>({
    queryKey: ["riders", riderId, "payouts"],
    queryFn: () => api.get<RiderPayouts>(`/admin/riders/${riderId}/payouts`),
    enabled: Boolean(riderId),
  });
}

export interface RiderPayouts {
  terms: { perKmCharge: number | null; kycStatus: string; isBlocked: boolean };
  bank: {
    accountHolderName: string | null;
    bankName: string | null;
    ifsc: string | null;
    accountNumberLast4: string | null;
    verified: boolean | null;
    verificationStatus: string | null;
  };
  summary: {
    walletBalance: number;
    bonusBalance: number;
    totalEarned: number;
    totalWithdrawn: number;
    awaitingApproval: { count: number; amount: number };
    paid: { count: number; amount: number };
    rejected: { count: number; amount: number };
    deliveries: number;
    deliveryFees: number;
    incentives: number;
    penalties: number;
  };
  payouts: {
    id: string;
    reference: string | null;
    amount: number;
    type: string | null;
    status: string;
    isAutopay: boolean;
    autopayStatus: string | null;
    bankLast4: string | null;
    requestedAt: string;
    processedAt: string | null;
  }[];
  transactions: {
    id: string;
    orderNumber: string | null;
    deliveryFee: number;
    incentive: number;
    penalty: number;
    total: number;
    distance: number | null;
    status: string | null;
    at: string;
  }[];
}

/** Deliveries, earnings and withdrawal requests in one timeline. */
export function useRiderActivity(riderId: string | undefined) {
  return useQuery<{ activity: RiderActivity[] }>({
    queryKey: ["riders", riderId, "activity"],
    queryFn: () => api.get(`/admin/riders/${riderId}/activity`),
    enabled: Boolean(riderId),
  });
}

export interface RiderActivity {
  kind: "order" | "earning" | "withdrawal";
  title: string;
  detail?: string;
  at: string;
}

/**
 * One restaurant's payout position, to read.
 *
 * Paying is done from Finance; this only shows where the vendor stands, so
 * that looking and moving money stay separate actions.
 */
export function useRestaurantPayouts(restaurantId: string | undefined) {
  return useQuery<RestaurantPayouts>({
    queryKey: ["restaurants", restaurantId, "payouts"],
    queryFn: () => api.get<RestaurantPayouts>(`/admin/restaurants/${restaurantId}/payouts`),
    enabled: Boolean(restaurantId),
  });
}

interface PayoutBucket {
  count: number;
  gross: number;
  commission: number;
  net: number;
}

export interface RestaurantPayouts {
  terms: {
    commissionPercent: number;
    frequency: "daily" | "weekly" | "monthly";
    settlementDay: number | null;
    minimumThreshold: number;
    autoSettlement: boolean;
    settlementLock: boolean;
  };
  /** Only the last four digits: enough to recognise, not enough to use. */
  bank: {
    accountHolderName: string | null;
    bankName: string | null;
    ifsc: string | null;
    accountNumberLast4: string | null;
  };
  summary: {
    paid: PayoutBucket;
    awaitingPayment: PayoutBucket;
    failed: PayoutBucket;
    notYetOnAPayout: {
      orders: number;
      gross: number;
      commission: number;
      net: number;
      firstOrderAt: string | null;
      lastOrderAt: string | null;
    };
  };
  payouts: {
    id: string;
    orders: number;
    grossAmount: number;
    commissionAmount: number;
    netAmount: number;
    status: "pending" | "completed" | "failed";
    payoutMethod: string | null;
    transactionId: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
}

export function useUpdateRestaurantDocument(restaurantId: string | undefined) {
  return useInvalidating<
    {
      type: string;
      number?: string;
      uploadedAt?: string;
      expiryDate?: string;
      status?: "pending" | "verified" | "rejected";
      verifiedBy?: string;
    },
    unknown
  >(({ type, ...body }) =>
    api.patch(`/admin/restaurants/${restaurantId}/documents/${type}`, body),
    ["restaurants"]
  );
}

export function useVerifyRestaurantDocument(restaurantId: string | undefined) {
  return useInvalidating<
    {
      type: string;
      status: "pending" | "verified" | "rejected";
      note?: string;
      /* The endpoint has always accepted these; the console never sent them,
       * so a licence number or an expiry date could be read but never
       * corrected. */
      number?: string;
      expiryDate?: string;
    },
    unknown
  >(
    ({ type, status, note, number, expiryDate }) =>
      api.patch(`/admin/restaurants/${restaurantId}/document-verification`, {
        documentType: type,
        status,
        note,
        number,
        expiryDate,
      }),
    ["restaurants", "restaurant"]
  );
}