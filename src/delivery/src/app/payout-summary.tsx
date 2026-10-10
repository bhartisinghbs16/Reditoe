import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActionLink,
  Badge,
  Button,
  IconPlate,
  NoteBar,
  Panel,
  Screen,
  StatCell,
  ToolButton,
  Txt,
  colors,
} from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { PartnerCard } from "@/components/partner-card";
import { money } from "@/lib/format";
import { docTone } from "@/lib/theme";
import { useStore } from "@/lib/store";

/**
 * Payout Summary, reproduced from the reference: the next payout and its date,
 * the four-figure overview, the payout history, the bank on file, and the note
 * explaining the weekly settlement.
 */

export default function PayoutSummary() {
  const router = useRouter();
  const { rider, payouts, payoutTotals } = useStore();
  const next = payouts.at(0);

  const overview = [
    { icon: "business" as const, tint: "green" as const, label: "Total Payouts", value: money(payoutTotals.total) },
    { icon: "trending-up" as const, tint: "blue" as const, label: "Successful Payouts", value: money(payoutTotals.success) },
    { icon: "time" as const, tint: "amber" as const, label: "Processing", value: money(payoutTotals.processing) },
    { icon: "close-circle" as const, tint: "violet" as const, label: "Failed / Cancelled", value: money(payoutTotals.failed) },
  ];

  return (
    <Screen>
      <ScreenHeader title="Payout Summary" />

      <View className="gap-3.5 px-4 pt-3.5">
        <PartnerCard />

        {next && (
        <View
          style={{ backgroundColor: "#edf9f1", borderColor: "#cdebd8" }}
          className="flex-row items-center gap-2.5 rounded-card border p-4"
        >
          <View className="min-w-0 flex-1">
            <Txt size="tiny" tone="soft" numberOfLines={1}>
              Next Payout Amount
            </Txt>
            <Txt size="xl" weight="bold" tone="green" className="mt-1" numberOfLines={1}>
              {money(next.amount)}
            </Txt>
          </View>

          <View className="h-12 w-px bg-green-100" />

          <View className="min-w-0 flex-1">
            <Txt size="tiny" tone="soft" numberOfLines={1}>
              Expected On
            </Txt>
            <View className="mt-1 flex-row items-center gap-1">
              <Ionicons name="calendar-outline" size={14} color={colors.info.default} />
              <Txt size="sm" weight="bold" numberOfLines={1}>
                {next.expected}
              </Txt>
            </View>
            <Txt size="micro" tone="muted">
              {next.expectedDay}
            </Txt>
          </View>

          <Button
            label="View Earnings"
            variant="outline"
            size="sm"
            onPress={() => router.push("/earnings")}
          />
        </View>
        )}

        <Panel title="Payout Overview" bodyClassName="flex-row px-2 pb-4">
          {overview.map((cell, index) => (
            <StatCell key={cell.label} {...cell} valueSize="sm" divided={index > 0} />
          ))}
        </Panel>

        <Panel
          title="Payout History"
          right={<ToolButton label="Filter" icon="funnel-outline" className="h-9 px-3" />}
          bodyClassName="pb-1"
        >
          {payouts.map((payout, index) => (
            <Pressable
              key={payout.id}
              onPress={() => router.push(`/payout/${payout.id}` as never)}
              className={`flex-row items-center gap-2 px-3.5 py-3 active:opacity-80 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <IconPlate icon="business" tint="green" size={34} />

              {/* Four columns across a phone, so the type runs a step down
                  from the rest of the app — as the reference sets it. */}
              <View className="min-w-0 flex-[1.05]">
                <Txt size="sm" weight="semibold" numberOfLines={1}>
                  Payout to Bank
                </Txt>
                <Txt size="micro" tone="muted" numberOfLines={1}>
                  A/c No. {rider.bank.accountMasked || "Not added"}
                </Txt>
              </View>

              <View className="min-w-0 flex-[1.15]">
                <Txt size="micro" weight="semibold" numberOfLines={1}>
                  {payout.id}
                </Txt>
                <Txt size="micro" tone="muted" numberOfLines={2}>
                  {payout.at}
                </Txt>
              </View>

              <View className="items-end gap-1">
                <Txt size="sm" weight="bold" numberOfLines={1}>
                  {money(payout.amount)}
                </Txt>
                <Badge label={payout.status} tone={docTone[payout.status] ?? "neutral"} />
              </View>

              <Ionicons name="chevron-forward" size={15} color={colors.ink.faint} />
            </Pressable>
          ))}
        </Panel>

        <Panel
          title="Payout Bank Details"
          action="Update"
          accent="green"
          actionIcon="none"
          right={<Ionicons name="create-outline" size={15} color={colors.green[600]} />}
          bodyClassName="px-4 pb-4"
        >
          <View className="flex-row items-center gap-3">
            <IconPlate icon="business" tint="blue" size={44} />

            <View className="min-w-0 flex-1">
              <Txt weight="bold" numberOfLines={1}>
                {rider.bank.name}
              </Txt>
              <Txt size="tiny" tone="muted">
                A/c No. {rider.bank.accountMasked || "Not added"}
              </Txt>
              <Txt size="tiny" tone="muted">
                IFSC: {rider.bank.ifsc}
              </Txt>
              <Txt size="tiny" tone="muted">
                Account Holder Name: {rider.bank.holder || "Not added"}
              </Txt>
            </View>

            <View className="rounded-tile border border-green-500 px-3 py-2">
              <ActionLink label="View / Change Bank" accent="green" size="tiny" />
            </View>
          </View>
        </Panel>

        <NoteBar
          tone="blue"
          icon="information-circle"
          title="How Payout Works?"
          detail="Your earnings are settled every week. Once the payout is processed, the amount will be transferred to your bank account within 1–2 working days."
        />
      </View>
    </Screen>
  );
}
