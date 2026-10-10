"use client";

import * as React from "react";

/**
 * A coverage map of India, drawn rather than fetched.
 *
 * The outline and projection come from the reference design. It is a
 * stylised silhouette, not a survey - close enough to place a city, not
 * something to navigate by - and it is deliberately hand-drawn: no tile
 * server, no API key, nothing that stops working when a key expires or a
 * bill goes unpaid.
 *
 * Every pin is a real restaurant at its own coordinates. A vendor without
 * coordinates is not drawn at all and is counted instead, because a pin in
 * the wrong place is worse than a missing one.
 */

const LON_MIN = 67.5;
const LON_MAX = 97.8;
const LAT_MIN = 6.5;
const LAT_MAX = 37.2;
const VB_W = 800;
const VB_H = 870;
/** Degrees-of-latitude per km, scaled into viewbox units. */
const KM_TO_UNIT = 0.269;

function project(lat: number, lon: number) {
  return {
    x: ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * VB_W,
    y: ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * VB_H,
  };
}

const INDIA_OUTLINE: [number, number][] = [
  [34.8, 78.0], [35.7, 76.8], [36.0, 75.2], [34.9, 73.9], [34.3, 73.3],
  [33.0, 73.9], [32.4, 74.4], [32.0, 74.9], [31.2, 74.5], [30.2, 74.0],
  [29.5, 73.0], [28.9, 71.5], [28.0, 70.2], [26.9, 70.1], [24.9, 69.5],
  [24.3, 68.8], [23.9, 68.5], [23.3, 68.9], [22.9, 69.6], [22.5, 69.1],
  [21.9, 69.6], [21.1, 70.0], [20.9, 70.9], [21.6, 72.2], [20.7, 72.9],
  [20.0, 73.0], [19.2, 72.8], [18.5, 72.9], [17.9, 73.3], [16.6, 73.3],
  [15.5, 73.8], [14.8, 74.1], [13.9, 74.5], [12.9, 74.8], [12.3, 75.2],
  [11.3, 75.7], [10.5, 76.0], [9.5, 76.3], [8.9, 76.6], [8.1, 77.5],
  [8.3, 78.1], [9.3, 79.3], [10.3, 79.8], [11.4, 79.8], [12.0, 80.0],
  [13.1, 80.3], [14.5, 80.1], [15.9, 80.3], [16.9, 82.2], [17.7, 83.3],
  [18.3, 84.1], [19.3, 84.9], [20.3, 86.7], [20.6, 87.0], [21.5, 87.5],
  [21.6, 88.1], [21.9, 88.9], [22.9, 88.9], [24.0, 88.3], [25.2, 89.0],
  [26.4, 89.9], [26.0, 90.5], [25.1, 91.7], [24.1, 92.0], [23.7, 91.3],
  [23.0, 91.8], [22.2, 93.0], [23.7, 93.4], [24.3, 93.9], [25.2, 94.1],
  [26.6, 94.6], [27.5, 95.4], [28.3, 96.8], [29.0, 97.3], [28.6, 96.2],
  [28.8, 94.8], [28.1, 93.5], [27.8, 92.1], [27.0, 91.5], [26.8, 90.0],
  [27.0, 88.9], [27.5, 88.7], [28.1, 88.2], [27.9, 87.9], [27.5, 86.9],
  [28.0, 85.3], [28.4, 83.8], [29.0, 82.3], [29.7, 80.2], [30.3, 79.5],
  [31.0, 79.0], [32.0, 78.5], [32.8, 78.9], [33.5, 78.5], [34.2, 78.2],
  [34.8, 78.0],
];

const INDIA_PATH_D =
  "M " +
  INDIA_OUTLINE.map(([lat, lon]) => {
    const point = project(lat, lon);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(" L ") +
  " Z";

const GRID_LATS = [10, 15, 20, 25, 30, 35];
const GRID_LONS = [70, 75, 80, 85, 90, 95];

export interface MapPin {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  radiusKm: number | null;
  latitude: number | null;
  longitude: number | null;
  plotted: boolean;
  status: string | null;
}

export function CoverageMap({
  pins,
  selectedId,
  onSelect,
  className,
}: {
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const plotted = pins.filter((pin) => pin.plotted);

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Coverage map of India"
      >
        <defs>
          <clipPath id="indiaClip">
            <path d={INDIA_PATH_D} />
          </clipPath>
        </defs>

        {/* Sea */}
        <rect width={VB_W} height={VB_H} fill="#dbeafe" opacity={0.35} />

        {/* Land */}
        <path d={INDIA_PATH_D} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} />

        {/* Graticule, clipped to the land so it reads as a map not a grid */}
        <g clipPath="url(#indiaClip)" stroke="#cbd5e1" strokeWidth={0.5} opacity={0.7}>
          {GRID_LATS.map((lat) => {
            const a = project(lat, LON_MIN);
            const b = project(lat, LON_MAX);
            return <line key={`lat-${lat}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          {GRID_LONS.map((lon) => {
            const a = project(LAT_MIN, lon);
            const b = project(LAT_MAX, lon);
            return <line key={`lon-${lon}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>

        {/* Delivery ranges, under the pins */}
        {plotted.map((pin) => {
          const point = project(pin.latitude!, pin.longitude!);
          const radius = Math.max(2, (pin.radiusKm ?? 0) * KM_TO_UNIT);
          const active = pin.id === selectedId;
          return (
            <circle
              key={`r-${pin.id}`}
              cx={point.x}
              cy={point.y}
              r={radius}
              fill={active ? "#c31f39" : "#16a34a"}
              fillOpacity={active ? 0.18 : 0.12}
              stroke={active ? "#c31f39" : "#15803d"}
              strokeWidth={active ? 1.4 : 0.9}
            />
          );
        })}

        {plotted.map((pin) => {
          const point = project(pin.latitude!, pin.longitude!);
          const active = pin.id === selectedId;
          return (
            <g
              key={pin.id}
              onClick={() => onSelect?.(pin.id)}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={active ? 7 : 5}
                fill={active ? "#c31f39" : "#0e1526"}
                stroke="#ffffff"
                strokeWidth={2}
              />
              <title>
                {pin.name}
                {pin.city ? ` — ${pin.city}` : ""}
                {pin.radiusKm ? ` — ${pin.radiusKm} km range` : ""}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** How many kilometres one viewbox unit is, for the scale note. */
export const KM_PER_UNIT = 1 / KM_TO_UNIT;
