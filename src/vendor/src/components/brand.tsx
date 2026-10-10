import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Photo } from "@/components/photo";
import { CountDot, Txt, colors } from "@/components/ui";

/**
 * The Reditoe lockup that opens the Dashboard in the reference: a red chef's
 * hat over the wordmark, with "Ready To Eat" set small underneath.
 *
 * Drawn rather than shipped as an asset so it stays crisp at any size and
 * tints with the brand token. Swap in the supplied artwork when it lands.
 */
export function ChefHat({ size = 22, color = colors.brand[600] }: { size?: number; color?: string }) {
  const unit = size / 22;
  return (
    <View style={{ width: size, height: size * 0.86 }}>
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 3 * unit,
          width: 9 * unit,
          height: 9 * unit,
          borderRadius: 999,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: 0,
          top: 3 * unit,
          width: 9 * unit,
          height: 9 * unit,
          borderRadius: 999,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 5 * unit,
          top: 0,
          width: 12 * unit,
          height: 12 * unit,
          borderRadius: 999,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 3 * unit,
          bottom: 0,
          width: 16 * unit,
          height: 6 * unit,
          borderRadius: 2 * unit,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/**
 * The Reditoe lockup at the top of every screen.
 *
 * This was drawn - a chef's hat built out of Views, with "Reditoe" and "Ready
 * To Eat" set beneath it - as a stand-in until the real artwork arrived. It
 * has arrived, so the drawing is retired and the supplied logo is shown.
 *
 * The subtitle under the wordmark is not part of this image: it is set in
 * white in the artwork, so on a light header it would be invisible, and at
 * this size it would be illegible in any colour.
 */
/**
 * The width-to-height of assets/images/logo-header.png.
 *
 * Stated once because more than one screen draws the lockup from a width
 * alone, and a wrong divisor letterboxes or stretches the artwork.
 */
export const LOGO_RATIO = 900 / 412;

export function Wordmark({ size = "md" }: { size?: "sm" | "md" }) {
  const width = size === "sm" ? 108 : 132;
  return (
    <Image
      source={require("../../assets/images/logo-header.png")}
      style={{ width, height: width / LOGO_RATIO }}
      resizeMode="contain"
      accessibilityLabel="Reditoe Vendor Partner"
    />
  );
}

/**
 * The Dashboard's top bar — hamburger, wordmark, the "Vendor App" pill, the
 * notification bell and the store avatar.
 */
export function AppBar({
  photoUri,
  notifications = 0,
  onMenu,
  onNotifications,
  onProfile,
}: {
  photoUri: string;
  notifications?: number;
  onMenu?: () => void;
  onNotifications?: () => void;
  onProfile?: () => void;
}) {
  return (
    /*
     * The bar is blue and carries the logo alone.
     *
     * It was white, with the wordmark pushed left of a "Vendor App" pill -
     * so the top of the screen read as two labels rather than a brand. The
     * logo is centred out of the flow, because the controls on the right are
     * wider than the menu button on the left and "middle of the row" would
     * put it visibly left of the middle of the screen.
     */
    <View
      /*
       * The blue from the client's own header artwork, sampled from it
       * (#0045b8). The app's indigo is a purple - #3708b0 - which is not the
       * colour the reference shows, and "keep the header blue" meant this one.
       */
      style={{ backgroundColor: "#0045b8" }}
      className="relative flex-row items-center gap-3 px-4 py-2.5"
    >
      <Pressable onPress={onMenu} hitSlop={8} accessibilityLabel="Open menu">
        <Ionicons name="menu" size={26} color="#ffffff" />
      </Pressable>

      {/*
        Straight on the blue, no pill behind it.
        
        The client supplied this same artwork already composited on this blue
        - both files are the identical lockup - so it is drawn to sit on it.
        The pill was a workaround for the old logo, which was not.
      */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}
      >
        <Wordmark />
      </View>

      <View className="flex-1" />

      <Pressable
        onPress={onNotifications}
        hitSlop={8}
        accessibilityLabel="Notifications"
        className="active:opacity-60"
      >
        <Ionicons name="notifications-outline" size={23} color="#ffffff" />
        <CountDot count={notifications} />
      </Pressable>

      <Pressable
        onPress={onProfile}
        hitSlop={6}
        accessibilityLabel="Store profile"
        className="flex-row items-center gap-0.5 active:opacity-70"
      >
        <Photo uri={photoUri} width={34} height={34} radius={17} />
        <Ionicons name="chevron-down" size={14} color={colors.ink.soft} />
      </Pressable>
    </View>
  );
}

/** The "Verified" / outlet-id line that sits under the store name. */
export function OutletLine({ id, verified }: { id: string; verified?: boolean }) {
  return (
    <View className="mt-1.5 flex-row items-center gap-2">
      {verified && (
        <View className="flex-row items-center gap-1 rounded-chip bg-ok-soft px-2 py-1">
          <Ionicons name="checkmark-circle" size={12} color={colors.ok.default} />
          <Text className="text-[11px] font-semibold text-ok">Verified</Text>
        </View>
      )}
      <Txt size="tiny" tone="muted">
        Outlet ID: {id}
      </Txt>
      <Ionicons name="copy-outline" size={13} color={colors.ink.faint} />
    </View>
  );
}
