/**
 * Domain vocabulary shared across screens: the status values the backend uses,
 * and the filter option lists built from them.
 */

export const ORDER_STATUSES = [
  "Pending",
  "Waiting for Confirmation",
  "Order Confirmed",
  "Processing",
  "Ready",
  "OnWay",
  "Delivered",
  "Cancelled",
  "RiderRejected",
] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

/** Display names — the raw values are verbose or camel-cased. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  Pending: "Pending",
  "Payment Pending": "Payment pending",
  "Waiting for Confirmation": "Awaiting confirmation",
  "Order Confirmed": "Confirmed",
  "In Progress": "In progress",
  Processing: "Preparing",
  Ready: "Ready",
  OnWay: "On the way",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
  RiderRejected: "Rider rejected",
};

export function orderStatusLabel(status?: string | null) {
  if (!status) return "—";
  return ORDER_STATUS_LABELS[status] ?? status;
}

/** Statuses that count as "in flight" for the live board. */
export const ACTIVE_ORDER_STATUSES = [
  "Waiting for Confirmation",
  "Order Confirmed",
  "Processing",
  "Ready",
  "OnWay",
] as const;

export const ORDER_STATUS_OPTIONS = ORDER_STATUSES.map((value) => ({
  value,
  label: orderStatusLabel(value),
}));

export const PAYMENT_METHOD_OPTIONS = [
  { value: "Online", label: "Online" },
  { value: "UPI", label: "UPI" },
  { value: "Card", label: "Card" },
  { value: "COD", label: "Cash on delivery" },
  { value: "Wallet", label: "Wallet" },
];

export const PAYMENT_STATUS_OPTIONS = [
  { value: "Paid", label: "Paid" },
  { value: "Pending", label: "Pending" },
  { value: "Failed", label: "Failed" },
  { value: "Refunded", label: "Refunded" },
];

/**
 * The values the API stores. It calls a cleared KYC "approved", not
 * "verified" — the label says Verified because that is the operator's word for
 * it, but the value has to be the one the API will accept and return.
 */
export const KYC_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

/** A cleared KYC, as stored. */
export const KYC_APPROVED = "approved";

/**
 * What to call a KYC state on screen. Without this a badge title-cases the raw
 * value and reads "Approved" directly under a tile counting "Verified", which
 * looks like two different things being measured.
 */
export function kycLabel(status: string | null | undefined) {
  if (!status) return "Pending";
  const match = KYC_STATUS_OPTIONS.find(
    (option) => option.value === String(status).toLowerCase()
  );
  if (match) return match.label;
  const text = String(status);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const RESTAURANT_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
];

export const RIDER_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "busy", label: "Busy" },
  { value: "blocked", label: "Blocked" },
];

/**
 * How far through signing up a delivery partner is.
 *
 * "Onboarding pending" is not a stored field: it covers somebody who verified
 * their email and phone and then stopped - who has no account at all - as
 * well as somebody who registered and never submitted.
 */
export const ONBOARDING_STATUS_OPTIONS = [
  { value: "onboarding_pending", label: "Onboarding Pending" },
  { value: "onboarded", label: "Onboarded" },
];

export const VEHICLE_TYPE_OPTIONS = [
  { value: "bike", label: "Bike" },
  { value: "scooter", label: "Scooter" },
  { value: "bicycle", label: "Bicycle" },
  { value: "car", label: "Car" },
];

export const TICKET_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

/**
 * Order total broken into the lines the finance team reconciles against.
 * Kept here so the detail page and the invoice view can't drift apart.
 */
export interface AmountLine {
  label: string;
  value: number;
  /** Subtracted from the total (discounts, wallet credit). */
  negative?: boolean;
  emphasis?: boolean;
}

export function orderAmountLines(order: {
  subtotal?: number;
  packagingFee?: number;
  deliveryFee?: number;
  platformFee?: number;
  tax?: number;
  gstAndPackaging?: number;
  tip?: number;
  discount?: number;
  walletUsed?: number;
  total?: number;
}): AmountLine[] {
  const lines: AmountLine[] = [
    { label: "Item total", value: order.subtotal ?? 0 },
  ];

  if (order.packagingFee) lines.push({ label: "Packaging", value: order.packagingFee });
  if (order.deliveryFee) lines.push({ label: "Delivery fee", value: order.deliveryFee });
  if (order.platformFee) lines.push({ label: "Platform fee", value: order.platformFee });
  /**
   * One tax line, never two.
   *
   * `gstAndPackaging` is the whole tax charge: GST on the food, GST on the
   * delivery and platform fees, and packaging. `tax` is the food part of it on
   * its own. Listing both counted the food's GST twice and left a bill whose
   * lines came to more than the total underneath them - on a 318.09 order the
   * lines added up to 330.54.
   */
  if (order.gstAndPackaging)
    lines.push({ label: "GST & packaging", value: order.gstAndPackaging });
  else if (order.tax) lines.push({ label: "Taxes", value: order.tax });
  if (order.tip) lines.push({ label: "Tip", value: order.tip });
  if (order.discount)
    lines.push({ label: "Discount", value: order.discount, negative: true });
  if (order.walletUsed)
    lines.push({ label: "Wallet credit", value: order.walletUsed, negative: true });

  lines.push({ label: "Total paid", value: order.total ?? 0, emphasis: true });
  return lines;
}

/**
 * Summarises the API's per-document flags — { fssaiVerified, gstVerified,
 * bankVerified } — into one status a badge can show.
 *
 * The object was previously handed to StatusBadge as if it were a status
 * string, which threw "toLowerCase is not a function" and took the whole
 * screen down. Returning null when nothing is tracked keeps "no documents
 * recorded" distinct from "documents rejected".
 */
export function documentStatus(flags?: Record<string, boolean> | null) {
  const values = Object.values(flags ?? {});
  if (values.length === 0) return { status: null, label: '—', done: 0, total: 0 };
  const done = values.filter(Boolean).length;
  return {
    status: done === values.length ? 'verified' : done > 0 ? 'pending' : 'not_uploaded',
    label: `${done} of ${values.length} verified`,
    done,
    total: values.length,
  };
}
