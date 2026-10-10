import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DashedRule, Txt, colors } from "@/components/ui";
import { currency } from "@/lib/format";
import type { Totals } from "@/lib/store";

/**
 * The bill breakdown. Used on the cart, payment and order screens from one
 * component so the customer sees the same arithmetic every time.
 *
 * Row labels, icons and order are copied from the reference's "Bill Details"
 * block, including the info glyphs on the fee lines.
 */

const ROWS = [
  { key: "itemTotal", label: "Item Total", icon: "basket-outline" as const, info: false },
  {
    key: "packaging",
    label: "Restaurant Packaging Fee",
    icon: "cube-outline" as const,
    info: true,
  },
  { key: "delivery", label: "Delivery Fee", icon: "bicycle-outline" as const, info: true },
  {
    key: "platformFee",
    label: "Platform Fee",
    icon: "business-outline" as const,
    info: true,
  },
  { key: "taxes", label: "GST & Charges", icon: "receipt-outline" as const, info: true },
] as const;

export function BillBreakdown({
  totals,
  totalLabel = "To Pay",
  showIcons = true,
  deliveryStruckFrom,
}: {
  totals: Totals;
  totalLabel?: string;
  showIcons?: boolean;
  /** Original delivery fee, so a waived one reads as struck through. */
  deliveryStruckFrom?: number;
}) {
  return (
    <View>
      {ROWS.map((row) => {
        const value = totals[row.key];
        const waived =
          row.key === "delivery" && value === 0 && totals.itemTotal > 0;

        return (
          <View
            key={row.key}
            className="flex-row items-center justify-between py-[5px]"
          >
            <View className="min-w-0 flex-1 flex-row items-center gap-2">
              {showIcons && (
                <Ionicons name={row.icon} size={15} color={colors.ink.muted} />
              )}
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <Txt size="sm" tone="soft">
                    {row.label}
                  </Txt>
                  {row.info && (
                    <Ionicons
                      name="information-circle-outline"
                      size={13}
                      color={colors.ink.faint}
                    />
                  )}
                </View>
                {row.key === "delivery" && totals.distanceKmUsed != null && totals.itemTotal > 0 && (
                  <Txt size="micro" tone="muted" className="mt-0.5">
                    Distance-based • {totals.distanceKmUsed.toFixed(1)} km
                  </Txt>
                )}
              </View>
            </View>

            {waived ? (
              <View className="flex-row items-center gap-1.5">
                {deliveryStruckFrom ? (
                  <Txt size="tiny" tone="faint" className="line-through">
                    {currency(deliveryStruckFrom)}
                  </Txt>
                ) : null}
                <Txt size="sm" weight="bold" tone="ok">
                  FREE
                </Txt>
              </View>
            ) : (
              <Txt size="sm" weight="medium">
                {currency(value)}
              </Txt>
            )}
          </View>
        );
      })}

      {totals.discount > 0 && (
        <View className="flex-row items-center justify-between py-[5px]">
          <View className="flex-row items-center gap-2">
            {showIcons && (
              <Ionicons name="pricetag-outline" size={15} color={colors.ok.default} />
            )}
            <Txt size="sm" tone="ok">
              Coupon Discount
            </Txt>
          </View>
          <Txt size="sm" weight="bold" tone="ok">
            −{currency(totals.discount)}
          </Txt>
        </View>
      )}

      <DashedRule className="my-3" />

      <View className="flex-row items-center justify-between">
        <Txt size="lg" weight="bold">
          {totalLabel}
        </Txt>
        <Txt size="lg" weight="bold">
          {currency(totals.toPay)}
        </Txt>
      </View>

      {totals.saved > 0 && (
        <View className="mt-2 flex-row items-center gap-1.5">
          <Ionicons name="pricetag" size={14} color={colors.ok.default} />
          <Txt size="tiny" weight="semibold" tone="ok">
            You saved {currency(totals.saved)} on this order
          </Txt>
        </View>
      )}
    </View>
  );
}

/** Label/value pairs without icons — the compact bill on order screens. */
export function BillLines({
  totals,
  totalLabel = "Total Paid",
}: {
  totals: Totals;
  totalLabel?: string;
}) {
  const rows = [
    ["Item Total", totals.itemTotal],
    ["Delivery Fee", totals.delivery],
    ["Platform Fee", totals.platformFee],
    ["GST & Charges", totals.taxes],
  ] as const;

  return (
    <View>
      {rows.map(([label, value]) => (
        <View key={label} className="flex-row items-center justify-between py-[5px]">
          <Txt size="sm" tone="soft">
            {label}
          </Txt>
          <Txt size="sm" weight="medium">
            {currency(value)}
          </Txt>
        </View>
      ))}

      <DashedRule className="my-3" />

      <View className="flex-row items-center justify-between">
        <Txt weight="bold">{totalLabel}</Txt>
        <Txt size="lg" weight="bold">
          {currency(totals.toPay)}
        </Txt>
      </View>
    </View>
  );
}
