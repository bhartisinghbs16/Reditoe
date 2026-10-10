"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  Bike,
  CalendarDays,
  ChefHat,
  CircleCheck,
  CircleX,
  Megaphone,
  MoveUpRight,
  Receipt,
  RefreshCw,
  Repeat,
  ShoppingBag,
  Star,
  Timer,
  UserPlus,
  Wallet,
  IndianRupee,
} from "lucide-react";
import { PageActions } from "@/components/common/page-actions";
import { DateRangeMenu, PeriodSelect } from "@/components/common/list-controls";
import { StatCard, StatGrid, StatTile } from "@/components/common/stat-card";
import { Panel, PanelLink } from "@/components/common/panel";
import { FixtureNote } from "@/components/common/fixture-note";
import { FoodThumb } from "@/components/common/food-thumb";
import { PromoBanner } from "@/components/common/promo-banner";
import { TrendChart, DonutChart } from "@/components/charts/charts";
import { OrderMiniRow } from "@/components/order-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_PRIMARY, TONES } from "@/lib/accent";
import { currency, number as formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { inRange, rangeLabel, type DateRange, type Period } from "@/lib/date-range";
import {
  announcements,
  ratingDistribution,
  reviewTotals,
  todaysInsights,
} from "@/lib/data";
import { fetchWithdrawalSummary, type OrderStage } from "@/lib/vendor-api";
import { useVendor } from "@/lib/store";

/** The five tiles of the Order Status strip, in the reference's order. */
const STATUS_TILES: Array<{
  stage: OrderStage;
  label: string;
  icon: typeof ShoppingBag;
  tone: "green" | "amber" | "violet" | "blue" | "red";
}> = [
  { stage: "new", label: "New Orders", icon: ShoppingBag, tone: "green" },
  { stage: "preparing", label: "Preparing", icon: ChefHat, tone: "amber" },
  { stage: "out_for_delivery", label: "Out for Delivery", icon: Bike, tone: "violet" },
  { stage: "completed", label: "Completed", icon: CircleCheck, tone: "blue" },
  { stage: "cancelled", label: "Cancelled", icon: CircleX, tone: "red" },
];

const INSIGHT_ICONS = [Timer, CalendarDays, Repeat, CircleX];

export default function DashboardPage() {
  const { orders, stats, profile, storeOpen, stageCounts, loading, refetch } =
    useVendor();

  const [range, setRange] = React.useState<DateRange>("all");
  const [period, setPeriod] = React.useState<Period>("daily");

  const payouts = useQuery({
    queryKey: ["withdrawals", "summary"],
    queryFn: fetchWithdrawalSummary,
  });

  // Everything computed from orders honours the date pill; the platform
  // totals above it come from /vendor/stats and are labelled as such.
  const scoped = React.useMemo(
    () => orders.filter((order) => inRange(order.placedAt, range)),
    [orders, range]
  );
  const recent = scoped.slice(0, 5);

  const scopedStageCounts = React.useMemo(() => {
    const counts = { ...stageCounts };
    for (const key of Object.keys(counts) as OrderStage[]) counts[key] = 0;
    for (const order of scoped) counts[order.stage] += 1;
    return counts;
  }, [scoped, stageCounts]);

  const series =
    period === "weekly"
      ? (stats?.weekly ?? [])
      : period === "monthly"
        ? (stats?.monthly ?? [])
        : (stats?.daily ?? []);

  /**
   * Top sellers, counted off the orders themselves. `/vendor/stats` returns
   * totals but no per-item figures, and a ranking is only worth showing if it
   * came from what actually sold.
   */
  const sellers = React.useMemo(() => {
    const tally = new Map<string, { name: string; image?: string; qty: number; revenue: number }>();
    for (const order of scoped) {
      if (order.stage === "cancelled") continue;
      for (const line of order.lines) {
        const row = tally.get(line.name) ?? {
          name: line.name,
          image: line.image,
          qty: 0,
          revenue: 0,
        };
        row.qty += line.quantity;
        row.revenue += line.price * line.quantity;
        tally.set(line.name, row);
      }
    }
    return [...tally.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [scoped]);

  /** Where the money on those orders actually sat. */
  const salesBreakdown = React.useMemo(() => {
    const billed = scoped.filter((order) => order.stage !== "cancelled");
    const food = billed.reduce((sum, o) => sum + o.subtotal, 0);
    const delivery = billed.reduce((sum, o) => sum + o.deliveryFee, 0);
    const taxes = billed.reduce((sum, o) => sum + o.tax, 0);
    return [
      { label: "Food Sales", value: food, color: "#22a45d" },
      { label: "Delivery Fees", value: delivery, color: "#2563eb" },
      { label: "Taxes & Packaging", value: Math.round(taxes), color: "#f59e0b" },
    ].filter((slice) => slice.value > 0);
  }, [scoped]);

  const ratingTotal = ratingDistribution.reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <PageActions>
        <DateRangeMenu value={range} onChange={setRange} />
        <Button variant="outline" onClick={refetch}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </PageActions>

      {!storeOpen && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <Ban className="size-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Your store is closed — customers cannot place orders. Reopen it from the
            account menu in the top right.
          </p>
        </div>
      )}

      {profile && !profile.approved && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
          <Timer className="size-5 shrink-0 text-blue-600" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Your restaurant is still under review. Orders start arriving once the
            platform team approves it.
          </p>
        </div>
      )}

      <StatGrid columns={4}>
        <StatCard
          label="Total Sales"
          value={currency(stats?.totalSales ?? 0, true)}
          icon={IndianRupee}
          tone="blue"
          hint="Delivered orders"
          loading={loading}
        />
        <StatCard
          label="Completed Orders"
          value={formatNumber(stats?.completedOrderCount ?? 0)}
          icon={CircleCheck}
          tone="green"
          hint="Delivered to customers"
          loading={loading}
        />
        <StatCard
          label="Pending Orders"
          value={formatNumber(stats?.pendingOrdersCount ?? 0)}
          icon={Receipt}
          tone="amber"
          hint="Waiting on the kitchen"
          loading={loading}
        />
        <StatCard
          label="New Orders"
          value={formatNumber(stats?.newLeads ?? 0)}
          icon={UserPlus}
          tone="violet"
          hint="Awaiting acceptance"
          loading={loading}
        />
      </StatGrid>

      {/* Revenue + what's selling */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Panel
          title="Revenue Overview"
          description={`From the platform, by ${period === "daily" ? "day" : period === "weekly" ? "week" : "month"}`}
          action={<PeriodSelect value={period} onChange={setPeriod} />}
        >
          <p className="text-[0.8125rem] text-muted-foreground">Total Sales</p>
          <p data-numeric className="mt-0.5 text-2xl font-bold tracking-tight">
            {currency(stats?.totalSales ?? 0, true)}
          </p>

          {loading ? (
            <Skeleton className="mt-3 h-[230px] w-full" />
          ) : series.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No sales recorded yet this week.
            </p>
          ) : (
            <TrendChart
              className="mt-3"
              data={series}
              categoryKey="label"
              categoryLabel="Day"
              height={230}
              series={[
                {
                  key: "value",
                  label: "Revenue",
                  color: CHART_PRIMARY,
                  format: (value) => currency(value),
                },
              ]}
            />
          )}
        </Panel>

        <Panel
          title="Top Selling Items"
          description={`By units sold · ${rangeLabel(range)}`}
          action={<PanelLink href="/menu">View All</PanelLink>}
        >
          {sellers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing sold yet.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {sellers.map((entry, index) => (
                <li
                  key={entry.name}
                  className="flex items-center gap-3 py-2.5 first:pt-0"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[0.625rem] font-bold text-background tabular-nums">
                    {index + 1}
                  </span>
                  <FoodThumb src={entry.image} name={entry.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold">
                      {entry.name}
                    </p>
                    <p className="text-[0.75rem] text-muted-foreground">
                      {entry.qty} sold
                    </p>
                  </div>
                  <span data-numeric className="shrink-0 text-[0.8125rem] font-bold">
                    {currency(entry.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {/* Order status strip */}
      <Panel
        className="mt-4"
        title="Order Status"
        action={<PanelLink href="/orders">View All Orders</PanelLink>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STATUS_TILES.map((tile) => (
            <StatTile
              key={tile.stage}
              icon={tile.icon}
              tone={tile.tone}
              value={scopedStageCounts[tile.stage]}
              label={tile.label}
              href="/orders"
            />
          ))}
        </div>
      </Panel>

      {/* Recent orders, ratings, insights */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Panel
          title="Recent Orders"
          action={<PanelLink href="/orders/history">View All</PanelLink>}
          bodyClassName="flex flex-col"
        >
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No orders yet.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((order) => (
                <OrderMiniRow key={order.id} order={order} />
              ))}
            </div>
          )}
          {/* Pinned to the foot of the card so the panel matching the taller
              column beside it doesn't leave the button stranded mid-air. */}
          <div className="mt-auto pt-3">
            <Button
              asChild
              variant="outline"
              className="w-full border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
            >
              <Link href="/orders">View All Orders</Link>
            </Button>
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Customer Ratings"
            action={<PanelLink href="/reviews">View All</PanelLink>}
          >
            <FixtureNote>
              This backend has no vendor reviews endpoint — the spread below is
              sample data.
            </FixtureNote>
            <div className="mt-3 flex items-start gap-5">
              <div className="shrink-0 text-center">
                <p className="flex items-baseline gap-1">
                  <span data-numeric className="text-3xl font-bold tracking-tight">
                    {reviewTotals.average}
                  </span>
                  <Star className="size-5 fill-amber-400 text-amber-400" />
                </p>
                <p className="mt-1 text-[0.75rem] text-muted-foreground">
                  Average Rating
                </p>
                <p className="mt-1 flex items-center justify-center gap-0.5 text-[0.75rem] font-semibold text-emerald-600">
                  <MoveUpRight className="size-3" />
                  {reviewTotals.weekDelta} vs last week
                </p>
              </div>

              <ul className="min-w-0 flex-1 space-y-1.5">
                {ratingDistribution.map((row) => {
                  const share = (row.count / ratingTotal) * 100;
                  return (
                    <li key={row.star} className="flex items-center gap-2">
                      <span className="flex w-7 shrink-0 items-center gap-0.5 text-[0.75rem] tabular-nums">
                        {row.star}
                        <Star className="size-2.5 fill-amber-400 text-amber-400" />
                      </span>
                      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            row.star >= 4
                              ? "bg-emerald-500"
                              : row.star === 3
                                ? "bg-amber-500"
                                : "bg-red-500"
                          )}
                          style={{ width: `${Math.max(share, 2)}%` }}
                        />
                      </span>
                      <span
                        data-numeric
                        className="w-16 shrink-0 text-right text-[0.75rem] text-muted-foreground"
                      >
                        {row.count} ({Math.round(share)}%)
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Panel>

          <Panel title="Today's Insights">
            <FixtureNote>Sample data — no endpoint behind these yet.</FixtureNote>
            <ul className="mt-2 divide-y divide-border">
              {todaysInsights.map((insight, index) => {
                const Icon = INSIGHT_ICONS[index] ?? Timer;
                return (
                  <li
                    key={insight.label}
                    className="flex items-center gap-3 py-2.5 last:pb-0"
                  >
                    <span
                      className={cn("icon-circle size-9", TONES[insight.tone].circle)}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[0.75rem] text-muted-foreground">
                        {insight.label}
                      </p>
                      <p className="truncate text-[0.8125rem] font-semibold">
                        {insight.value}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      {/* Money */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Sales Summary" description={`Where order value sat · ${rangeLabel(range)}`}>
          {salesBreakdown.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No billed orders yet.
            </p>
          ) : (
            <DonutChart
              slices={salesBreakdown}
              centerLabel="Order Value"
              centerValue={currency(
                salesBreakdown.reduce((sum, slice) => sum + slice.value, 0)
              )}
              height={230}
              format={(value) => currency(value)}
            />
          )}
        </Panel>

        <Panel
          title="Payout Summary"
          action={<PanelLink href="/earnings">View All</PanelLink>}
        >
          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <div className="min-w-0 flex-1">
              <p className="text-[0.75rem] text-muted-foreground">
                Available for Payout
              </p>
              <p
                data-numeric
                className="mt-0.5 text-xl font-bold text-emerald-700 dark:text-emerald-300"
              >
                {currency(payouts.data?.withdrawable ?? 0, true)}
              </p>
            </div>
            <span className="icon-circle bg-emerald-600 text-white">
              <Wallet className="size-5" />
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[0.75rem] text-muted-foreground">Already Withdrawn</p>
              <p data-numeric className="mt-0.5 text-[0.9375rem] font-bold">
                {currency(payouts.data?.alreadyWithdrawn ?? 0, true)}
              </p>
            </div>
            <div>
              <p className="text-[0.75rem] text-muted-foreground">Unsettled</p>
              <p data-numeric className="mt-0.5 text-[0.9375rem] font-bold">
                {currency(payouts.data?.unsettledEarnings ?? 0, true)}
              </p>
            </div>
          </div>

          <Button
            asChild
            className="mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Link href="/earnings">Request Payout</Link>
          </Button>
        </Panel>
      </div>

      {/* Announcements */}
      <Panel className="mt-4" title="Announcements">
        <FixtureNote>Sample data — no announcements endpoint yet.</FixtureNote>
        <ul className="mt-2 divide-y divide-border">
          {announcements.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3 last:pb-0">
              <span className={cn("icon-circle size-9", TONES[item.tone].circle)}>
                <Megaphone className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold">{item.title}</p>
                <p className="mt-0.5 text-[0.8125rem] text-muted-foreground text-pretty">
                  {item.body}
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                  {item.at}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <PromoBanner
        className="mt-4"
        icon={Megaphone}
        tone="amber"
        title="Grow your business with Reditoe!"
        description="Run offers, discounts and promote your restaurant to reach more customers."
        actions={
          <>
            <Button asChild>
              <Link href="/offers">Create Offer</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/insights">Learn How</Link>
            </Button>
          </>
        }
      />
    </>
  );
}
