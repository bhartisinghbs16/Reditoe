import React from "react";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageBar } from "@/components/screen-header";
import { OrderCard } from "@/components/order-card";
import {
  Button,
  EmptyState,
  IconPlate,
  SearchField,
  ToolButton,
  Txt,
  UnderlineTabs,
  colors,
} from "@/components/ui";
import { currency, money } from "@/lib/format";
import { tints, type TintName } from "@/lib/theme";
import { useStore, type OrderStage } from "@/lib/store";

/**
 * Orders Management — a copy of the reference orders screen: the four status
 * counters, the search / filter / sort row, the stage tabs, the rail-marked
 * order cards, and the day's totals along the foot.
 */

type Tab = OrderStage | "all";

/* ── Status counters ────────────────────────────────────────────────────── */

/**
 * One of the four counts across the top of Orders.
 *
 * They wrapped two by two, because each was told to take at least 46% of the
 * width. The client wants the four side by side, so the card stacks its icon
 * above its figure instead of beside it - four of the old shape at a quarter
 * of a phone's width would truncate every label.
 */
function StatusCard({
  icon,
  tint,
  count,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: TintName;
  count: number;
  label: string;
}) {
  return (
    <View
      style={{ backgroundColor: tints[tint].bg }}
      className="flex-1 items-center rounded-card px-1.5 py-2.5"
    >
      <View className="items-center gap-1">
        <IconPlate icon={icon} tint={tint} size={30} background="#ffffff" />
        <View className="min-w-0 items-center">
          <Txt size="xl" weight="bold">
            {count}
          </Txt>
          <Txt size="micro" tone="soft" numberOfLines={2} className="text-center">
            {label}
          </Txt>
        </View>
      </View>
    </View>
  );
}

/* ── Day totals ─────────────────────────────────────────────────────────── */

function MiniStat({
  label,
  value,
  delta,
  up,
  icon,
  tint,
}: {
  label: string;
  value: string;
  delta: string;
  up: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  tint: TintName;
}) {
  return (
    <View
      style={{ backgroundColor: tints[tint].bg }}
      className="min-w-[46%] flex-1 rounded-card p-3"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Txt size="tiny" tone="muted" numberOfLines={1} className="flex-1">
          {label}
        </Txt>
        <Ionicons name={icon} size={14} color={tints[tint].fg} />
      </View>
      <Txt size="xl" weight="bold" className="mt-1" numberOfLines={1}>
        {value}
      </Txt>
      <View className="mt-0.5 flex-row items-center gap-1">
        <Ionicons
          name={up ? "arrow-up" : "arrow-down"}
          size={11}
          color={up ? colors.ok.default : colors.bad.default}
        />
        <Txt size="micro" weight="semibold" tone={up ? "ok" : "bad"}>
          {delta} vs yesterday
        </Txt>
      </View>
    </View>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

export default function VendorOrders() {
  const { orders, notifications, today } = useStore();
  const [tab, setTab] = React.useState<Tab>("all");
  const [query, setQuery] = React.useState("");

  const countFor = (id: Tab) =>
    id === "all" ? orders.length : orders.filter((o) => o.stage === id).length;

  const term = query.trim().toLowerCase();
  const visible = orders
    .filter((o) => (tab === "all" ? true : o.stage === tab))
    .filter((o) =>
      term
        ? o.reference.toLowerCase().includes(term) ||
          o.customer.toLowerCase().includes(term) ||
          o.lines.some((line) => line.name.toLowerCase().includes(term))
        : true
    );

  const cancelled = countFor("cancelled");
  const cancelRate = orders.length ? ((cancelled / orders.length) * 100).toFixed(2) : "0.00";

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: `All Orders (${countFor("all")})` },
    { id: "new", label: `New (${countFor("new")})` },
    { id: "preparing", label: `Preparing (${countFor("preparing")})` },
    { id: "ready", label: `Ready (${countFor("ready")})` },
    { id: "picked", label: `Out for Delivery (${countFor("picked")})` },
    // Delivered was missing, so a completed order fell out of every tab but
    // "All" and the vendor had no list of what they had finished.
    { id: "delivered", label: `Delivered (${countFor("delivered")})` },
    { id: "cancelled", label: `Cancelled (${cancelled})` },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      {/* The reference fits the title, the bell and "New Order" on one line on
          its wide canvas. At phone width that truncates the title, so the
          action drops to its own row — the same shape the Menu screen uses. */}
      <View className="border-b border-line bg-surface">
        <PageBar
          title="Orders Management"
          subtitle="Manage and track all restaurant orders"
          notifications={notifications}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6">
        <View className="flex-row gap-2 px-4 pt-3">
          <StatusCard
            icon="bag-handle-outline"
            tint="green"
            count={countFor("new")}
            label="New Orders"
          />
          <StatusCard
            icon="flame-outline"
            tint="amber"
            count={countFor("preparing")}
            label="Preparing"
          />
          <StatusCard
            icon="bicycle-outline"
            tint="violet"
            count={countFor("picked")}
            label="Out for Delivery"
          />
          <StatusCard
            icon="checkmark-circle-outline"
            tint="blue"
            count={countFor("ready")}
            label="Ready"
          />
        </View>

        <View className="flex-row gap-2.5 px-4 pt-3">
          <SearchField
            placeholder="Search by Order ID, Customer, Item…"
            value={query}
            onChangeText={setQuery}
            className="flex-1"
          />
          <ToolButton label="Filter" icon="options-outline" />
          <ToolButton label="Sort" icon="swap-vertical-outline" />
        </View>

        <UnderlineTabs tabs={tabs} value={tab} onChange={setTab} className="mt-3 bg-surface" />

        <View className="gap-3 px-4 pt-3">
          {visible.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="Nothing here"
              detail="No orders match this stage or search right now."
            />
          ) : (
            visible.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </View>

        <View className="flex-row flex-wrap gap-2.5 px-4 pt-4">
          <MiniStat
            label="Today's Revenue"
            value={money(today.earnings)}
            delta="+12.5%"
            up
            icon="cash-outline"
            tint="green"
          />
          <MiniStat
            label="Average Order Value"
            value={currency(today.averageOrder)}
            delta="+8.3%"
            up
            icon="stats-chart-outline"
            tint="blue"
          />
          <MiniStat
            label="Total Orders"
            value={String(today.orders)}
            delta="+18.2%"
            up
            icon="bag-handle-outline"
            tint="violet"
          />
          <MiniStat
            label="Cancellation Rate"
            value={`${cancelRate}%`}
            delta="-1.3%"
            up={false}
            icon="close-circle-outline"
            tint="red"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
