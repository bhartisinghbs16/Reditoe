import type * as React from "react";
import type { LiveMapProps } from "./live-map-common";

/**
 * The delivery map.
 *
 * There is no live-map.tsx: Metro picks live-map.web.tsx on the web and
 * live-map.native.tsx everywhere else, because react-native-maps has no web
 * build and importing it there breaks the bundle. That resolution happens at
 * bundle time, which the type checker does not do, so the shape both files
 * share is declared here.
 */
export declare function LiveMap(props: LiveMapProps): React.ReactElement;

export { distanceKm } from "./live-map-common";
export type { Coordinate, LiveMapProps } from "./live-map-common";
