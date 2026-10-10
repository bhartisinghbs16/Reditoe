import React from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { IndigoHeader } from "@/components/screen-header";
import { AreaChart } from "@/components/chart";
import {
  ActionLink,
  Badge,
  Button,
  Card,
  Divider,
  Panel,
  PromoBanner,
  SelectButton,
  StatTile,
  ToolButton,
  Txt,
  colors,
} from "@/components/ui";
import { money } from "@/lib/format";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

/**
 * Payments — a copy of the reference earnings screen. Indigo header carrying
 * the wallet balance, a today's-earnings panel overlapping it, the four
 * balance tiles, the week chart beside its breakup, then the transactions
 * ledger.
 */

/** The ranges the payout list can be narrowed to. */
type PeriodKey = "7d" | "30d" | "90d" | "all";

const DAY = 24 * 60 * 60 * 1000;
const PERIODS: Record<PeriodKey, { label: string; since: () => number | null }> = {
  "7d": { label: "Last 7 days", since: () => Date.now() - 7 * DAY },
  "30d": { label: "Last 30 days", since: () => Date.now() - 30 * DAY },
  "90d": { label: "Last 90 days", since: () => Date.now() - 90 * DAY },
  all: { label: "All time", since: () => null },
};

type Tab = "transactions" | "history" | "requests";

const TABS: { id: Tab; label: string }[] = [
  { id: "transactions", label: "Transactions" },
  { id: "history", label: "Payout History" },
  { id: "requests", label: "Payout Requests" },
];

/** The balance shown in the header. It was pressable with no handler. */
function WalletChip({ balance }: { balance: number }) {
  return (
    <View className="flex-row items-center gap-2">
      <Ionicons name="wallet-outline" size={22} color="#ffffff" />
      <View className="items-end">
        <Txt size="micro" className="text-white/75">
          Wallet Balance
        </Txt>
        <Txt size="sm" weight="bold" style={{ color: "#4ade80" }}>
          {money(balance)}
        </Txt>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#ffffff" />
    </View>
  );
}

function TodayCard() {
  const router = useRouter();
  const { payments, refresh } = useStore();
  const [requesting, setRequesting] = React.useState(false);

  /**
   * Ask for the available balance to be paid out.
   *
   * The button had no handler at all, though the withdrawal endpoint has
   * existed the whole time. The amount is the balance the server says is
   * available - not a figure typed here - and the server checks it again and
   * applies its own minimum.
   */
  const requestPayout = async () => {
    const amount = Math.floor(payments.availableBalance || 0);
    if (amount <= 0) {
      Alert.alert("Nothing to pay out", "You have no settled balance waiting.");
      return;
    }
    setRequesting(true);
    try {
      await api.post("/vendor/withdrawals", { amount });
      await refresh();
      Alert.alert("Payout requested", `A payout of ${money(amount)} has been requested.`);
    } catch (error) {
      Alert.alert(
        "Could not request the payout",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Card className="mx-4 -mt-8 p-4" raised>
      <Txt size="tiny" tone="muted">
        Today&apos;s Sales
      </Txt>
      <Txt size="3xl" weight="bold" className="mt-0.5">
        {money(payments.today.earnings)}
      </Txt>

      {/* The API reports today's total, not a comparison, so the delta chip
          only appears when there is a real figure behind it. */}
      {payments.today.deltaPct !== 0 && (
        <View className="mt-2 flex-row items-center gap-2">
          <Badge
            label={`${payments.today.deltaPct > 0 ? "↑" : "↓"} ${Math.abs(payments.today.deltaPct)}%`}
            tone={payments.today.deltaPct > 0 ? "ok" : "bad"}
          />
          <Txt size="tiny" tone="muted">
            vs Yesterday
          </Txt>
        </View>
      )}

      <View className="mt-1.5 flex-row items-center gap-2">
        <Ionicons name="bag-handle-outline" size={13} color={colors.ink.muted} />
        <Txt size="tiny" tone="muted">
          {payments.today.orders} Orders
        </Txt>
        <Txt size="tiny" tone="faint">
          •
        </Txt>
        <Ionicons name="cube-outline" size={13} color={colors.ink.muted} />
        <Txt size="tiny" tone="muted">
          {payments.today.items} Items
        </Txt>
      </View>

      {/*
        Both buttons did nothing. There has been a withdrawal API all along -
        the app simply never called it.
      */}
      {/*
        Only the one button. "Payouts" led nowhere and had nothing to lead to -
        the payout requests are a tab on this same screen, just below.
      */}
      <View className="mt-3">
        <Button
          label={requesting ? "Requesting…" : "Request Payout"}
          icon="business-outline"
          accent="indigo"
          onPress={requestPayout}
        />
      </View>

      <Divider className="my-3" />

      <Pressable
        onPress={() => router.push("/bank-details")}
        accessibilityLabel="Payout account"
        className="flex-row items-center gap-2 active:opacity-70"
      >
        <Ionicons name="calendar-outline" size={16} color={colors.indigo[600]} />
        <View className="min-w-0 flex-1">
          <Txt size="tiny" tone="muted">
            Next Payout Date
          </Txt>
          <Txt size="sm" weight="bold" tone="indigo">
            {payments.nextPayoutDate}
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.ink.faint} />
      </Pressable>
    </Card>
  );
}

function BalanceTiles() {
  const { payments } = useStore();

  return (
    <View className="mt-3 flex-row flex-wrap gap-2.5 px-4">
      <StatTile
        icon="wallet-outline"
        tint="violet"
        label="Available Balance"
        value={money(payments.availableBalance)}
        footnote="Withdraw Now ›"
        footnoteTone="indigo"
        filled
        className="min-w-[46%] flex-1"
      />
      {/* Week and month come from the sales endpoint, so they are gross.
          Total is what the payout system recognises as the vendor's own,
          net of commission — labelling both "Earnings" would misread. */}
      <StatTile
        icon="albums-outline"
        tint="green"
        label="This Week Sales"
        value={money(payments.week.earnings)}
        footnote={`${payments.week.orders} Orders`}
        filled
        className="min-w-[46%] flex-1"
      />
      <StatTile
        icon="calendar-outline"
        tint="amber"
        label="This Month Sales"
        value={money(payments.month.earnings)}
        footnote={`${payments.month.orders} Orders`}
        filled
        className="min-w-[46%] flex-1"
      />
      <StatTile
        icon="stats-chart-outline"
        tint="blue"
        label="Your Earnings"
        value={money(payments.lifetime)}
        footnote="Net of commission"
        filled
        className="min-w-[46%] flex-1"
      />
    </View>
  );
}

function Breakup() {
  const { payments } = useStore();

  return (
    <Panel title="Settlement" subtitle="From the payout ledger" accent="indigo" className="mx-4 mt-3">
      <View className="px-4 pb-4">
        {payments.breakup.map((row) => (
          <View key={row.label} className="flex-row items-center justify-between py-1.5">
            <Txt size="sm" tone="soft" className="flex-1" numberOfLines={1}>
              {row.label}
            </Txt>
            <Txt size="sm" weight="medium" tone={row.value < 0 ? "bad" : "default"}>
              {row.value < 0 ? "- " : ""}
              {money(Math.abs(row.value))}
            </Txt>
          </View>
        ))}

        <View className="mt-2 flex-row items-center justify-between rounded-tile bg-ok-soft px-3 py-3">
          <Txt size="sm" weight="semibold" tone="ok">
            {payments.netLabel}
          </Txt>
          <Txt size="lg" weight="bold" tone="ok">
            {money(payments.net)}
          </Txt>
        </View>
      </View>
    </Panel>
  );
}

function Ledger() {
  const { payments } = useStore();
  const [tab, setTab] = React.useState<Tab>("transactions");
  const [period, setPeriod] = React.useState<PeriodKey>("30d");
  const [kind, setKind] = React.useState<string>("all");
  const [pickerOpen, setPickerOpen] = React.useState<null | "period" | "kind">(null);

  /** The types actually present, so the picker offers nothing that is absent. */
  const kinds = React.useMemo(
    () => ["all", ...Array.from(new Set(payments.transactions.map((entry) => entry.type)))],
    [payments.transactions]
  );

  const shown = React.useMemo(() => {
    const since = PERIODS[period].since();
    return payments.transactions.filter((entry) => {
      if (kind !== "all" && entry.type !== kind) return false;
      if (!since) return true;
      const at = new Date(entry.at).getTime();
      // A row whose date cannot be read is kept rather than silently dropped;
      // hiding a payout because its timestamp is odd is the worse mistake.
      return Number.isFinite(at) ? at >= since : true;
    });
  }, [payments.transactions, period, kind]);

  return (
    <Card className="mx-4 mt-3 overflow-hidden">
      {/* Tabs */}
      <View className="flex-row border-b border-line">
        {TABS.map((entry) => {
          const active = entry.id === tab;
          return (
            <Pressable
              key={entry.id}
              onPress={() => setTab(entry.id)}
              style={{ borderBottomColor: active ? colors.indigo[600] : "transparent" }}
              className="flex-1 items-center border-b-2 px-2 pb-2.5 pt-3 active:opacity-70"
            >
              <Txt
                size="tiny"
                weight={active ? "semibold" : "medium"}
                tone={active ? "indigo" : "muted"}
                numberOfLines={1}
              >
                {entry.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {/*
        The date range read "13 May - 19 May 2024" whatever the date was, and
        neither it nor the type selector nor the Filter button did anything -
        the list was always everything the API returned. The Filter button is
        gone; these two are the filter, and they work.
      */}
      <View className="flex-row gap-2 p-3">
        <SelectButton
          label={PERIODS[period].label}
          icon="calendar-outline"
          className="flex-[1.4]"
          onPress={() => setPickerOpen((open) => (open === "period" ? null : "period"))}
        />
        <SelectButton
          label={kind === "all" ? "All Types" : kind}
          className="flex-1"
          onPress={() => setPickerOpen((open) => (open === "kind" ? null : "kind"))}
        />
      </View>

      {pickerOpen === "period" && (
        <View className="mx-3 mb-2 overflow-hidden rounded-card border border-line">
          {(Object.keys(PERIODS) as PeriodKey[]).map((key, index) => (
            <Pressable
              key={key}
              onPress={() => {
                setPeriod(key);
                setPickerOpen(null);
              }}
              className={`flex-row items-center justify-between px-3 py-2.5 active:opacity-70 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <Txt size="sm" weight={period === key ? "bold" : "regular"}>
                {PERIODS[key].label}
              </Txt>
              {period === key && (
                <Ionicons name="checkmark" size={16} color={colors.brand[600]} />
              )}
            </Pressable>
          ))}
        </View>
      )}

      {pickerOpen === "kind" && (
        <View className="mx-3 mb-2 overflow-hidden rounded-card border border-line">
          {kinds.map((option, index) => (
            <Pressable
              key={option}
              onPress={() => {
                setKind(option);
                setPickerOpen(null);
              }}
              className={`flex-row items-center justify-between px-3 py-2.5 active:opacity-70 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <Txt size="sm" weight={kind === option ? "bold" : "regular"}>
                {option === "all" ? "All Types" : option}
              </Txt>
              {kind === option && (
                <Ionicons name="checkmark" size={16} color={colors.brand[600]} />
              )}
            </Pressable>
          ))}
        </View>
      )}

      {tab === "transactions" ? (
        <>
          {shown.length === 0 && (
            <Txt size="sm" tone="muted" className="border-t border-line px-3.5 py-6 text-center">
              Nothing in this period.
            </Txt>
          )}
          {shown.map((entry) => {
            const outgoing = entry.amount < 0;
            return (
              <View
                key={entry.id}
                className="flex-row items-center gap-3 border-t border-line px-3.5 py-3"
              >
                <View className="min-w-0 flex-1">
                  <Txt size="sm" weight="bold" numberOfLines={1}>
                    {entry.ref}
                  </Txt>
                  <Txt size="micro" tone="muted" numberOfLines={1}>
                    {entry.type} • {entry.sub}
                  </Txt>
                  <Txt size="micro" tone="faint" numberOfLines={1}>
                    {entry.at.replace("\n", ", ")}
                  </Txt>
                </View>
                <View className="items-end gap-1">
                  <Txt size="sm" weight="bold" tone={outgoing ? "bad" : "default"}>
                    {outgoing ? "- " : ""}
                    {money(Math.abs(entry.amount))}
                  </Txt>
                  <Badge
                    label={entry.status}
                    tone={entry.status === "Completed" ? "ok" : "info"}
                  />
                </View>
              </View>
            );
          })}

          <View className="items-center border-t border-line py-3">
            <ActionLink label="View All Transactions" accent="indigo" />
          </View>
        </>
      ) : (
        <View className="items-center gap-1 border-t border-line px-6 py-10">
          <Ionicons name="time-outline" size={26} color={colors.ink.faint} />
          <Txt weight="semibold" className="mt-1">
            Nothing yet
          </Txt>
          <Txt size="tiny" tone="muted" className="text-center">
            {tab === "history"
              ? "Settled payouts will be listed here."
              : "Payout requests you raise will appear here."}
          </Txt>
        </View>
      )}
    </Card>
  );
}

export default function VendorPayments() {
  const { payments } = useStore();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-indigo-900">
      <StatusBar style="light" />
      <ScrollView
        className="flex-1 bg-surface-sunken"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-6"
      >
        <IndigoHeader
          title="Payments"
          subtitle="Track earnings and manage payouts"
          leading="menu"
          right={<WalletChip balance={payments.walletBalance} />}
          overlap={26}
        />

        <TodayCard />
        <BalanceTiles />

        <Panel
          title="Earnings Overview"
          accent="indigo"
          right={<SelectButton label="This Week" className="w-[116px]" />}
          className="mx-4 mt-3"
        >
          <View className="px-4 pb-4">
            <Txt size="2xl" weight="bold">
              {money(payments.week.earnings)}
            </Txt>
            <View className="mt-3">
              <AreaChart data={payments.weekSeries} />
            </View>
            <View className="mt-3 items-center">
              <ActionLink label="View Full Report" accent="indigo" />
            </View>
          </View>
        </Panel>

        <Breakup />
        <Ledger />

        <PromoBanner
          title="Grow Your Earnings!"
          detail="Keep your menu updated and get more orders."
          action="Tips"
          accent="indigo"
          icon="trending-up"
          className="mx-4 mt-3"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
