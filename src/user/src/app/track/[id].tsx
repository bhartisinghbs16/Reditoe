import React from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  EmptyState,
  IconTile,
  SectionHead,
  StageTrack,
  Thumb,
  Txt,
  VegMark,
  colors,
} from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { RestaurantCard } from "@/components/cards";
import { BillLines } from "@/components/bill";
import { LiveMap, distanceKm, type Coordinate } from "@/components/live-map";
import { api } from "@/lib/api";
import { accents } from "@/lib/theme";
import { currency, etaFromNow, time } from "@/lib/format";
import { useStore } from "@/lib/store";

/**
 * "Live Order Tracking", copied from the reference: the ETA card with its
 * status pill, the four-stop tracker, the kitchen note, the route map with the
 * rider callout, the rider card, the add-more nudge, a suggestions rail, the
 * order summary and the safety footer.
 */

const STAGES = [
  { key: "Placed", label: "Order Placed", icon: "receipt-outline" as const },
  { key: "Order Confirmed", label: "Confirmed", icon: "bag-check-outline" as const },
  { key: "Processing", label: "Picked Up", icon: "restaurant-outline" as const },
  { key: "OnWay", label: "On the Way", icon: "bicycle-outline" as const },
  { key: "Delivered", label: "Delivered", icon: "checkmark-circle-outline" as const },
];

export default function TrackOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { orders, restaurantById, restaurants } = useStore();

  const order = orders.find((o) => o.id === id);

  if (!order) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
        <ScreenHeader title="Live Order Tracking" />
        <EmptyState
          icon="navigate-outline"
          title="Nothing to track"
          detail="This order isn't on the way."
          action="Back to orders"
          onAction={() => router.replace("/orders")}
        />
      </SafeAreaView>
    );
  }

  /**
   * Where everyone is, refreshed while the order is still moving.
   *
   * Five seconds is often enough to look live without asking much of a phone
   * on mobile data, and the poll stops once the order is finished - there is
   * nothing left to follow, and a screen left open should not keep the radio
   * busy for the rest of the day.
   */
  const [track, setTrack] = React.useState<{
    rider?: Coordinate | null;
    restaurant?: Coordinate | null;
    destination?: Coordinate | null;
    route: Coordinate[];
    /** Who is actually carrying it, once one has been assigned. */
    riderInfo?: { name?: string; phone?: string; vehicleNumber?: string } | null;
    /** Set only while the rider is carrying more than this one order. */
    batch?: {
      totalStops: number;
      yourStop: number;
      stopsBefore: number;
      isNext: boolean;
      stops: { position: number; isYours: boolean; status?: string }[];
    } | null;
  }>({ route: [] });

  const finished = order.status === "Delivered" || order.status === "Cancelled";

  React.useEffect(() => {
    if (finished) return;
    let stopped = false;

    const pull = async () => {
      try {
        const res = await api.orderTracking(order.id);
        if (stopped) return;
        const d = res.data;
        setTrack({
          rider: d.riderLocation ?? null,
          restaurant: d.restaurantLocation ?? null,
          destination: d.deliveryLocation ?? null,
          route: d.routeCoordinates ?? [],
          riderInfo: d.riderInfo ?? null,
          batch: d.batch ?? null,
        });
      } catch {
        // A failed poll leaves the last known positions on screen; the next
        // one is five seconds away.
      }
    };

    pull();
    // Keep the marker feeling live on mobile networks without hammering the API.
    // The rider location service already updates frequently; two seconds keeps
    // the customer view close to real-time while retaining the existing API.
    const timer = setInterval(pull, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [order.id, finished]);

  const restaurant = restaurantById(order.restaurantId);
  const delivered = order.status === "Delivered";
  const stageIndex = delivered
    ? STAGES.length - 1
    : Math.max(0, STAGES.findIndex((s) => s.key === order.status));

  const placedMs = new Date(order.placedAt).getTime();
  const stages = STAGES.map((stage, index) => ({
    label: stage.label,
    icon: stage.icon,
    time:
      index <= stageIndex ? time(new Date(placedMs + index * 9 * 60_000)) : undefined,
  }));

  const progress = delivered ? 1 : (stageIndex + 0.5) / STAGES.length;

  /**
   * How far the rider still has to come, straight line.
   *
   * Straight line rather than along the roads: the distance is a rough sense
   * of "nearly here" and asking Google for a driving distance on every poll
   * would be a billed request every five seconds, per customer watching.
   */
  const remainingKm =
    track.rider && track.destination
      ? distanceKm(track.rider, track.destination)
      : null;

  const etaText = delivered ? "Delivered" : etaFromNow(order.etaAt);

  /*
   * The rider the API named, or nobody.
   *
   * Each field fell back to a fixture, so before a rider had accepted, the
   * screen showed a sample partner's name, phone number, plate and rating as
   * though they were on their way - and a real rider with no plate recorded
   * borrowed the fixture's. The customer was given a number to call that
   * belonged to nobody.
   */
  const partner = track.riderInfo?.name
    ? {
        name: track.riderInfo.name,
        phone: track.riderInfo.phone ?? null,
        plate: track.riderInfo.vehicleNumber ?? null,
      }
    : null;
  const suggestions = restaurants.filter((r) => r.id !== order.restaurantId).slice(0, 4);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Live Order Tracking"
        subtitle={`Order ID: ${order.code}`}
        subtitleIcon="copy-outline"
        right={<HeaderAction icon="headset-outline" label="Help" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        {/* ETA */}
        <Card className="mx-4 mt-1 flex-row items-center gap-3 p-3">
          <IconTile icon="bicycle" tint={accents.red} size={62} />
          <View className="min-w-0 flex-1">
            <Txt size="tiny" tone="muted">
              Estimated Delivery
            </Txt>
            <Txt size="2xl" weight="bold" tone="ok">
              {delivered ? "Delivered" : etaFromNow(order.etaAt)}
            </Txt>
            <Txt size="tiny" tone="muted">
              Arriving by{" "}
              <Txt size="tiny" weight="bold" tone="warn">
                {time(order.etaAt)}
              </Txt>
            </Txt>
          </View>

          <View className="items-center rounded-tile border border-leaf-100 bg-leaf-50 px-3 py-2">
            <Txt size="tiny" weight="bold" tone="ok" numberOfLines={1}>
              {stages[stageIndex].label}
            </Txt>
            <Txt size="micro" tone="muted">
              {stages[stageIndex].time}
            </Txt>
            <Ionicons name="chevron-down" size={12} color={colors.leaf[600]} />
          </View>
        </Card>

        {/* Tracker */}
        <View className="mx-4 mt-5">
          <StageTrack stages={stages} currentIndex={stageIndex} />
        </View>

        {/* Kitchen note */}
        <Card className="mx-4 mt-5 flex-row items-center gap-3 p-3">
          <Ionicons name="storefront-outline" size={24} color={colors.ink.default} />
          <View className="min-w-0 flex-1">
            <Txt size="sm" weight="bold" numberOfLines={1}>
              {restaurant?.name} is preparing your order
            </Txt>
            <Txt size="tiny" tone="muted">
              We'll update you when your rider picks it up.
            </Txt>
          </View>
        </Card>

        {/* The rider's other deliveries, when there are any */}
        {track.batch && (
          <Card className="mx-4 mt-4 p-3">
            <View className="flex-row items-center gap-2">
              <Ionicons name="git-commit-outline" size={15} color={colors.leaf[600]} />
              <Txt size="sm" weight="bold">
                Rider has {track.batch.totalStops} deliveries
              </Txt>
            </View>

            <View className="mt-2.5 gap-1.5">
              {track.batch.stops.map((stop) => (
                <View
                  key={stop.position}
                  className={`flex-row items-center gap-2.5 rounded-tile px-2.5 py-2 ${
                    stop.isYours ? "bg-leaf-50" : "bg-surface-sunken"
                  }`}
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full ${
                      stop.isYours ? "bg-leaf-600" : "bg-line-strong"
                    }`}
                  >
                    <Txt size="micro" weight="bold" tone="white">
                      {stop.position}
                    </Txt>
                  </View>
                  <Txt size="tiny" weight={stop.isYours ? "bold" : "regular"} className="flex-1">
                    {/*
                      Only this customer's own stop is named. The others are
                      other people's addresses, and the count is all anybody
                      needs to understand the wait.
                    */}
                    {stop.isYours ? `Delivery ${stop.position} (You)` : `Delivery ${stop.position}`}
                  </Txt>
                  {stop.isYours && (
                    <Txt size="micro" weight="bold" tone="ok">
                      {track.batch!.isNext ? "Next stop" : `${track.batch!.stopsBefore} ahead`}
                    </Txt>
                  )}
                </View>
              ))}
            </View>

            <Txt size="micro" tone="muted" className="mt-2">
              {track.batch.isNext
                ? "You are the next stop."
                : `${track.batch.stopsBefore} ${
                    track.batch.stopsBefore === 1 ? "delivery" : "deliveries"
                  } before yours.`}
            </Txt>
          </Card>
        )}

        {/* Map */}
        <View className="mt-4">
          <LiveMap
            height={320}
            rider={track.rider}
            restaurant={track.restaurant}
            destination={track.destination}
            route={track.route}
            restaurantLabel={restaurant?.name ?? "Restaurant"}
            destinationLabel="Your Location"
            etaLabel={delivered ? undefined : etaText}
            progress={progress}
          />
        </View>

        {/* Time, distance, stops */}
        <Card className="mx-4 mt-4 flex-row items-center p-3">
          {[
            { icon: "time-outline" as const, value: etaText, label: "Estimated time" },
            {
              icon: "navigate-outline" as const,
              value: remainingKm != null ? `${remainingKm.toFixed(1)} km` : "—",
              label: "Distance",
            },
            {
              icon: "git-commit-outline" as const,
              value: track.batch
                ? `${track.batch.yourStop} of ${track.batch.totalStops}`
                : track.rider
                  ? "You are next"
                  : "—",
              label: "Stops",
            },
          ].map((item, index) => (
            <View
              key={item.label}
              className={`flex-1 items-center gap-1 ${index > 0 ? "border-l border-line" : ""}`}
            >
              <Ionicons name={item.icon} size={16} color={colors.leaf[600]} />
              <Txt size="sm" weight="bold" numberOfLines={1}>
                {item.value}
              </Txt>
              <Txt size="micro" tone="muted">
                {item.label}
              </Txt>
            </View>
          ))}
        </Card>

        {/* Rider — only once one has actually accepted the order. */}
        {partner === null ? (
          <Card className="mx-4 mt-4 p-3">
            <Txt weight="bold">Finding a delivery partner</Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              We will show their name and number as soon as somebody accepts.
            </Txt>
          </Card>
        ) : (
        <Card className="mx-4 mt-4 flex-row items-center gap-3 p-3">
          <Thumb label={partner.name} tint={accents.green} size={56} radius={28} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold" numberOfLines={2} className="min-w-0 flex-shrink">
              {partner.name}
            </Txt>
            <Txt size="tiny" tone="muted">
              Your Delivery Partner
            </Txt>
            {partner.phone && (
              <View className="mt-0.5 flex-row items-center gap-1.5">
                <Ionicons name="call-outline" size={12} color={colors.ink.muted} />
                <Txt size="tiny" tone="muted">
                  {partner.phone}
                </Txt>
              </View>
            )}
          </View>

          <View className="items-end gap-1.5">
            {partner.plate && (
              <Txt size="micro" tone="muted">
                {partner.plate}
              </Txt>
            )}
            <View className="flex-row items-center gap-1.5">
              <Pressable
                onPress={() => partner.phone && Linking.openURL(`tel:${partner.phone}`)}
                className="flex-row items-center gap-1.5 rounded-tile border border-line px-2.5 py-2 active:opacity-70"
              >
                <Ionicons name="call" size={13} color={colors.ink.default} />
                <Txt size="micro" weight="bold">
                  Call
                </Txt>
              </Pressable>
              <Pressable
                // In-app now. This used to open the phone's SMS app, which
                // handed the rider's number to a private thread nobody could
                // look at afterwards when a delivery was disputed.
                onPress={() => router.push(`/chat/${id}` as never)}
                className="flex-row items-center gap-1.5 rounded-tile border border-line px-2.5 py-2 active:opacity-70"
              >
                <Ionicons name="chatbubble-ellipses" size={13} color={colors.ink.default} />
                <Txt size="micro" weight="bold">
                  Chat
                </Txt>
              </Pressable>
            </View>
          </View>
        </Card>
        )}

        {/* Add more */}
        {!delivered && (
          <View className="mx-4 mt-4 flex-row items-center gap-3 rounded-card bg-leaf-50 px-3 py-3">
            <IconTile icon="pricetag" tint={{ bg: colors.leaf[600], fg: "#ffffff" }} size={40} />
            <View className="min-w-0 flex-1">
              <Txt weight="bold">Enjoying your order?</Txt>
              <Txt size="tiny" tone="muted" numberOfLines={2}>
                Add more items and get up to ₹100 OFF
              </Txt>
            </View>
            <Pressable
              onPress={() => router.push(`/restaurant/${order.restaurantId}`)}
              className="rounded-tile bg-leaf-700 px-4 py-3 active:opacity-90"
            >
              <Txt size="tiny" weight="bold" tone="white">
                Add More Items
              </Txt>
            </Pressable>
          </View>
        )}

        {/* Suggestions */}
        <View className="mt-6">
          <SectionHead
            title="You may also like"
            onAction={() => router.push("/search")}
            className="mb-3 px-4"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3 px-4"
          >
            {suggestions.map((entry, index) => (
              <RestaurantCard key={entry.id} restaurant={entry} index={index} />
            ))}
          </ScrollView>
        </View>

        {/* Order summary */}
        <Card className="mx-4 mt-6 p-3">
          <View className="flex-row items-center justify-between">
            <Txt weight="bold">Order Details</Txt>
            <Pressable
              onPress={() => router.push(`/order/${order.id}`)}
              hitSlop={8}
              className="flex-row items-center gap-0.5"
            >
              <Txt size="tiny" weight="bold" tone="brand">
                View Receipt
              </Txt>
              <Ionicons name="chevron-forward" size={12} color={colors.brand[600]} />
            </Pressable>
          </View>

          <View className="mt-2">
            {order.lines.map((line) => (
              <View key={line.key} className="flex-row items-start gap-2.5 py-2">
                <View className="mt-0.5">
                  <VegMark veg={line.veg} size={13} />
                </View>
                <View className="min-w-0 flex-1">
                  <Txt size="sm" weight="semibold" numberOfLines={2}>
                    {line.quantity} x {line.name}
                  </Txt>
                  {line.portionName && (
                    <Txt size="tiny" tone="muted">
                      {line.portionName}
                    </Txt>
                  )}
                </View>
                <Txt size="sm" weight="medium">
                  {currency(line.unitPrice * line.quantity)}
                </Txt>
              </View>
            ))}
          </View>

          <View className="mt-2 border-t border-line pt-3">
            <BillLines totals={order.totals} />
          </View>
        </Card>

        {/* Saved */}
        {order.totals.saved > 0 && (
          <Pressable
            onPress={() => router.push("/offers")}
            className="mx-4 mt-4 flex-row items-center gap-3 rounded-card bg-sun-50 px-3 py-3 active:opacity-80"
          >
            <IconTile icon="cash" tint={{ bg: colors.sun[500], fg: "#ffffff" }} size={40} />
            <View className="min-w-0 flex-1">
              <Txt size="sm" weight="bold">
                Yay! You saved {currency(order.totals.saved)} on this order
              </Txt>
              <Txt size="tiny" tone="muted">
                Thanks for using Reditoe
              </Txt>
            </View>
            <View className="flex-row items-center gap-0.5">
              <Txt size="tiny" weight="bold" tone="brand">
                View offers
              </Txt>
              <Ionicons name="chevron-forward" size={12} color={colors.brand[600]} />
            </View>
          </Pressable>
        )}

        {/* Safety */}
        <Card className="mx-4 mt-4 flex-row items-center gap-3 p-3">
          <IconTile icon="shield-checkmark" tint={accents.green} size={44} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold">Safe & Secure Delivery</Txt>
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              Your safety is our top priority
            </Txt>
          </View>
          <Pressable
            onPress={() => router.push("/refunds")}
            className="flex-row items-center gap-1.5 rounded-tile border border-brand-500 px-3 py-2.5 active:opacity-70"
          >
            <Ionicons name="warning-outline" size={15} color={colors.brand[600]} />
            <Txt size="tiny" weight="bold" tone="brand">
              Report Issue
            </Txt>
          </Pressable>
        </Card>

        <Card className="mx-4 mt-4 flex-row items-center gap-3 p-3">
          <IconTile icon="headset" tint={accents.red} size={44} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold">Need Help?</Txt>
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              We're here to help you with your order
            </Txt>
          </View>
          <Pressable
            onPress={() => router.push("/support")}
            accessibilityLabel="Chat with support"
            className="rounded-tile border border-brand-500 px-3 py-2.5 active:opacity-70"
          >
            <Txt size="tiny" weight="bold" tone="brand">
              Chat with Support
            </Txt>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
