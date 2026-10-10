import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageBar } from "@/components/screen-header";
import { Photo } from "@/components/photo";
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  IconButton,
  IconPlate,
  Panel,
  Txt,
  colors,
} from "@/components/ui";
import QRCode from "react-native-qrcode-svg";
import { ago, money, time } from "@/lib/format";
import { usePickupCode } from "@/lib/pickup";
import { img } from "@/lib/images";
import { categoryTint, stageStyle } from "@/lib/theme";
import {
  NEXT_STAGE,
  estimatedDelivery,
  orderTotals,
  useStore,
  type OrderStage,
  type VendorOrder,
} from "@/lib/store";
import { callNumber } from "@/lib/call";

/**
 * Order Details — a copy of the reference detail screen: the three-part
 * summary, the lifecycle timeline, the itemised bill, the three context cards
 * and the action bar.
 *
 * The reference runs its timeline and its context cards horizontally on a wide
 * canvas. Both are laid out vertically here; five timeline nodes with
 * timestamps cannot be read side by side at phone width.
 */

const STEPS: { label: string; icon: keyof typeof Ionicons.glyphMap; offset: number }[] = [
  { label: "Order Placed", icon: "bag-check-outline", offset: 0 },
  { label: "Confirmed", icon: "checkmark", offset: 1 },
  { label: "Preparing", icon: "restaurant-outline", offset: 9 },
  { label: "Out for Delivery", icon: "bicycle-outline", offset: 19 },
  { label: "Delivered", icon: "home-outline", offset: 34 },
];

/** How far down the five steps a given stage has reached. */
function reachedCount(stage: OrderStage): number {
  const reached: Record<OrderStage, number> = {
    new: 1,
    preparing: 3,
    ready: 3,
    picked: 4,
    delivered: 5,
    cancelled: 1,
  };
  return reached[stage];
}

function Timeline({ order }: { order: VendorOrder }) {
  const reached = reachedCount(order.stage);
  const placed = new Date(order.placedAt).getTime();

  return (
    <View className="px-4 pb-1">
      {STEPS.map((step, index) => {
        const done = index < reached;
        const last = index === STEPS.length - 1;
        const at = new Date(placed + step.offset * 60_000);

        return (
          <View key={step.label} className="flex-row gap-3">
            <View className="items-center">
              <View
                style={{ backgroundColor: done ? colors.ok.default : "#eef1f6" }}
                className="h-8 w-8 items-center justify-center rounded-full"
              >
                <Ionicons
                  name={step.icon}
                  size={16}
                  color={done ? "#ffffff" : colors.ink.faint}
                />
              </View>
              {!last && (
                <View
                  style={{ backgroundColor: index + 1 < reached ? colors.ok.default : colors.line.default }}
                  className="w-0.5 flex-1"
                />
              )}
            </View>

            <View className={`min-w-0 flex-1 ${last ? "pb-1" : "pb-4"}`}>
              <Txt
                size="sm"
                weight="semibold"
                tone={done ? "ok" : "muted"}
                numberOfLines={1}
              >
                {step.label}
              </Txt>
              <Txt size="micro" tone="faint">
                {done ? `18 May, ${time(at)}` : "Pending"}
              </Txt>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SummaryCard({ order }: { order: VendorOrder }) {
  const stage = stageStyle[order.stage];
  const totals = orderTotals(order);
  const eta = estimatedDelivery(order);
  const minutesLeft = Math.round((eta.getTime() - Date.now()) / 60_000);
  const cod = order.payment === "COD";

  return (
    <Card className="mx-4 mt-3 p-4">
      <Badge label={stage.short} tone={badgeTone(order.stage)} />

      <Txt size="tiny" tone="muted" className="mt-2.5">
        Order ID
      </Txt>
      <Txt size="2xl" weight="bold">
        #{order.reference}
      </Txt>
      <Txt size="tiny" tone="muted" className="mt-0.5">
        18 May 2024, {time(order.placedAt)}
      </Txt>
      <View className="mt-1.5 self-start rounded-chip bg-surface-sunken px-2 py-1">
        <Txt size="micro" tone="soft">
          Placed {ago(order.placedAt)}
        </Txt>
      </View>

      <Divider className="my-3.5" />

      <View className="flex-row gap-3">
        <View className="flex-1 items-center">
          <Txt size="tiny" tone="muted">
            Estimated Delivery
          </Txt>
          <Txt size="xl" weight="bold" tone="indigo" className="mt-0.5">
            {time(eta)}
          </Txt>
          <Txt size="micro" tone="muted">
            {minutesLeft > 0 ? `(${minutesLeft} mins left)` : "(due now)"}
          </Txt>
        </View>

        <View className="w-px bg-line" />

        <View className="flex-1 items-center">
          <Txt size="tiny" tone="muted">
            Total Amount
          </Txt>
          <Txt size="xl" weight="bold" className="mt-0.5">
            {money(totals.total)}
          </Txt>
          <View className="mt-1 flex-row items-center gap-1">
            <Ionicons
              name={cod ? "cash-outline" : "card-outline"}
              size={13}
              color={cod ? colors.info.default : colors.ok.default}
            />
            <Txt size="micro" weight="semibold" tone={cod ? "info" : "ok"}>
              {cod ? "COD" : order.payment}
            </Txt>
          </View>
        </View>
      </View>

      {/* "Track Order" stood here with no handler. There is no tracking
          screen in the vendor app to send it to — where the order has got to
          is the timeline above, which updates as the rider moves it on. */}

      {cod && (
        <View className="mt-2.5 rounded-tile bg-info-soft px-3 py-2">
          <Txt size="tiny" tone="info" weight="medium">
            Payment to be collected from customer
          </Txt>
        </View>
      )}
    </Card>
  );
}

function Bill({ order }: { order: VendorOrder }) {
  const totals = orderTotals(order);
  const rows = [
    { label: "Item Total", value: totals.items },
    { label: "Delivery Fee", value: totals.delivery },
    { label: "Packaging Fee", value: totals.packaging },
    { label: "GST (5%)", value: totals.gst, tone: "ok" as const },
  ];

  /*
   * No "View Invoice" button: it had no handler and there is no separate
   * invoice screen to open. The breakdown below is the invoice - items,
   * delivery, packaging and GST as its own line, which is where the tax
   * belongs rather than inside each item's price.
   */
  return (
    <Panel
      title={`Order Items (${order.lines.length})`}
      className="mx-4 mt-3"
    >
      <View className="border-t border-line px-4 pb-4 pt-1">
        {order.lines.map((line, index) => (
          <View key={index} className="flex-row items-center gap-3 py-2.5">
            <Photo
              uri={line.image}
              width={48}
              height={48}
              radius={9}
              tint={categoryTint(index)}
            />
            <View className="min-w-0 flex-1">
              <Txt size="sm" weight="semibold" numberOfLines={2}>
                {line.name}
              </Txt>
              <Txt size="micro" tone={line.note ? "warn" : "info"} numberOfLines={1}>
                {line.note ?? "No Special Instructions"}
              </Txt>
            </View>
            <Txt size="tiny" tone="muted">
              x{line.quantity}
            </Txt>
            <Txt size="sm" weight="semibold" className="w-[74px] text-right">
              {money(line.price * line.quantity)}
            </Txt>
          </View>
        ))}

        <Divider className="mb-1 mt-2" />

        {rows.map((row) => (
          <View key={row.label} className="flex-row justify-between py-1">
            <Txt size="sm" tone="soft">
              {row.label}
            </Txt>
            <Txt size="sm" weight="medium" tone={row.tone ?? "default"}>
              {money(row.value)}
            </Txt>
          </View>
        ))}

        <View
          style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.line.strong }}
          className="mt-2 flex-row justify-between pt-2.5"
        >
          <Txt weight="bold">Total Amount</Txt>
          <Txt size="lg" weight="bold">
            {money(totals.total)}
          </Txt>
        </View>
      </View>
    </Panel>
  );
}

function ContextCards({ order }: { order: VendorOrder }) {
  return (
    <View className="mx-4 mt-3 gap-3">
      <Card className="p-4">
        <View className="flex-row items-center gap-2">
          <IconPlate icon="person-outline" tint="violet" size={30} shape="square" />
          <Txt weight="bold">Customer Details</Txt>
        </View>
        <View className="mt-3 gap-2">
          <Detail icon="person-outline" text={order.customer} />
          <Detail icon="call-outline" text={order.phone} />
          <Detail icon="location-outline" text={order.address} lines={2} />
        </View>
          <Button
          label="Call Customer"
          icon="call-outline"
          variant="outline"
          accent="indigo"
          size="sm"
          className="mt-3"
          onPress={() => callNumber(order.phone)}
        />
      </Card>

      <Card className="p-4">
        <View className="flex-row items-center gap-2">
          <IconPlate icon="bicycle-outline" tint="green" size={30} shape="square" />
          <Txt weight="bold">Delivery Details</Txt>
        </View>
        {order.rider ? (
          <>
            <View className="mt-3 gap-2">
              <Detail icon="person-outline" text={order.rider.name} />
              <Detail icon="call-outline" text={order.rider.phone} />
              <Detail icon="bicycle-outline" text="TVS Apache 160" />
              <Detail icon="car-outline" text="AP39 K 1234" />
            </View>
            <Button
              label="Call Rider"
              icon="call-outline"
              variant="outline"
              accent="indigo"
              size="sm"
              className="mt-3"
              onPress={() => callNumber(order.rider?.phone)}
            />
          </>
        ) : (
          <Txt size="tiny" tone="muted" className="mt-2">
            A delivery partner is assigned once the order is marked ready.
          </Txt>
        )}
      </Card>

      {/* "picked" as well as "ready", so the vendor gets the confirmation that
          the handover went through rather than the card simply vanishing. */}
      {(order.stage === "ready" || order.stage === "picked") && <PickupCode order={order} />}

      <Card className="p-4">
        <View className="flex-row items-center gap-2">
          <IconPlate icon="reader-outline" tint="amber" size={30} shape="square" />
          <Txt weight="bold">Order Notes</Txt>
        </View>
        {order.notes?.length ? (
          <View className="mt-3 gap-2">
            {order.notes.map((note, index) => (
              <View key={note} className="flex-row items-start gap-2">
                <Ionicons
                  name={index === 0 ? "chatbox-outline" : "restaurant-outline"}
                  size={14}
                  color={index === 0 ? colors.ink.muted : colors.warn.default}
                />
                <Txt
                  size="tiny"
                  tone={index === 0 ? "soft" : "warn"}
                  className="flex-1"
                >
                  {note}
                </Txt>
              </View>
            ))}
          </View>
        ) : (
          <Txt size="tiny" tone="muted" className="mt-2">
            No notes from the customer.
          </Txt>
        )}
      </Card>
    </View>
  );
}

function Detail({
  icon,
  text,
  lines = 1,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  lines?: number;
}) {
  return (
    <View className="flex-row items-start gap-2">
      <Ionicons name={icon} size={14} color={colors.ink.muted} />
      <Txt size="tiny" tone="soft" className="flex-1" numberOfLines={lines}>
        {text}
      </Txt>
    </View>
  );
}

/**
 * The handover proof, on the order it belongs to.
 *
 * The code was only ever reachable from a separate Pickup Verification
 * screen, so a vendor looking at a ready order saw nothing to show the rider
 * — which is what the client reported. The order is the place it is needed.
 */
function PickupCode({ order }: { order: VendorOrder }) {
  const router = useRouter();
  const { code, qr, verified, error, loading } = usePickupCode(order.id);

  if (verified) {
    return (
      <Card className="p-4">
        <View className="flex-row items-center gap-2">
          <IconPlate icon="checkmark-circle-outline" tint="green" size={30} shape="square" />
          <Txt weight="bold">Picked up</Txt>
        </View>
        <Txt size="tiny" tone="muted" className="mt-2">
          The delivery partner verified this order and collected it.
        </Txt>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <View className="flex-row items-center gap-2">
        <IconPlate icon="qr-code-outline" tint="violet" size={30} shape="square" />
        <View className="min-w-0 flex-1">
          <Txt weight="bold">Pickup Code</Txt>
          <Txt size="tiny" tone="muted">
            Show this to the delivery partner
          </Txt>
        </View>
      </View>

      {loading && !code ? (
        <Txt size="tiny" tone="muted" className="mt-3">
          Loading the code…
        </Txt>
      ) : error ? (
        <Txt size="tiny" className="mt-3 text-bad-ink">
          {error}
        </Txt>
      ) : (
        <>
          <View className="mt-3 flex-row items-center justify-center gap-2">
            {(code ?? "----").split("").map((digit, index) => (
              <View
                key={index}
                className="h-12 w-11 items-center justify-center rounded-tile border border-line bg-surface-sunken"
              >
                <Txt size="xl" weight="bold" tone="indigo">
                  {digit}
                </Txt>
              </View>
            ))}
          </View>

          {qr ? (
            <View className="mt-3 items-center">
              <View className="rounded-card border border-line bg-surface p-2.5">
                <QRCode value={qr} size={128} />
              </View>
              <Txt size="micro" tone="muted" className="mt-1.5">
                Or let them scan this
              </Txt>
            </View>
          ) : null}

          <Button
            label="Open Pickup Verification"
            icon="scan-outline"
            variant="outline"
            accent="indigo"
            size="sm"
            className="mt-3"
            onPress={() => router.push(`/pickup?id=${order.id}`)}
          />
        </>
      )}
    </Card>
  );
}

function badgeTone(stage: OrderStage) {
  return (
    {
      new: "ok",
      preparing: "warn",
      ready: "info",
      picked: "indigo",
      delivered: "ok",
      cancelled: "bad",
    } as const
  )[stage];
}

export default function OrderDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { orders, advance } = useStore();
  const order = orders.find((entry) => entry.id === id);

  if (!order) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
        <View className="border-b border-line bg-surface">
          <PageBar title="Order Details" leading="back" />
        </View>
        <EmptyState
          icon="receipt-outline"
          title="Order not found"
          detail={`No order matches #${id}.`}
          action="Back to orders"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const next = NEXT_STAGE[order.stage];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <View className="border-b border-line bg-surface">
        <PageBar
          title="Order Details"
          subtitle="Orders › Order Details"
          leading="back"
          right={
            /* "Print" and an overflow menu stood here, neither with a
               handler: there is no printer integration in this app and no
               menu behind the dots. The actions this screen offers are the
               ones on the cards below. */
            undefined
          }
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6">
        <SummaryCard order={order} />

        <Panel
          title="Order Status"
          action="View History"
          onAction={() => {}}
          accent="indigo"
          className="mx-4 mt-3"
        >
          <View className="border-t border-line pt-3.5">
            <Timeline order={order} />
          </View>

          {order.rider && (
            <View className="mx-4 mb-4 mt-1 flex-row items-center gap-2.5 rounded-tile bg-info-soft px-3 py-2.5">
              <IconPlate icon="bicycle" tint="blue" size={30} background="#ffffff" />
              <Txt size="tiny" tone="soft" className="flex-1">
                {order.rider.name} is on the way with your order
              </Txt>
              <Button
                label="Call"
                icon="call-outline"
                variant="outline"
                accent="indigo"
                size="sm"
                onPress={() => callNumber(order.rider?.phone ?? order.phone)}
              />
            </View>
          )}
        </Panel>

        <Bill order={order} />
        <ContextCards order={order} />

        <View className="mx-4 mt-4 gap-2.5">
          {next && (
            <Button
              label={next.label}
              icon="checkmark-circle-outline"
              accent="indigo"
              onPress={() => {
                advance(order.id, next.to);
                router.back();
              }}
            />
          )}
          <View className="flex-row gap-2.5">
            <Button
              label="Cancel Order"
              icon="close-circle-outline"
              variant="outline"
              accent="brand"
              className="flex-1"
              onPress={() => {
                advance(order.id, "cancelled");
                router.back();
              }}
            />
            <Button
              label="Need Help?"
              icon="headset-outline"
              variant="outline"
              accent="indigo"
              className="flex-1"
              onPress={() => router.push("/support")}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
