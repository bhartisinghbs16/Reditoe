import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Badge, Txt, colors } from "@/components/ui";
import { Photo } from "@/components/photo";
import { minutesAgo, money, time } from "@/lib/format";
import { img } from "@/lib/images";
import { stageStyle } from "@/lib/theme";
import { NEXT_STAGE, useStore, type Order } from "@/lib/store";

/**
 * The reference's order card: a status chip and the order id on the first row,
 * then the restaurant, the pickup → drop pair drawn as a two-dot route, and
 * the amount with its payment terms in a column on the right. A new offer
 * carries the Reject / Accept pair and a cream wash; work in hand does not.
 */

/** The pickup → drop pair, drawn as the reference's green-to-red route. */
function Route({ from, to }: { from: string; to: string }) {
  return (
    <View className="mt-2">
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full bg-green-600" />
        <Txt size="tiny" tone="soft" numberOfLines={1} className="flex-1">
          {from}
        </Txt>
      </View>
      <View className="ml-[4px] h-3 w-0.5 bg-line-strong" />
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full bg-brand-500" />
        <Txt size="tiny" tone="soft" numberOfLines={1} className="flex-1">
          {to}
        </Txt>
      </View>
    </View>
  );
}

/** Order amount and payment terms — the column that closes every card. */
function AmountColumn({ order }: { order: Order }) {
  return (
    <View className="w-[104px] items-start border-l border-line pl-3">
      <Txt size="lg" weight="bold" numberOfLines={1}>
        {money(order.amount)}
      </Txt>
      <Txt size="micro" tone="muted">
        Order Amount
      </Txt>

      <View className="mt-2 w-full rounded-chip bg-surface-sunken px-2 py-1.5">
        <Txt size="micro" weight="bold">
          {order.payment === "COD" ? "COD" : "Online Paid"}
        </Txt>
        {order.payment === "COD" && (
          <Txt size="micro" tone="muted">
            {order.codAllowed ? "Collect cash" : "Not Allowed"}
          </Txt>
        )}
      </View>
    </View>
  );
}

/** The 20-second window the reference prints on the Accept button. */
function useOfferCountdown(active: boolean, seconds = 20) {
  const [left, setLeft] = React.useState(seconds);

  React.useEffect(() => {
    if (!active) return;
    setLeft(seconds);
    const timer = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [active, seconds]);

  return left;
}

export function OrderCard({
  order,
  showId = true,
  onPress,
  className = "",
}: {
  order: Order;
  showId?: boolean;
  onPress?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const { advance, reject } = useStore();
  const stage = stageStyle[order.stage];
  const next = NEXT_STAGE[order.stage];
  const isOffer = order.stage === "offered";
  const secondsLeft = useOfferCountdown(isOffer);

  /*
   * Collecting and delivering need the other party's code, so from a list
   * this button opens the order rather than claiming the step.
   *
   * It used to call advance for every stage. "Picked Up Order" changed the
   * stage locally and the next refresh put it back; "Confirm Delivery" asked
   * the server to close an unverified order, which it refuses — so the order
   * reappeared in the list and the tap looked like it had done nothing.
   */
  const needsHandover = order.stage === "at_restaurant" || order.stage === "at_customer";

  return (
    <View
      style={
        isOffer
          ? { backgroundColor: "#fffaf0", borderColor: "#fbe3b8" }
          : { backgroundColor: "#ffffff", borderColor: colors.line.default }
      }
      className={`rounded-card border p-4 ${className}`}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        className="flex-row items-center gap-2"
      >
        <Badge label={stage.short} tone={stage.tone} />
        {showId && (
          <Txt size="tiny" tone="muted" className="flex-1" numberOfLines={1}>
            Order ID: #{order.id}
          </Txt>
        )}
        <Txt size="tiny" weight="semibold" tone="brand">
          {minutesAgo(order.placedAt)}
        </Txt>
        {onPress && (
          <Ionicons name="chevron-forward" size={15} color={colors.ink.faint} />
        )}
      </Pressable>

      <View className="mt-3 flex-row gap-3">
        <Photo uri={img(order.photo, 220)} width={72} height={72} radius={10} />

        <View className="min-w-0 flex-1">
          <Txt size="lg" weight="bold" numberOfLines={1}>
            {order.restaurant.name}
          </Txt>
          <Txt size="tiny" tone="muted" className="mt-0.5">
            Order Type:{" "}
            <Txt size="tiny" weight="semibold" tone="green">
              Delivery
            </Txt>
          </Txt>

          <Route from={order.restaurant.address} to={order.customer.address} />

          <Txt size="tiny" weight="semibold" className="mt-2">
            {order.distanceKm} km{" "}
            <Txt size="tiny" tone="muted">
              • {order.minutes} mins distance
            </Txt>
          </Txt>
        </View>

        <AmountColumn order={order} />
      </View>

      {next && (
        <View className="mt-3.5 flex-row gap-3">
          {isOffer && (
            <Pressable
              onPress={() => reject(order.id)}
              style={{ borderColor: colors.brand[500] }}
              className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-tile border bg-white active:opacity-70"
            >
              <Ionicons name="close" size={17} color={colors.brand[500]} />
              <Txt weight="bold" tone="brand">
                Reject
              </Txt>
            </Pressable>
          )}
          <Pressable
            onPress={() =>
              needsHandover
                ? router.push(`/order/${order.id}`)
                : advance(order.id, next.to)
            }
            style={{ backgroundColor: colors.green[700] }}
            className={`h-12 flex-row items-center justify-center gap-1.5 rounded-tile active:opacity-80 ${
              isOffer ? "flex-[1.35]" : "flex-1"
            }`}
          >
            <Ionicons name="checkmark" size={17} color="#ffffff" />
            <Txt weight="bold" tone="white">
              {isOffer ? `Accept Order (${secondsLeft}s)` : next.label}
            </Txt>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * The reference's compact list row — In Progress and Completed Today. Same
 * information, no actions, a status chip where the buttons would be.
 */
export function OrderRow({
  order,
  onPress,
  divided,
}: {
  order: Order;
  onPress?: () => void;
  divided?: boolean;
}) {
  const stage = stageStyle[order.stage];
  const done = order.stage === "delivered";

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row gap-3 p-4 active:opacity-80 ${
        divided ? "border-t border-line" : ""
      }`}
    >
      <Photo uri={img(order.photo, 200)} width={64} height={64} radius={10} />

      <View className="min-w-0 flex-1">
        <Txt size="tiny" tone="muted" numberOfLines={1}>
          Order ID: #{order.id}
        </Txt>
        <Txt weight="bold" className="mt-0.5" numberOfLines={1}>
          {order.restaurant.name}
        </Txt>
        <Txt size="tiny" tone="muted" className="mt-0.5">
          Order Type:{" "}
          <Txt size="tiny" weight="semibold" tone="green">
            Delivery
          </Txt>
        </Txt>

        {!done && <Route from={order.restaurant.address} to={order.customer.address} />}

        <Txt size="tiny" tone="muted" className="mt-1.5">
          {order.distanceKm} km • {order.minutes} mins distance
        </Txt>
      </View>

      <View className="w-[104px] items-end gap-1">
        <View className="flex-row items-center gap-1.5">
          <Badge label={stage.short} tone={stage.tone} />
        </View>
        <Txt size="micro" tone={done ? "muted" : "brand"} weight="semibold">
          {done ? time(order.deliveredAt) : minutesAgo(order.placedAt)}
        </Txt>
        <Txt weight="bold" className="mt-1">
          {money(order.amount)}
        </Txt>
        <Txt size="micro" tone="muted">
          Order Amount
        </Txt>
        <Badge
          label={order.payment === "COD" ? "COD" : "Online Paid"}
          tone={order.payment === "COD" ? "warn" : "ok"}
          className="mt-1"
        />
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.ink.faint} />
    </Pressable>
  );
}
