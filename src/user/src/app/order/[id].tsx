import React from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  DashedRule,
  Divider,
  EmptyState,
  IconTile,
  Rating,
  StageTrack,
  Thumb,
  Txt,
  VegMark,
  colors,
} from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { RouteMap } from "@/components/map";
import { Photo } from "@/components/photo";
import { photoUri } from "@/lib/images";
import { accents, categoryTint } from "@/lib/theme";
import { currency, date, time } from "@/lib/format";
import { addressTypeStyle } from "@/lib/data";
import { LiveMap, type Coordinate } from "@/components/live-map";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * "Order Details", copied from the reference: the status card with its
 * four-stop tracker, the restaurant and rider blocks, the delivery address,
 * items, bill, payment, the invoice actions, the quick-support chips and the
 * savings and rating strips.
 */

const STAGES = [
  { key: "Order Confirmed", label: "Confirmed", icon: "bag-check-outline" as const },
  { key: "Processing", label: "Preparing", icon: "restaurant-outline" as const },
  { key: "OnWay", label: "On the way", icon: "bicycle-outline" as const },
  { key: "Delivered", label: "Delivered", icon: "checkmark-circle-outline" as const },
];

const SUPPORT_TOPICS = [
  { icon: "bag-remove-outline" as const, label: "Wrong item", accent: "red" as const },
  { icon: "alert-circle-outline" as const, label: "Missing item", accent: "amber" as const },
  { icon: "time-outline" as const, label: "Late delivery", accent: "blue" as const },
  { icon: "help-circle-outline" as const, label: "Other issue", accent: "green" as const },
];

export default function OrderDetailScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const router = useRouter();
  const { addLine, addresses, dishById, orders, restaurantById } = useStore();

  const order = orders.find((o) => o.id === id);

  if (!order) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
        <ScreenHeader title="Order Details" />
        <EmptyState
          icon="receipt-outline"
          title="Order not found"
          action="Back to orders"
          onAction={() => router.replace("/orders")}
        />
      </SafeAreaView>
    );
  }

  /**
   * The live picture, on this screen rather than one tap away.
   *
   * The order screen drew a stand-in map and named a delivery partner before
   * anyone had been assigned - so a customer saw a route that was not theirs
   * and a rider who was not carrying their food. It is the same feed the
   * tracking screen reads; there is no reason for this one to show something
   * older.
   */
  const [track, setTrack] = React.useState<{
    rider?: Coordinate | null;
    restaurant?: Coordinate | null;
    destination?: Coordinate | null;
    route: Coordinate[];
    riderInfo?: { name?: string; phone?: string; vehicleNumber?: string } | null;
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
        });
      } catch {
        // The last known positions stay on screen; the next poll is soon.
      }
    };

    pull();
    const timer = setInterval(pull, 8000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [order.id, finished]);

  /** Nobody is named until somebody has actually accepted the job. */
  const assignedRider = track.riderInfo?.name ? track.riderInfo : null;

  const restaurant = restaurantById(order.restaurantId);
  const address = addresses.find((a) => a.id === order.addressId) ?? addresses[0];
  const addressStyle = addressTypeStyle[address.type];
  const justPlaced = placed === "1";

  const delivered = order.status === "Delivered";

  /* The customer's rating of this order, and sending it. */
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [reviewed, setReviewed] = React.useState(false);

  const sendReview = async () => {
    if (!comment.trim()) {
      Alert.alert("Add a note", "Please write a line about your experience.");
      return;
    }
    setSending(true);
    try {
      await api.submitReview({
        orderId: order.id,
        restaurantId: order.restaurantId,
        rating,
        comment,
      });
      setReviewed(true);
    } catch (error) {
      Alert.alert(
        "Couldn't send",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSending(false);
    }
  };
  const cancelled = order.status === "Cancelled" || order.status === "Refunded";
  const live = !delivered && !cancelled;

  const stageIndex = delivered
    ? STAGES.length - 1
    : Math.max(0, STAGES.findIndex((s) => s.key === order.status));

  const placedMs = new Date(order.placedAt).getTime();
  const stages = STAGES.map((stage, index) => ({
    label: stage.label,
    icon: stage.icon,
    time:
      index <= stageIndex
        ? index === STAGES.length - 1 && order.deliveredAt
          ? time(order.deliveredAt)
          : time(new Date(placedMs + index * 9 * 60_000))
        : undefined,
  }));

  const itemCount = order.lines.reduce((sum, l) => sum + l.quantity, 0);

  const reorder = () => {
    order.lines.forEach((line) => {
      const dish = dishById(line.dishId);
      if (!dish) return;
      for (let i = 0; i < line.quantity; i++) {
        addLine(dish, {
          portionName: line.portionName,
          unitPrice: line.unitPrice,
          extras: [],
        });
      }
    });
    router.push("/cart");
  };

  const statusCopy = delivered
    ? {
        tone: "ok" as const,
        title: "Delivered",
        detail: "Your order has been delivered successfully",
        stamp: order.deliveredAt
          ? `Delivered on ${date(order.deliveredAt)}, ${time(order.deliveredAt)}`
          : undefined,
      }
    : cancelled
      ? {
          tone: "bad" as const,
          title: order.status,
          detail:
            order.status === "Refunded"
              ? "Your refund has been credited to the original payment method"
              : "This order was cancelled",
          stamp: `${order.status} on ${date(order.placedAt)}`,
        }
      : {
          tone: "info" as const,
          title: justPlaced ? "Order placed" : "On its way",
          detail: `${restaurant?.name ?? "The kitchen"} is getting your order ready`,
          stamp: `Arriving by ${time(order.etaAt)}`,
        };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Order Details"
        subtitle={`Order ID: ${order.code}`}
        subtitleIcon="copy-outline"
        onBack={() => (justPlaced ? router.replace("/orders") : router.back())}
        right={<HeaderAction icon="headset-outline" label="Help" boxed />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        {/* Status */}
        <Card className="mx-4 mt-1 p-4">
          <View className="flex-row items-start gap-3">
            <View
              className={`h-10 w-10 items-center justify-center rounded-full ${
                delivered ? "bg-leaf-600" : cancelled ? "bg-bad" : "bg-info"
              }`}
            >
              <Ionicons
                name={delivered ? "checkmark" : cancelled ? "close" : "bicycle"}
                size={21}
                color="#ffffff"
              />
            </View>

            <View className="min-w-0 flex-1">
              <Txt size="lg" weight="bold" tone={statusCopy.tone}>
                {statusCopy.title}
              </Txt>
              <Txt size="tiny" tone="soft" className="mt-0.5">
                {statusCopy.detail}
              </Txt>
              {statusCopy.stamp && (
                <Txt size="tiny" tone="muted" className="mt-0.5">
                  {statusCopy.stamp}
                </Txt>
              )}
            </View>

            {!cancelled && (
              <Pressable
                onPress={live ? () => router.push(`/track/${order.id}`) : reorder}
                className="h-10 flex-row items-center gap-1.5 rounded-tile border border-brand-500 px-3 active:opacity-70"
              >
                <Ionicons
                  name={live ? "navigate-outline" : "refresh"}
                  size={15}
                  color={colors.brand[600]}
                />
                <Txt size="sm" weight="bold" tone="brand">
                  {live ? "Track" : "Reorder"}
                </Txt>
              </Pressable>
            )}
          </View>

          {!cancelled && (
            <View className="mt-4">
              <StageTrack stages={stages} currentIndex={stageIndex} />
            </View>
          )}
        </Card>

        {/* Restaurant */}
        <Card className="mx-4 mt-4 flex-row items-center gap-3 p-3">
          <Photo
            uri={photoUri(restaurant, 220)}
            width={64}
            height={64}
            radius={10}
            tint={categoryTint(1)}
          />
          <Pressable
            onPress={() => router.push(`/restaurant/${order.restaurantId}`)}
            className="min-w-0 flex-1 active:opacity-70"
          >
            <View className="flex-row items-center gap-1">
              <Txt weight="bold" numberOfLines={2} className="min-w-0 flex-shrink">
                {restaurant?.name ?? "Restaurant"}
              </Txt>
              <Ionicons name="chevron-forward" size={14} color={colors.ink.default} />
            </View>
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              {restaurant?.cuisines.join(", ")}
            </Txt>
            <View className="mt-1 flex-row items-center gap-2">
              <Rating value={restaurant?.rating ?? 0} />
              <View className="h-3 w-px bg-line" />
              <Txt size="tiny" tone="muted">
                {restaurant?.etaMinutes[0]}-{restaurant?.etaMinutes[1]} mins
              </Txt>
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/restaurant/${order.restaurantId}`)}
            className="h-10 items-center justify-center rounded-tile border border-brand-500 px-3 active:opacity-70"
          >
            <Txt size="sm" weight="bold" tone="brand">
              View Menu
            </Txt>
          </Pressable>
        </Card>

        {/* Rider */}
        {!cancelled && (
          <Card className="mx-4 mt-4 flex-row items-center gap-3 p-3">
            {assignedRider ? (
              <>
                <Thumb label={assignedRider.name!} tint={accents.green} size={50} radius={25} />
                <View className="min-w-0 flex-1">
                  <Txt size="tiny" tone="muted">
                    {delivered ? "Delivered by" : "Your Delivery Partner"}
                  </Txt>
                  <Txt weight="bold" numberOfLines={1}>
                    {assignedRider.name}
                  </Txt>
                  {!!assignedRider.vehicleNumber && (
                    <Txt size="tiny" tone="muted">
                      {assignedRider.vehicleNumber}
                    </Txt>
                  )}
                </View>

                {[
                  { icon: "call" as const, label: "Call", url: `tel:${assignedRider.phone ?? ""}` },
                  {
                    icon: "chatbubble-ellipses" as const,
                    label: "Chat",
                    url: `sms:${assignedRider.phone ?? ""}`,
                  },
                ].map((action) => (
                  <View key={action.label} className="items-center gap-1">
                    <Pressable
                      onPress={() => assignedRider.phone && Linking.openURL(action.url)}
                      className="h-10 w-10 items-center justify-center rounded-full border border-line active:opacity-70"
                    >
                      <Ionicons name={action.icon} size={17} color={colors.ink.default} />
                    </Pressable>
                    <Txt size="micro" tone="soft">
                      {action.label}
                    </Txt>
                  </View>
                ))}
              </>
            ) : (
              /*
                Nobody is named before somebody has accepted. Naming a rider
                who has not taken the job gives the customer a person to ring
                who knows nothing about their order.
              */
              <>
                <View className="h-[50px] w-[50px] items-center justify-center rounded-full bg-surface-sunken">
                  <ActivityIndicator size="small" color={colors.brand[600]} />
                </View>
                <View className="min-w-0 flex-1">
                  <Txt weight="bold">Assigning Delivery Partner…</Txt>
                  <Txt size="tiny" tone="muted">
                    We are finding a delivery partner near the restaurant.
                  </Txt>
                </View>
              </>
            )}
          </Card>
        )}

        {/* Route */}
        {!cancelled && (
          <Card className="mx-4 mt-4 p-3">
            <LiveMap
              height={170}
              rider={track.rider}
              restaurant={track.restaurant}
              destination={track.destination}
              route={track.route}
              restaurantLabel={restaurant?.name ?? "Restaurant"}
              destinationLabel="Your Location"
              progress={delivered ? 1 : 0.55}
            />
            <Pressable
              onPress={() => router.push(`/track/${order.id}`)}
              className="mt-3 h-11 flex-row items-center justify-center gap-2 rounded-tile border border-brand-500 active:opacity-70"
            >
              <Ionicons name="locate" size={16} color={colors.brand[600]} />
              <Txt size="sm" weight="bold" tone="brand">
                Live Tracking
              </Txt>
            </Pressable>
          </Card>
        )}

        {/* Address */}
        <Card className="mx-4 mt-4 p-3">
          <Txt weight="bold" className="mb-2">
            Delivery Address
          </Txt>
          <View className="flex-row items-start gap-3">
            <IconTile icon={addressStyle.icon} tint={accents[addressStyle.accent]} size={44} />
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-2">
                <Txt weight="bold">{address.label}</Txt>
                <Pressable onPress={() => router.push("/addresses")} hitSlop={8}>
                  <Txt size="tiny" weight="bold" tone="brand">
                    Change
                  </Txt>
                </Pressable>
              </View>
              <Txt size="tiny" tone="soft" className="mt-0.5">
                {address.line},
              </Txt>
              <Txt size="tiny" tone="soft">
                {address.city}
              </Txt>
              <Txt size="tiny" tone="muted" className="mt-0.5">
                {address.phone}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
          </View>
        </Card>

        {/* Items */}
        <Card className="mx-4 mt-4 p-3">
          <View className="flex-row items-center justify-between">
            {/* "View Receipt" used to sit here with no handler. The receipt
                is this card — the items, every charge and the total are all
                printed below — so the link led to what it was already on. */}
            <Txt weight="bold">Order Items ({itemCount})</Txt>
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
                  {(line.portionName || line.extras.length > 0) && (
                    <Txt size="tiny" tone="muted" numberOfLines={2}>
                      {[line.portionName, ...line.extras.map((e) => e.name)]
                        .filter(Boolean)
                        .join(" · ")}
                    </Txt>
                  )}
                </View>
                <Txt size="sm" weight="medium">
                  {currency(line.unitPrice * line.quantity)}
                </Txt>
              </View>
            ))}
          </View>

          <DashedRule className="my-3" />

          {[
            ["Item Total", order.totals.itemTotal],
            ["Restaurant Packaging Charges", order.totals.packaging],
            ["Delivery Charges", order.totals.delivery],
            ["Platform Fee", order.totals.platformFee],
            ["GST & Taxes", order.totals.taxes],
          ].map(([label, value]) => (
            <View
              key={label as string}
              className="flex-row items-center justify-between py-[3px]"
            >
              <Txt size="sm" tone="soft">
                {label as string}
              </Txt>
              <Txt size="sm" weight="medium">
                {currency(value as number)}
              </Txt>
            </View>
          ))}

          <DashedRule className="my-3" />

          <View className="flex-row items-center justify-between">
            <Txt weight="bold">
              {order.paymentMethod === "COD" ? "Pay on Delivery" : "Paid Online"}
            </Txt>
            <Txt size="lg" weight="bold">
              {currency(order.totals.toPay)}
            </Txt>
          </View>

          {order.totals.saved > 0 && (
            <View className="mt-2 flex-row items-center gap-1.5">
              <Ionicons name="pricetag" size={14} color={colors.ok.default} />
              <Txt size="tiny" weight="semibold" tone="ok">
                You saved {currency(order.totals.saved)} on this order
              </Txt>
            </View>
          )}
        </Card>

        {/* Payment */}
        <Card className="mx-4 mt-4 flex-row items-center gap-3 p-3">
          <IconTile icon="card-outline" tint={accents.blue} size={44} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold">Payment Details</Txt>
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              Paid using {order.paymentDetail}
            </Txt>
          </View>
          <View className="items-end">
            <Txt weight="bold">{currency(order.totals.toPay)}</Txt>
            <Txt size="tiny" weight="semibold" tone={cancelled ? "info" : "ok"}>
              {order.status === "Refunded"
                ? "Refunded"
                : order.paymentMethod === "COD"
                  ? "Pay on delivery"
                  : "Paid"}
            </Txt>
          </View>
        </Card>

        {/* Invoice actions */}
        <View className="mx-4 mt-4 flex-row gap-2.5">
          {[
            { icon: "download-outline" as const, label: "Download Invoice" },
            { icon: "share-social-outline" as const, label: "Share Invoice" },
            { icon: "warning-outline" as const, label: "Report an Issue" },
          ].map((action) => (
            <Pressable
              key={action.label}
              onPress={() => action.label === "Report an Issue" && router.push("/refunds")}
              className="h-14 flex-1 items-center justify-center gap-1 rounded-card border border-brand-500 px-1 active:opacity-70"
            >
              <Ionicons name={action.icon} size={17} color={colors.brand[600]} />
              <Txt size="micro" weight="bold" tone="brand" numberOfLines={1}>
                {action.label}
              </Txt>
            </Pressable>
          ))}
        </View>

        {/* Quick support */}
        <Card className="mx-4 mt-4 p-3">
          <Txt weight="bold">Need help with this order?</Txt>
          <Txt size="tiny" tone="muted" className="mt-0.5">
            Choose an option to get quick support
          </Txt>
          {/* Four across a phone cuts every label to "Wrong…"; two rows of two
              keeps them readable. */}
          <View className="mt-3 flex-row flex-wrap gap-2">
            {SUPPORT_TOPICS.map((topic) => (
              <Pressable
                key={topic.label}
                onPress={() => router.push("/refunds")}
                className="h-11 w-[48%] flex-row items-center justify-center gap-1.5 rounded-tile border border-line px-2 active:opacity-70"
              >
                <Ionicons
                  name={topic.icon}
                  size={15}
                  color={accents[topic.accent].fg}
                />
                <Txt size="tiny" weight="semibold" numberOfLines={1}>
                  {topic.label}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Savings */}
        {order.totals.saved > 0 && (
          <Pressable
            onPress={() => router.push("/offers")}
            className="mx-4 mt-4 flex-row items-center gap-3 rounded-card bg-sun-50 px-3 py-3 active:opacity-80"
          >
            <IconTile icon="ribbon" tint={{ bg: colors.sun[500], fg: "#ffffff" }} size={40} />
            <View className="min-w-0 flex-1">
              <Txt size="sm" weight="bold" numberOfLines={2}>
                You saved {currency(order.totals.saved)} with Reditoe Offers
              </Txt>
              <Txt size="tiny" tone="muted">
                Keep ordering & save more!
              </Txt>
            </View>
            <View className="flex-row items-center gap-0.5 rounded-tile border border-brand-500 px-3 py-2">
              <Txt size="tiny" weight="bold" tone="brand">
                View Offers
              </Txt>
              <Ionicons name="chevron-forward" size={12} color={colors.brand[600]} />
            </View>
          </Pressable>
        )}

        {/* Rate */}
        {/*
          Rating a delivered order.

          The five stars were drawn with no handler, so the question could be
          read but not answered. Choosing one now opens a line for a comment —
          which the server requires — and sends the review.
        */}
        {delivered && (
          <View className="mx-4 mt-4 rounded-card bg-sun-50 px-3 py-3">
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1">
                <Txt size="sm" weight="bold">
                  {reviewed ? "🙏 Thanks for the feedback!" : "👏 Thanks for ordering with Reditoe!"}
                </Txt>
                <Txt size="tiny" tone="muted">
                  {reviewed ? "Your review has been sent." : "How was your overall experience?"}
                </Txt>
              </View>
              <View className="flex-row gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    hitSlop={4}
                    disabled={reviewed}
                    onPress={() => setRating(star)}
                    accessibilityLabel={`Rate ${star} out of 5`}
                  >
                    <Ionicons
                      name={star <= rating ? "star" : "star-outline"}
                      size={22}
                      color={colors.sun[500]}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            {rating > 0 && !reviewed ? (
              <View className="mt-3">
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Tell us a little about it"
                  placeholderTextColor={colors.ink.faint}
                  multiline
                  accessibilityLabel="Your review"
                  className="min-h-[64px] rounded-tile border border-line bg-surface px-3 py-2 text-ink-default"
                />
                <Pressable
                  onPress={sendReview}
                  disabled={sending}
                  accessibilityLabel="Send review"
                  className={`mt-2 h-11 items-center justify-center rounded-tile bg-brand-600 active:opacity-90 ${
                    sending ? "opacity-60" : ""
                  }`}
                >
                  <Txt weight="bold" tone="white">
                    {sending ? "Sending…" : "Send review"}
                  </Txt>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        <Divider className="mx-4 mt-6" />
      </ScrollView>
    </SafeAreaView>
  );
}
