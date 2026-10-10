import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Txt, colors } from "@/components/ui";

/**
 * The width-to-height of assets/images/logo-header.png.
 *
 * Stated once because two screens draw the lockup from a width alone. Both
 * carried their own 2.7 and the file is 2.2, so replacing the artwork left it
 * stretched on every auth screen until each number was found and changed.
 */
export const LOGO_RATIO = 900 / 409;

/** The width-to-height of assets/images/rider-hero.png. */
const RIDER_RATIO = 760 / 639;

/**
 * The Reditoe lockup that opens the reference's auth screens: a red delivery
 * scooter over the wordmark, with "Ready to Eat" ruled underneath.
 *
 * Drawn from primitives rather than shipped as an asset so it stays crisp at
 * any size and tints with the brand token. Swap in the supplied artwork when
 * it lands.
 */
export function ScooterMark({
  size = 44,
  color = colors.brand[500],
}: {
  size?: number;
  color?: string;
}) {
  const box = size * 0.34;

  return (
    <View style={{ width: size, height: size * 0.82 }}>
      {/* The insulated delivery box, strapped over the rear. */}
      <View
        style={{
          position: "absolute",
          left: size * 0.03,
          top: 0,
          width: box,
          height: box * 0.82,
          borderRadius: size * 0.05,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.03 + box * 0.3,
          top: box * 0.18,
          width: box * 0.4,
          height: box * 0.12,
          borderRadius: 999,
          backgroundColor: "#ffffff",
          opacity: 0.9,
        }}
      />

      {/* The machine itself. */}
      <Ionicons
        name="bicycle"
        size={size * 0.86}
        color={color}
        style={{ position: "absolute", left: size * 0.07, bottom: -size * 0.08 }}
      />
    </View>
  );
}

export function Wordmark({ size = "lg" }: { size?: "sm" | "lg" }) {
  const type = size === "sm" ? 24 : 34;

  return (
    <View className="items-center">
      <ScooterMark size={size === "sm" ? 34 : 52} />
      <Text
        style={{ color: colors.brand[500], fontSize: type, marginTop: 4 }}
        className="font-bold"
      >
        Reditoe
      </Text>
      <View className="mt-0.5 flex-row items-center gap-1.5">
        <View style={{ width: 14, height: 1.5, backgroundColor: colors.ink.default }} />
        <Text
          style={{ color: colors.ink.default, fontSize: size === "sm" ? 9 : 11, letterSpacing: 0.4 }}
          className="font-semibold"
        >
          Ready to Eat
        </Text>
        <View style={{ width: 14, height: 1.5, backgroundColor: colors.ink.default }} />
      </View>
    </View>
  );
}

/**
 * The courier on the pink city backdrop the reference draws behind him.
 *
 * The figure is the one from the client's own lockup, cut out of it: the
 * panel used to hold a scooter drawn from primitives, which stood in for
 * artwork nobody had supplied.
 */
export function RiderHero({
  height = 200,
  className = "",
}: {
  height?: number;
  /** So the panel can sit in a column beside the heading, not only full width. */
  className?: string;
}) {
  return (
    <View
      style={{ height, backgroundColor: "#fdeeee" }}
      className={`items-center justify-center overflow-hidden rounded-card ${className}`}
    >
      {/* Skyline */}
      <View className="absolute bottom-0 left-0 right-0 h-1/2 flex-row items-end gap-1.5 px-4 opacity-60">
        {[0.5, 0.8, 0.35, 0.95, 0.6, 0.75, 0.4].map((h, index) => (
          <View
            key={index}
            style={{ height: `${h * 100}%`, backgroundColor: "#fbd9d9" }}
            className="flex-1 rounded-t-md"
          />
        ))}
      </View>

      <Ionicons
        name="location"
        size={22}
        color={colors.brand[300]}
        style={{ position: "absolute", left: 26, top: 34 }}
      />
      <Ionicons
        name="location"
        size={18}
        color={colors.brand[300]}
        style={{ position: "absolute", right: 32, top: 22 }}
      />

      {/* Lifted clear of the bottom edge — the sheet below overlaps the panel. */}
      <Image
        source={require("../../assets/images/rider-hero.png")}
        style={{
          height: height * 0.72,
          width: height * 0.72 * RIDER_RATIO,
          marginBottom: height * 0.12,
        }}
        resizeMode="contain"
        accessibilityLabel="Reditoe delivery partner"
      />
    </View>
  );
}

/** The three-up benefit strip that closes the Login screen. */
export function BenefitStrip({
  items,
}: {
  items: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }[];
}) {
  return (
    <View className="flex-row gap-3">
      {items.map((item) => (
        <View key={item.title} className="flex-1 items-center">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name={item.icon} size={24} color={colors.brand[500]} />
          </View>
          <Txt size="tiny" weight="bold" className="mt-2 text-center">
            {item.title}
          </Txt>
          <Txt size="micro" tone="muted" className="mt-0.5 text-center">
            {item.detail}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** "──── or ────" between the primary action and the Google button. */
export function OrRule({ className = "" }: { className?: string }) {
  return (
    <View className={`flex-row items-center gap-3 ${className}`}>
      <View className="h-px flex-1 bg-line" />
      <Txt size="tiny" tone="muted">
        or
      </Txt>
      <View className="h-px flex-1 bg-line" />
    </View>
  );
}

/** The Google button, drawn as the reference does — a hairline with the mark. */
export function GoogleButton({
  label = "Continue with Google",
  onPress,
}: {
  label?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="h-[52px] flex-row items-center justify-center gap-2.5 rounded-tile border border-line bg-surface active:opacity-80"
    >
      <View className="h-5 w-5 items-center justify-center">
        <Text style={{ color: "#4285f4", fontSize: 17 }} className="font-bold">
          G
        </Text>
      </View>
      <Text className="text-[15px] font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}
