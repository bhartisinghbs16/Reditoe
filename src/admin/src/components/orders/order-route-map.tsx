"use client";

import * as React from "react";
import { api } from "@/lib/api";

/**
 * The journey one order took.
 *
 * Answers a specific question - which kitchen did this come from, where did
 * it go, and what route did the rider follow - so it shows those things and
 * nothing else. No other orders, no other riders, no unrelated pins.
 *
 * Loads Google's script the same way the live fleet map does, and for the
 * same reason: a console that never opens either screen never fetches a map.
 */

const SCRIPT_ID = "google-maps-js";

interface Point {
  latitude: number;
  longitude: number;
}

interface Tracking {
  orderNumber?: string;
  status?: string;
  restaurant?: { name?: string; location?: Point | null };
  delivery?: { location?: Point | null };
  rider?: { name?: string; location?: Point | null } | null;
  routeCoordinates?: Point[];
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
        loader = null;
        reject(new Error("Could not load Google Maps."));
      };
      document.head.appendChild(script);
    });
  }
  return loader;
}

const usable = (p?: Point | null) =>
  !!p &&
  Number.isFinite(p.latitude) &&
  Number.isFinite(p.longitude) &&
  !(p.latitude === 0 && p.longitude === 0);

const toLatLng = (p: Point) => ({ lat: p.latitude, lng: p.longitude });

export function OrderRouteMap({ orderId, height = 380 }: { orderId: string; height?: number }) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const [tracking, setTracking] = React.useState<Tracking | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<Tracking>(`/admin/orders/${orderId}/tracking`)
      .then((data) => !cancelled && setTracking(data))
      .catch(() => !cancelled && setError("Could not load this order's route."));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  React.useEffect(() => {
    if (!tracking || !holder.current) return;

    if (!apiKey) {
      setError("No Google Maps key is configured for this console.");
      return;
    }

    const pickup = tracking.restaurant?.location;
    const drop = tracking.delivery?.location;
    const rider = tracking.rider?.location;
    const points = [pickup, drop, rider].filter(usable) as Point[];

    if (points.length === 0) {
      setError("This order has no locations recorded, so there is no route to draw.");
      return;
    }

    let cancelled = false;
    loadMaps(apiKey)
      .then(() => {
        if (cancelled || !holder.current || !window.google?.maps) return;

        const map = new window.google.maps.Map(holder.current, {
          center: toLatLng(points[0]),
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        // Fit whatever exists, rather than guessing a zoom that suits one city.
        const bounds = new window.google.maps.LatLngBounds();
        points.forEach((p) => bounds.extend(toLatLng(p)));

        if (usable(pickup)) {
          new window.google.maps.Marker({
            map,
            position: toLatLng(pickup!),
            label: { text: "P", color: "#ffffff", fontWeight: "600" },
            title: `Picked up from ${tracking.restaurant?.name ?? "restaurant"}`,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: "#f97316",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });
        }

        if (usable(drop)) {
          new window.google.maps.Marker({
            map,
            position: toLatLng(drop!),
            label: { text: "D", color: "#ffffff", fontWeight: "600" },
            title: "Delivered here",
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: "#2563eb",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });
        }

        if (usable(rider)) {
          new window.google.maps.Marker({
            map,
            position: toLatLng(rider!),
            title: `${tracking.rider?.name ?? "Rider"} is here now`,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#16a34a",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });
        }

        /**
         * The recorded path where there is one, and the straight line between
         * the two ends where there is not - dashed, so it is not mistaken for
         * a route anybody actually rode.
         */
        const travelled = (tracking.routeCoordinates ?? []).filter(usable);
        if (travelled.length > 1) {
          new window.google.maps.Polyline({
            map,
            path: travelled.map(toLatLng),
            strokeColor: "#16a34a",
            strokeWeight: 4,
          });
          travelled.forEach((p) => bounds.extend(toLatLng(p)));
        } else if (usable(pickup) && usable(drop)) {
          new window.google.maps.Polyline({
            map,
            path: [toLatLng(pickup!), toLatLng(drop!)],
            strokeOpacity: 0,
            icons: [
              {
                icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7, scale: 3 },
                offset: "0",
                repeat: "14px",
              },
            ],
            strokeColor: "#94a3b8",
          });
        }

        if (points.length > 1) map.fitBounds(bounds, 48);
      })
      .catch((reason: Error) => !cancelled && setError(reason.message));

    return () => {
      cancelled = true;
    };
  }, [tracking, apiKey]);

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
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border" style={{ height }}>
        <div ref={holder} className="h-full w-full" />
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-[#f97316]" /> Picked up from{" "}
          {tracking?.restaurant?.name ?? "restaurant"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-[#2563eb]" /> Delivery address
        </span>
        {tracking?.rider?.location && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-[#16a34a]" />{" "}
            {tracking.rider.name ?? "Rider"} now
          </span>
        )}
      </div>
    </div>
  );
}
