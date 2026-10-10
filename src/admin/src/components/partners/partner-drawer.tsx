"use client";

import * as React from "react";
import Link from "next/link";
import { Ban, FileText, Pencil, Star, Wallet } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/common/status-badge";
import { SegmentedTabs } from "@/components/common/filter-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSetRiderBlocked } from "@/lib/queries";
import { partnerPayout, TDS_PERCENT } from "@/lib/payouts";
import {
  currency,
  date as formatDate,
  initials,
  number as formatNumber,
  percent,
  phone as formatPhone,
  shortId,
  titleCase,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Rider } from "@/lib/types";
import { kycLabel } from "@/lib/domain";

/**
 * Delivery Partner Details — the reference's right-hand drawer over the
 * partners list.
 *
 * Overview is deliberately sparse: the rider record holds a name, contact,
 * vehicle and the delivery counters, but none of the demographics, address,
 * bank details or working preferences the reference lays out. Those render as
 * em-dashes so the screen names what the backend still owes. Performance,
 * Earnings and Payouts are built entirely from fields the API does return.
 */

const TABS = [
  { label: "Overview", value: "overview" },
  { label: "Performance", value: "performance" },
  { label: "Earnings", value: "earnings" },
  { label: "Activity", value: "activity" },
];

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-[0.8125rem] font-medium break-words">
        {value ?? "—"}
      </div>
    </div>
  );
}

function Block({
  title,
  children,
  note,
}: {
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[0.8125rem] font-semibold">{title}</h3>
        <Button variant="ghost" size="sm" disabled>
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{children}</div>
      {note && <p className="mt-2 text-[0.6875rem] text-muted-foreground">{note}</p>}
    </section>
  );
}

function Stat({
  label,
  value,
  meter,
}: {
  label: string;
  value: React.ReactNode;
  meter?: number | null;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <p data-numeric className="mt-0.5 text-base font-semibold tracking-tight">
        {value}
      </p>
      {meter !== null && meter !== undefined && (
        <Progress value={meter} className="mt-1.5 h-1.5" />
      )}
    </div>
  );
}

export function PartnerDrawer({
  rider,
  onClose,
}: {
  rider: Rider | null;
  onClose: () => void;
}) {
  if (!rider) return null;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      {/* Keyed on the partner so a different row remounts the body and resets
          the tab, rather than an effect reaching for setState. */}
      <PartnerBody key={rider._id} rider={rider} onClose={onClose} />
    </Sheet>
  );
}

function PartnerBody({ rider, onClose }: { rider: Rider; onClose: () => void }) {
  const [tab, setTab] = React.useState("overview");
  const setBlocked = useSetRiderBlocked();

  const blocked = rider.isBlocked === true || rider.status === "blocked";
  const rating = rider.currentRating ?? rider.rating;
  const payout = partnerPayout(rider);

  const total = rider.totalDeliveries ?? 0;
  const completed = rider.completedDeliveries ?? total - (rider.cancelledDeliveries ?? 0);
  const completionRate = total > 0 ? (completed / total) * 100 : null;
  const cancellationRate =
    total > 0 ? ((rider.cancelledDeliveries ?? 0) / total) * 100 : null;
  const perDelivery = completed > 0 ? (rider.totalEarnings ?? 0) / completed : null;

  async function toggleBlock() {
    try {
      await setBlocked.mutateAsync({ id: rider._id, isBlocked: !blocked });
      toast.success(blocked ? "Partner unblocked" : "Partner blocked");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }

  return (
    <SheetContent className="w-full sm:max-w-lg">
      <SheetHeader>
        <SheetTitle>Delivery Partner Details</SheetTitle>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar className="size-14">
              <AvatarImage src={rider.image} alt="" />
              <AvatarFallback>{initials(rider.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-[0.9375rem] font-semibold">
                  {rider.name ?? "Partner"}
                </span>
                {rider.kycStatus === "approved" && (
                  <StatusBadge tone="success" dot={false} label="Verified" />
                )}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    blocked
                      ? "bg-danger"
                      : rider.isOnline
                        ? "bg-success"
                        : "bg-muted-foreground"
                  )}
                />
                {blocked ? "Blocked" : rider.isOnline ? "On Duty" : "Offline"}
              </p>
              <p className="text-[0.6875rem] text-muted-foreground">
                Partner ID: {rider.riderId ?? shortId(rider._id, "RDTP")}
              </p>
            </div>
          </div>
          <div className="shrink-0 space-y-1 text-right">
            <StatusBadge status={blocked ? "blocked" : (rider.status ?? "active")} />
            <p className="text-[0.6875rem] text-muted-foreground">
              Joined {formatDate(rider.createdAt)}
            </p>
            {rating !== undefined && (
              <p className="flex items-center justify-end gap-1 text-[0.6875rem]">
                <Star className="size-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{rating.toFixed(1)}</span>
                <span className="text-muted-foreground">
                  ({formatNumber(total)})
                </span>
              </p>
            )}
          </div>
        </div>

        <SegmentedTabs value={tab} onChange={setTab} options={TABS} />

        {tab === "overview" && (
          <div className="space-y-3">
            <Block
              title="Personal Information"
              note="Date of birth, gender, emergency contact and address aren't returned by the riders endpoint."
            >
              <Field label="Full Name" value={rider.name} />
              <Field label="Date of Birth" />
              <Field label="Phone Number" value={formatPhone(rider.phone)} />
              <Field label="Gender" />
              <Field label="Email ID" value={rider.email} />
              <Field label="Emergency Contact" />
            </Block>

            <Block
              title="Vehicle Information"
              note="Make, registration year and colour are captured when a partner is added but not returned here."
            >
              <Field label="Vehicle Type" value={titleCase(rider.vehicleType)} />
              <Field label="Vehicle Number" value={rider.vehicleNumber} />
              <Field label="Vehicle Model" value={rider.vehicleName} />
              <Field label="Registration Year" />
            </Block>

            <Block
              title="Bank & Payout Information"
              note="Bank details are captured on the add-partner form but the riders endpoint doesn't return them."
            >
              <Field label="Account Holder Name" value={rider.name} />
              <Field label="IFSC Code" />
              <Field label="Bank Name" />
              <Field label="Account Type" />
              <Field label="Account Number" />
              <Field label="Payout Method" />
            </Block>

            <Block title="Working Information">
              <Field
                label="Per-kilometre Charge"
                value={
                  rider.perKmCharge !== undefined
                    ? currency(rider.perKmCharge)
                    : undefined
                }
              />
              <Field label="KYC Status" value={<StatusBadge status={rider.kycStatus} label={kycLabel(rider.kycStatus)} />} />
              <Field label="Preferred City / Zone" />
              <Field label="Available Days" />
            </Block>
          </div>
        )}

        {tab === "performance" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Total deliveries" value={formatNumber(total)} meter={null} />
            <Stat label="Completed" value={formatNumber(completed)} meter={null} />
            <Stat
              label="Completion rate"
              value={completionRate === null ? "—" : percent(completionRate, 2)}
              meter={completionRate}
            />
            <Stat
              label="Cancellation rate"
              value={cancellationRate === null ? "—" : percent(cancellationRate, 2)}
              meter={cancellationRate}
            />
            <Stat
              label="Success rate (API)"
              value={
                rider.successRate === undefined ? "—" : percent(rider.successRate, 2)
              }
              meter={rider.successRate ?? null}
            />
            <Stat
              label="Rating"
              value={rating === undefined ? "—" : rating.toFixed(2)}
              meter={rating === undefined ? null : (rating / 5) * 100}
            />
          </div>
        )}

        {tab === "earnings" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat
                label="Gross earnings"
                value={currency(payout.gross)}
                meter={null}
              />
              <Stat
                label={`TDS (${TDS_PERCENT}%)`}
                value={`−${currency(payout.tds, true)}`}
                meter={null}
              />
              <Stat label="Net earnings" value={currency(payout.net)} meter={null} />
              <Stat
                label="Average per delivery"
                value={perDelivery === null ? "—" : currency(perDelivery, true)}
                meter={null}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {/* Both live on the partner's own page now. */}
              <Button asChild variant="outline" size="sm">
                <Link href={`/partners/${rider._id}`}>
                  <Wallet className="size-3.5" />
                  Payout &amp; earnings
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/partners/${rider._id}`}>
                  <FileText className="size-3.5" />
                  Documents
                </Link>
              </Button>
            </div>
            <p className="mt-2 text-[0.6875rem] text-muted-foreground">
              Tips and incentives aren&apos;t recorded, so gross is delivery earnings
              only and TDS is the statutory {TDS_PERCENT}% computed on it.
            </p>
          </>
        )}

        {tab === "activity" && (
          <p className="text-[0.8125rem] text-muted-foreground">
            A per-partner activity feed needs the activity-log endpoint filtered by
            rider, which it doesn&apos;t currently support. The console-wide log is on
            the Activity Logs screen.
          </p>
        )}
      </div>

      <SheetFooter className="flex-row justify-between">
        <Button
          variant="outline"
          disabled={setBlocked.isPending}
          onClick={toggleBlock}
          className={cn(!blocked && "text-danger-foreground")}
        >
          <Ban className="size-4" />
          {blocked ? "Unblock Partner" : "Block Partner"}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button asChild>
            <Link href={`/partners/${rider._id}`}>
              <Pencil className="size-4" />
              Edit Partner
            </Link>
          </Button>
        </div>
      </SheetFooter>
    </SheetContent>
  );
}
