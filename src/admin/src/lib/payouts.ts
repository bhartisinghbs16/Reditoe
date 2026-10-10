import type { Rider } from "@/lib/types";

/**
 * Partner payout arithmetic, kept out of the screens so the table and the
 * drawer can't disagree about what a partner is owed.
 *
 * The rider record holds lifetime earnings and nothing else — no tips,
 * incentives or payout runs. So gross is real, tips and incentives are `null`
 * (rendered as em-dashes rather than zeros, which would read as "none earned"),
 * and TDS is the statutory 5% computed on gross. Net is gross minus TDS.
 */

/** Statutory tax deducted at source on a delivery partner's earnings. */
export const TDS_PERCENT = 5;

export interface PartnerPayout {
  gross: number;
  /** Null where the API holds no figure — not zero. */
  tips: number | null;
  incentives: number | null;
  tds: number;
  net: number;
  status: "paid" | "pending" | "blocked";
}

export function partnerPayout(rider: Rider): PartnerPayout {
  const gross = rider.totalEarnings ?? 0;
  const tds = Math.round(((gross * TDS_PERCENT) / 100) * 100) / 100;

  return {
    gross,
    tips: null,
    incentives: null,
    tds,
    net: Math.round((gross - tds) * 100) / 100,
    // A blocked partner isn't payable; anyone with nothing owed has nothing
    // pending, so they read as settled rather than stuck in a queue.
    status: rider.isBlocked ? "blocked" : gross > 0 ? "paid" : "pending",
  };
}
