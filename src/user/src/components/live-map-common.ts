/**
 * The parts of the delivery map that do not care whether there is a map.
 *
 * `react-native-maps` has no web build, and importing it at all on web breaks
 * the bundle - guarding the render is not enough, because the import runs
 * first. So the component exists twice, once per platform, and everything
 * they share lives here.
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface LiveMapProps {
  height?: number;
  rider?: Coordinate | null;
  restaurant?: Coordinate | null;
  destination?: Coordinate | null;
  /** Where the rider has already been, newest last. */
  route?: Coordinate[];
  restaurantLabel?: string;
  destinationLabel?: string;
  /** Shown in a bubble over the rider, e.g. "12 mins away". */
  etaLabel?: string;
  /** Drawn-map fallback position, used on web and before any real fix. */
  progress?: number;
}

export const valid = (point?: Coordinate | null): point is Coordinate =>
  !!point &&
  Number.isFinite(point.latitude) &&
  Number.isFinite(point.longitude) &&
  // 0,0 is in the Atlantic; the API sends it when a coordinate is missing.
  !(point.latitude === 0 && point.longitude === 0);

/** A window holding every point, with room around the edges. */
export function regionFor(points: Coordinate[]) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // A single point would give a zero span, which zooms in as far as it goes.
    latitudeDelta: Math.max((maxLat - minLat) * 1.8, 0.008),
    longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.008),
  };
}

/** Straight-line kilometres, good enough for a "3.6 km" label. */
export function distanceKm(a: Coordinate, b: Coordinate): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * A quiet basemap, so the two route colours are the loudest thing on it.
 * Google's default palette competes with them.
 */
export const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f4f5f7" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#fde8ea" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#eef3ec" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d6e4f0" }] },
];
