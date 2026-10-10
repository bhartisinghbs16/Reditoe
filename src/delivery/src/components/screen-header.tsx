import React from "react";
import { Image, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CountDot, Txt, colors } from "@/components/ui";
import { LOGO_RATIO } from "@/components/brand";

/**
 * The reference gives every screen the same bar: one control on the left, the
 * title centred, one control on the right. Tab screens lead with the hamburger
 * and close with the notification bell; pushed screens lead with the back arrow
 * and close with help or an overflow.
 */
export function AppBar({
  title,
  leading = "menu",
  onLeading,
  trailing = "none",
  onTrailing,
  notifications = 0,
  right,
  bordered,
  brand,
}: {
  /** Not needed when `brand` is set: the logo stands in for the title. */
  title?: string;
  /** Show the Reditoe logo in place of the title, as the home screen does. */
  brand?: boolean;
  leading?: "menu" | "back" | "none";
  onLeading?: () => void;
  trailing?: "bell" | "help" | "more" | "none";
  onTrailing?: () => void;
  notifications?: number;
  /** Replaces the trailing control outright — used by Scan's help circle. */
  right?: React.ReactNode;
  bordered?: boolean;
}) {
  const router = useRouter();

  const trailingIcon = {
    bell: "notifications-outline",
    help: "help-circle-outline",
    more: "ellipsis-vertical",
    none: undefined,
  }[trailing] as keyof typeof Ionicons.glyphMap | undefined;

  return (
    <View
      className={`flex-row items-center bg-surface px-4 pb-3 pt-2 ${
        bordered ? "border-b border-line" : ""
      }`}
    >
      <View className="w-11 items-start">
        {leading !== "none" && (
          <Pressable
            onPress={() => (onLeading ? onLeading() : leading === "back" ? router.back() : undefined)}
            hitSlop={10}
            accessibilityLabel={leading === "back" ? "Go back" : "Open menu"}
            className="active:opacity-60"
          >
            <Ionicons
              name={leading === "back" ? "arrow-back" : "menu"}
              size={leading === "back" ? 24 : 26}
              color={colors.ink.default}
            />
          </Pressable>
        )}
      </View>

      {/*
        The logo sits in the middle of the bar, which is where the client's
        reference puts it and where the vendor app carries it - the three apps
        should look the same at the top. Screens that are a step in a flow
        keep their own title, because "Step 2 of 3" is what the rider needs to
        see there, not the brand.
      */}
      {brand ? (
        <View className="flex-1 items-center">
          <Image
            source={require("../../assets/images/logo-header.png")}
            style={{ width: 128, height: 128 / LOGO_RATIO }}
            resizeMode="contain"
            accessibilityLabel="Reditoe Deliver Partner"
          />
        </View>
      ) : (
        <Txt size="xl" weight="bold" className="flex-1 text-center" numberOfLines={1}>
          {title}
        </Txt>
      )}

      {/* A supplied node sizes itself — "Step 1 of 3" does not fit an icon slot. */}
      <View className={`items-end ${right ? "min-w-11" : "w-11"}`}>
        {right ??
          (trailingIcon && (
            <Pressable
              onPress={onTrailing}
              hitSlop={10}
              accessibilityLabel={trailing === "bell" ? "Notifications" : trailing}
              className="active:opacity-60"
            >
              <Ionicons name={trailingIcon} size={23} color={colors.ink.default} />
              {trailing === "bell" && <CountDot count={notifications} />}
            </Pressable>
          ))}
      </View>
    </View>
  );
}

/** Back bar for pushed detail screens — one implementation, one behaviour. */
export function ScreenHeader({
  title,
  trailing = "help",
  onTrailing,
  onBack,
}: {
  title: string;
  trailing?: "bell" | "help" | "more" | "none";
  onTrailing?: () => void;
  onBack?: () => void;
}) {
  return (
    <AppBar
      title={title}
      leading="back"
      onLeading={onBack}
      trailing={trailing}
      onTrailing={onTrailing}
    />
  );
}

/**
 * The bar the KYC screens use: back arrow, then a red "Help" link with a
 * headset. Aadhaar leaves the centre empty and sets its name as a heading
 * under the tracker; the three steps after it name themselves here instead.
 */
export function KycBar({ title, onBack }: { title?: string; onBack?: () => void }) {
  const router = useRouter();
  return (
    <View className="flex-row items-center gap-3 bg-surface px-4 pb-2 pt-2">
      <Pressable
        onPress={() => (onBack ? onBack() : router.back())}
        hitSlop={10}
        accessibilityLabel="Go back"
        className="active:opacity-60"
      >
        <Ionicons name="arrow-back" size={24} color={colors.ink.default} />
      </Pressable>

      <Txt size="lg" weight="bold" className="flex-1 text-center" numberOfLines={1}>
        {title ?? ""}
      </Txt>

      {/* This "Help" is on every screen that uses this header, and none of
          them did anything when it was pressed. */}
      <Pressable
        hitSlop={8}
        onPress={() => router.push("/support")}
        accessibilityLabel="Help and support"
        className="flex-row items-center gap-1.5 active:opacity-60"
      >
        <Ionicons name="headset" size={18} color={colors.brand[500]} />
        <Txt weight="bold" tone="brand">
          Help
        </Txt>
      </Pressable>
    </View>
  );
}
