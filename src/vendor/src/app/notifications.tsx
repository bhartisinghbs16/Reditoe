import React from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Divider, IconPlate, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import type { TintName } from "@/lib/theme";
import { useStore } from "@/lib/store";

/**
 * What has happened that the vendor should know about.
 *
 * Notifications on the More menu opened the Orders tab, which is not the same
 * thing: Orders is a work queue, this is a record of what changed and when.
 *
 * Built from the orders already loaded rather than from a notifications feed,
 * because there is no such feed on the server - and inventing one that says
 * something different from the orders would be worse than saying nothing.
 */
const RELATIVE = (iso?: string) => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

export default function Notifications() {
  const router = useRouter();
  const { orders } = useStore();

  /** Newest first, and only the states worth telling somebody about. */
  const items = React.useMemo(() => {
    const interesting = orders.filter((order) =>
      ["new", "preparing", "ready", "picked", "delivered", "cancelled"].includes(order.stage)
    );
    return interesting
      .map((order) => {
        const COPY: Record<
          string,
          { title: string; tint: TintName; icon: keyof typeof Ionicons.glyphMap }
        > = {
          new: { title: "New order request", tint: "red", icon: "bag-handle" },
          preparing: { title: "Order accepted", tint: "amber", icon: "flame" },
          ready: { title: "Order ready for pickup", tint: "blue", icon: "cube" },
          picked: { title: "Picked up by rider", tint: "violet", icon: "bicycle" },
          delivered: { title: "Order delivered", tint: "green", icon: "checkmark-done" },
          cancelled: { title: "Order cancelled", tint: "slate", icon: "close-circle" },
        };
        const copy = COPY[order.stage] ?? {
          title: "Order updated",
          tint: "slate" as TintName,
          icon: "ellipse" as keyof typeof Ionicons.glyphMap,
        };
        return { order, ...copy };
      })
      .sort(
        (a, b) =>
          new Date(b.order.placedAt ?? 0).getTime() -
          new Date(a.order.placedAt ?? 0).getTime()
      );
  }, [orders]);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Notifications" />
      <ScrollView contentContainerClassName="pb-10">
        {items.length === 0 ? (
          <View className="items-center px-6 pt-16">
            <Ionicons name="notifications-off-outline" size={28} color={colors.ink.faint} />
            <Txt weight="semibold" className="mt-2">
              Nothing yet
            </Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5 text-center">
              New orders and status changes will appear here.
            </Txt>
          </View>
        ) : (
          <Card className="mx-4 mt-3 overflow-hidden">
            {items.map((item, index) => (
              <View key={item.order.id}>
                {index > 0 && <Divider className="ml-16" />}
                <View className="flex-row items-center gap-3 px-3 py-3">
                  <IconPlate icon={item.icon} tint={item.tint} />
                  <View className="min-w-0 flex-1">
                    <Txt weight="semibold" numberOfLines={1}>
                      {item.title}
                    </Txt>
                    <Txt size="tiny" tone="muted" numberOfLines={1}>
                      {item.order.reference} · {RELATIVE(item.order.placedAt)}
                    </Txt>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.ink.faint}
                    onPress={() => router.push(`/order/${item.order.id}`)}
                  />
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
