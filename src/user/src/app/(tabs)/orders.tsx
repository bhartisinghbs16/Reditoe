import React from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  Card,
  EmptyState,
  IconTile,
  TabStrip,
  Txt,
  colors,
} from "@/components/ui";
import { HeaderIcon } from "@/components/screen-header";
import { Photo } from "@/components/photo";
import { photoUri } from "@/lib/images";
import { accents, categoryTint, statusFor } from "@/lib/theme";
import { currency, friendlyDateTime, time } from "@/lib/format";
import { type PlacedOrder, useStore } from "@/lib/store";
import { shareReferral } from "@/lib/referral";

/**
 * "My Orders", copied from the reference: the status tab strip, the three
 * dropdown filters with a Clear link, the monthly savings strip, the order
 * cards with their View Details / Reorder pair, and the paging footer.
 */

const TABS = ["All", "Ongoing", "Delivered", "Cancelled", "Refunded"] as const;

/**
 * The periods the date chip cycles through.
 *
 * The chip used to read "This Month" and do nothing, so the list it sat above
 * was never filtered by anything it claimed to filter by. Pressing it now
 * moves to the next period and the list follows.
 */
const PERIODS = [
  { label: "All Time", days: null },
  { label: "This Month", days: 30 },
  { label: "Last 3 Months", days: 90 },
  { label: "This Year", days: 365 },
] as const;

/** How many orders a page shows, so "Next" has something to do. */
const PAGE_SIZE = 10;

function OrderCard({ order, index }: { order: PlacedOrder; index: number }) {
  const router = useRouter();
  const { addLine, dishById, restaurantById } = useStore();
  const restaurant = restaurantById(order.restaurantId);
  const status = statusFor(order.status);
  const live = order.status !== "Delivered" && order.status !== "Cancelled" &&
    order.status !== "Refunded";

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

  const closingLine =
    order.status === "Delivered" && order.deliveredAt
      ? `Delivered at ${time(order.deliveredAt)}`
      : order.status === "Cancelled"
        ? `Cancelled at ${time(order.placedAt)}`
        : order.status === "Refunded"
          ? "Refund credited"
          : `Arriving by ${time(order.etaAt)}`;

  return (
    <Card className="mx-4 mb-3 overflow-hidden">
      <Pressable
        onPress={() => router.push(`/order/${order.id}`)}
        className="flex-row gap-3 p-3 active:opacity-80"
      >
        <Photo
          uri={photoUri(restaurant, 220)}
          width={72}
          height={72}
          radius={10}
          tint={categoryTint(index)}
        />

        <View className="min-w-0 flex-1">
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              <Txt weight="bold" numberOfLines={1} className="min-w-0 flex-shrink">
                {restaurant?.name ?? "Restaurant"}
              </Txt>
              <Ionicons name="checkmark-circle" size={14} color={colors.leaf[600]} />
            </View>
            <Badge label={status.label} tone={status.tone} />
            <Ionicons name="chevron-forward" size={16} color={colors.ink.faint} />
          </View>

          <Txt size="tiny" tone="muted" numberOfLines={1} className="mt-1">
            {itemCount} {itemCount === 1 ? "Item" : "Items"} · Order ID: {order.code}
          </Txt>
          <Txt size="tiny" tone="muted" numberOfLines={1}>
            {friendlyDateTime(order.placedAt)}
          </Txt>

          <View className="mt-1 flex-row items-end justify-between gap-2">
            <Txt weight="bold">{currency(order.totals.toPay)}</Txt>
            <Txt size="tiny" tone={live ? "brand" : "muted"} numberOfLines={1}>
              {closingLine}
            </Txt>
          </View>
        </View>
      </Pressable>

      <View className="flex-row gap-3 px-3 pb-3">
        <Pressable
          onPress={() => router.push(`/order/${order.id}`)}
          className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-tile border border-line bg-surface active:opacity-70"
        >
          <Ionicons name="eye-outline" size={15} color={colors.ink.soft} />
          <Txt size="sm" weight="semibold">
            View Details
          </Txt>
        </Pressable>

        {order.status !== "Cancelled" && order.status !== "Refunded" && (
          <Pressable
            onPress={live ? () => router.push(`/track/${order.id}`) : reorder}
            className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-tile border border-brand-500 bg-surface active:opacity-70"
          >
            <Ionicons
              name={live ? "navigate-outline" : "refresh"}
              size={15}
              color={colors.brand[600]}
            />
            <Txt size="sm" weight="bold" tone="brand">
              {live ? "Track Order" : "Reorder"}
            </Txt>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const { orders, itemCount } = useStore();
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("All");
  const [periodIndex, setPeriodIndex] = React.useState(0);
  const [restaurantId, setRestaurantId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(0);
  const [pickingRestaurant, setPickingRestaurant] = React.useState(false);
  const { restaurantById } = useStore();

  /** The kitchens this customer has actually ordered from. */
  const orderedFrom = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const order of orders) {
      if (seen.has(order.restaurantId)) continue;
      seen.set(order.restaurantId, restaurantById(order.restaurantId)?.name ?? "Restaurant");
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [orders, restaurantById]);

  const period = PERIODS[periodIndex];

  const matching = orders.filter((order) => {
    if (tab === "All") return true;
    if (tab === "Ongoing")
      return (
        order.status !== "Delivered" &&
        order.status !== "Cancelled" &&
        order.status !== "Refunded"
      );
    // The remaining tabs name a status exactly.
    return order.status === tab;
  })
    .filter((order) => {
      if (!period.days) return true;
      const cutoff = Date.now() - period.days * 24 * 60 * 60 * 1000;
      return new Date(order.placedAt).getTime() >= cutoff;
    })
    .filter((order) => !restaurantId || order.restaurantId === restaurantId);

  /* A page of them, so the pager below is telling the truth. */
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const shown = matching.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  /* Any change to what is being filtered starts again at the first page. */
  React.useEffect(() => {
    setPage(0);
  }, [tab, periodIndex, restaurantId]);

  const savedThisMonth = orders.reduce((sum, order) => sum + order.totals.saved, 0);

  /** The last order worth rating — the newest one that actually arrived. */
  const lastDelivered = React.useMemo(
    () =>
      [...orders]
        .filter((order) => order.status === "Delivered")
        .sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt))[0],
    [orders]
  );

  const footerActions = [
    {
      icon: "headset-outline" as const,
      title: "Need Help?",
      detail: "Get quick support",
      accent: "red" as const,
      onPress: () => router.push("/support"),
    },
    {
      icon: "star-outline" as const,
      title: "Rate Your Order",
      detail: "Share your feedback",
      accent: "amber" as const,
      onPress: () =>
        lastDelivered
          ? router.push(`/order/${lastDelivered.id}`)
          : Alert.alert(
              "Nothing to rate yet",
              "Once an order has been delivered you can rate it here."
            ),
    },
    {
      icon: "gift-outline" as const,
      title: "Invite Friends",
      detail: "Earn Reditoe Money",
      accent: "pink" as const,
      onPress: shareReferral,
    },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      {/* Header — a tab root, so no back arrow, but the reference's type. */}
      <View className="flex-row items-center gap-3 bg-surface px-4 pb-3 pt-2">
        <View className="min-w-0 flex-1">
          <Txt size="2xl" weight="bold">
            My Orders
          </Txt>
          <Txt size="tiny" tone="muted">
            View and track all your orders
          </Txt>
        </View>
        <HeaderIcon icon="search" onPress={() => router.push("/search")} label="Search orders" />
        {/* Was decoration: no handler, beside a working search icon. */}
        <HeaderIcon
          icon="funnel-outline"
          size={20}
          label="Filter orders"
          onPress={() => setPeriodIndex((i) => (i + 1) % PERIODS.length)}
        />
      </View>

      <TabStrip tabs={TABS} value={tab} onChange={setTab} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName={itemCount > 0 ? "pb-28" : "pb-6"}
      >
        {/* Filters — scrolled rather than squeezed, so every label stays whole. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="items-center gap-2 px-4 py-3"
        >
          <Pressable
            onPress={() => setPeriodIndex((i) => (i + 1) % PERIODS.length)}
            accessibilityLabel={`Period: ${period.label}. Press to change.`}
            className={`h-10 flex-row items-center gap-1.5 rounded-tile border px-3 active:opacity-70 ${
              period.days ? "border-brand-600 bg-brand-50" : "border-line bg-surface"
            }`}
          >
            <Ionicons name="calendar-outline" size={14} color={colors.ink.soft} />
            <Txt size="tiny" weight="medium" tone={period.days ? "brand" : "default"}>
              {period.label}
            </Txt>
            <Ionicons name="chevron-down" size={12} color={colors.ink.muted} />
          </Pressable>

          {/* Only worth offering once there is more than one kitchen to pick. */}
          {orderedFrom.length > 1 ? (
            <Pressable
              onPress={() => setPickingRestaurant(true)}
              accessibilityLabel="Filter by restaurant"
              className={`h-10 flex-row items-center gap-1.5 rounded-tile border px-3 active:opacity-70 ${
                restaurantId ? "border-brand-600 bg-brand-50" : "border-line bg-surface"
              }`}
            >
              <Ionicons name="storefront-outline" size={14} color={colors.ink.soft} />
              <Txt size="tiny" weight="medium" tone={restaurantId ? "brand" : "default"} numberOfLines={1}>
                {restaurantId
                  ? orderedFrom.find((r) => r.id === restaurantId)?.name ?? "Restaurant"
                  : "All Restaurants"}
              </Txt>
              <Ionicons name="chevron-down" size={12} color={colors.ink.muted} />
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => {
              setTab("All");
              setPeriodIndex(0);
              setRestaurantId(null);
            }}
            hitSlop={8}
            className="px-2"
          >
            <Txt size="sm" weight="bold" tone="brand">
              Clear
            </Txt>
          </Pressable>
        </ScrollView>

        {savedThisMonth > 0 && (
          <Pressable
            onPress={() => router.push("/offers")}
            className="mx-4 mb-4 flex-row items-center gap-3 rounded-card bg-sun-50 px-3 py-3 active:opacity-80"
          >
            <View className="h-10 w-10 items-center justify-center rounded-lg bg-sun-400">
              <Ionicons name="pricetags" size={19} color="#ffffff" />
            </View>
            <View className="min-w-0 flex-1">
              <Txt size="sm" weight="bold" numberOfLines={2}>
                You saved {currency(savedThisMonth)} this month on your orders
              </Txt>
              <Txt size="tiny" tone="muted">
                Keep ordering with Reditoe!
              </Txt>
            </View>
            <View className="flex-row items-center gap-0.5">
              <Txt size="tiny" weight="bold" tone="brand">
                View Savings
              </Txt>
              <Ionicons name="chevron-forward" size={12} color={colors.brand[600]} />
            </View>
          </Pressable>
        )}

        {shown.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No orders here"
            detail="Nothing matches this filter yet."
            action="Browse restaurants"
            onAction={() => router.push("/")}
          />
        ) : (
          shown.map((order, index) => (
            <OrderCard key={order.id} order={order} index={index} />
          ))
        )}

        {/*
          The pager said "Showing 1–N of N" beside a Next button that had
          nothing to advance to. It now counts the page it is actually on, and
          the arrows are only offered when there is somewhere to go.
        */}
        {shown.length > 0 && (
          <View className="flex-row items-center justify-center gap-4 px-4 py-2">
            {current > 0 ? (
              <Pressable
                onPress={() => setPage(current - 1)}
                hitSlop={8}
                accessibilityLabel="Previous page"
                className="flex-row items-center gap-0.5 active:opacity-70"
              >
                <Ionicons name="chevron-back" size={12} color={colors.brand[600]} />
                <Txt size="tiny" weight="bold" tone="brand">
                  Previous
                </Txt>
              </Pressable>
            ) : null}

            <Txt size="tiny" tone="muted">
              Showing {current * PAGE_SIZE + 1}–{current * PAGE_SIZE + shown.length} of{" "}
              {matching.length} orders
            </Txt>

            {current < pageCount - 1 ? (
              <Pressable
                onPress={() => setPage(current + 1)}
                hitSlop={8}
                accessibilityLabel="Next page"
                className="flex-row items-center gap-0.5 active:opacity-70"
              >
                <Txt size="tiny" weight="bold" tone="brand">
                  Next
                </Txt>
                <Ionicons name="chevron-forward" size={12} color={colors.brand[600]} />
              </Pressable>
            ) : null}
          </View>
        )}

        <View className="mx-4 mt-4 flex-row items-center rounded-card bg-surface-sunken py-3">
          {footerActions.map((action, index) => (
            <Pressable
              key={action.title}
              onPress={action.onPress}
              accessibilityLabel={action.title}
              className={`flex-1 flex-row items-center gap-2 px-2 active:opacity-70 ${
                index > 0 ? "border-l border-line" : ""
              }`}
            >
              <IconTile icon={action.icon} tint={accents[action.accent]} size={32} />
              <View className="min-w-0 flex-1">
                <Txt size="micro" weight="bold" numberOfLines={1}>
                  {action.title}
                </Txt>
                <Txt size="micro" tone="muted" numberOfLines={1}>
                  {action.detail}
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>


      {/* Which kitchen to show, chosen from the ones this customer has used. */}
      <Modal
        visible={pickingRestaurant}
        transparent
        animationType="slide"
        onRequestClose={() => setPickingRestaurant(false)}
      >
        <Pressable
          onPress={() => setPickingRestaurant(false)}
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          className="flex-1 justify-end"
        >
          <Pressable onPress={() => {}} className="max-h-[70%] rounded-t-[22px] bg-surface">
            <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
              <Txt size="lg" weight="bold">
                Filter by restaurant
              </Txt>
              <Pressable
                onPress={() => setPickingRestaurant(false)}
                hitSlop={10}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={colors.ink.muted} />
              </Pressable>
            </View>

            <ScrollView contentContainerClassName="pb-8">
              {[{ id: null as string | null, name: "All Restaurants" }, ...orderedFrom].map(
                (entry) => {
                  const chosen = restaurantId === entry.id;
                  return (
                    <Pressable
                      key={entry.id ?? "all"}
                      onPress={() => {
                        setRestaurantId(entry.id);
                        setPickingRestaurant(false);
                      }}
                      accessibilityLabel={entry.name}
                      className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-70"
                    >
                      <Txt weight={chosen ? "bold" : "medium"} tone={chosen ? "brand" : "default"} className="flex-1">
                        {entry.name}
                      </Txt>
                      {chosen ? (
                        <Ionicons name="checkmark" size={18} color={colors.brand[600]} />
                      ) : null}
                    </Pressable>
                  );
                }
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
