"use client";

import * as React from "react";
import type { Rider } from "@/lib/types";

/**
 * Every rider on one map.
 *
 * Red is carrying an order, green is free and waiting for one — which is the
 * distinction the dispatcher actually needs: green pins near a busy kitchen
 * are capacity, red pins are commitments.
 *
 * Google's script is loaded once and shared. It is added here rather than in
 * the page shell so that consoles which never open this screen never fetch a
 * map at all, and so the key is only sent where it is used.
 */

const SCRIPT_ID = "google-maps-js";

/** Tirupati, where the seeded restaurants are — used until a rider is placed. */
const FALLBACK = { lat: 13.6288, lng: 79.4192 };

type Marker = google.maps.Marker;

declare global {
  interface Window {
    google?: typeof google;
  }
}

let loader: Promise<void> | null = null;

function loadMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();

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
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
      script.onload = () => resolve();
      script.onerror = () => {
        // Cleared so a later attempt on a working connection can retry.
        loader = null;
        reject(new Error("Could not load Google Maps."));
      };
      document.head.appendChild(script);
    });
  }

  return loader;
}

/** GeoJSON stores [longitude, latitude]; everything else here wants the pair. */
function positionOf(rider: Rider): google.maps.LatLngLiteral | null {
  const pair = rider.currentLocation?.coordinates;
  if (!pair || pair.length !== 2) return null;
  const [lng, lat] = pair;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // 0,0 is in the Atlantic and means "never reported", not "at sea".
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

const isDelivering = (rider: Rider) => Boolean(rider.currentOrderId);

function pin(colour: string): google.maps.Symbol {
  return {
    path: window.google!.maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: colour,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
  };
}

export function LiveRiderMap({
  riders,
  apiKey,
  height = 520,
}: {
  riders: Rider[];
  apiKey: string;
  height?: number;
}) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const map = React.useRef<google.maps.Map | null>(null);
  const markers = React.useRef<Map<string, Marker>>(new Map());
  const [error, setError] = React.useState<string | null>(null);

  const placed = React.useMemo(
    () => riders.map((r) => ({ rider: r, at: positionOf(r) })).filter((e) => e.at),
    [riders]
  );

  React.useEffect(() => {
    if (!apiKey) {
      setError("No Google Maps key is configured for this console.");
      return;
    }

    let cancelled = false;
    loadMaps(apiKey)
      .then(() => {
        if (cancelled || !holder.current || map.current) return;
        map.current = new window.google!.maps.Map(holder.current, {
          center: placed[0]?.at ?? FALLBACK,
          zoom: 13,
          // Tilt needs a vector map, which needs a map id; without one this is
          // the flat raster map, which is still the right picture for
          // "where is everybody".
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, placed]);

  /**
   * Markers are moved rather than rebuilt.
   *
   * The list refreshes every few seconds; recreating every marker each time
   * makes the whole fleet blink, and loses any info window the dispatcher has
   * open.
   */
  React.useEffect(() => {
    if (!map.current || !window.google?.maps) return;

    const seen = new Set<string>();

    for (const { rider, at } of placed) {
      if (!at) continue;
      seen.add(rider._id);
      const colour = isDelivering(rider) ? "#dc2626" : "#16a34a";
      const existing = markers.current.get(rider._id);

      if (existing) {
        existing.setPosition(at);
        existing.setIcon(pin(colour));
        continue;
      }

      const marker = new window.google.maps.Marker({
        map: map.current,
        position: at,
        icon: pin(colour),
        title: `${rider.name ?? "Rider"} — ${
          isDelivering(rider) ? "on a delivery" : "waiting for an order"
        }`,
      });
      markers.current.set(rider._id, marker);
    }

    // A rider who has gone off duty should not leave a pin behind.
    for (const [id, marker] of markers.current) {
      if (!seen.has(id)) {
        marker.setMap(null);
        markers.current.delete(id);
      }
    }
  }, [placed]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        style={{ height }}
      >
        {error}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border" style={{ height }}>
      <div ref={holder} className="h-full w-full" />

      <div className="absolute left-3 top-3 rounded-lg bg-background/95 px-3 py-2 text-xs shadow">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
          <span>On a delivery</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#16a34a]" />
          <span>Free</span>
        </div>
      </div>

      {placed.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/90 px-3 py-2 text-center text-xs text-muted-foreground">
          No rider has reported a location yet.
        </div>
      )}
    </div>
  );
}
