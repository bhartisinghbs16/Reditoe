import React from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
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
import { OrderCard } from "@/components/order-card";
import { ProgressTrack } from "@/components/tracker";
import { money, time } from "@/lib/format";
import { stageStyle } from "@/lib/theme";
import { NEXT_STAGE, legFor, useStore, type Order } from "@/lib/store";
import { VerifySheet, type VerifyStage } from "@/components/verify-sheet";
import { api } from "@/lib/api";

/**
 * A single order.
 *
 * The reference reaches this screen from the chevron on every order row but
 * does not draw it, so it is assembled from the reference's own parts: the
 * order card, the progress track from the Dashboard, the contact rows, and the
 * payment panel from the payout screens.
 */

const STAGES = [
  "offered",
  "accepted",
  "at_restaurant",
  "picked_up",
  "at_customer",
  "delivered",
] as const;

/** One end of the trip — who to reach, where, and how far. */
function ContactRow({
  icon,
  tint,
  kind,
  name,
  address,
  phone,
  active,
  onMessage,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: "green" | "red";
  kind: string;
  name: string;
  address: string;
  phone?: string;
  active: boolean;
  /** Only the customer can be messaged; the restaurant has no app to read it. */
  onMessage?: () => void;
}) {
  return (
    <View className="flex-row items-start gap-3 px-4 py-3.5">
      <IconPlate icon={icon} tint={tint} size={42} shape="circle" />

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Txt size="tiny" tone="muted">
            {kind}
          </Txt>
          {active && <Badge label="Current stop" tone="info" dot />}
        </View>
        <Txt weight="bold" numberOfLines={1}>
          {name}
        </Txt>
        <Txt size="tiny" tone="muted" numberOfLines={2}>
          {address}
        </Txt>
      </View>

      {phone || onMessage ? (
        <View className="flex-row gap-2">
          {phone ? (
            <Pressable
              onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, "")}`)}
              className="h-10 w-10 items-center justify-center rounded-full bg-green-50 active:opacity-70"
              accessibilityLabel={`Call ${name}`}
            >
              <Ionicons name="call" size={17} color={colors.green[600]} />
            </Pressable>
          ) : null}
          {onMessage ? (
            <Pressable
              onPress={onMessage}
              className="h-10 w-10 items-center justify-center rounded-full bg-brand-50 active:opacity-70"
              accessibilityLabel={`Message ${name}`}
            >
              <Ionicons name="chatbubble-ellipses" size={17} color={colors.brand[600]} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => openDirections(address, name)}
            className="h-10 w-10 items-center justify-center rounded-full bg-info-soft active:opacity-70"
            accessibilityLabel={`Navigate to ${name}`}
          >
            <Ionicons name="navigate" size={17} color={colors.info.default} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Hands the stop to whatever the rider navigates with.
 *
 * The button had no handler at all, so a rider looking at an unfamiliar
 * address had a navigation icon that did nothing.
 *
 * Android's geo: scheme opens the rider's own choice of maps app, which is
 * the right behaviour - a rider has one they prefer and it is usually already
 * signed in. Where nothing handles it, the Google Maps web address does, and
 * that works on any device with a browser.
 */
async function openDirections(address: string, label: string) {
  const query = encodeURIComponent(address?.trim() || label);
  const geo = `geo:0,0?q=${query}`;
  const web = `https://www.google.com/maps/dir/?api=1&destination=${query}`;

  try {
    if (await Linking.canOpenURL(geo)) {
      await Linking.openURL(geo);
      return;
    }
  } catch {
    // Fall through to the web address.
  }

  Linking.openURL(web).catch(() => {
    Alert.alert("Could not open maps", "No map application is available on this phone.");
  });
}

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { orders, history, advance } = useStore();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);

  const order: Order | undefined =
    orders.find((o) => o.id === id) ?? history.find((o) => o.id === id);

  if (!order) {
    return (
      <Screen>
        <ScreenHeader title="Order" trailing="none" />
        <EmptyState
          icon="bag-handle-outline"
          title="Order not found"
          detail="It may have been reassigned. Open Orders to see the day's book."
          action="Go to Orders"
          onAction={() => router.replace("/orders")}
        />
      </Screen>
    );
  }

  const stage = stageStyle[order.stage];
  const next = NEXT_STAGE[order.stage];
  const leg = legFor(order.stage);
  const index = STAGES.indexOf(order.stage as (typeof STAGES)[number]);

  /**
   * Which handover, if either, is the rider's next move.
   *
   * Collecting and delivering are the two steps that need somebody else's
   * consent, so they are the two the app cannot simply advance past. Every
   * other step is the rider's own report of where they are.
   */
  const verifyStage: VerifyStage | null =
    order.stage === "at_restaurant"
      ? "pickup"
      : order.stage === "at_customer"
        ? "delivery"
        : null;

  const submitCode = async (code: string) => {
    if (!verifyStage) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      if (verifyStage === "pickup") {
        await api.verifyPickup(order.id, code);
        advance(order.id, "picked_up");
      } else {
        await api.verifyDelivery(order.id, code);
        advance(order.id, "delivered");
      }
      setSheetOpen(false);
      if (verifyStage === "delivery") router.replace("/orders");
    } catch (reason: any) {
      // The server's message carries the useful part — how many tries are
      // left, or that the order is not at that step yet.
      setVerifyError(reason?.message ?? "That code was not accepted.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={`#${order.id}`} trailing="more" />

      <View className="gap-3.5 px-4 pt-3.5">
        <OrderCard order={order} showId={false} />

        <Panel title="Order Progress" bodyClassName="px-3 pb-4">
          {/* An unaccepted offer has reached no stop yet, so nothing is lit. */}
          <ProgressTrack
            current={index - 1}
            steps={[
              { label: "Order Accepted", icon: "bag-handle", at: time(order.placedAt) },
              { label: "Picked Up", icon: "storefront" },
              { label: "On the Way", icon: "location" },
              {
                label: "Delivered",
                icon: "checkmark-circle",
                at: order.deliveredAt ? time(order.deliveredAt) : undefined,
              },
            ]}
          />
        </Panel>

        <Panel title="Pickup & Drop" bodyClassName="pb-2">
          <ContactRow
            icon="storefront"
            tint="green"
            kind="Pick up from"
            name={order.restaurant.name}
            address={order.restaurant.address}
            phone={order.restaurant.phone || undefined}
            active={leg === "pickup"}
          />
          <Divider className="ml-[70px]" />
          <ContactRow
            icon="location"
            tint="red"
            kind="Deliver to"
            name={order.customer.name}
            address={order.customer.address}
            phone={order.customer.phone || undefined}
            active={leg === "drop"}
            onMessage={() => router.push(`/chat/${order.id}` as never)}
          />
        </Panel>

        <Pressable
          onPress={() =>
            openDirections(
              leg === "pickup" ? order.restaurant.address : order.customer.address,
              leg === "pickup" ? order.restaurant.name : order.customer.name
            )
          }
          className="mx-4 flex-row items-center justify-center gap-2 rounded-card bg-brand-600 px-4 py-3.5 active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel={leg === "pickup" ? "Navigate to restaurant" : "Navigate to customer"}
        >
          <Ionicons name="navigate" size={19} color="#ffffff" />
          <Txt weight="bold" tone="white">
            {leg === "pickup" ? "Navigate to Restaurant" : "Navigate to Customer"}
          </Txt>
        </Pressable>

        <Panel title="Payment" bodyClassName="pb-2">
          <DetailRow label="Order Amount" value={money(order.amount)} />
          <Divider />
          <DetailRow
            label="Payment Method"
            value={order.payment === "COD" ? "Cash on Delivery" : "Online Paid"}
          />
          <Divider />
          <DetailRow
            label="Cash to Collect"
            value={order.payment === "COD" && order.codAllowed ? money(order.amount) : "—"}
          />
          <Divider />
          <DetailRow
            label="Your Earning"
            valueNode={
              <Txt weight="bold" tone="green">
                {money(order.payout)}
              </Txt>
            }
          />
          <Divider />
          <DetailRow label="Distance" value={`${order.distanceKm} km • ${order.minutes} mins`} />
        </Panel>

        {/* The code belongs to whoever is handing over. Showing it to the
            rider would make asking for it pointless — this only says whose
            code to ask for. */}
        {verifyStage && (
          <NoteBar
            tone="amber"
            icon="keypad"
            title={
              verifyStage === "pickup"
                ? "Pickup code needed"
                : "Delivery code needed"
            }
            detail={
              verifyStage === "pickup"
                ? "Ask the restaurant to read out their 4-digit code, or scan the QR on their screen."
                : "Ask the customer to read out their 4-digit code, or scan the QR in their app."
            }
          />
        )}

        {order.stage === "delivered" ? (
          <NoteBar
            tone="green"
            icon="checkmark-circle"
            title="Delivered"
            detail={`Handed over at ${time(order.deliveredAt)} • ${money(order.payout)} credited to your wallet.`}
          />
        ) : (
          <View className="flex-row gap-3">
            <Button
              label="Scan QR"
              variant="outline"
              accent="brand"
              icon="scan-outline"
              className="flex-1"
              onPress={() => router.push("/scan")}
            />
            {verifyStage ? (
              <Button
                label={verifyStage === "pickup" ? "Verify pickup" : "Verify delivery"}
                className="flex-[1.6]"
                iconRight="lock-open-outline"
                onPress={() => {
                  setVerifyError(null);
                  setSheetOpen(true);
                }}
              />
            ) : (
              next && (
                <Button
                  label={next.label}
                  className="flex-[1.6]"
                  iconRight="arrow-forward"
                  onPress={() => advance(order.id, next.to)}
                />
              )
            )}
          </View>
        )}

        {verifyStage && (
          <VerifySheet
            stage={verifyStage}
            visible={sheetOpen}
            busy={verifying}
            error={verifyError}
            onCancel={() => setSheetOpen(false)}
            onSubmit={(code) => void submitCode(code)}
          />
        )}

        <Txt size="tiny" tone="faint" className="text-center">
          {stage.label} • Order placed {time(order.placedAt)}
        </Txt>
      </View>
    </Screen>
  );
}
