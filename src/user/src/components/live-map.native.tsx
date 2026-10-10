import React from "react";
import { Platform, Pressable, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { Txt, colors } from "@/components/ui";
import { RouteMap } from "@/components/map";
import {
  MAP_STYLE,
  distanceKm,
  regionFor,
  valid,
  type Coordinate,
  type LiveMapProps,
} from "@/components/live-map-common";

/**
 * The delivery, on a real map, tilted.
 *
 * The screen used to draw its own map and put the rider a little over half
 * way along it, always. This shows where the rider is, polled while the order
 * is moving.
 *
 * The camera is pitched so buildings stand up, which is what was asked for -
 * with the caveat that these are the real buildings Google has modelled for
 * the place, not the illustrated ones in the reference artwork. No map SDK
 * draws those.
 *
 * Two things it deliberately does not do:
 *
 *   - it does not chase the rider with the camera after the first fix, so a
 *     customer who has panned or zoomed to look at something keeps their view.
 *     A recentre button puts it back.
 *   - it does not error when there is no rider position, which is the normal
 *     state before pickup; the two ends of the journey are shown instead.
 *
 * react-native-maps has no web build, so the drawn map is still used there.
 */

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
  const map = React.useRef<MapView | null>(null);
  const points = [rider, restaurant, destination].filter(valid);

  const recentre = React.useCallback(() => {
    if (points.length) map.current?.animateToRegion(regionFor(points), 400);
  }, [points]);

  // No map SDK on web, and nothing to show without a coordinate anywhere.
  if (Platform.OS === "web" || points.length === 0) {
    return (
      <RouteMap
        height={height}
        progress={progress}
        restaurantLabel={restaurantLabel}
        destinationLabel={destinationLabel}
      />
    );
  }

  const travelled = route.filter(valid);

  return (
    <View className="overflow-hidden bg-surface-sunken" style={{ height }}>
      <MapView
        ref={map}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={regionFor(points)}
        customMapStyle={MAP_STYLE}
        // Tilted, with Google's building models standing up in it.
        initialCamera={{
          center: points[0],
          pitch: 55,
          heading: 0,
          zoom: 16,
          altitude: 0,
        }}
        showsBuildings
        showsCompass={false}
        showsUserLocation={false}
        toolbarEnabled={false}
        rotateEnabled
        pitchEnabled
      >
        {/* Where the rider has been: restaurant to here. */}
        {travelled.length > 1 && (
          <Polyline
            coordinates={travelled}
            strokeColor="#f97316"
            strokeWidth={5}
          />
        )}

        {/* What is left: here to the door. */}
        {valid(rider) && valid(destination) && (
          <Polyline
            coordinates={[rider, destination]}
            strokeColor="#16a34a"
            strokeWidth={5}
          />
        )}

        {/* Before pickup there is no rider, so show the whole journey. */}
        {!valid(rider) && valid(restaurant) && valid(destination) && (
          <Polyline
            coordinates={[restaurant, destination]}
            strokeColor="#16a34a"
            strokeWidth={4}
            lineDashPattern={[8, 6]}
          />
        )}

        {valid(restaurant) && (
          <Marker coordinate={restaurant} title={restaurantLabel} anchor={{ x: 0.5, y: 1 }}>
            <View className="items-center">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-[#f97316]">
                <Ionicons name="restaurant" size={16} color="#ffffff" />
              </View>
            </View>
          </Marker>
        )}

        {valid(destination) && (
          <Marker coordinate={destination} title={destinationLabel} anchor={{ x: 0.5, y: 1 }}>
            <View className="items-center">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-[#2563eb]">
                <Ionicons name="home" size={15} color="#ffffff" />
              </View>
            </View>
          </Marker>
        )}

        {valid(rider) && (
          <Marker coordinate={rider} title="Your rider" anchor={{ x: 0.5, y: 0.5 }}>
            <View className="items-center">
              {!!etaLabel && (
                <View className="mb-1 rounded-full bg-white px-2 py-0.5 shadow">
                  <Txt size="micro" weight="bold" className="text-[#16a34a]">
                    {etaLabel}
                  </Txt>
                </View>
              )}
              <View className="h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#16a34a] shadow">
                <Ionicons name="bicycle" size={18} color="#ffffff" />
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      <Pressable
        onPress={recentre}
        accessibilityLabel="Recentre the map"
        className="absolute right-3 top-3 h-10 w-10 items-center justify-center rounded-full bg-white shadow active:opacity-70"
      >
        <Ionicons name="locate" size={18} color={colors.ink.default} />
      </Pressable>

      {!valid(rider) && (
        <View className="absolute inset-x-0 bottom-0 bg-surface/90 px-3 py-2">
          <Txt size="tiny" tone="muted">
            Waiting for your rider to start the delivery.
          </Txt>
        </View>
      )}
    </View>
  );
}

export { distanceKm };
export type { Coordinate };
