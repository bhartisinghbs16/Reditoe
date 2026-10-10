"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  BarChart3,
  Bike,
  Download,
  IndianRupee,
  LineChart,
  MapPin,
  Repeat,
  ShoppingCart,
  Star,
  Store,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelLink } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { DonutChart, TrendChart } from "@/components/charts/charts";
import { MiniMetricCard } from "@/components/dashboard/metric-card";
import { FilterSelect } from "@/components/common/filter-bar";
import {
  RestaurantBoundary,
  restaurantStatus,
} from "@/components/restaurants/restaurant-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrders } from "@/lib/queries";
import { downloadCsv, stampedName, toCsv } from "@/lib/export";
import { orderStatusLabel } from "@/lib/domain";
import {
  currency,
  currencyCompact,
  initials,
  number as formatNumber,
  percent,
  shortId,
} from "@/lib/format";
import { refId } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Restaurant } from "@/lib/types";

/**
 * Restaurant Analytics, built to the client's reference screen: six headline
 * figures beside the identity card, a section rail, then trends, breakdowns,
 * a time-of-day heatmap and the location table.
 *
 * Every figure is derived from this restaurant's own orders rather than a
 * pre-aggregated endpoint — /admin/orders?restaurantId= is what exists. The
 * sample is the most recent ORDER_SAMPLE orders, which the header states, so
 * nobody reads these as lifetime totals.
 */

/** How many recent orders the derivations run over. */
const ORDER_SAMPLE = 200;

const SECTIONS = [
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "sales", label: "Sales Analytics", icon: LineChart },
  { value: "orders", label: "Order Analytics", icon: ShoppingCart },
  { value: "customers", label: "Customer Analytics", icon: UsersRound },
  { value: "menu", label: "Menu Analytics", icon: UtensilsCrossed },
  { value: "delivery", label: "Delivery Analytics", icon: Bike },
  { value: "ratings", label: "Ratings & Reviews", icon: Star },
  { value: "location", label: "Location Analytics", icon: MapPin },
  { value: "payout", label: "Payout Analytics", icon: Wallet },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_BANDS = [
  { label: "12 AM", from: 0 },
  { label: "4 AM", from: 4 },
  { label: "8 AM", from: 8 },
  { label: "12 PM", from: 12 },
  { label: "4 PM", from: 16 },
  { label: "8 PM", from: 20 },
];

export default function RestaurantAnalyticsPage() {
  const params = useParams<{ id: string }>();
  return (
    <RestaurantBoundary id={params.id}>
      {(restaurant) => <Analytics restaurant={restaurant} />}
    </RestaurantBoundary>
  );
}

function Analytics({ restaurant }: { restaurant: Restaurant }) {
  const orders = useOrders({ restaurantId: restaurant._id, limit: ORDER_SAMPLE });
  const [section, setSection] = React.useState("overview");
  const [grain, setGrain] = React.useState("daily");

  const rows = React.useMemo(() => orders.data?.items ?? [], [orders.data]);
  const loading = orders.isPending;

  const stats = React.useMemo(() => {
    const revenue = rows.reduce((sum, order) => sum + (order.total ?? 0), 0);
    const cancelled = rows.filter((order) => order.status === "Cancelled").length;

    const perCustomer = new Map<string, number>();
    for (const order of rows) {
      const id = refId(order.userId);
      if (!id) continue;
      perCustomer.set(id, (perCustomer.get(id) ?? 0) + 1);
    }
    const repeat = [...perCustomer.values()].filter((count) => count > 1).length;

    return {
      revenue,
      cancelled,
      customers: perCustomer.size,
      repeatShare: perCustomer.size ? (repeat / perCustomer.size) * 100 : null,
      aov: rows.length ? revenue / rows.length : 0,
    };
  }, [rows]);

  /** Orders and revenue per day across the sample's last two weeks. */
  const trend = React.useMemo(() => {
    const span = grain === "weekly" ? 8 : 7;
    const step = grain === "weekly" ? 7 : 1;
    const buckets = Array.from({ length: span }, (_, index) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (span - 1 - index) * step);
      return {
        start: start.getTime(),
        end: start.getTime() + step * 86_400_000,
        label: start.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        orders: 0,
        revenue: 0,
      };
    });

    for (const order of rows) {
      const at = order.createdAt ? new Date(order.createdAt).getTime() : NaN;
      if (Number.isNaN(at)) continue;
      const bucket = buckets.find((slot) => at >= slot.start && at < slot.end);
      if (!bucket) continue;
      bucket.orders += 1;
      bucket.revenue += order.total ?? 0;
    }

    return buckets.map(({ label, orders: count, revenue }) => ({
      label,
      orders: count,
      revenue,
    }));
  }, [rows, grain]);

  const statusMix = React.useMemo(() => {
    const totals = new Map<string, number>();
    for (const order of rows) {
      const label = orderStatusLabel(order.status);
      if (label === "—") continue;
      totals.set(label, (totals.get(label) ?? 0) + 1);
    }
    return [...totals.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  /** Item-level rollups, from the line items on each order. */
  const itemStats = React.useMemo(() => {
    const totals = new Map<string, { orders: number; revenue: number }>();
    for (const order of rows) {
      for (const item of order.items ?? []) {
        const name = item.name;
        if (!name) continue;
        const entry = totals.get(name) ?? { orders: 0, revenue: 0 };
        entry.orders += item.quantity ?? 1;
        entry.revenue += (item.price ?? 0) * (item.quantity ?? 1);
        totals.set(name, entry);
      }
    }
    return [...totals.entries()]
      .map(([name, entry]) => ({ name, ...entry }))
      .sort((a, b) => b.orders - a.orders);
  }, [rows]);

  const locations = React.useMemo(() => {
    const totals = new Map<string, { orders: number; revenue: number }>();
    for (const order of rows) {
      const city = order.deliveryAddress?.city;
      if (!city) continue;
      const entry = totals.get(city) ?? { orders: 0, revenue: 0 };
      entry.orders += 1;
      entry.revenue += order.total ?? 0;
      totals.set(city, entry);
    }
    const list = [...totals.entries()]
      .map(([city, entry]) => ({ city, ...entry }))
      .sort((a, b) => b.orders - a.orders);
    const total = list.reduce((sum, entry) => sum + entry.orders, 0);
    return { list, total };
  }, [rows]);

  /** Weekday × time-band order counts, 0-based rows Mon…Sun. */
  const heat = React.useMemo(() => {
    const grid = WEEKDAYS.map(() => HOUR_BANDS.map(() => 0));
    for (const order of rows) {
      if (!order.createdAt) continue;
      const at = new Date(order.createdAt);
      if (Number.isNaN(at.getTime())) continue;
      // getDay() is Sunday-first; the grid is Monday-first.
      const day = (at.getDay() + 6) % 7;
      const band = HOUR_BANDS.reduce(
        (best, entry, index) => (at.getHours() >= entry.from ? index : best),
        0
      );
      grid[day][band] += 1;
    }
    const peak = Math.max(1, ...grid.flat());
    return { grid, peak };
  }, [rows]);

  /**
   * The report, as the screen shows it.
   *
   * The button had no handler at all - it looked like every other working
   * control and did nothing when pressed. Each section below is the same
   * figure the panel above it draws, so what downloads matches what was
   * being read rather than being a second, differently-counted answer.
   */
  const downloadReport = () => {
    const sections: string[] = [
      toCsv(
        [
          { Metric: "Restaurant", Value: restaurant.name ?? "" },
          { Metric: "Orders in sample", Value: rows.length },
          { Metric: "Revenue", Value: stats.revenue.toFixed(2) },
          { Metric: "Average order value", Value: stats.aov.toFixed(2) },
          { Metric: "Cancelled orders", Value: stats.cancelled },
          { Metric: "Customers", Value: stats.customers },
          {
            Metric: "Repeat customers (%)",
            Value: stats.repeatShare === null ? "" : stats.repeatShare.toFixed(1),
          },
          { Metric: "Generated", Value: new Date().toISOString() },
        ],
        [
          { header: "Metric", value: (r) => r.Metric },
          { header: "Value", value: (r) => r.Value },
        ]
      ),
      "",
      grain === "weekly" ? "Weekly trend" : "Daily trend",
      toCsv(trend, [
        { header: "Period", value: (r) => r.label },
        { header: "Orders", value: (r) => r.orders },
        { header: "Revenue", value: (r) => r.revenue.toFixed(2) },
      ]),
      "",
      "By status",
      toCsv(statusMix, [
        { header: "Status", value: (r) => r.label },
        { header: "Orders", value: (r) => r.value },
      ]),
      "",
      "Items",
      toCsv(itemStats, [
        { header: "Item", value: (r) => r.name },
        { header: "Quantity", value: (r) => r.orders },
        { header: "Revenue", value: (r) => r.revenue.toFixed(2) },
      ]),
    ];

    if (locations.list.length > 0) {
      sections.push(
        "",
        "By city",
        toCsv(locations.list, [
          { header: "City", value: (r) => r.city },
          { header: "Orders", value: (r) => r.orders },
          { header: "Revenue", value: (r) => r.revenue.toFixed(2) },
        ])
      );
    }

    // The heatmap, flattened: a grid does not survive a single CSV row.
    const busiest = WEEKDAYS.flatMap((day, dayIndex) =>
      HOUR_BANDS.map((band, bandIndex) => ({
        day,
        band: band.label,
        orders: heat.grid[dayIndex][bandIndex],
      }))
    ).filter((entry) => entry.orders > 0);

    if (busiest.length > 0) {
      sections.push(
        "",
        "Busiest times",
        toCsv(busiest, [
          { header: "Day", value: (r) => r.day },
          { header: "Time", value: (r) => r.band },
          { header: "Orders", value: (r) => r.orders },
        ])
      );
    }

    const slug = (restaurant.name ?? "restaurant")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();
    downloadCsv(
      stampedName(`reditoe-${slug}-analytics`),
      sections.join("\n")
    );
  };

  return (
    <>
      <PageHeader
        title="Restaurant Analytics"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Restaurants", href: "/restaurants" },
          { label: restaurant.name ?? "Restaurant", href: `/restaurants/${restaurant._id}` },
          { label: "Restaurant Analytics" },
        ]}
        description={`Derived from this restaurant's ${formatNumber(rows.length)} most recent orders.`}
        actions={
          <>
            <FilterSelect
              value={grain}
              onChange={(value) => setGrain(value || "daily")}
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
              ]}
              placeholder="Daily"
              allLabel="Daily"
            />
            <Button
              variant="outline"
              size="lg"
              onClick={downloadReport}
              disabled={loading || rows.length === 0}
            >
              <Download className="size-4" />
              Download Report
            </Button>
          </>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[1fr_2.4fr]">
        <div className="surface flex items-start gap-3 p-3.5">
          <Avatar className="size-14 shrink-0">
            <AvatarImage src={restaurant.image} alt="" />
            <AvatarFallback>{initials(restaurant.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-[0.9375rem] font-semibold">
                {restaurant.name ?? "Restaurant"}
              </span>
              <StatusBadge status={restaurantStatus(restaurant)} />
            </div>
            <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
              {shortId(restaurant._id, "REST")}
            </p>
            <p className="mt-1 truncate text-[0.75rem] text-muted-foreground">
              {[...new Set(restaurant.categories ?? [])].slice(0, 2).join(", ") || "—"}
            </p>
            {restaurant.rating && (
              <p className="mt-1 flex items-center gap-1 text-[0.75rem]">
                <Star className="size-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{restaurant.rating.toFixed(1)}</span>
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MiniMetricCard
            label="Total Orders"
            value={loading ? "…" : formatNumber(rows.length)}
            hint="In this sample"
            icon={ShoppingCart}
            tone="blue"
          />
          <MiniMetricCard
            label="Total Revenue"
            value={loading ? "…" : currencyCompact(stats.revenue)}
            hint="In this sample"
            icon={IndianRupee}
            tone="green"
          />
          <MiniMetricCard
            label="Average Order Value"
            value={loading ? "…" : currency(stats.aov, true)}
            hint="Revenue ÷ orders"
            icon={Wallet}
            tone="purple"
          />
          <MiniMetricCard
            label="Total Customers"
            value={loading ? "…" : formatNumber(stats.customers)}
            hint="Distinct in this sample"
            icon={UsersRound}
            tone="amber"
          />
          <MiniMetricCard
            label="Repeat Customer %"
            value={
              loading || stats.repeatShare === null
                ? "—"
                : percent(stats.repeatShare, 2)
            }
            hint="Ordered more than once"
            icon={Repeat}
            tone="green"
          />
          <MiniMetricCard
            label="Cancelled Orders"
            value={loading ? "…" : formatNumber(stats.cancelled)}
            hint="In this sample"
            icon={XCircle}
            tone="red"
          />
        </div>
      </div>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[14rem_1fr]">
        <nav className="surface p-1.5">
          <ul>
            {SECTIONS.map(({ value, label, icon: Icon }) => {
              const active = value === section;
              return (
                <li key={value}>
                  <button
                    type="button"
                    onClick={() => setSection(value)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[0.8125rem] transition-colors",
                      active
                        ? "bg-primary/8 font-medium text-primary"
                        : "text-foreground hover:bg-muted/60"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {section === "overview" ? (
          <div className="flex flex-col gap-3">
            <div className="grid items-start gap-3 lg:grid-cols-2">
              <Panel title="Orders Trend">
                {loading ? (
                  <Skeleton className="h-52 w-full" />
                ) : (
                  <TrendChart
                    data={trend}
                    categoryKey="label"
                    categoryLabel="Day"
                    height={210}
                    caption="Orders"
                    series={[{ key: "orders", label: "Orders" }]}
                  />
                )}
              </Panel>
              <Panel title="Revenue Trend (₹)">
                {loading ? (
                  <Skeleton className="h-52 w-full" />
                ) : (
                  <TrendChart
                    data={trend}
                    categoryKey="label"
                    categoryLabel="Day"
                    height={210}
                    caption="Revenue"
                    series={[
                      {
                        key: "revenue",
                        label: "Revenue",
                        color: "#059669",
                        format: (value) => currency(value),
                      },
                    ]}
                  />
                )}
              </Panel>
            </div>

            <div className="grid items-stretch gap-3 xl:grid-cols-[1fr_1.15fr_1.25fr]">
              <Panel title="Orders by Status">
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <DonutChart
                    slices={statusMix}
                    centerLabel="Total Orders"
                    centerValue={formatNumber(rows.length)}
                    height={260}
                  />
                )}
              </Panel>

              <Panel
                title="Item Mix"
                description="Share of units across the top items."
              >
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : itemStats.length === 0 ? (
                  <p className="text-[0.8125rem] text-muted-foreground">
                    No line items on these orders.
                  </p>
                ) : (
                  <DonutChart
                    slices={itemStats
                      .slice(0, 5)
                      .map((item) => ({ label: item.name, value: item.orders }))}
                    centerLabel="Units"
                    centerValue={formatNumber(
                      itemStats.reduce((sum, item) => sum + item.orders, 0)
                    )}
                    height={260}
                  />
                )}
              </Panel>

              <Panel
                title="Top Selling Items"
                action={<PanelLink href={`/restaurants/${restaurant._id}/menu`}>View All Items</PanelLink>}
                flush
              >
                {loading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-[0.6875rem] text-muted-foreground">
                        <th scope="col" className="px-4 py-2 text-left font-medium">
                          #
                        </th>
                        <th scope="col" className="px-2 py-2 text-left font-medium">
                          Item Name
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">
                          Units
                        </th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">
                          Revenue (₹)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemStats.slice(0, 5).map((item, index) => (
                        <tr
                          key={item.name}
                          className="border-b border-border/70 last:border-0"
                        >
                          <td className="px-4 py-2 text-[0.8125rem] text-muted-foreground tabular-nums">
                            {index + 1}
                          </td>
                          <td className="px-2 py-2 text-[0.8125rem]">{item.name}</td>
                          <td className="px-2 py-2 text-right text-[0.8125rem] tabular-nums">
                            {formatNumber(item.orders)}
                          </td>
                          <td className="px-4 py-2 text-right text-[0.8125rem] font-medium tabular-nums">
                            {formatNumber(Math.round(item.revenue))}
                          </td>
                        </tr>
                      ))}
                      {itemStats.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-6 text-center text-[0.8125rem] text-muted-foreground"
                          >
                            No line items on these orders.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </Panel>
            </div>

            <div className="grid items-start gap-3 xl:grid-cols-[1.1fr_1fr]">
              <Panel
                title="Orders by Time Slot"
                description="Weekday against time of day; darker means busier."
              >
                {loading ? (
                  <Skeleton className="h-56 w-full" />
                ) : (
                  <div className="min-w-0 overflow-x-auto">
                    <table className="w-full min-w-[18rem] border-separate border-spacing-1">
                      <thead>
                        <tr>
                          <th className="w-10" />
                          {HOUR_BANDS.map((band) => (
                            <th
                              key={band.label}
                              scope="col"
                              className="pb-1 text-[0.625rem] font-medium text-muted-foreground"
                            >
                              {band.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {WEEKDAYS.map((day, dayIndex) => (
                          <tr key={day}>
                            <th
                              scope="row"
                              className="pr-2 text-right text-[0.625rem] font-medium text-muted-foreground"
                            >
                              {day}
                            </th>
                            {HOUR_BANDS.map((band, bandIndex) => {
                              const count = heat.grid[dayIndex][bandIndex];
                              const share = count / heat.peak;
                              return (
                                <td key={band.label}>
                                  <div
                                    title={`${day} ${band.label} — ${count} orders`}
                                    className="h-6 rounded"
                                    style={{
                                      backgroundColor:
                                        count === 0
                                          ? "var(--muted)"
                                          : `color-mix(in oklab, var(--primary) ${Math.round(
                                              15 + share * 85
                                            )}%, transparent)`,
                                    }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[0.6875rem] text-muted-foreground">
                      Peak slot: {heat.peak} order{heat.peak === 1 ? "" : "s"}.
                    </p>
                  </div>
                )}
              </Panel>

              <Panel title="Orders by Location" flush>
                {loading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : locations.list.length === 0 ? (
                  <p className="p-4 text-[0.8125rem] text-muted-foreground">
                    No delivery addresses on these orders.
                  </p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-[0.6875rem] text-muted-foreground">
                        <th scope="col" className="px-4 py-2 text-left font-medium">
                          Location
                        </th>
                        <th scope="col" className="px-2 py-2 text-left font-medium">
                          Orders
                        </th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">
                          Revenue (₹)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {locations.list.slice(0, 6).map((entry) => {
                        const share = locations.total
                          ? (entry.orders / locations.total) * 100
                          : 0;
                        return (
                          <tr
                            key={entry.city}
                            className="border-b border-border/70 last:border-0"
                          >
                            <td className="px-4 py-2 text-[0.8125rem]">{entry.city}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[0.8125rem] tabular-nums">
                                  {formatNumber(entry.orders)}
                                </span>
                                <span className="text-[0.625rem] text-muted-foreground tabular-nums">
                                  ({percent(share)})
                                </span>
                                <span
                                  aria-hidden
                                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                                >
                                  <span
                                    className="block h-full rounded-full bg-primary"
                                    style={{ width: `${share}%` }}
                                  />
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right text-[0.8125rem] font-medium tabular-nums">
                              {formatNumber(Math.round(entry.revenue))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Panel>
            </div>
          </div>
        ) : (
          <Panel title={SECTIONS.find((entry) => entry.value === section)?.label}>
            <p className="text-[0.8125rem] text-muted-foreground">
              This breakdown needs an aggregation endpoint the API doesn&apos;t expose
              yet. Overview derives what it can from the restaurant&apos;s recent
              orders.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setSection("overview")}
            >
              <Store className="size-3.5" />
              Back to Overview
            </Button>
          </Panel>
        )}
      </div>
    </>
  );
}
