import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  EmptyState,
  FilterChip,
  SearchField,
  SectionTitle,
  ToolButton,
  Txt,
  colors,
} from "@/components/ui";
import { AppBar } from "@/components/screen-header";
import { PartnerCard } from "@/components/partner-card";
import { OrderCard, OrderRow } from "@/components/order-card";
import { useStore, type Order } from "@/lib/store";

/**
 * Orders, reproduced from the reference: the filter card with its counted
 * chips, search and date scope, then the day's book grouped into New Orders,
 * In Progress and Completed Today — each group headed by a coloured bullet and
 * a "View All" link.
 */

type Filter = "all" | "new" | "progress" | "completed" | "cancelled";

function Group({
  title,
  count,
  dot,
  children,
}: {
  title: string;
  count: number;
  dot: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <View className="mt-5">
      <SectionTitle
        title={`${title} (${count})`}
        dot={dot}
        action="View All"
        className="px-4"
      />
      <View className="mt-3 px-4">{children}</View>
    </View>
  );
}

export default function Orders() {
  const router = useRouter();
  const { orders, history, counts, unread, run } = useStore();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");

  const open = (order: Order) => router.push(`/order/${order.id}` as never);

  const matches = (order: Order) => {
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return (
      order.id.toLowerCase().includes(needle) ||
      order.restaurant.name.toLowerCase().includes(needle) ||
      order.customer.name.toLowerCase().includes(needle)
    );
  };

  const fresh = orders.filter((o) => o.stage === "offered").filter(matches);
  const active = orders.filter((o) => o.stage !== "offered").filter(matches);
  const done = history.filter(matches);

  const show = {
    new: filter === "all" || filter === "new",
    progress: filter === "all" || filter === "progress",
    completed: filter === "all" || filter === "completed",
  };

  const nothing =
    (!show.new || fresh.length === 0) &&
    (!show.progress || active.length === 0) &&
    (!show.completed || done.length === 0);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8">
        <AppBar title="Orders" trailing="bell"
          notifications={unread}
          onTrailing={() => router.push("/notifications")}
        />

        <View className="bg-surface pb-3">
          <PartnerCard card={false} />
        </View>

        {/*
          The order the deliveries are to be made in.
          Shown only when there is more than one to sequence - a single
          delivery needs no running order, and each customer has been told
          where they sit in this list, so it is not the rider's to reshuffle.
        */}
        {run && run.totalStops > 1 && (
          <View className="px-4 pt-3.5">
            <Card className="p-4">
              <View className="flex-row items-center gap-2">
                <Ionicons name="git-commit-outline" size={15} color={colors.ok.default} />
                <Txt weight="bold">Your run — {run.totalStops} deliveries</Txt>
              </View>

              <View className="mt-2.5 gap-1.5">
                {run.stops.map((stop) => (
                  <Pressable
                    key={stop.orderId}
                    onPress={() => router.push(`/order/${stop.orderId}` as never)}
                    className="flex-row items-center gap-2.5 rounded-tile bg-surface-sunken px-2.5 py-2 active:opacity-70"
                  >
                    <View
                      className={`h-5 w-5 items-center justify-center rounded-full ${
                        stop.position === 1 ? "bg-ok" : "bg-line-strong"
                      }`}
                    >
                      <Txt size="micro" weight="bold" tone="white">
                        {stop.position}
                      </Txt>
                    </View>
                    <Txt size="tiny" weight="semibold" className="flex-1">
                      {stop.orderNumber}
                    </Txt>
                    <Txt size="micro" tone={stop.position === 1 ? "ok" : "muted"}>
                      {stop.position === 1 ? "Deliver first" : `Stop ${stop.position}`}
                    </Txt>
                  </Pressable>
                ))}
              </View>
            </Card>
          </View>
        )}

        <View className="px-4 pt-3.5">
          <Card className="p-4">
            <View className="flex-row items-center justify-between">
              <Txt size="lg" weight="bold">
                My Orders
              </Txt>
              <ToolButton label="Filter" icon="options-outline" className="h-10" />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 pt-3"
            >
              <FilterChip
                label="All Orders"
                count={counts.all}
                active={filter === "all"}
                onPress={() => setFilter("all")}
              />
              <FilterChip
                label="New Orders"
                count={counts.New}
                tone="warn"
                active={filter === "new"}
                onPress={() => setFilter("new")}
              />
              <FilterChip
                label="In Progress"
                count={counts.progress}
                tone="info"
                active={filter === "progress"}
                onPress={() => setFilter("progress")}
              />
              <FilterChip
                label="Completed"
                count={counts.completed}
                tone="ok"
                active={filter === "completed"}
                onPress={() => setFilter("completed")}
              />
              <FilterChip
                label="Cancelled"
                count={counts.cancelled}
                tone="bad"
                active={filter === "cancelled"}
                onPress={() => setFilter("cancelled")}
              />
            </ScrollView>

            <View className="mt-3 flex-row gap-2">
              <SearchField
                placeholder="Search by Order ID, Restaurant or Customer"
                value={query}
                onChangeText={setQuery}
                className="flex-1"
              />
              <ToolButton label="Today" icon="calendar-outline" chevron accent="neutral" />
            </View>
          </Card>
        </View>

        {show.new && (
          <Group title="New Orders" count={fresh.length} dot={colors.orange.default}>
            <View className="gap-3">
              {fresh.map((order) => (
                <OrderCard key={order.id} order={order} onPress={() => open(order)} />
              ))}
            </View>
          </Group>
        )}

        {show.progress && (
          <Group title="In Progress" count={active.length} dot={colors.info.default}>
            <Card className="overflow-hidden">
              {active.map((order, index) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  divided={index > 0}
                  onPress={() => open(order)}
                />
              ))}
            </Card>
          </Group>
        )}

        {show.completed && (
          <Group title="Completed Today" count={done.length} dot={colors.green[600]}>
            <Card className="overflow-hidden">
              {done.map((order, index) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  divided={index > 0}
                  onPress={() => open(order)}
                />
              ))}
            </Card>
          </Group>
        )}

        {(nothing || filter === "cancelled") && (
          <EmptyState
            icon="bag-handle-outline"
            title={filter === "cancelled" ? "No cancelled orders" : "Nothing here yet"}
            detail={
              filter === "cancelled"
                ? "You have not cancelled an order today — keep it up."
                : "Orders matching this filter will appear here."
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
