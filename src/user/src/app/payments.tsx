import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  Divider,
  HelpFooter,
  IconTile,
  Note,
  SectionHead,
  Txt,
  colors,
} from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { accents } from "@/lib/theme";
import { currency } from "@/lib/format";
import { useStore } from "@/lib/store";

/**
 * "Payment & Refunds", copied from the reference: the security note, the four
 * quick-action boxes, the saved payment methods with their Manage link, and
 * the recent payments list with its paid/refunded column.
 */

const QUICK_ACTIONS = [
  {
    icon: "document-text-outline" as const,
    title: "View Invoices",
    detail: "Download bills",
    accent: "red" as const,
  },
  {
    icon: "time-outline" as const,
    title: "Refund Status",
    detail: "Check refunds",
    accent: "purple" as const,
    href: "/refunds",
  },
  {
    icon: "card-outline" as const,
    title: "Saved Cards",
    detail: "Manage cards",
    accent: "blue" as const,
  },
  {
    icon: "shield-checkmark-outline" as const,
    title: "UPI ID",
    detail: "Manage UPI",
    accent: "amber" as const,
  },
];

/** How the stored paymentMethod values read on screen. */
const METHOD_LABELS: Record<string, { label: string; short: string }> = {
  razorpay: { label: "Razorpay", short: "RZP" },
  cashfree: { label: "Cashfree", short: "CF" },
  wallet: { label: "Reditoe Money", short: "WLT" },
  cod: { label: "Cash on Delivery", short: "COD" },
  UPI: { label: "UPI", short: "UPI" },
};

export default function PaymentsScreen() {
  const { orders, restaurantById } = useStore();

  /*
   * What this customer has actually paid with, newest first.
   *
   * This screen listed a saved Visa, a Mastercard and a UPI handle belonging
   * to "mohan@ibl" - the same three for every customer, none of them real.
   * Card details live with Razorpay rather than here, so there is no saved
   * card to show; what can honestly be listed is the methods their own paid
   * orders went through.
   */
  const paid = orders.filter(
    (order) => order.paymentMethod && order.status !== "Payment Pending"
  );

  const methodsUsed = React.useMemo(() => {
    const seen = new Map<string, { method: string; count: number; last: string }>();
    for (const order of paid) {
      const key = order.paymentMethod;
      const existing = seen.get(key);
      seen.set(key, {
        method: key,
        count: (existing?.count ?? 0) + 1,
        last: existing?.last ?? order.placedAt,
      });
    }
    return [...seen.values()];
  }, [paid]);
  const router = useRouter();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Payment & Refunds"
        subtitle="All your payments and refunds"
        right={<HeaderAction icon="headset-outline" label="Help" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <View className="mx-4 mt-1">
          <Note
            icon="lock-closed"
            tone="ok"
            title="100% Secure Payments"
            detail="All transactions are encrypted and secure"
            action="Learn More"
          />
        </View>

        {/* Quick actions */}
        <Card className="mx-4 mt-4 p-3">
          <Txt size="lg" weight="bold">
            Quick Actions
          </Txt>
          <View className="mt-3 flex-row gap-2.5">
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.title}
                onPress={() => action.href && router.push(action.href as never)}
                className="min-w-0 flex-1 items-center gap-1.5 rounded-card border border-line px-1 py-3 active:opacity-70"
              >
                <IconTile icon={action.icon} tint={accents[action.accent]} size={44} />
                <Txt size="micro" weight="bold" numberOfLines={2} className="text-center">
                  {action.title}
                </Txt>
                <Txt size="micro" tone="muted" numberOfLines={2} className="text-center">
                  {action.detail}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Payment methods */}
        <Card className="mx-4 mt-4 p-3">
          <SectionHead title="Payment Methods" action="Manage" onAction={() => {}} />

          {methodsUsed.length === 0 ? (
            <Txt size="sm" tone="muted" className="mt-3">
              You have not completed a payment yet.
            </Txt>
          ) : (
            <View className="mt-3 overflow-hidden rounded-card border border-line">
              {methodsUsed.map((entry, index) => (
                <React.Fragment key={entry.method}>
                  {index > 0 && <Divider />}
                  <View className="flex-row items-center gap-3 px-3 py-3">
                    <View className="h-9 w-14 items-center justify-center rounded-md border border-line bg-surface">
                      <Txt size="micro" weight="bold" tone="soft">
                        {METHOD_LABELS[entry.method]?.short ??
                          entry.method.slice(0, 4).toUpperCase()}
                      </Txt>
                    </View>

                    <View className="min-w-0 flex-1">
                      <Txt weight="semibold" numberOfLines={1}>
                        {METHOD_LABELS[entry.method]?.label ?? entry.method}
                      </Txt>
                      <Txt size="tiny" tone="muted">
                        {entry.count === 1 ? "Used once" : `Used ${entry.count} times`}
                      </Txt>
                    </View>
                  </View>
                </React.Fragment>
              ))}
            </View>
          )}
        </Card>

        {/* Recent payments */}
        <Card className="mx-4 mt-4 overflow-hidden">
          <SectionHead
            title="Recent Payments"
            action="View All"
            onAction={() => router.push("/orders")}
            className="px-3 pb-1 pt-3"
          />

          {paid.length === 0 && (
            <Txt size="sm" tone="muted" className="px-3 pb-3 pt-1">
              Your payments will appear here once you have ordered.
            </Txt>
          )}

          {paid.slice(0, 10).map((order, index) => {
            const refunded = order.status === "Refunded";
            return (
              <React.Fragment key={order.id}>
                {index > 0 && <Divider className="ml-14" />}
                <Pressable
                  onPress={() => router.push(`/order/${order.id}`)}
                  className="flex-row items-center gap-3 px-3 py-3 active:opacity-70"
                >
                  <IconTile
                    icon={refunded ? "refresh-circle-outline" : "bag-handle"}
                    tint={refunded ? accents.green : accents.red}
                    size={38}
                  />
                  <View className="min-w-0 flex-1">
                    <Txt weight="semibold" numberOfLines={1}>
                      {restaurantById(order.restaurantId)?.name ?? "Order"}
                    </Txt>
                    <Txt size="tiny" tone="muted" numberOfLines={1}>
                      Order ID: {order.code} ·{" "}
                      {new Date(order.placedAt).toLocaleDateString()}
                    </Txt>
                  </View>
                  <View className="items-end">
                    <Txt size="sm" weight="bold" tone={refunded ? "ok" : "default"}>
                      {refunded ? "+ " : ""}₹{order.totals.toPay.toFixed(2)}
                    </Txt>
                    <Txt size="tiny" weight="semibold" tone="ok">
                      {order.status}
                    </Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink.faint} />
                </Pressable>
              </React.Fragment>
            );
          })}
        </Card>

        <HelpFooter
          detail="We're here to help you with payment related issues"
          className="mx-4 mt-4"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
