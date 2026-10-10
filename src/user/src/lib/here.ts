import React from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

/**
 * Where the customer is, kept current while the app is open.
 *
 * The address bar showed whichever address was selected, which for anyone who
 * had not added one was a sample address in a town they may never have
 * visited. This offers the place they are actually standing in.
 *
 * Three things keep it current, because a position read once at launch is
 * wrong as soon as anybody moves:
 *
 *  - a reading when the app opens,
 *  - a fresh reading each time it returns to the foreground, which is what
 *    "opening the app" means on a phone that never really closes it,
 *  - a watch that fires when the customer has moved far enough to matter.
 *
 * The permission is asked for once. A refusal is remembered and not asked
 * again on the next launch — being asked on every open is how an app teaches
 * people to refuse permanently — but the permission is re-read every time, so
 * granting it later in Settings starts this working with no further prompt.
 */

const ASKED_KEY = "reditoe.location.asked";

/** Far enough that the area name could plausibly have changed. */
const MOVED_METRES = 200;

export interface Here {
  latitude: number;
  longitude: number;
  /** Something short enough for a header, e.g. "Tirupati". */
  area?: string;
  /** The fuller line beneath it, e.g. "Gandhi Road, Tirupati". */
  line?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

/** The place name for a point, or nothing if it cannot be resolved. */
async function describe(point: { latitude: number; longitude: number }): Promise<Here> {
  // Best effort: the coordinates are the useful part and the name is a
  // nicety, so a failure here still leaves a usable position.
  const [place] = await Location.reverseGeocodeAsync(point).catch(() => []);
  if (!place) return point;

  const area = place.district || place.city || place.subregion || place.region || undefined;
  const line =
    [place.name, place.street, place.district, place.city]
      // A name like "123" repeated as the street number reads as a stutter.
      .filter((part, index, all) => part && all.indexOf(part) === index)
      .join(", ") || undefined;

  return {
    ...point,
    area,
    line,
    city: place.city || place.subregion || undefined,
    state: place.region || undefined,
    postalCode: place.postalCode || undefined,
  };
}

export function useHere(enabled = true) {
  const [here, setHere] = React.useState<Here | null>(null);

  React.useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let watcher: Location.LocationSubscription | null = null;

    /** Whether we may read the position, prompting at most once ever. */
    const allowed = async () => {
      const existing = await Location.getForegroundPermissionsAsync();
      if (existing.status === "granted") return true;
      if (existing.canAskAgain === false) return false;
      const asking = await Location.requestForegroundPermissionsAsync();
      if (asking.status === "granted") {
        await AsyncStorage.removeItem(ASKED_KEY);
        return true;
      }
      await AsyncStorage.setItem(ASKED_KEY, "1");
      return false;
    };

    const read = async () => {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);
      if (cancelled || !position) return;
      const point = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setHere((current) => current ?? point);
      const described = await describe(point);
      if (!cancelled) setHere(described);
    };

    (async () => {
      try {
        if (!(await allowed()) || cancelled) return;
        await read();
        if (cancelled) return;

        // Movement, rather than a timer: a customer sitting still does not
        // need their position recomputed every few seconds.
        watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: MOVED_METRES },
          (position) => {
            if (cancelled) return;
            void describe({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }).then((described) => {
              if (!cancelled) setHere(described);
            });
          }
        );
      } catch {
        // No location is the normal state for anyone who said no.
      }
    })();

    // Coming back to the app is what a customer means by opening it.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || cancelled) return;
      void (async () => {
        if (await allowed()) void read();
      })();
    });

    return () => {
      cancelled = true;
      watcher?.remove();
      subscription.remove();
    };
  }, [enabled]);

  return here;
}
