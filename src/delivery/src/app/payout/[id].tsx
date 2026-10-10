import React from "react";
import { Share, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActionLink,
  Badge,
  Button,
  DetailRow,
  Divider,
  EmptyState,
  IconPlate,
  NoteBar,
  Panel,
  Screen,
  Txt,
  colors,
} from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { PartnerCard } from "@/components/partner-card";
import { ProgressTrack } from "@/components/tracker";
import { money } from "@/lib/format";
import { docTone, type TintName } from "@/lib/theme";
import { useStore } from "@/lib/store";

/**
 * Payout to Bank, reproduced from the reference: the status header with its
 * six facts and the four-stop tracker, the breakdown that arrives at the
 * transferred figure, the bank on file, the transaction facts, and the help
 * note with the receipt actions beneath it.
 *
 * The total and the transferred figure are computed from the line items rather
 * than stored, so the arithmetic on screen can never drift from the data.
 */

/** Where the money has got to — drives the tracker. */
const STATUS_STEP: Record<string, number> = { Processing: 1, Success: 3, Failed: 1 };

function Facts({
  items,
}: {
  items: { label: string; value: string; note?: string; node?: React.ReactNode }[];
}) {
  return (
    <View className="flex-row">
      {items.map((item, index) => (
        <View
          key={item.label}
          className={`flex-1 px-3 ${index > 0 ? "border-l border-line" : ""}`}
        >
          <Txt size="tiny" tone="muted" numberOfLines={1}>
            {item.label}
          </Txt>
          {item.node ?? (
            <Txt size="sm" weight="semibold" className="mt-1" numberOfLines={2}>
              {item.value}
            </Txt>
          )}
          {item.note && (
            <Txt size="tiny" tone="muted">
              {item.note}
            </Txt>
          )}
        </View>
      ))}
    </View>
  );
}

export default function PayoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { rider, payouts } = useStore();

  const payout = payouts.find((p) => p.id === id);

  if (!payout) {
    return (
      <Screen>
        <ScreenHeader title="Payout to Bank" trailing="none" />
        <EmptyState
          icon="business-outline"
          title="Payout not found"
          detail="Open Payout Summary to see every settlement on your account."
          action="Payout Summary"
          onAction={() => router.replace("/payout-summary")}
        />
      </Screen>
    );
  }

  const gross = payout.breakdown.reduce((sum, line) => sum + line.amount, 0);
  const net = gross - payout.charges;
  const step = STATUS_STEP[payout.status] ?? 0;

  return (
    <Screen>
      <ScreenHeader title="Payout to Bank" />

      <View className="gap-3.5 px-4 pt-3.5">
        <PartnerCard />

        <Panel bodyClassName="pb-4">
          <View className="pt-4">
            <Facts
              items={[
                {
                  label: "Payout Status",
                  value: payout.status,
                  node: (
                    <View className="mt-1">
                      <Badge
                        label={payout.status}
                        tone={docTone[payout.status] ?? "neutral"}
                      />
                    </View>
                  ),
                },
                { label: "Payout ID", value: payout.id },
                { label: "Initiated On", value: payout.initiatedAt },
              ]}
            />
          </View>

          <Divider className="my-4" />

          <Facts
            items={[
              {
                label: "Payout Amount",
                value: money(net),
                node: (
                  <Txt size="xl" weight="bold" tone="green" className="mt-1">
                    {money(net)}
                  </Txt>
                ),
              },
              {
                label: "Expected In Bank",
                value: payout.expected,
                note: payout.expectedDay,
              },
              { label: "Reference ID", value: payout.reference },
            ]}
          />

          <Divider className="my-4" />

          <View className="px-3">
            <ProgressTrack
              current={step}
              steps={[
                { label: "Initiated", icon: "business", at: payout.initiatedAt },
                { label: "Processing", icon: "time", at: payout.processingAt },
                { label: "Sent to Bank", icon: "swap-horizontal" },
                { label: "Credited", icon: "checkmark-circle" },
              ]}
            />
          </View>
        </Panel>

        <Panel title="Payout Breakdown" bodyClassName="px-4 pb-4">
          {payout.breakdown.map((line, index) => (
            <View
              key={line.label}
              className={`flex-row items-center gap-3 py-2.5 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <IconPlate
                icon={line.icon as keyof typeof Ionicons.glyphMap}
                tint={line.tint as TintName}
                size={32}
              />
              <Txt size="sm" tone="soft" className="flex-1">
                {line.label}
              </Txt>
              <Txt weight="semibold">{money(line.amount)}</Txt>
            </View>
          ))}

          <View className="mt-2 border-t border-dashed border-line pt-3">
            <View className="flex-row items-center justify-between">
              <Txt weight="semibold">Total Earnings</Txt>
              <Txt weight="bold">{money(gross)}</Txt>
            </View>

            <View className="mt-2.5 flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Txt size="sm" tone="soft">
                  Payout Charges
                </Txt>
                <Ionicons name="information-circle-outline" size={14} color={colors.ink.faint} />
              </View>
              <Txt weight="semibold" tone="bad">
                − {money(payout.charges)}
              </Txt>
            </View>
          </View>

          <View
            style={{ backgroundColor: "#edf9f1" }}
            className="mt-3 flex-row items-center justify-between rounded-tile px-3 py-3"
          >
            <Txt weight="bold" tone="green">
              Payout to Bank
            </Txt>
            <Txt size="lg" weight="bold" tone="green">
              {money(net)}
            </Txt>
          </View>
        </Panel>

        <NoteBar
          tone="green"
          icon="shield-checkmark"
          detail="TDS is deducted as per the Income Tax Act and will be shown in your Form 16."
        />

        <Panel
          title="Bank Details"
          action="View / Change Bank"
          accent="green"
          bodyClassName="px-4 pb-4"
        >
          <View className="flex-row items-center gap-3">
            <IconPlate icon="business" tint="blue" size={44} />
            <View className="min-w-0 flex-1">
              <Txt weight="bold">{rider.bank.name}</Txt>
              <Txt size="tiny" tone="muted">
                A/c No. {rider.bank.accountMasked}
              </Txt>
              <Txt size="tiny" tone="muted">
                IFSC: {rider.bank.ifsc}
              </Txt>
              <Txt size="tiny" tone="muted">
                Account Holder Name: {rider.bank.holder}
              </Txt>
            </View>
          </View>
        </Panel>

        <Panel title="Transaction Details" bodyClassName="pb-2">
          {[
            { label: "Transaction Type", value: "Payout to Bank" },
            { label: "Payment Method", value: payout.method },
            { label: "Batch ID", value: payout.batch },
            { label: "Remarks", value: payout.remarks },
          ].map((row, index) => (
            <View key={row.label}>
              {index > 0 && <Divider />}
              <DetailRow label={row.label} value={row.value} />
            </View>
          ))}
        </Panel>

        <NoteBar
          tone="blue"
          icon="information-circle"
          title="Need Help?"
          detail="If your payout is delayed or failed, please contact our support team."
          right={
            <View className="rounded-tile border border-info px-3 py-2">
              <ActionLink label="Contact Support" accent="info" icon="none" />
            </View>
          }
        />

        {/*
          Both had no handler. "Download Receipt" is gone — the API has no
          receipt file to hand over — and sharing now sends the payout's own
          figures, which is what somebody wants it for.
        */}
        <Button
          label="Share Details"
          variant="outline"
          accent="info"
          icon="share-social-outline"
          onPress={() =>
            Share.share({
              message: [
                `Reditoe payout ${payout.id}`,
                `Status: ${payout.status}`,
                `Gross: ₹${gross.toFixed(2)}`,
                `Charges: ₹${payout.charges.toFixed(2)}`,
                `Net paid: ₹${net.toFixed(2)}`,
              ].join("\n"),
            })
          }
        />

        <Button
          label="Next Payout Summary"
          size="lg"
          iconRight="chevron-forward"
          onPress={() => router.replace("/payout-summary")}
        />
      </View>
    </Screen>
  );
}
