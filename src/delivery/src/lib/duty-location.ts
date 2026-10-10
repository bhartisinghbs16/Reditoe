import * as Location from "expo-location";
import { api } from "@/lib/api";

/**
 * Telling the server where the rider is, while they are on duty.
 *
 * Dispatch picks the nearest riders to the restaurant, and nothing was ever
 * sending a position for it to measure — the app only shared location once an
 * order was in hand, for the customer's tracking map. So every rider sat at
 * the field's [0,0] default, thousands of kilometres from every restaurant,
 * and the dispatcher fell back to offering each order to everybody online.
 *
 * This is separate from that per-order sharing and much coarser: it answers
 * "which riders are near this restaurant", not "where is my food". It runs
 * only while the rider is online — following someone off-shift would be a
 * tracking device, not a delivery app.
 */

/** Enough to rank riders around a restaurant; not a street-level fix. */
const ACCURACY = Location.Accuracy.Low;
const EVERY_MS = 60_000;
const EVERY_METRES = 250;

let subscription: Location.LocationSubscription | null = null;

async function report(position: Location.LocationObject) {
  try {
    await api.updateRiderLocation({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  } catch {
    // A missed position is not worth interrupting a shift for; the next one
    // is a minute away.
  }
}

/**
 * Starts reporting. Returns false if the rider declines, which is theirs to
 * decline — dispatch still reaches them, just without distance ranking.
 */
export async function startDutyLocation(): Promise<boolean> {
  if (subscription) return true;

  const existing = await Location.getForegroundPermissionsAsync();
  const granted =
    existing.status === "granted" ||
    (existing.canAskAgain &&
      (await Location.requestForegroundPermissionsAsync()).status === "granted");
  if (!granted) return false;

  // One straight away, so going on duty is enough to be findable — waiting
  // for the first movement would leave a stationary rider unlocated.
  const first = await Location.getCurrentPositionAsync({ accuracy: ACCURACY }).catch(() => null);
  if (first) await report(first);

  subscription = await Location.watchPositionAsync(
    { accuracy: ACCURACY, timeInterval: EVERY_MS, distanceInterval: EVERY_METRES },
    (position) => void report(position)
  );
  return true;
}

export function stopDutyLocation() {
  subscription?.remove();
  subscription = null;
}
