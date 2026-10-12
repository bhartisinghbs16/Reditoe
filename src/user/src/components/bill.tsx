import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DashedRule, Txt, colors } from "@/components/ui";
import { currencyExact } from "@/lib/format";
import type { Totals } from "@/lib/store";

/**
 * The bill breakdown. Used on the cart, payment and order screens from one
 * component so the customer sees the same arithmetic every time.
 *
 * Row labels, icons and order are copied from the reference's "Bill Details"
 * block, including the info glyphs on the fee lines.
 *
 * Every figure is shown to the paisa and the rows add up exactly:
 *
 *   Net Payable = charges - coupon discount - Reditoe Money
 *
 * Whole-rupee display used to hide the paise the server charges, so a bill
 * could print lines that did not sum to the total beneath them.
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

/** The money going off the bill, in the order it comes off. */
function deductions(totals: Totals) {
  const out: { key: string; label: string; value: number; icon: "pricetag-outline" | "wallet-outline" }[] = [];
  if (totals.discount > 0) {
    out.push({
      key: "discount",
      label: totals.couponCode
        ? `Coupon Discount (${totals.couponCode})`
        : "Coupon Discount",
      value: totals.discount,
      icon: "pricetag-outline",
    });
  }
  if ((totals.walletUsed ?? 0) > 0) {
    out.push({
      key: "wallet",
      label: "Reditoe Money",
      value: totals.walletUsed ?? 0,
      icon: "wallet-outline",
    });
  }
  return out;
}

/** A coupon was chosen and the server says it is not taking anything off. */
function CouponNotice({ totals }: { totals: Totals }) {
  if (!totals.couponError) return null;
  return (
    <View className="mt-1 flex-row items-start gap-1.5 py-[3px]">
      <Ionicons name="alert-circle-outline" size={14} color={colors.warn.default} />
      <Txt size="tiny" tone="warn" className="min-w-0 flex-1">
        Coupon not applied: {totals.couponError}
      </Txt>
    </View>
  );
}

export function BillBreakdown({
  totals,
  totalLabel = "Net Payable",
  showIcons = true,
  deliveryStruckFrom,
}: {
  totals: Totals;
  totalLabel?: string;
  showIcons?: boolean;
  /** Original delivery fee, so a waived one reads as struck through. */
  deliveryStruckFrom?: number;
}) {
  const taken = deductions(totals);
  const tip = totals.tip ?? 0;

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
                    {currencyExact(deliveryStruckFrom)}
                  </Txt>
                ) : null}
                <Txt size="sm" weight="bold" tone="ok">
                  FREE
                </Txt>
              </View>
            ) : (
              <Txt size="sm" weight="medium">
                {currencyExact(value)}
              </Txt>
            )}
          </View>
        );
      })}

      {tip > 0 && (
        <View className="flex-row items-center justify-between py-[5px]">
          <Txt size="sm" tone="soft">
            Tip
          </Txt>
          <Txt size="sm" weight="medium">
            {currencyExact(tip)}
          </Txt>
        </View>
      )}

      {/* The bill before anything comes off it, so the deductions below have
          something to be taken from. Only shown when something is. */}
      {taken.length > 0 && totals.grossTotal != null && (
        <>
          <DashedRule className="my-2" />
          <View className="flex-row items-center justify-between py-[5px]">
            <Txt size="sm" weight="semibold">
              Bill Total
            </Txt>
            <Txt size="sm" weight="semibold">
              {currencyExact(totals.grossTotal)}
            </Txt>
          </View>
        </>
      )}

      {taken.map((row) => (
        <View
          key={row.key}
          className="flex-row items-center justify-between py-[5px]"
        >
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            {showIcons && (
              <Ionicons name={row.icon} size={15} color={colors.ok.default} />
            )}
            <Txt size="sm" tone="ok" numberOfLines={1} className="min-w-0 flex-shrink">
              {row.label}
            </Txt>
          </View>
          <Txt size="sm" weight="bold" tone="ok">
            −{currencyExact(row.value)}
          </Txt>
        </View>
      ))}

      <CouponNotice totals={totals} />

      <DashedRule className="my-3" />

      <View className="flex-row items-center justify-between">
        <Txt size="lg" weight="bold">
          {totalLabel}
        </Txt>
        <Txt size="lg" weight="bold">
          {currencyExact(totals.toPay)}
        </Txt>
      </View>

      {totals.saved > 0 && (
        <View className="mt-2 flex-row items-center gap-1.5">
          <Ionicons name="pricetag" size={14} color={colors.ok.default} />
          <Txt size="tiny" weight="semibold" tone="ok">
            You saved {currencyExact(totals.saved)} on this order
          </Txt>
        </View>
      )}
    </View>
  );
}

/**
 * Label/value pairs without icons - the compact bill on order screens.
 *
 * The same rows, in the same order, with the same deductions as
 * `BillBreakdown`. This one used to leave out packaging, the coupon discount
 * and Reditoe Money, so a placed order's bill did not add up to the amount
 * charged.
 */
export function BillLines({
  totals,
  totalLabel = "Net Payable",
}: {
  totals: Totals;
  totalLabel?: string;
}) {
  const tip = totals.tip ?? 0;
  const taken = deductions(totals);
  const rows: { key: string; label: string; value: number; negative?: boolean }[] = [
    { key: "itemTotal", label: "Item Total", value: totals.itemTotal },
    { key: "packaging", label: "Restaurant Packaging Fee", value: totals.packaging },
    { key: "delivery", label: "Delivery Fee", value: totals.delivery },
    { key: "platformFee", label: "Platform Fee", value: totals.platformFee },
    { key: "taxes", label: "GST & Charges", value: totals.taxes },
    ...(tip > 0 ? [{ key: "tip", label: "Tip", value: tip }] : []),
    ...taken.map((row) => ({
      key: row.key,
      label: row.label,
      value: row.value,
      negative: true,
    })),
  ];

  return (
    <View>
      {rows.map((row) => (
        <View key={row.key} className="flex-row items-center justify-between py-[5px]">
          <Txt size="sm" tone={row.negative ? "ok" : "soft"} className="min-w-0 flex-1">
            {row.label}
          </Txt>
          <Txt size="sm" weight="medium" tone={row.negative ? "ok" : "default"}>
            {row.negative ? "−" : ""}
            {currencyExact(row.value)}
          </Txt>
        </View>
      ))}

      <DashedRule className="my-3" />

      <View className="flex-row items-center justify-between">
        <Txt weight="bold">{totalLabel}</Txt>
        <Txt size="lg" weight="bold">
          {currencyExact(totals.toPay)}
        </Txt>
      </View>
    </View>
  );
}
