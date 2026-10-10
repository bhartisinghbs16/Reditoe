"use client";

import * as React from "react";
import {
  Award,
  Download,
  HandCoins,
  IndianRupee,
  Receipt,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/common/status-badge";
import { SegmentedTabs } from "@/components/common/filter-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  currency,
  date as formatDate,
  initials,
  number as formatNumber,
  phone as formatPhone,
  shortId,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Rider } from "@/lib/types";
import { type PartnerPayout, TDS_PERCENT } from "@/lib/payouts";

/**
 * Payout Details — the reference's right-hand drawer over the payouts table:
 * the partner's earnings broken into gross, tips and incentives, the TDS
 * deduction, and where the money is going.
 */

const TABS = [
  { label: "Earnings Breakdown", value: "earnings" },
  { label: "Finance Details", value: "finance" },
  { label: "Transactions", value: "transactions" },
];

function Line({
  icon: Icon,
  label,
  hint,
  value,
  tone,
}: {
  icon?: typeof Wallet;
  label: string;
  hint?: string;
  value: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-[0.8125rem] not-last:border-b not-last:border-border/70">
      <span className="flex min-w-0 items-start gap-2">
        {Icon && (
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="size-3.5 text-muted-foreground" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block">{label}</span>
          {hint && (
            <span className="block text-[0.6875rem] text-muted-foreground">{hint}</span>
          )}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 font-medium tabular-nums",
          tone === "danger" && "text-danger-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function PayoutDrawer({
  payout,
  onClose,
}: {
  payout: (PartnerPayout & { rider: Rider }) | null;
  onClose: () => void;
}) {
  if (!payout) return null;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      {/* Keyed on the partner so opening a different row remounts the body,
          which resets the tab without an effect reaching for setState. */}
      <PayoutBody key={payout.rider._id} payout={payout} />
    </Sheet>
  );
}

function PayoutBody({ payout }: { payout: PartnerPayout & { rider: Rider } }) {
  const [tab, setTab] = React.useState("earnings");
  const { rider } = payout;

  return (
    <>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Payout Details</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <Avatar className="size-11">
                <AvatarImage src={rider.image} alt="" />
                <AvatarFallback>{initials(rider.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[0.9375rem] font-semibold">
                    {rider.name ?? "Partner"}
                  </span>
                  <StatusBadge
                    status={rider.isBlocked ? "blocked" : (rider.status ?? "active")}
                  />
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                  {rider.riderId ?? shortId(rider._id, "RDTP")} ·{" "}
                  {formatPhone(rider.phone)}
                </p>
                <p className="text-[0.6875rem] text-muted-foreground">
                  Joined {formatDate(rider.createdAt)}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[0.6875rem] text-muted-foreground">Payout status</p>
              <StatusBadge status={payout.status} />
            </div>
          </div>

          <SegmentedTabs value={tab} onChange={setTab} options={TABS} />

          {tab === "earnings" && (
            <>
              <div>
                <p className="text-[0.8125rem] font-semibold">Earnings Summary</p>
                <div className="mt-1.5">
                  <Line
                    icon={IndianRupee}
                    label="Gross Earnings"
                    hint="Delivery charges"
                    value={currency(payout.gross, true)}
                  />
                  <Line
                    icon={HandCoins}
                    label="Tips"
                    hint="Received from customers"
                    value={payout.tips === null ? "—" : currency(payout.tips, true)}
                  />
                  <Line
                    icon={Award}
                    label="Incentives"
                    hint="Performance & bonuses"
                    value={
                      payout.incentives === null
                        ? "—"
                        : currency(payout.incentives, true)
                    }
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between border-t border-border pt-2 text-[0.8125rem] font-semibold">
                  <span>Total Earnings (A)</span>
                  <span className="tabular-nums">{currency(payout.gross, true)}</span>
                </div>
              </div>

              <div>
                <p className="text-[0.8125rem] font-semibold">Deductions</p>
                <div className="mt-1.5">
                  <Line
                    icon={Receipt}
                    label={`TDS (${TDS_PERCENT}%)`}
                    hint="Tax deducted at source, computed on gross earnings"
                    value={`−${currency(payout.tds, true)}`}
                    tone="danger"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-success-muted px-3 py-2.5">
                <span className="text-[0.8125rem] font-semibold text-success-foreground">
                  Net Earnings (A − TDS)
                </span>
                <span
                  data-numeric
                  className="text-base font-semibold text-success-foreground"
                >
                  {currency(payout.net, true)}
                </span>
              </div>
            </>
          )}

          {tab === "finance" && (
            <div>
              <p className="text-[0.8125rem] font-semibold">Payout Information</p>
              <div className="mt-1.5">
                <Line label="Payout Method" value="—" />
                <Line label="UTR / Transaction ID" value="—" />
                <Line label="Bank Name" value="—" />
                <Line label="Account Number" value="—" />
                <Line label="IFSC Code" value="—" />
                <Line label="Account Holder Name" value={rider.name ?? "—"} />
              </div>
              <p className="mt-3 text-[0.75rem] text-muted-foreground">
                Bank details are captured on the partner record but aren&apos;t returned
                by the riders endpoint, so they read as em-dashes here.
              </p>
            </div>
          )}

          {tab === "transactions" && (
            <div>
              <p className="text-[0.8125rem] font-semibold">Transactions</p>
              <div className="mt-1.5">
                <Line
                  label="Deliveries completed"
                  value={formatNumber(rider.completedDeliveries ?? rider.totalDeliveries)}
                />
                <Line
                  label="Deliveries cancelled"
                  value={formatNumber(rider.cancelledDeliveries ?? 0)}
                />
                <Line
                  label="Lifetime earnings"
                  value={currency(rider.totalEarnings ?? 0)}
                />
                <Line
                  label="Per-kilometre charge"
                  value={
                    rider.perKmCharge !== undefined
                      ? currency(rider.perKmCharge)
                      : "—"
                  }
                />
              </div>
              <p className="mt-3 text-[0.75rem] text-muted-foreground">
                A per-payout transaction ledger needs an endpoint that returns payout
                runs; this summarises what the rider record holds.
              </p>
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-end">
          <Button
            variant="outline"
            onClick={() => toast.info("Statement export isn't wired to the API yet.")}
          >
            <Download className="size-4" />
            Download Statement
          </Button>
          <Button
            disabled={payout.status === "paid"}
            onClick={() =>
              toast.info("Manual payout needs a payout endpoint on the API.")
            }
          >
            <Wallet className="size-4" />
            Process Manual Payout
          </Button>
        </SheetFooter>
      </SheetContent>
    </>
  );
}
