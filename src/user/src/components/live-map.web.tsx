import React from "react";
import { View } from "react-native";
import { RouteMap } from "@/components/map";
import { Txt } from "@/components/ui";
import {
  valid,
  regionFor,
  type Coordinate,
  type LiveMapProps,
} from "@/components/live-map-common";

/**
 * The delivery map, on the web.
 *
 * `react-native-maps` is a native module with no web build, and importing it
 * on web breaks the whole bundle - not the render, the import. So the web
 * build gets its own component that never mentions it.
 *
 * This used to draw a picture of a map: a straight line between two labels
 * with a dot moved along it by a `progress` number. It ignored the rider's
 * real position entirely, which is why the tracking screen looked the same
 * whatever the rider was doing. It now loads Google's map and puts the
 * kitchen, the customer and the rider on it, and falls back to the drawing
 * only when there is no map key or no usable coordinate.
 *
 * Metro picks this file for web and live-map.native.tsx everywhere else; the
 * screen imports "@/components/live-map" and does not know the difference.
 */

const SCRIPT_ID = "google-maps-js";
const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

declare global {
  interface Window {
    google?: typeof globalThis & { maps?: unknown };
  }
}

let loader: Promise<void> | null = null;

/** Loads Google's script once, however many maps ask for it. */
function loadMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as { google?: { maps?: unknown } }).google?.maps) {
    return Promise.resolve();
  }
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      const existing = document.getElementById(SCRIPT_ID);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("maps failed")));
        return;
      }
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey
      )}&v=weekly`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("maps failed"));
      document.head.appendChild(script);
    });
  }
  return loader;
}

export function LiveMap({
  height = 300,
  rider,
  restaurant,
  destination,
  route = [],
  restaurantLabel = "Restaurant",
  destinationLabel = "Your location",
  etaLabel,
  progress = 0.5,
}: LiveMapProps) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = React.useState(false);

  const points = [restaurant, destination, rider].filter(valid) as Coordinate[];
  const drawable = MAPS_KEY !== "" && points.length > 0 && !failed;

  React.useEffect(() => {
    if (!drawable || !holder.current) return;
    let cancelled = false;

    loadMaps(MAPS_KEY)
      .then(() => {
        if (cancelled || !holder.current) return;
        const g = (window as unknown as { google: any }).google;
        const region = regionFor(points);

        const map = new g.maps.Map(holder.current, {
          center: { lat: region.latitude, lng: region.longitude },
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
        });

        const bounds = new g.maps.LatLngBounds();
        const pin = (point: Coordinate, title: string, colour: string) => {
          new g.maps.Marker({
            position: { lat: point.latitude, lng: point.longitude },
            map,
            title,
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: colour,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });
          bounds.extend({ lat: point.latitude, lng: point.longitude });
        };

        if (valid(restaurant)) pin(restaurant, restaurantLabel, "#E23744");
        if (valid(destination)) pin(destination, destinationLabel, "#0b7038");
        if (valid(rider)) {
          pin(rider, etaLabel ? `Rider · ${etaLabel}` : "Rider", "#1d4ed8");
        }

        // Where the rider has actually been, rather than a straight line
        // between two points they never travelled along.
        const travelled = route.filter(valid) as Coordinate[];
        if (travelled.length > 1) {
          new g.maps.Polyline({
            path: travelled.map((p) => ({ lat: p.latitude, lng: p.longitude })),
            map,
            strokeColor: "#1d4ed8",
            strokeOpacity: 0.9,
            strokeWeight: 4,
          });
        }

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 48);
          // One pin alone makes a zero-size box, which fitBounds turns into
          // the maximum zoom - a street corner with no context around it.
          if (points.length === 1) map.setZoom(15);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawable, rider?.latitude, rider?.longitude, restaurant?.latitude, destination?.latitude, route.length]);

  if (!drawable) {
    return (
      <View>
        <RouteMap
          height={height}
          progress={progress}
          restaurantLabel={restaurantLabel}
          destinationLabel={destinationLabel}
        />
        {MAPS_KEY === "" && (
          <Txt size="micro" tone="muted" className="mt-1 px-1">
            Live map unavailable — no map key is configured for this build.
          </Txt>
        )}
      </View>
    );
  }

  return (
    <View style={{ height, borderRadius: 12, overflow: "hidden" }}>
      <div ref={holder} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

export { distanceKm } from "@/components/live-map-common";
export type { Coordinate } from "@/components/live-map-common";
