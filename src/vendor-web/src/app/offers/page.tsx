"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgePercent,
  CalendarDays,
  Download,
  Pause,
  Play,
  Plus,
  Ticket,
  TicketPercent,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { PageActions } from "@/components/common/page-actions";
import { StatTile } from "@/components/common/stat-card";
import { SearchField, Toolbar, UnderlineTabs } from "@/components/common/filter-bar";
import { SortMenu } from "@/components/common/list-controls";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PromoBanner } from "@/components/common/promo-banner";
import { OfferDialog } from "@/components/offers/offer-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { currency, date as formatDate, number as formatNumber } from "@/lib/format";
import { downloadCsv, stampedName, toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import {
  deleteCoupon,
  fetchCoupons,
  toggleCoupon,
  type Coupon,
} from "@/lib/vendor-api";

/** Coupon tiles are coloured by discount type, not at random. */
const TYPE_TONES = {
  percentage: {
    rail: "bg-violet-500",
    tile: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
  flat: {
    rail: "bg-emerald-500",
    tile: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  bogo: {
    rail: "bg-orange-500",
    tile: "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  },
} as const;

const SORTS = [
  { value: "recent" as const, label: "Newest first" },
  { value: "used" as const, label: "Most used" },
  { value: "expiry" as const, label: "Expiring soonest" },
];
type SortKey = (typeof SORTS)[number]["value"];

function MetaCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
        <p className="truncate text-[0.8125rem] font-medium">{value}</p>
      </div>
    </div>
  );
}

function OfferCard({
  coupon,
  onToggle,
  onDelete,
  busy,
}: {
  coupon: Coupon;
  onToggle: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const tone = TYPE_TONES[coupon.type];

  return (
    <article className="surface relative min-w-0 overflow-hidden">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", tone.rail)} />

      <div className="grid gap-4 py-4 pr-4 pl-5 lg:grid-cols-[1.8fr_0.9fr] lg:gap-0">
        <div className="flex min-w-0 gap-4 lg:pr-5">
          <span
            className={cn(
              "flex size-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none",
              tone.tile
            )}
          >
            <span className="text-lg font-extrabold tracking-tight">
              {coupon.couponTop}
            </span>
            <span className="mt-1 text-[0.625rem] font-bold tracking-wide">
              {coupon.couponBottom}
            </span>
          </span>

          <div className="min-w-0 flex-1">
            <StatusBadge status={coupon.status} dot={false} />
            <p className="mt-1.5 text-[0.9375rem] font-bold tracking-tight">
              {coupon.code}
            </p>
            <p className="text-[0.8125rem] text-muted-foreground text-pretty">
              {coupon.description || coupon.name}
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <MetaCell
                icon={CalendarDays}
                label={coupon.status === "Expired" ? "Expired on" : "Valid till"}
                value={coupon.endDate ? formatDate(coupon.endDate) : "—"}
              />
              <MetaCell
                icon={User}
                label="Min. Order"
                value={coupon.minOrderValue > 0 ? currency(coupon.minOrderValue) : "None"}
              />
              <MetaCell
                icon={Ticket}
                label="Usage Limit"
                value={coupon.usageLimit ? formatNumber(coupon.usageLimit) : "Unlimited"}
              />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 lg:border-l lg:border-border lg:pl-5">
          <div>
            <p className="text-[0.75rem] text-muted-foreground">Redeemed</p>
            <p data-numeric className="text-[0.9375rem] font-bold">
              {formatNumber(coupon.usedCount)} time
              {coupon.usedCount === 1 ? "" : "s"}
            </p>
          </div>
          {coupon.maxDiscount !== undefined && (
            <div>
              <p className="text-[0.75rem] text-muted-foreground">Max Discount</p>
              <p data-numeric className="text-[0.9375rem] font-bold">
                {currency(coupon.maxDiscount)}
              </p>
            </div>
          )}

          <div className="mt-auto flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy || coupon.status === "Expired"}
              onClick={onToggle}
            >
              {coupon.isActive ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
              {coupon.isActive ? "Pause" : "Resume"}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${coupon.code}`}
              className="text-red-600 hover:bg-red-50 hover:text-red-600"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function OffersPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState("Active");
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [formOpen, setFormOpen] = React.useState(false);

  const coupons = useQuery({ queryKey: ["coupons"], queryFn: fetchCoupons });
  const all = React.useMemo(() => coupons.data ?? [], [coupons.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["coupons"] });

  const toggle = useMutation({
    mutationFn: (id: string) => toggleCoupon(id),
    onSuccess: () => {
      toast.success("Offer updated");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Could not update"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCoupon(id),
    onSuccess: () => {
      toast.success("Offer deleted");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete"),
  });

  const counts = React.useMemo(
    () => ({
      Active: all.filter((c) => c.status === "Active").length,
      Scheduled: all.filter((c) => c.status === "Scheduled").length,
      Paused: all.filter((c) => c.status === "Paused").length,
      Expired: all.filter((c) => c.status === "Expired").length,
    }),
    [all]
  );

  const visible = React.useMemo(() => {
    const rows = all.filter((coupon) => {
      if (coupon.status !== tab) return false;
      if (!search) return true;
      const needle = search.toLowerCase();
      return (
        coupon.code.toLowerCase().includes(needle) ||
        coupon.name.toLowerCase().includes(needle) ||
        coupon.description.toLowerCase().includes(needle)
      );
    });
    const sorted = [...rows];
    if (sort === "used") sorted.sort((a, b) => b.usedCount - a.usedCount);
    if (sort === "expiry") {
      sorted.sort(
        (a, b) =>
          new Date(a.endDate ?? 0).getTime() - new Date(b.endDate ?? 0).getTime()
      );
    }
    return sorted;
  }, [all, tab, search, sort]);

  const totalRedemptions = all.reduce((sum, c) => sum + c.usedCount, 0);
  const busyId = toggle.isPending
    ? toggle.variables
    : remove.isPending
      ? remove.variables
      : null;

  const exportCsv = () => {
    downloadCsv(
      stampedName("offers"),
      toCsv(
        [
          { header: "Code", value: (c: Coupon) => c.code },
          { header: "Name", value: (c: Coupon) => c.name },
          { header: "Type", value: (c: Coupon) => c.type },
          { header: "Discount", value: (c: Coupon) => c.discountValue },
          { header: "Min order", value: (c: Coupon) => c.minOrderValue },
          { header: "Redeemed", value: (c: Coupon) => c.usedCount },
          { header: "Usage limit", value: (c: Coupon) => c.usageLimit ?? "Unlimited" },
          { header: "Valid till", value: (c: Coupon) => (c.endDate ? formatDate(c.endDate) : "") },
          { header: "Status", value: (c: Coupon) => c.status },
        ],
        all
      )
    );
    toast.success(`Exported ${all.length} offer${all.length === 1 ? "" : "s"}`);
  };

  return (
    <>
      <PageActions>
        <Button variant="outline" onClick={exportCsv} disabled={all.length === 0}>
          <Download className="size-4" />
          Export
        </Button>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Create Offer
        </Button>
      </PageActions>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={TicketPercent}
          tone="violet"
          value={formatNumber(all.length)}
          label="Total Offers"
          caption="Across every status"
          labelFirst
        />
        <StatTile
          icon={Ticket}
          tone="green"
          value={formatNumber(counts.Active)}
          label="Running Now"
          caption="Live on your listing"
          labelFirst
        />
        <StatTile
          icon={BadgePercent}
          tone="amber"
          value={formatNumber(totalRedemptions)}
          label="Total Redemptions"
          caption="Coupons used by customers"
          labelFirst
        />
        <StatTile
          icon={Wallet}
          tone="blue"
          value={formatNumber(counts.Expired)}
          label="Expired"
          caption="Past their end date"
          labelFirst
        />
      </div>

      <div className="surface mt-4">
        <UnderlineTabs
          className="px-4"
          value={tab}
          onChange={setTab}
          options={[
            { label: "Active", value: "Active", count: counts.Active },
            { label: "Scheduled", value: "Scheduled", count: counts.Scheduled },
            { label: "Paused", value: "Paused", count: counts.Paused },
            { label: "Expired", value: "Expired", count: counts.Expired },
          ]}
        />

        <div className="p-4">
          <Toolbar>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search offers by name or code"
            />
            <SortMenu value={sort} onChange={setSort} options={SORTS} />
          </Toolbar>
        </div>

        <div className="space-y-4 px-4 pb-4">
          {coupons.isPending ? (
            Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full rounded-xl" />
            ))
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title={`No ${tab.toLowerCase()} offers`}
              description="Create one and it will show up here the moment it goes live."
              action={
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="size-4" />
                  Create Offer
                </Button>
              }
            />
          ) : (
            visible.map((coupon) => (
              <OfferCard
                key={coupon.id}
                coupon={coupon}
                busy={busyId === coupon.id}
                onToggle={() => toggle.mutate(coupon.id)}
                onDelete={() => {
                  if (window.confirm(`Delete the offer "${coupon.code}"?`)) {
                    remove.mutate(coupon.id);
                  }
                }}
              />
            ))
          )}
        </div>
      </div>

      <OfferDialog open={formOpen} onOpenChange={setFormOpen} />

      <PromoBanner
        className="mt-4"
        icon={TicketPercent}
        tone="violet"
        title="Boost your sales with offers!"
        description="Well planned offers can help you get more customers and increase your sales."
        actions={
          <Button variant="outline" onClick={() => setFormOpen(true)}>
            Create an Offer
          </Button>
        }
      />
    </>
  );
}
