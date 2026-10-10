import React from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

/**
 * A photo slot. Fades in over a tinted placeholder rather than popping from a
 * grey box, and keeps the tint underneath so a slow or failed load still looks
 * deliberate instead of broken.
 */
export function Photo({
  uri,
  width,
  height,
  radius = 14,
  tint,
  className = "",
  children,
}: {
  uri: string;
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  tint?: { bg: string; fg: string };
  className?: string;
  /** Overlaid content — badges, gradient scrims, prices. */
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        width: width ?? "100%",
        height,
        borderRadius: radius,
        backgroundColor: tint?.bg ?? "#eef2ff",
      }}
      className={`overflow-hidden ${className}`}
    >
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        transition={220}
        cachePolicy="memory-disk"
      />
      {children}
    </View>
  );
}

/**
 * Dark scrim at the foot of an image so white text stays readable whatever the
 * photo underneath happens to be.
 */
export function PhotoScrim({ height = 64 }: { height?: number }) {
  return (
    <LinearGradient
      colors={["transparent", "rgba(15,23,42,0.72)"]}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height,
      }}
      pointerEvents="none"
    />
  );
}

export { LinearGradient };
