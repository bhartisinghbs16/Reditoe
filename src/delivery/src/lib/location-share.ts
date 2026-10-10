import * as Location from "expo-location";
import { api } from "@/lib/api";

/**
 * Sending the rider's position while they are working.
 *
 * The customer's tracking screen shows where their rider is. Nothing was ever
 * sending that: the rider app asked for a location once, during registration,
 * and never again - so the map on the customer's phone had a rider pin fixed
 * a little over half way along the route, whoever was carrying the order and
 * wherever they had got to.
 *
 * The watch runs only while there is an order in hand. A delivery app that
 * follows someone off-shift is a tracking device, and the battery cost is
 * real: the accuracy below is the coarsest that still moves a pin sensibly
 * down a street, and updates are throttled by both time and distance.
 */

/** Roughly street-level, without asking for the GPS's best effort. */
const ACCURACY = Location.Accuracy.Balanced;
const EVERY_MS = 10_000;
const EVERY_METRES = 25;

let subscription: Location.LocationSubscription | null = null;
let sharingFor: string | null = null;

/** Whether the rider has agreed to share their position. */
export async function canShareLocation(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === "granted";
}

/**
 * Starts sending positions for one order, replacing any earlier watch.
 *
 * Returns false when the rider declines the permission - which is theirs to
 * decline. The delivery still works; the customer simply sees the two ends of
 * the journey and no rider pin.
 */
export async function startSharing(orderId: string): Promise<boolean> {
  if (sharingFor === orderId && subscription) return true;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return false;

  await stopSharing();

  subscription = await Location.watchPositionAsync(
    {
      accuracy: ACCURACY,
      timeInterval: EVERY_MS,
      distanceInterval: EVERY_METRES,
    },
    (position) => {
      const { latitude, longitude, accuracy, heading, speed } = position.coords;
      api
        .shareLocation(orderId, {
          latitude,
          longitude,
          accuracy: accuracy ?? undefined,
          heading: heading ?? undefined,
          speed: speed ?? undefined,
        })
        .catch(() => {
          // One dropped position is not worth telling the rider about; the
          // next one is along in a few seconds.
        });
    }
  );

  sharingFor = orderId;
  return true;
}

/** Stops the watch. Safe to call when nothing is running. */
export async function stopSharing(): Promise<void> {
  subscription?.remove();
  subscription = null;
  sharingFor = null;
}

/** The order currently being shared, if any. */
export const sharingOrderId = () => sharingFor;
