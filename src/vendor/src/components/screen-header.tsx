import React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/photo";
import { CountDot, Txt, colors } from "@/components/ui";
import { indigoHeader } from "@/lib/theme";
import { useSafeBack } from "@/lib/navigation";

/**
 * The page bar used by the red screens — Orders Management, Menu Management.
 * A leading control, a title with a one-line description, then the screen's
 * own actions on the right.
 */
export function PageBar({
  title,
  subtitle,
  leading = "menu",
  onLeading,
  notifications,
  onNotifications,
  right,
}: {
  title: string;
  subtitle?: string;
  leading?: "menu" | "back" | "none";
  onLeading?: () => void;
  notifications?: number;
  onNotifications?: () => void;
  right?: React.ReactNode;
}) {
  const goBack = useSafeBack();
  const back = () => (onLeading ? onLeading() : goBack());

  return (
    <View className="flex-row items-center gap-3 bg-surface px-4 pb-3 pt-2.5">
      {leading !== "none" && (
        <Pressable
          onPress={leading === "back" ? back : onLeading}
          hitSlop={8}
          accessibilityLabel={leading === "back" ? "Go back" : "Open menu"}
          className="active:opacity-60"
        >
          <Ionicons
            name={leading === "back" ? "arrow-back" : "menu"}
            size={leading === "back" ? 23 : 26}
            color={colors.ink.default}
          />
        </Pressable>
      )}

      <View className="min-w-0 flex-1">
        <Txt size="2xl" weight="bold" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle && (
          <Txt size="tiny" tone="muted" numberOfLines={1}>
            {subtitle}
          </Txt>
        )}
      </View>

      {notifications !== undefined && (
        <Pressable
          onPress={onNotifications}
          hitSlop={8}
          accessibilityLabel="Notifications"
          className="active:opacity-60"
        >
          <Ionicons name="notifications-outline" size={23} color={colors.ink.default} />
          <CountDot count={notifications} />
        </Pressable>
      )}

      {right}
    </View>
  );
}

/**
 * The indigo header the reference gives Payments, Offers and Settings. The
 * first card of the page is meant to overlap it, so the block carries extra
 * bottom padding and the page pulls its first child up into it.
 */
export function IndigoHeader({
  title,
  subtitle,
  leading = "back",
  onLeading,
  right,
  children,
  overlap = 28,
}: {
  title: string;
  subtitle?: string;
  leading?: "menu" | "back" | "none";
  onLeading?: () => void;
  right?: React.ReactNode;
  /** Extra content inside the wash, above the overlap gap. */
  children?: React.ReactNode;
  overlap?: number;
}) {
  const goBack = useSafeBack();

  return (
    <LinearGradient
      colors={[indigoHeader[0], indigoHeader[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ paddingTop: 12, paddingBottom: overlap + 16, paddingHorizontal: 16 }}
    >
      <View className="flex-row items-center gap-3">
        {leading !== "none" && (
          <Pressable
            onPress={() => (onLeading ? onLeading() : goBack())}
            hitSlop={8}
            accessibilityLabel={leading === "back" ? "Go back" : "Open menu"}
            className="active:opacity-60"
          >
            <Ionicons
              name={leading === "back" ? "arrow-back" : "menu"}
              size={leading === "back" ? 23 : 25}
              color="#ffffff"
            />
          </Pressable>
        )}

        <View className="min-w-0 flex-1">
          <Txt size="2xl" weight="bold" tone="white" numberOfLines={1}>
            {title}
          </Txt>
          {subtitle && (
            <Txt size="tiny" className="text-white/75" numberOfLines={1}>
              {subtitle}
            </Txt>
          )}
        </View>

        {right}
      </View>

      {children}
    </LinearGradient>
  );
}

/** Back bar for pushed detail screens — one implementation, one behaviour. */
export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <View className="border-b border-line">
      <PageBar
        title={title}
        subtitle={subtitle}
        leading="back"
        onLeading={onBack}
        right={right}
      />
    </View>
  );
}
