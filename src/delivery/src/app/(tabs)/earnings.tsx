import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Badge,
  Card,
  Divider,
  IconPlate,
  Panel,
  StatCell,
  ToolButton,
  Txt,
  colors,
} from "@/components/ui";
import { AppBar } from "@/components/screen-header";
import { PartnerCard } from "@/components/partner-card";
import { AreaChart, Donut } from "@/components/chart";
import { money } from "@/lib/format";
import { docTone } from "@/lib/theme";
import { useStore } from "@/lib/store";

/**
 * Earnings, reproduced from the reference: the total with its four-figure
 * strip, the month's overview chart beside a period panel, the breakup ring
 * with its legend, the statement, and the payout summary that closes the page.
 */

function TotalCard() {
  const { earningsTotals } = useStore();
  const cells = [
    { icon: "wallet" as const, tint: "green" as const, value: money(earningsTotals.total), label: "Total Earnings" },
    { icon: "bag-handle" as const, tint: "blue" as const, value: money(earningsTotals.orders), label: "Order Earnings" },
    { icon: "gift" as const, tint: "amber" as const, value: money(earningsTotals.incentives), label: "Incentives" },
    { icon: "briefcase" as const, tint: "violet" as const, value: money(earningsTotals.other), label: "Other Earnings" },
  ];

  return (
    <Card className="overflow-hidden">
      <View className="flex-row items-start justify-between gap-3 p-4">
        <View className="min-w-0 flex-1">
          <Txt weight="semibold">Total Earnings</Txt>
          <Txt size="3xl" weight="bold" tone="green" className="mt-1" numberOfLines={1}>
            {money(earningsTotals.total)}
          </Txt>
        </View>
        <ToolButton label="This Month" icon="calendar-outline" chevron className="h-10" />
      </View>

      <Divider />

      <View className="flex-row px-2 py-4">
        {cells.map((cell, index) => (
          <StatCell
            key={cell.label}
            {...cell}
            valueSize="sm"
            order="value-first"
            divided={index > 0}
          />
        ))}
      </View>
    </Card>
  );
}

function Overview() {
  const router = useRouter();
  const { earningsTotals, earningsSeries, wallet } = useStore();

  /*
   * The four periods are a filter now.
   *
   * They were four figures printed side by side with "This Month" always
   * highlighted, so tapping one did nothing - which is the filter the client
   * reports as not working. Choosing one changes the headline total and the
   * orders counted under it.
   */
  const [period, setPeriod] = React.useState("This Month");
  const periods = [
    { label: "This Month", value: earningsTotals.total, orders: wallet.month.orders },
    { label: "Last Month", value: earningsTotals.lastMonth, orders: null },
    { label: "This Week", value: wallet.week.amount, orders: wallet.week.orders },
    { label: "Today", value: wallet.today.amount, orders: wallet.today.orders },
  ];
  const chosen = periods.find((entry) => entry.label === period) ?? periods[0];

  /*
   * The overview is the detail - there is no deeper breakdown to open, and
   * the label led nowhere. Payouts are where the money actually leaves, so
   * that is what it points at now.
   */
  return (
    <Panel
      title="Earnings Overview"
      action="Payouts"
      onAction={() => router.push("/payout-summary")}
      bodyClassName="px-4 pb-4"
    >
      <View className="mb-3">
        <Txt size="micro" tone="muted">
          {chosen.label}
        </Txt>
        <Txt size="2xl" weight="bold" tone="green">
          {money(chosen.value)}
        </Txt>
        {chosen.orders !== null && (
          <Txt size="tiny" tone="muted">
            {chosen.orders} {chosen.orders === 1 ? "order" : "orders"}
          </Txt>
        )}
      </View>

      <View className="flex-row gap-3">
        <View className="min-w-0 flex-1">
          <AreaChart data={earningsSeries} />
        </View>

        <View className="w-[118px] gap-1.5 rounded-tile bg-surface-sunken p-2">
          {periods.map((entry) => {
            const active = entry.label === period;
            return (
              <Pressable
                key={entry.label}
                onPress={() => setPeriod(entry.label)}
                style={{ backgroundColor: active ? "#ffffff" : "transparent" }}
                className="rounded-tile px-2 py-1.5 active:opacity-70"
              >
                <Txt size="micro" tone={active ? "green" : "muted"} weight={active ? "bold" : "regular"}>
                  {entry.label}
                </Txt>
                <Txt
                  size="sm"
                  weight="bold"
                  tone={active ? "green" : "default"}
                  numberOfLines={1}
                >
                  {money(entry.value)}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Panel>
  );
}

function Breakup() {
  const { earningsBreakup } = useStore();
  return (
    <Panel title="Earnings Breakup (This Month)" bodyClassName="px-4 pb-4">
      <View className="flex-row items-center gap-4">
        <Donut data={earningsBreakup}>
          <Txt size="lg" weight="bold" numberOfLines={1}>
            ₹{earningsBreakup.reduce((sum, s) => sum + s.amount, 0).toLocaleString("en-IN")}
          </Txt>
          <Txt size="micro" tone="muted">
            Total
          </Txt>
        </Donut>

        <View className="min-w-0 flex-1 gap-2.5">
          {earningsBreakup.map((slice) => (
            <View key={slice.label} className="flex-row items-center gap-2">
              <View
                style={{ backgroundColor: slice.color }}
                className="h-2.5 w-2.5 rounded-full"
              />
              <Txt size="tiny" tone="soft" className="flex-1" numberOfLines={1}>
                {slice.label}
              </Txt>
              <Txt size="micro" tone="muted">
                ({slice.share.toFixed(1)}%)
              </Txt>
              <Txt size="tiny" weight="semibold">
                {money(slice.amount)}
              </Txt>
            </View>
          ))}
        </View>
      </View>
    </Panel>
  );
}

function Transactions() {
  const router = useRouter();
  const { transactions } = useStore();
  return (
    <Panel
      title="Recent Transactions"
      action="View All"
      onAction={() => router.push("/payout-summary")}
      bodyClassName="pb-1"
    >
      {/*
        The rows do not navigate. Every one of them opened the payout summary,
        whichever transaction was tapped - so a rider looking at a delivery
        payment landed on a page about something else. There is no per-
        transaction screen to open, and the row already says what happened.
      */}
      {transactions.map((entry, index) => (
        <View
          key={entry.id}
          className={`flex-row items-center gap-3 px-4 py-3 ${
            index > 0 ? "border-t border-line" : ""
          }`}
        >
          <IconPlate icon={entry.icon} tint={entry.tint} size={38} />

          <View className="min-w-0 flex-1">
            <Txt weight="semibold" numberOfLines={1}>
              {entry.title}
            </Txt>
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              {entry.at}
            </Txt>
          </View>

          <View className="items-end">
            <Txt weight="bold" tone={entry.amount < 0 ? "bad" : "default"}>
              {money(entry.amount)}
            </Txt>
            <Txt size="micro" tone="muted">
              {entry.kind}
            </Txt>
          </View>

          {/* No chevron: nothing opens, so nothing should suggest it does. */}
          <Badge label={entry.status} tone={docTone[entry.status] ?? "neutral"} />
        </View>
      ))}
    </Panel>
  );
}

export default function Earnings() {
  const router = useRouter();
  const { payouts, unread } = useStore();
  // No settlement yet is a real state for a new partner, not an error.
  const next = payouts.at(0);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8">
        <AppBar title="Earnings" trailing="bell"
          notifications={unread}
          onTrailing={() => router.push("/notifications")}
        />

        <View className="bg-surface pb-3">
          <PartnerCard card={false} />
        </View>

        <View className="gap-3.5 px-4 pt-3.5">
          <TotalCard />
          <Overview />
          <Breakup />
          <Transactions />

          {next && (
          <Pressable
            onPress={() => router.push("/payout-summary")}
            style={{ backgroundColor: "#edf9f1", borderColor: "#cdebd8" }}
            className="flex-row items-center gap-3 rounded-card border p-4 active:opacity-80"
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-white">
              <Ionicons name="business" size={21} color={colors.green[600]} />
            </View>

            <View className="min-w-0 flex-1">
              <Txt weight="bold">Payout Summary</Txt>
              <Txt size="tiny" tone="muted" className="mt-0.5">
                Your next payout will be transferred to your bank account.
              </Txt>
              <Txt size="tiny" tone="muted">
                Expected on: {next.expected}
              </Txt>
            </View>

            <View className="items-end">
              <Txt size="lg" weight="bold" numberOfLines={1}>
                {money(next.amount)}
              </Txt>
              <Txt size="micro" tone="green" weight="semibold">
                Next Payout Amount
              </Txt>
            </View>

            <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
          </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
