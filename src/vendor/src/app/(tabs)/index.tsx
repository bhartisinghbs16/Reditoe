import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppBar, OutletLine } from "@/components/brand";
import { Photo } from "@/components/photo";
import { Badge, Button, Card, IconPlate, Panel, Toggle, Txt, colors } from "@/components/ui";
import { money, time } from "@/lib/format";
import { hero, img } from "@/lib/images";
import { stageStyle, tints } from "@/lib/theme";
import { orderTotals, useStore, type VendorOrder } from "@/lib/store";

/**
 * Vendor dashboard — a copy of the reference home screen.
 *
 * Order of the page, top to bottom: the Reditoe app bar, the store card with
 * today's sales and the open/closed switch, Today's Overview, Quick Actions,
 * Incoming Orders, the offers promo and this week's performance.
 */

/* ── Store card ─────────────────────────────────────────────────────────── */

/** What the kitchen can promise right now, in minutes. */
const PREP_CHOICES = [15, 20, 30, 45, 60];

function StoreCard() {
  const router = useRouter();
  const { vendor, storeOpen, setStoreOpen, today } = useStore();
  /**
   * Asked before going online, because the customer's delivery estimate is
   * worked out from it and the server will not open the store without one.
   * Closing skips it - there is nothing to promise while shut.
   */
  const [askPrep, setAskPrep] = React.useState(false);

  return (
    <Card className="mx-4 mt-3 p-3.5">
      <View className="flex-row gap-3">
        <Photo uri={hero(vendor.photo, 320)} width={96} height={96} radius={12}>
          <View
            style={{ backgroundColor: storeOpen ? colors.ok.default : colors.bad.default }}
            className="absolute bottom-1.5 left-1.5 rounded-chip px-2 py-0.5"
          >
            <Txt size="micro" weight="bold" tone="white">
              {storeOpen ? "Open" : "Closed"}
            </Txt>
          </View>
        </Photo>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Txt size="lg" weight="bold" numberOfLines={1} className="shrink">
              {vendor.name}
            </Txt>
            {vendor.verified && (
              <Ionicons name="checkmark-circle" size={16} color={colors.brand[600]} />
            )}
          </View>

          <OutletLine id={vendor.outletId} verified={vendor.verified} />

          <View className="mt-1.5 flex-row items-center gap-2">
            <Ionicons name="star" size={13} color="#f59e0b" />
            <Txt size="tiny" weight="semibold">
              {vendor.rating || "—"}
            </Txt>
            {vendor.reviews > 0 && (
              <Txt size="tiny" tone="muted">
                ({vendor.reviews} Reviews)
              </Txt>
            )}
            <Txt size="tiny" tone="faint">
              |
            </Txt>
            <Ionicons name="time-outline" size={13} color={colors.ink.muted} />
            <Txt size="tiny" tone="muted">
              {vendor.eta}
            </Txt>
          </View>

          <Txt size="tiny" tone="muted" className="mt-1.5" numberOfLines={2}>
            {vendor.address}
          </Txt>
        </View>
      </View>

      <View className="mt-3 flex-row gap-2.5">
        <Pressable
          onPress={() => router.push("/earnings")}
          className="flex-1 rounded-tile bg-surface-sunken p-3 active:opacity-80"
        >
          <Txt size="tiny" tone="muted">
            Today&apos;s Sales
          </Txt>
          <Txt size="xl" weight="bold" tone="ok" className="mt-0.5">
            {money(today.earnings)}
          </Txt>
          <View className="mt-0.5 flex-row items-center justify-between">
            <Txt size="tiny" tone="muted">
              {today.orders} Orders
            </Txt>
            <Ionicons name="chevron-forward" size={13} color={colors.ink.faint} />
          </View>
        </Pressable>

        <View className="flex-1 rounded-tile bg-surface-sunken p-3">
          <Txt size="tiny" tone="muted">
            Today&apos;s Status
          </Txt>
          <View className="mt-1 flex-row items-center justify-between">
            <Txt size="lg" weight="bold" tone={storeOpen ? "ok" : "bad"}>
              {storeOpen ? "Open" : "Closed"}
            </Txt>
            <Toggle
              value={storeOpen}
              onValueChange={(next) =>
                next ? setAskPrep(true) : setStoreOpen(false)
              }
              accessibilityLabel="Accepting orders"
            />
          </View>
        </View>
      </View>

      <Button
        label="Store Settings"
        icon="settings-outline"
        variant="outline"
        className="mt-2.5"
        onPress={() => router.push("/more")}
      />

      <Modal
        visible={askPrep}
        transparent
        animationType="fade"
        onRequestClose={() => setAskPrep(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setAskPrep(false)}
        >
          <Pressable className="rounded-t-panel bg-surface p-4" onPress={() => {}}>
            <Txt size="lg" weight="bold">
              How long is food taking?
            </Txt>
            <Txt size="tiny" tone="muted" className="mt-1">
              Customers see this as their delivery estimate. You can change it
              whenever the kitchen gets busier.
            </Txt>

            <View className="mt-3 gap-2">
              {PREP_CHOICES.map((minutes) => (
                <Pressable
                  key={minutes}
                  onPress={() => {
                    setAskPrep(false);
                    setStoreOpen(true, minutes);
                  }}
                  className="flex-row items-center justify-between rounded-tile border border-line px-3 py-3 active:opacity-70"
                >
                  <Txt weight="semibold">{minutes} minutes</Txt>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.ink.faint}
                  />
                </Pressable>
              ))}
            </View>

            <Button
              label="Cancel"
              variant="outline"
              className="mt-3"
              onPress={() => setAskPrep(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {!storeOpen && (
        <View className="mt-2.5 flex-row items-center gap-2 rounded-tile bg-bad-soft px-3 py-2">
          <Ionicons name="pause-circle" size={15} color={colors.bad.default} />
          <Txt size="tiny" weight="semibold" className="flex-1 text-bad-ink">
            Your store is closed. Customers can&apos;t place orders right now.
          </Txt>
        </View>
      )}
    </Card>
  );
}

/* ── Today's Overview ───────────────────────────────────────────────────── */

function OverviewTile({
  icon,
  tint,
  label,
  value,
  link,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: keyof typeof tints;
  label: string;
  value: string;
  link: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="min-w-[46%] flex-1 items-center rounded-tile border border-line bg-surface p-3 active:opacity-80"
    >
      <IconPlate icon={icon} tint={tint} size={40} />
      <Txt size="tiny" tone="muted" className="mt-2 text-center" numberOfLines={1}>
        {label}
      </Txt>
      <Txt size="xl" weight="bold" className="mt-0.5" numberOfLines={1}>
        {value}
      </Txt>
      <Txt
        size="tiny"
        weight="semibold"
        className="mt-1"
        style={{ color: tints[tint].fg }}
        numberOfLines={1}
      >
        {link}
      </Txt>
    </Pressable>
  );
}

/**
 * Every item still to be cooked, added up across all the open orders.
 *
 * A kitchen with four orders for gobi rice reads four separate tickets and
 * cooks it four times. This is the same information the tickets carry, summed
 * - so the same dish is prepared once, in the quantity actually needed.
 *
 * Counted from the live orders, so it follows every acceptance, cancellation
 * and status change without anything extra to refresh.
 */
function TotalOrderItems() {
  const { orders } = useStore();

  const totals = React.useMemo(() => {
    /*
     * Only what is still coming. A delivered or cancelled order has nothing
     * left to cook, and counting it would tell the kitchen to make more.
     */
    const pending = orders.filter(
      (order) => order.stage !== "delivered" && order.stage !== "cancelled"
    );

    const byName = new Map<string, { name: string; quantity: number; veg: boolean }>();
    for (const order of pending) {
      for (const line of order.lines ?? []) {
        const key = line.name.trim().toLowerCase();
        if (!key) continue;
        const entry = byName.get(key) ?? { name: line.name.trim(), quantity: 0, veg: line.veg };
        entry.quantity += line.quantity ?? 1;
        byName.set(key, entry);
      }
    }

    return [...byName.values()].sort((a, b) => b.quantity - a.quantity);
  }, [orders]);

  const totalDishes = totals.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <Panel
      title="Total Order Items"
      className="mx-4 mt-3"
      bodyClassName="px-3.5 pb-4"
    >
      {totals.length === 0 ? (
        <Txt size="tiny" tone="muted">
          Nothing waiting to be cooked right now.
        </Txt>
      ) : (
        <>
          <Txt size="tiny" tone="muted">
            {totalDishes} {totalDishes === 1 ? "dish" : "dishes"} across{" "}
            {totals.length} {totals.length === 1 ? "item" : "items"}
          </Txt>
          <View className="mt-2">
            {totals.map((entry, index) => (
              <View
                key={entry.name}
                className={`flex-row items-center gap-2.5 py-2 ${
                  index > 0 ? "border-t border-line" : ""
                }`}
              >
                <View
                  style={{ borderColor: entry.veg ? colors.ok.default : colors.bad.default }}
                  className="h-3.5 w-3.5 items-center justify-center rounded-[3px] border"
                >
                  <View
                    style={{ backgroundColor: entry.veg ? colors.ok.default : colors.bad.default }}
                    className="h-1.5 w-1.5 rounded-full"
                  />
                </View>
                <Txt size="sm" className="min-w-0 flex-1" numberOfLines={1}>
                  {entry.name}
                </Txt>
                <Txt size="lg" weight="bold" tone="indigo">
                  {entry.quantity}
                </Txt>
              </View>
            ))}
          </View>
        </>
      )}
    </Panel>
  );
}

function TodayOverview() {
  const router = useRouter();
  const { today, vendor } = useStore();

  return (
    <Panel
      title="Today's Overview"
      action="View Details"
      onAction={() => router.push("/earnings")}
      className="mx-4 mt-3"
      bodyClassName="px-3.5 pb-4"
    >
      <View className="flex-row flex-wrap gap-2.5">
        <OverviewTile
          icon="bag-handle-outline"
          tint="green"
          label="Total Orders"
          value={String(today.orders)}
          link="View Orders"
          onPress={() => router.push("/orders")}
        />
        <OverviewTile
          icon="cash-outline"
          tint="amber"
          label="Total Earnings"
          value={money(today.earnings)}
          link="View Earnings"
          onPress={() => router.push("/earnings")}
        />
        <OverviewTile
          icon="trending-up-outline"
          tint="red"
          label="Average Order Value"
          value={money(today.averageOrder)}
          link="View Analytics"
          onPress={() => router.push("/earnings")}
        />
        <OverviewTile
          icon="eye-outline"
          tint="violet"
          label="Profile Views"
          value={String(vendor.profileViews)}
          link="View Profile"
          onPress={() => router.push("/more")}
        />
      </View>
    </Panel>
  );
}

/* ── Quick Actions ──────────────────────────────────────────────────────── */

function QuickActions() {
  const router = useRouter();
  const { orders } = useStore();
  const waiting = orders.filter((o) => o.stage === "new").length;

  const actions: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    href: string;
    badge?: number;
  }[] = [
    { label: "Manage Menu", icon: "restaurant-outline", href: "/menu" },
    { label: "Orders", icon: "bag-handle-outline", href: "/orders", badge: waiting },
    { label: "Add Item", icon: "add-circle-outline", href: "/item/new" },
    { label: "Offers & Coupons", icon: "pricetag-outline", href: "/offers" },
    { label: "Payouts", icon: "wallet-outline", href: "/earnings" },
    { label: "Pickup Verify", icon: "qr-code-outline", href: "/pickup" },
    { label: "Business Profile", icon: "storefront-outline", href: "/more" },
  ];

  return (
    <View className="mt-4">
      <Txt size="lg" weight="bold" className="mb-2.5 px-4">
        Quick Actions
      </Txt>
      <View className="flex-row flex-wrap gap-2.5 px-4">
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={() => router.push(action.href as never)}
            className="min-w-[30%] flex-1 items-center justify-start rounded-tile border border-line bg-surface px-2 py-3 active:opacity-80"
          >
            <View>
              <IconPlate icon={action.icon} tint="red" size={38} />
              {action.badge !== undefined && action.badge > 0 && (
                <View className="absolute -right-1.5 -top-1.5 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1">
                  <Txt size="micro" weight="bold" tone="white">
                    {action.badge}
                  </Txt>
                </View>
              )}
            </View>
            <Txt size="tiny" weight="medium" className="mt-2 text-center">
              {action.label}
            </Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ── Incoming orders ────────────────────────────────────────────────────── */

function IncomingRow({ order, last }: { order: VendorOrder; last?: boolean }) {
  const { advance } = useStore();
  const router = useRouter();
  const stage = stageStyle[order.stage];
  const items = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const cod = order.payment === "COD";

  const action =
    order.stage === "new"
      ? { label: "Accept", to: "preparing" as const }
      : order.stage === "preparing"
        ? { label: "Ready", to: "ready" as const }
        : { label: "Picked Up", to: "picked" as const };

  return (
    <View className={`flex-row items-center gap-3 px-3.5 py-3 ${last ? "" : "border-b border-line"}`}>
      <View className="w-[74px]">
        <Badge
          label={stage.short}
          tone={
            order.stage === "new"
              ? "ok"
              : order.stage === "preparing"
                ? "warn"
                : order.stage === "ready"
                  ? "info"
                  : "indigo"
          }
        />
      </View>

      <Pressable
        onPress={() => router.push(`/order/${order.id}`)}
        accessibilityLabel={`Open order ${order.id}`}
        className="min-w-0 flex-1 active:opacity-70"
      >
        <Txt size="sm" weight="bold" numberOfLines={1}>
          #{order.reference}
        </Txt>
        <Txt size="micro" tone="muted">
          {time(order.placedAt)}
        </Txt>
        <Txt size="sm" weight="semibold" className="mt-1" numberOfLines={1}>
          {order.customer}
        </Txt>
        <Txt size="micro" tone="muted">
          {items} Items • {money(orderTotals(order).total)}
        </Txt>
        <Txt size="micro" weight="semibold" tone={cod ? "warn" : "ok"}>
          Payment: {cod ? "COD" : "Online"}
        </Txt>
      </Pressable>

      <View className="items-end gap-1.5">
        <Txt size="micro" tone="muted">
          {order.prepMinutes}–{order.prepMinutes + 5} mins
        </Txt>
        <Txt size="micro" tone="muted">
          {order.paid ? "Paid" : "Collect on delivery"}
        </Txt>
        <Button
          label={action.label}
          iconRight="chevron-forward"
          variant="outline"
          size="sm"
          onPress={() => advance(order.id, action.to)}
        />
      </View>
    </View>
  );
}

function IncomingOrders() {
  const router = useRouter();
  const { orders } = useStore();
  const incoming = orders.filter(
    (o) => o.stage === "new" || o.stage === "preparing" || o.stage === "ready"
  );

  return (
    <Panel
      title={`Incoming Orders (${incoming.length})`}
      action="View All"
      onAction={() => router.push("/orders")}
      className="mx-4 mt-4"
    >
      {incoming.length === 0 ? (
        <View className="items-center px-6 pb-6 pt-2">
          <Ionicons name="checkmark-done" size={26} color={colors.ok.default} />
          <Txt weight="semibold" className="mt-2">
            All caught up
          </Txt>
          <Txt size="tiny" tone="muted" className="mt-0.5 text-center">
            New orders will appear here the moment they arrive.
          </Txt>
        </View>
      ) : (
        <View className="border-t border-line">
          {incoming.map((order, index) => (
            <IncomingRow key={order.id} order={order} last={index === incoming.length - 1} />
          ))}
        </View>
      )}
    </Panel>
  );
}

/* ── Promo & performance ────────────────────────────────────────────────── */

function GrowBanner() {
  const router = useRouter();
  return (
    <View className="mx-4 mt-4 flex-row items-center gap-3 rounded-card bg-brand-50 p-4">
      <View className="min-w-0 flex-1">
        <Txt size="lg" weight="bold">
          Grow Your Business!
        </Txt>
        <Txt size="tiny" tone="soft" className="mt-1">
          Create exciting offers &amp; discounts to attract more customers.
        </Txt>
        <Button
          label="Create Offer"
          iconRight="chevron-forward"
          size="sm"
          className="mt-3 self-start px-4"
          onPress={() => router.push("/offers")}
        />
      </View>

      {/* The discount rosette of the reference banner. */}
      <View className="h-[78px] w-[78px] items-center justify-center rounded-full bg-brand-600">
        <Txt size="micro" weight="semibold" tone="white">
          UP TO
        </Txt>
        <Txt size="xl" weight="bold" tone="white">
          30%
        </Txt>
        <Txt size="micro" weight="semibold" tone="white">
          OFF
        </Txt>
      </View>
    </View>
  );
}

function BusinessPerformance() {
  const router = useRouter();
  const { weekPerformance } = useStore();

  return (
    <Panel
      title="Business Performance"
      subtitle="Current period"
      action="View Report"
      onAction={() => router.push("/earnings")}
      className="mx-4 mt-4"
      bodyClassName="px-3.5 pb-4"
    >
      {/* No deltas: the API reports current figures, not a comparison with
          last week, and an invented percentage next to real numbers reads as
          though it were measured. */}
      <View className="flex-row flex-wrap gap-y-4">
        {weekPerformance.map((row) => (
          <View key={row.label} className="w-1/2 flex-row items-start gap-2.5">
            <IconPlate icon={row.icon} tint={row.tint} size={34} />
            <View className="min-w-0 flex-1">
              <Txt size="tiny" tone="muted" numberOfLines={1}>
                {row.label}
              </Txt>
              <Txt size="lg" weight="bold" numberOfLines={1}>
                {row.value}
              </Txt>
            </View>
          </View>
        ))}
      </View>
    </Panel>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

export default function VendorHome() {
  const router = useRouter();
  const { vendor, notifications } = useStore();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <View className="border-b border-line">
        {/*
          None of these were wired, so the menu, the bell and the profile
          picture were all decoration. The picture also showed a stock photo
          rather than the restaurant's own logo, which is what a vendor
          expects to see after signing in.
        */}
        <AppBar
          photoUri={vendor.image ?? img(vendor.photo, 120)}
          notifications={notifications}
          onMenu={() => router.push("/(tabs)/more")}
          onNotifications={() => router.push("/(tabs)/orders")}
          /* The restaurant's own record, not the settings menu. "Profile"
             opened More, which is where every other setting lives. */
          onProfile={() => router.push("/restaurant-info")}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6">
        {/*
          No logo block here. The wordmark belongs in the top bar, which is
          where the client's reference shows it - a second copy of it below
          only pushed the store card down the screen.
        */}
        <StoreCard />
        <TodayOverview />
        <TotalOrderItems />
        <QuickActions />
        <IncomingOrders />
        <GrowBanner />
        <BusinessPerformance />
      </ScrollView>
    </SafeAreaView>
  );
}
