import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Txt, colors } from "@/components/ui";

/**
 * The route map the reference puts on the tracking and order screens.
 *
 * The project has no map SDK and no SVG renderer, so this draws the same
 * picture from plain views: a tinted base with parks, water and road bands, a
 * dotted route between the kitchen and the customer, and the three pins. It is
 * a faithful stand-in that swaps out for a real map view without any of the
 * surrounding layout changing.
 */

type Point = { x: number; y: number };

/** Percentage waypoints, kitchen (left) to doorstep (right). */
const ROUTE: Point[] = [
  { x: 10, y: 64 },
  { x: 22, y: 64 },
  { x: 27, y: 46 },
  { x: 47, y: 46 },
  { x: 58, y: 40 },
  { x: 71, y: 40 },
  { x: 79, y: 60 },
  { x: 90, y: 76 },
];

function lengths(points: Point[]) {
  const segments = points.slice(1).map((p, i) => {
    const prev = points[i];
    return Math.hypot(p.x - prev.x, p.y - prev.y);
  });
  const total = segments.reduce((sum, s) => sum + s, 0);
  return { segments, total };
}

/** Point a fraction of the way along the polyline. */
function pointAt(progress: number): Point {
  const { segments, total } = lengths(ROUTE);
  let travelled = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 0; i < segments.length; i++) {
    if (travelled <= segments[i]) {
      const t = segments[i] === 0 ? 0 : travelled / segments[i];
      return {
        x: ROUTE[i].x + (ROUTE[i + 1].x - ROUTE[i].x) * t,
        y: ROUTE[i].y + (ROUTE[i + 1].y - ROUTE[i].y) * t,
      };
    }
    travelled -= segments[i];
  }
  return ROUTE[ROUTE.length - 1];
}

/** Evenly spaced dots along the polyline, so the route reads as a path. */
function routeDots(step = 1.6) {
  const { total } = lengths(ROUTE);
  const count = Math.max(2, Math.round(total / step));
  return Array.from({ length: count + 1 }, (_, i) => pointAt(i / count));
}

const DOTS = routeDots();

function Pin({
  at,
  icon,
  bg,
  size = 30,
}: {
  at: Point;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  size?: number;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left: `${at.x}%`,
        top: `${at.y}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        backgroundColor: bg,
        borderRadius: size / 2,
        borderWidth: 2.5,
        borderColor: "#ffffff",
        shadowColor: "#0f172a",
        shadowOpacity: 0.25,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}
      className="items-center justify-center"
    >
      <Ionicons name={icon} size={size * 0.5} color="#ffffff" />
    </View>
  );
}

function Callout({
  at,
  title,
  detail,
  tone = "default",
  align = "left",
}: {
  at: Point;
  title: string;
  detail?: string;
  tone?: "default" | "ok";
  align?: "left" | "right";
}) {
  return (
    <View
      style={{
        position: "absolute",
        left: align === "left" ? `${at.x}%` : undefined,
        right: align === "right" ? `${100 - at.x}%` : undefined,
        top: `${at.y}%`,
        shadowColor: "#0f172a",
        shadowOpacity: 0.14,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
      className="rounded-lg bg-white px-2.5 py-1.5"
    >
      <Txt size="micro" weight="bold" numberOfLines={1}>
        {title}
      </Txt>
      {detail && (
        <Txt
          size="micro"
          weight={tone === "ok" ? "bold" : "regular"}
          tone={tone === "ok" ? "ok" : "muted"}
          numberOfLines={1}
        >
          {detail}
        </Txt>
      )}
    </View>
  );
}

export function RouteMap({
  height = 200,
  progress = 0.55,
  restaurantLabel = "Restaurant",
  restaurantDetail,
  destinationLabel = "Your Location",
  destinationDetail = "Home",
  riderLabel,
  radius = 14,
  compact,
}: {
  height?: number;
  /** Where the rider sits on the route, 0 at the kitchen and 1 at the door. */
  progress?: number;
  restaurantLabel?: string;
  restaurantDetail?: string;
  destinationLabel?: string;
  destinationDetail?: string;
  riderLabel?: string;
  radius?: number;
  /** Drops the callouts — used for the small map on the order screen. */
  compact?: boolean;
}) {
  const rider = pointAt(progress);
  const reached = Math.max(0, Math.min(1, progress));

  return (
    <View
      style={{ height, borderRadius: radius, backgroundColor: "#eceff1" }}
      className="overflow-hidden"
      accessibilityLabel="Delivery route map"
    >
      {/* Parks and water, so the base doesn't read as a flat grey box. */}
      <View
        style={{ position: "absolute", left: "2%", top: "4%", width: "26%", height: "26%", backgroundColor: "#dff0dd", borderRadius: 10 }}
      />
      <View
        style={{ position: "absolute", left: "62%", top: "2%", width: "30%", height: "20%", backgroundColor: "#dff0dd", borderRadius: 12 }}
      />
      <View
        style={{ position: "absolute", left: "40%", top: "76%", width: "34%", height: "22%", backgroundColor: "#e3efe1", borderRadius: 10 }}
      />
      <View
        style={{ position: "absolute", left: "-6%", top: "84%", width: "42%", height: "9%", backgroundColor: "#d6e6f2", transform: [{ rotate: "-6deg" }] }}
      />

      {/* Road grid. */}
      {[16, 34, 52, 70, 88].map((top) => (
        <View
          key={`h${top}`}
          style={{ position: "absolute", left: 0, right: 0, top: `${top}%`, height: 5, backgroundColor: "#ffffff" }}
        />
      ))}
      {[14, 33, 52, 71, 89].map((left) => (
        <View
          key={`v${left}`}
          style={{ position: "absolute", top: 0, bottom: 0, left: `${left}%`, width: 5, backgroundColor: "#ffffff" }}
        />
      ))}
      <View
        style={{ position: "absolute", left: "-10%", top: "58%", width: "130%", height: 7, backgroundColor: "#f7f7f5", transform: [{ rotate: "-9deg" }] }}
      />

      {/* Route: solid green behind the rider, pale ahead of them. */}
      {DOTS.map((dot, index) => {
        const passed = index / (DOTS.length - 1) <= reached;
        return (
          <View
            key={index}
            style={{
              position: "absolute",
              left: `${dot.x}%`,
              top: `${dot.y}%`,
              width: passed ? 5 : 4,
              height: passed ? 5 : 4,
              marginLeft: -2.5,
              marginTop: -2.5,
              borderRadius: 3,
              backgroundColor: passed ? colors.leaf[600] : "#b9c6bd",
            }}
          />
        );
      })}

      <Pin at={ROUTE[0]} icon="storefront" bg={colors.brand[600]} />
      <Pin at={rider} icon="bicycle" bg={colors.leaf[600]} size={32} />
      <Pin at={ROUTE[ROUTE.length - 1]} icon="home" bg={colors.brand[600]} />

      {!compact && (
        <>
          <Callout
            at={{ x: 4, y: 8 }}
            title={restaurantLabel}
            detail={restaurantDetail}
          />
          {riderLabel && (
            <Callout at={{ x: 96, y: 8 }} title={riderLabel} align="right" />
          )}
          <Callout
            at={{ x: 96, y: 52 }}
            title={destinationLabel}
            detail={destinationDetail}
            tone="ok"
            align="right"
          />
        </>
      )}
    </View>
  );
}
