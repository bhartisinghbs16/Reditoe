import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ActionLink,
  Card,
  IconPlate,
  Screen,
  Txt,
  colors,
} from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * What Reditoe has told this rider.
 *
 * The bell sat on all five tabs with an unread count on it and no handler at
 * all, so the one thing it promised - showing what the count was counting -
 * was the one thing it would not do. The notifications have always been
 * there; nothing was reading them.
 */

interface Notice {
  id: string;
  category: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

/** A category, drawn as the rest of the app draws that kind of thing. */
const LOOK: Record<string, { icon: keyof typeof Ionicons.glyphMap; tint: "green" | "blue" | "amber" | "violet" | "red" }> = {
  orders: { icon: "bag-handle", tint: "green" },
  payments: { icon: "cash", tint: "blue" },
  earnings: { icon: "cash", tint: "blue" },
  account: { icon: "person", tint: "violet" },
  alerts: { icon: "alert-circle", tint: "red" },
};

function when(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const mins = Math.round((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} hr ago`;
  return at.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function Notifications() {
  const { refresh } = useStore();
  const [notices, setNotices] = React.useState<Notice[]>([]);
  const [busy, setBusy] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const response = await api.notifications();
      setNotices(response.notifications ?? []);
    } catch {
      setNotices([]);
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  /* Opening the screen is reading them; the count should follow. */
  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotices((current) => current.map((n) => ({ ...n, unread: false })));
      await refresh();
    } catch {
      /* the list is still right; only the badge lags */
    }
  };

  const unreadCount = notices.filter((n) => n.unread).length;

  return (
    <Screen>
      <ScreenHeader title="Notifications" trailing="none" />

      {unreadCount > 0 && (
        <View className="items-end px-4 pt-2">
          <ActionLink
            label="Mark all read"
            accent="brand"
            icon="none"
            onPress={() => void markAllRead()}
          />
        </View>
      )}

      <ScrollView
        contentContainerClassName="px-4 pb-8 pt-3.5"
        refreshControl={
          <RefreshControl refreshing={busy} onRefresh={() => void load()} />
        }
      >
        {notices.length === 0 && !busy ? (
          <Card className="items-center gap-2 p-6">
            <Ionicons name="notifications-off-outline" size={30} color={colors.ink.faint} />
            <Txt weight="bold">Nothing yet</Txt>
            <Txt size="tiny" tone="muted" className="text-center">
              Order offers and payment updates will appear here.
            </Txt>
          </Card>
        ) : (
          <View className="gap-2.5">
            {notices.map((notice) => {
              const look = LOOK[notice.category] ?? { icon: "notifications", tint: "violet" as const };
              return (
                <Card
                  key={notice.id}
                  className={`flex-row items-start gap-3 p-3.5 ${
                    notice.unread ? "border border-brand-100 bg-brand-50" : ""
                  }`}
                >
                  <IconPlate icon={look.icon} tint={look.tint} size={40} shape="circle" />
                  <View className="min-w-0 flex-1">
                    <Txt weight="bold" numberOfLines={2}>
                      {notice.title}
                    </Txt>
                    <Txt size="tiny" tone="muted" className="mt-0.5">
                      {notice.body}
                    </Txt>
                    <Txt size="micro" tone="faint" className="mt-1">
                      {when(notice.time)}
                    </Txt>
                  </View>
                  {notice.unread && (
                    <View className="mt-1.5 h-2 w-2 rounded-full bg-brand-600" />
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
