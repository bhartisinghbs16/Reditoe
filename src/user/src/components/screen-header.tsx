import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Txt, colors } from "@/components/ui";

/**
 * The back bar every pushed screen in the reference uses: a plain arrow, a
 * 20px bold title with a grey line under it, and one or two actions on the
 * right — usually a red word with a small icon beside it.
 */
export function ScreenHeader({
  title,
  subtitle,
  subtitleIcon,
  right,
  onBack,
  border = false,
}: {
  title: string;
  subtitle?: string;
  subtitleIcon?: keyof typeof Ionicons.glyphMap;
  right?: React.ReactNode;
  onBack?: () => void;
  /** The reference rules off the header only on the restaurant screen. */
  border?: boolean;
}) {
  const router = useRouter();

  return (
    <View
      className={`flex-row items-center gap-3 bg-surface px-4 pb-3 pt-2 ${
        border ? "border-b border-line" : ""
      }`}
    >
      <Pressable
        onPress={() => (onBack ? onBack() : router.back())}
        hitSlop={10}
        className="h-9 w-9 items-center justify-center active:opacity-60"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={23} color={colors.ink.default} />
      </Pressable>

      <View className="min-w-0 flex-1">
        {/* Two lines, so long titles like "Secure Delivery Verification" and
            their explanatory subtitles read in full on a phone. */}
        <Txt size="xl" weight="bold" numberOfLines={2}>
          {title}
        </Txt>
        {subtitle && (
          <View className="mt-0.5 flex-row items-start gap-1">
            {subtitleIcon && (
              <Ionicons
                name={subtitleIcon}
                size={13}
                color={colors.ink.muted}
                style={{ marginTop: 2 }}
              />
            )}
            <Txt size="tiny" tone="muted" numberOfLines={2} className="min-w-0 flex-1">
              {subtitle}
            </Txt>
          </View>
        )}
      </View>

      {right && <View className="flex-row items-center gap-4">{right}</View>}
    </View>
  );
}

/** Bare icon button for the header's right slot. */
export function HeaderIcon({
  icon,
  onPress,
  color = colors.ink.default,
  size = 22,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  color?: string;
  size?: number;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityLabel={label}
      className="active:opacity-60"
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

/** Icon + red word — "Support", "Help", "My Coupons", "Map View". */
export function HeaderAction({
  icon,
  label,
  onPress,
  boxed,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  /** Order Details puts this action in a hairline pill. */
  boxed?: boolean;
}) {
  const router = useRouter();
  // Every "Support"/"Help" action in the app is the headset icon, and most
  // screens render it without a handler, so it did nothing when tapped.
  // Default those to the support screen.
  const handlePress =
    onPress ?? (icon.startsWith("headset") ? () => router.push("/support") : undefined);
  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center gap-1.5 active:opacity-60 ${
        boxed ? "rounded-pill border border-line px-3 py-1.5" : ""
      }`}
    >
      <Ionicons name={icon} size={17} color={colors.ink.default} />
      <Txt size="sm" weight="semibold" tone="brand">
        {label}
      </Txt>
    </Pressable>
  );
}
