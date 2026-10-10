/**
 * Backend payloads → the shapes the screens render.
 *
 * These are pure functions kept apart from the store so the mapping can be read
 * (and corrected) without wading through provider plumbing. Every one is
 * defensive: the API returns empty collections for a fresh account, and a
 * missing field must produce an empty screen rather than a crash.
 */

import { colors, type TintName } from "@/lib/theme";

/* ── Earnings ───────────────────────────────────────────────────────────── */

export interface EarningsTotals {
  total: number;
  orders: number;
  incentives: number;
  other: number;
  lastMonth: number;
}

export function toEarningsTotals(summary: any): EarningsTotals {
  const fees = Number(summary?.totalDeliveryFees) || 0;
  const incentives = Number(summary?.totalIncentives) || 0;
  const total = Number(summary?.totalEarnings) || 0;
  return {
    total,
    orders: fees,
    incentives,
    // Whatever the total holds beyond fees and incentives, less any penalty.
    other: Math.max(0, total - fees - incentives),
    lastMonth: 0,
  };
}

export function toEarningsBreakup(summary: any) {
  const fees = Number(summary?.totalDeliveryFees) || 0;
  const incentives = Number(summary?.totalIncentives) || 0;
  const total = Number(summary?.totalEarnings) || 0;
  const other = Math.max(0, total - fees - incentives);
  const penalties = Number(summary?.totalPenalties) || 0;

  const slices = [
    { label: "Order Earnings", amount: fees, color: colors.green[600] },
    { label: "Incentives", amount: incentives, color: colors.info.default },
    { label: "Other Earnings", amount: other, color: colors.violet.default },
    { label: "Penalties", amount: penalties, color: colors.warn.default },
  ].filter((slice) => slice.amount > 0);

  const sum = slices.reduce((n, s) => n + s.amount, 0) || 1;
  return slices.map((slice) => ({ ...slice, share: (slice.amount / sum) * 100 }));
}

/** `/rider/analytics` returns one point per weekday; the chart labels alternate. */
export function toEarningsSeries(daily: any[]): { label: string; value: number }[] {
  if (!Array.isArray(daily) || daily.length === 0) return [];
  return daily.map((point, index) => ({
    // Label every other point so the ticks do not collide at phone width.
    label: index % 2 === 0 ? String(point?.label ?? "") : "",
    value: Number(point?.value) || 0,
  }));
}

const dateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}, ${d
    .toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    .toUpperCase()}`;
};

export const formatDateTime = dateTime;

/** Earnings rows and payouts share the statement list on the Earnings screen. */
export function toTransactions(earnings: any[], withdrawals: any[]) {
  const credits = (earnings ?? []).map((row) => ({
    id: String(row?.id ?? row?.orderId ?? ""),
    title: `Order #${row?.orderNumber ?? "—"}`,
    kind: "Order Earnings",
    at: dateTime(row?.orderDate),
    amount: Number(row?.totalEarning) || 0,
    status: "Credited",
    icon: "bag-handle" as const,
    tint: "green" as TintName,
    sortAt: new Date(row?.orderDate ?? 0).getTime(),
  }));

  const debits = (withdrawals ?? []).map((row) => ({
    id: String(row?.id ?? ""),
    title: "Payout to Bank",
    kind: "Payout",
    at: dateTime(row?.createdAt),
    amount: -(Number(row?.amount) || 0),
    status: row?.status === "processed" ? "Debited" : "Processing",
    icon: "card" as const,
    tint: "blue" as TintName,
    sortAt: new Date(row?.createdAt ?? 0).getTime(),
  }));

  return [...credits, ...debits].sort((a, b) => b.sortAt - a.sortAt).slice(0, 8);
}

/* ── Payouts ────────────────────────────────────────────────────────────── */

/** The app's four-stop tracker reads these; the API's enum is wider. */
const PAYOUT_STATUS: Record<string, "Processing" | "Success" | "Failed"> = {
  pending: "Processing",
  processing: "Processing",
  approved: "Processing",
  processed: "Success",
  rejected: "Failed",
  cancelled: "Failed",
};

export interface Payout {
  id: string;
  amount: number;
  at: string;
  status: "Processing" | "Success" | "Failed";
  reference: string;
  method: string;
  batch: string;
  remarks: string;
  expected: string;
  expectedDay: string;
  initiatedAt: string;
  processingAt: string;
  breakdown: { label: string; amount: number; icon: string; tint: string }[];
  charges: number;
}

export function toPayouts(withdrawals: any[]): Payout[] {
  return (withdrawals ?? []).map((row) => {
    const amount = Number(row?.amount) || 0;
    const charges = 100;
    const gross = amount + charges;
    const created = row?.createdAt ? new Date(row.createdAt) : null;

    return {
      id: String(row?.withdrawalId ?? row?.id ?? "—"),
      amount,
      at: dateTime(row?.createdAt),
      status: PAYOUT_STATUS[String(row?.status)] ?? "Processing",
      reference: String(row?.transactionReference ?? "—"),
      method: "NEFT",
      batch: created
        ? `BATCH${String(created.getDate()).padStart(2, "0")}${String(created.getMonth() + 1).padStart(2, "0")}${created.getFullYear()}`
        : "—",
      remarks: "Weekly Payout",
      expected: created
        ? created.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "—",
      expectedDay: created ? created.toLocaleDateString("en-IN", { weekday: "long" }) : "",
      initiatedAt: dateTime(row?.createdAt),
      processingAt: dateTime(row?.processedAt ?? row?.createdAt),
      // The API sends a single figure, so the breakdown is stated as the one
      // line it can support rather than invented across categories.
      breakdown: [{ label: "Order Earnings", amount: gross, icon: "bag-handle", tint: "green" }],
      charges,
    };
  });
}

export function toPayoutTotals(withdrawals: any[], wallet: any) {
  const sum = (predicate: (row: any) => boolean) =>
    (withdrawals ?? []).filter(predicate).reduce((n, row) => n + (Number(row?.amount) || 0), 0);

  return {
    total: sum(() => true) || Number(wallet?.totalWithdrawals) || 0,
    success: sum((r) => r?.status === "processed"),
    processing: sum((r) => ["pending", "processing", "approved"].includes(String(r?.status))),
    failed: sum((r) => ["rejected", "cancelled"].includes(String(r?.status))),
  };
}

/* ── Documents ──────────────────────────────────────────────────────────── */

export interface RiderDocument {
  id: string;
  title: string;
  purpose: string;
  status: "Verified" | "Pending" | "Expired";
  expiry: string;
  number: string;
  verifiedOn: string;
  icon: string;
  tint: string;
}

/** The API keys documents by name; the screen renders an ordered list. */
const DOCUMENT_META: Record<string, { title: string; purpose: string; icon: string; tint: TintName }> = {
  aadhaar: { title: "Aadhaar Card", purpose: "Government ID Proof", icon: "id-card", tint: "violet" },
  aadhaarFront: { title: "Aadhaar (Front)", purpose: "Government ID Proof", icon: "id-card", tint: "violet" },
  aadhaarBack: { title: "Aadhaar (Back)", purpose: "Government ID Proof", icon: "id-card", tint: "violet" },
  pan: { title: "PAN Card", purpose: "Permanent Account Number", icon: "person", tint: "blue" },
  drivingLicense: { title: "Driving License", purpose: "Driving License (Two Wheeler)", icon: "car-sport", tint: "amber" },
  vehicleRC: { title: "Vehicle Registration (RC)", purpose: "Registration Certificate", icon: "bicycle", tint: "red" },
  insurance: { title: "Vehicle Insurance", purpose: "Insurance Certificate", icon: "shield-checkmark", tint: "orange" },
  gst: { title: "GST Certificate", purpose: "Tax Registration", icon: "document-text", tint: "teal" },
  fssaiLicense: { title: "FSSAI Licence", purpose: "Food Safety Licence", icon: "document-text", tint: "teal" },
};

export function toDocuments(documents: any, kycStatus: string): RiderDocument[] {
  if (!documents || typeof documents !== "object") return [];

  return Object.entries(documents)
    .filter(([, value]) => value && typeof value === "object")
    .map(([key, value]: [string, any]) => {
      const meta = DOCUMENT_META[key] ?? {
        title: key,
        purpose: "Document",
        icon: "document-text",
        tint: "slate" as TintName,
      };
      const uploaded = Boolean(value?.url);

      return {
        id: key,
        title: meta.title,
        purpose: meta.purpose,
        status: kycStatus === "approved" && uploaded ? "Verified" : "Pending",
        expiry: "–",
        // The seeded records carry the number in `url`; a real upload puts a
        // file path there, which is not something to print as an id.
        number: typeof value?.url === "string" && value.url.length < 40 ? value.url : "Uploaded",
        verifiedOn: dateTime(value?.uploadedAt),
        icon: meta.icon,
        tint: meta.tint,
      } as RiderDocument;
    });
}

/* ── Scan ───────────────────────────────────────────────────────────────── */

/** The scan log is the day's completed handovers, newest first. */
export function toRecentScans(orders: { id: string; restaurant: { name: string }; customer: { name: string }; deliveredAt?: string }[]) {
  return orders.slice(0, 3).map((order, index) => ({
    id: order.id + index,
    title: "Order Delivered",
    who: order.customer.name,
    at: dateTime(order.deliveredAt),
    kind: "Delivery",
    tone: "ok" as const,
    order: `#${order.id}`,
    /* The id on its own, so a row can open the order it is about. `id` above
       carries an index suffix to keep React keys unique. */
    orderId: order.id,
    icon: "bag-handle" as const,
    tint: "green" as TintName,
  }));
}
