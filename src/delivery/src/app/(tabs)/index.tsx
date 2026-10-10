import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  ActionLink,
  Card,
  IconPlate,
  NoteBar,
  Panel,
  ProgressBar,
  SectionTitle,
  StatCell,
  Txt,
  colors,
} from "@/components/ui";
import { AppBar } from "@/components/screen-header";
import { PartnerCard } from "@/components/partner-card";
import { OrderCard } from "@/components/order-card";
import { ProgressTrack } from "@/components/tracker";
import { LinearGradient } from "@/components/photo";
import { money, time } from "@/lib/format";
import { greenHeader, tints, type TintName } from "@/lib/theme";
import { useStore } from "@/lib/store";

/**
 * The rider Dashboard, reproduced from the client's reference screen: the
 * partner strip, the green wallet banner, the duty banner, the bonus meter,
 * the current order with its progress track, today's figures, quick actions,
 * performance and the safety and encouragement notes that close the page.
 */



const QUICK_ACTIONS: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: TintName;
  label: string;
  href: string;
}[] = [
  { icon: "clipboard-outline", tint: "blue", label: "Order History", href: "/orders" },
  { icon: "wallet-outline", tint: "violet", label: "Earnings", href: "/earnings" },
  // Support opened the profile screen, which is not support.
  { icon: "headset-outline", tint: "red", label: "Support", href: "/support" },
  { icon: "person-outline", tint: "teal", label: "Profile", href: "/profile" },
];

function QuickActions() {
  const router = useRouter();

  /*
   * "View All" had nothing behind it, and there is nothing more to show -
   * every quick action is already on the row. The label is gone rather than
   * left looking tappable.
   */
  return (
    <Panel title="Quick Actions" bodyClassName="flex-row px-3 pb-4">
      {QUICK_ACTIONS.map((action) => (
        <Pressable
          key={action.label}
          onPress={() => router.push(action.href as never)}
          className="flex-1 items-center gap-2 px-0.5 active:opacity-70"
        >
          <IconPlate icon={action.icon} tint={action.tint} size={48} />
          <Txt size="micro" weight="medium" className="text-center" numberOfLines={2}>
            {action.label}
          </Txt>
        </Pressable>
      ))}
    </Panel>
  );
}

/** Orders, earnings, distance and fuel for the day. */
function TodayProgress() {
  const router = useRouter();
  const { wallet } = useStore();
  /*
   * What a rider is measured on. Fuel spent was here and is gone: the app
   * never knew what anyone spent on fuel, so the figure was invented.
   */
  const accepted = wallet.acceptanceRatio;
  const cells = [
    { icon: "bag-handle" as const, tint: "green" as const, value: String(wallet.today.orders), label: "Orders Completed" },
    { icon: "cash" as const, tint: "blue" as const, value: money(wallet.today.amount), label: "Today's Earnings" },
    { icon: "bicycle" as const, tint: "orange" as const, value: String(wallet.totalTrips), label: "Total Trips" },
    {
      icon: "checkmark-circle" as const,
      tint: "blue" as const,
      value: accepted === null ? "—" : `${accepted}%`,
      label: "Acceptance Ratio",
    },
  ];

  return (
    <Panel
      title="Today's Progress"
      action="View Details"
      onAction={() => router.push("/earnings")}
      bodyClassName="px-4 pb-4"
    >
      <View className="flex-row rounded-tile border border-line py-3">
        {cells.map((cell, index) => (
          <StatCell
            key={cell.label}
            {...cell}
            valueSize="sm"
            order="value-first"
            divided={index > 0}
          />
        ))}
      </View>
    </Panel>
  );
}

function MyPerformance() {
  const router = useRouter();
  const { performance } = useStore();
  return (
    <Panel
      title="My Performance"
      action="View Details"
      onAction={() => router.push("/earnings")}
      bodyClassName="flex-row px-2 pb-4"
    >
      {performance.map((row, index) => (
        <StatCell
          key={row.label}
          icon={row.icon}
          tint={row.tint}
          value={row.value}
          label={row.label}
          note={row.note}
          noteTone="green"
          order="value-first"
          divided={index > 0}
        />
      ))}
    </Panel>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { orders, unread } = useStore();

  /*
   * Everything waiting on the rider, offers first.
   *
   * The screen showed one - the first offer, or failing that whatever
   * happened to be at the top of the list - so a rider with two offers in
   * front of them could see only one, and the other timed out unseen.
   */
  const actionable = orders.filter(
    (order) => order.stage !== "delivered" && order.stage !== "cancelled"
  );
  const queue = [
    ...actionable.filter((order) => order.stage === "offered"),
    ...actionable.filter((order) => order.stage !== "offered"),
  ];
  const current = queue[0];

  const stageIndex = current
    ? ["offered", "accepted", "at_restaurant", "picked_up", "at_customer", "delivered"].indexOf(
        current.stage
      )
    : -1;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8">
        {/* The logo goes in the bar itself, as it does in the vendor app. */}
        <AppBar brand trailing="bell"
          notifications={unread}
          onTrailing={() => router.push("/notifications")}
        />

        <PartnerCard greeting="Good Morning! 👋" card={false} className="bg-surface pb-2" />

        {/*
          The home screen shows the day, not the account.
          
          A wallet balance, three earnings periods and a bonus meter sat here;
          the client asked for today's earnings and nothing else, and the
          balance belongs on Earnings where it can be acted on. The duty
          banner went with them - the switch is already on the card above, and
          two controls for one thing is how a rider ends up unsure which
          state they are in.
        */}

        {queue.length > 0 && (
          <View className="mt-5">
            <SectionTitle
              title={queue.length > 1 ? "Current Orders" : "Current Order"}
              action="View All Orders"
              onAction={() => router.push("/orders")}
              className="px-4"
            />
            <View className="mt-3 gap-3 px-4">
              {queue.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onPress={() => router.push(`/order/${order.id}` as never)}
                />
              ))}
            </View>
          </View>
        )}

        <View className="mt-3.5 gap-3.5 px-4">
          {current && (
            <Panel title="Order Progress" bodyClassName="px-3 pb-4">
              {/* An unaccepted offer has reached no stop yet, so nothing is lit. */}
              <ProgressTrack
                current={stageIndex - 1}
                steps={[
                  { label: "Order Accepted", icon: "bag-handle", at: time(current.placedAt) },
                  { label: "Picked Up", icon: "storefront" },
                  { label: "On the Way", icon: "location" },
                  { label: "Delivered", icon: "checkmark-circle" },
                ]}
              />
            </Panel>
          )}

          <TodayProgress />
          <QuickActions />
          <MyPerformance />

          <NoteBar
            tone="blue"
            icon="shield-checkmark"
            title="Safety First"
            detail="Follow safety guidelines and wear your helmet. Your safety is our priority."
            right={<ActionLink label="Safety Guidelines" accent="info" />}
          />

          <Card className="flex-row items-center gap-3 p-4">
            <IconPlate icon="notifications" tint="violet" size={42} />
            <View className="min-w-0 flex-1">
              <Txt weight="bold">Recent Notifications</Txt>
              <Txt size="tiny" tone="muted" numberOfLines={2}>
                Fuel cashback of {money(25)} on 3 orders today! Check your wallet for details.
              </Txt>
            </View>
            <Txt size="tiny" tone="muted">
              5m ago
            </Txt>
            <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
          </Card>

          <View
            style={{ backgroundColor: tints.amber.bg, borderColor: "#fbe3b8" }}
            className="flex-row items-center gap-3 rounded-card border p-4"
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-white">
              <Ionicons name="trophy" size={22} color={colors.warn.default} />
            </View>
            <View className="min-w-0 flex-1">
              <Txt weight="bold">Great Job! You&apos;re doing awesome! 🎉</Txt>
              <Txt size="tiny" tone="muted" className="mt-0.5">
                Keep it up and achieve more.
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
