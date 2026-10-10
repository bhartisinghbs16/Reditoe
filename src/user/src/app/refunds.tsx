import React from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
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
import { Photo } from "@/components/photo";
import { photoUri } from "@/lib/images";
import { accents, categoryTint } from "@/lib/theme";
import { refundReasons } from "@/lib/data";
import { useStore } from "@/lib/store";

/**
 * "Returns & Refunds", copied from the reference: the three-figure summary,
 * the refund assurance note, the reason picker, the recent request list with
 * its coloured status and amount, and the "How refunds work" explainer.
 */

const STATUS_TONE = {
  "Refund In Progress": { bg: "#fff8e6", fg: "#a75c07" },
  "Refund Completed": { bg: "#eefaf3", fg: "#0b7038" },
  "Request Received": { bg: "#eff5ff", fg: "#1d4ed8" },
} as const;

export default function RefundsScreen() {
  const { restaurantById, refundRequests, refundSummary, orders, requestRefund } =
    useStore();
  const router = useRouter();
  const [reason, setReason] = React.useState<string | null>(null);
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  /*
   * Only orders a refund can actually be raised against - paid for, and
   * finished one way or the other. The server decides which those are, so the
   * list here and the answer it gives cannot disagree.
   */
  const refundable = orders.filter(
    (order) =>
      order.canRequestRefund &&
      !refundRequests.some((request) => request.orderId === order.id)
  );

  const submit = async () => {
    if (!orderId || !reason) return;
    setSending(true);
    const result = await requestRefund({ orderId, reason });
    setSending(false);
    Alert.alert(result.ok ? "Request raised" : "Could not raise the request", result.message);
    if (result.ok) {
      setReason(null);
      setOrderId(null);
    }
  };

  /*
   * The customer's own refunds, counted by the server. This screen listed a
   * hard-coded set of four requests and counted those, so it reported the same
   * refunds to everybody - including customers who had never asked for one.
   */
  const completed = refundSummary?.completed ?? 0;
  const inProgress = refundSummary?.inProgress ?? 0;
  const raised = refundSummary?.raised ?? refundRequests.length;

  const summary = [
    { label: "Requests Raised", value: raised, icon: "cube" as const, accent: "amber" as const },
    { label: "Refunds Completed", value: completed, icon: "checkmark-circle" as const, accent: "green" as const },
    { label: "In Progress", value: inProgress, icon: "time" as const, accent: "purple" as const },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Returns & Refunds"
        subtitle="Easy returns, quick refunds"
        right={<HeaderAction icon="headset-outline" label="Help" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        {/* Summary */}
        <Card className="mx-4 mt-1 flex-row py-3">
          {summary.map((entry, index) => (
            <View
              key={entry.label}
              className={`flex-1 flex-row items-center gap-2 px-2 ${
                index > 0 ? "border-l border-line" : ""
              }`}
            >
              <IconTile icon={entry.icon} tint={accents[entry.accent]} size={36} />
              <View className="min-w-0 flex-1">
                <Txt size="micro" tone="muted" numberOfLines={2}>
                  {entry.label}
                </Txt>
                <Txt size="xl" weight="bold">
                  {String(entry.value).padStart(2, "0")}
                </Txt>
                {/* "View all" sat under each figure with no handler. Every
                    request is already listed in the card below this one. */}
              </View>
            </View>
          ))}
        </Card>

        <View className="mx-4 mt-4">
          <Note
            icon="shield-checkmark"
            tone="ok"
            title="100% Refund Assurance"
            detail="If your issue is valid, we ensure 100% refund"
            action="Know More"
          />
        </View>

        {/* Raise a request */}
        <Card className="mx-4 mt-4 p-3">
          <Txt size="lg" weight="bold">
            Raise a Return / Refund Request
          </Txt>
          <Txt size="tiny" tone="muted" className="mt-0.5">
            Select the reason for your issue
          </Txt>

          <View className="mt-4 flex-row">
            {refundReasons.map((entry) => {
              const active = reason === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => setReason(active ? null : entry.id)}
                  className="flex-1 items-center gap-1.5 px-0.5 active:opacity-70"
                >
                  <View
                    className={`rounded-full ${active ? "border-2 border-brand-500" : ""}`}
                  >
                    <IconTile icon={entry.icon} tint={accents[entry.accent]} size={52} />
                  </View>
                  {/* The data carries the reference's own line breaks; five
                      tiles across a phone need them. */}
                  <Txt
                    size="micro"
                    weight="semibold"
                    numberOfLines={3}
                    className="text-center"
                  >
                    {entry.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>

          {/*
            Picking a reason was as far as this went: the button had no
            handler, so the refund request could not be raised from the app at
            all. It asks which order next, because a refund is against one.
          */}
          {reason && (
            <>
              <Txt size="tiny" weight="bold" tone="muted" className="mt-4">
                WHICH ORDER?
              </Txt>

              {refundable.length === 0 ? (
                <Txt size="sm" tone="muted" className="mt-2">
                  None of your orders can be refunded. A refund can be raised
                  on an order you have paid for once it has been delivered or
                  cancelled.
                </Txt>
              ) : (
                <View className="mt-2 overflow-hidden rounded-card border border-line">
                  {refundable.map((order, index) => (
                    <Pressable
                      key={order.id}
                      onPress={() => setOrderId(order.id)}
                      className={`flex-row items-center justify-between px-3 py-3 active:opacity-70 ${
                        index > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <View className="min-w-0 flex-1">
                        <Txt size="sm" weight="semibold" numberOfLines={1}>
                          {restaurantById(order.restaurantId)?.name ?? "Order"}
                        </Txt>
                        <Txt size="tiny" tone="muted" numberOfLines={1}>
                          {order.code} · ₹{order.totals.toPay.toFixed(2)}
                        </Txt>
                      </View>
                      <Ionicons
                        name={orderId === order.id ? "radio-button-on" : "radio-button-off"}
                        size={19}
                        color={orderId === order.id ? colors.brand[600] : colors.line.strong}
                      />
                    </Pressable>
                  ))}
                </View>
              )}

              <Pressable
                onPress={submit}
                disabled={!orderId || sending}
                className={`mt-4 h-12 items-center justify-center rounded-tile ${
                  orderId && !sending ? "bg-brand-600 active:opacity-90" : "bg-line"
                }`}
              >
                <Txt weight="bold" tone="white">
                  {sending ? "Sending…" : "Raise refund request"}
                </Txt>
              </Pressable>
            </>
          )}
        </Card>

        {/* Recent requests */}
        <Card className="mx-4 mt-4 overflow-hidden">
          <SectionHead
            title="Your Recent Requests"
            action="View All"
            onAction={() => router.push("/orders")}
            className="px-3 pb-1 pt-3"
          />

          {refundRequests.length === 0 && (
            <View className="px-3 pb-4 pt-2">
              <Txt size="sm" tone="muted">
                You have not raised any refund requests.
              </Txt>
            </View>
          )}

          {refundRequests.map((request, index) => {
            const restaurant = restaurantById(request.orderId);
            const tone =
              STATUS_TONE[request.statusLabel as keyof typeof STATUS_TONE] ??
              STATUS_TONE["Request Received"];
            return (
              <React.Fragment key={request.id}>
                {index > 0 && <Divider />}
                <Pressable
                  onPress={() => router.push(`/order/${request.orderId}`)}
                  accessibilityLabel={`Open the order this refund is for`}
                  className="px-3 py-3 active:opacity-70"
                >
                  <View className="flex-row gap-3">
                    <Photo
                      uri={photoUri(restaurant, 200)}
                      width={56}
                      height={56}
                      radius={10}
                      tint={categoryTint(index)}
                    />

                    <View className="min-w-0 flex-1">
                      <Txt size="sm" weight="bold" numberOfLines={2}>
                        Order ID: {request.orderCode ?? request.orderId}
                      </Txt>
                      <Txt size="tiny" tone="muted" numberOfLines={1}>
                        {request.restaurantName ?? restaurant?.name ?? ""}
                      </Txt>
                      <Txt size="tiny" tone="muted" numberOfLines={1}>
                        {new Date(request.requestedAt).toLocaleDateString()}
                      </Txt>
                    </View>

                    <View className="w-[104px] items-end gap-1">
                      <View
                        style={{ backgroundColor: tone.bg }}
                        className="rounded-md px-1.5 py-1"
                      >
                        <Txt size="micro" weight="bold" style={{ color: tone.fg }}>
                          {request.statusLabel}
                        </Txt>
                      </View>
                      <Txt size="micro" tone="muted">
                        Refund Amount
                      </Txt>
                      <Txt size="sm" weight="bold" style={{ color: tone.fg }}>
                        ₹{Number(request.amount ?? 0).toFixed(2)}
                      </Txt>
                    </View>

                    <View className="justify-center">
                      <Ionicons name="chevron-forward" size={16} color={colors.ink.faint} />
                    </View>
                  </View>

                  <View className="mt-2 border-t border-line pt-2">
                    <Txt size="tiny" tone="soft">
                      Reason: {request.reason}
                    </Txt>
                    <Txt size="tiny" tone="muted">
                      {request.note}
                    </Txt>
                  </View>
                </Pressable>
              </React.Fragment>
            );
          })}
        </Card>

        <View className="mx-4 mt-4">
          <Note
            icon="information-circle"
            tone="plus"
            title="How Refunds Work?"
            detail="We review your request and process the refund to your original payment method or Reditoe Wallet."
            action="Learn More"
          />
        </View>

        <HelpFooter className="mx-4 mt-4" />
      </ScrollView>
    </SafeAreaView>
  );
}
