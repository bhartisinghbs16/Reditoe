import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Button, Card, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * How far this restaurant delivers.
 *
 * This is the setting that decides which customers may order here at all, and
 * until now the vendor had no way to touch it - the radius was whatever the
 * record was created with, and nothing read it anyway.
 *
 * Two halves, and both are needed. The radius is a distance; the restaurant's
 * coordinates are the point it is measured from. A radius without a location
 * describes a circle around nowhere, and the restaurant is unorderable to
 * everybody until the location is set.
 */

/** Sensible distances for a kitchen, rather than a free-text box. */
const CHOICES = [3, 5, 8, 10, 15, 20];

export default function DeliveryAreaScreen() {
  const router = useRouter();
  const { vendor, refresh } = useStore();

  const [radius, setRadius] = React.useState<number | null>(vendor.deliveryRadiusKm ?? null);
  const [point, setPoint] = React.useState<{ latitude: number; longitude: number } | null>(
    vendor.latitude && vendor.longitude
      ? { latitude: vendor.latitude, longitude: vendor.longitude }
      : null
  );
  const [locating, setLocating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  /**
   * Takes the restaurant's position from the phone.
   *
   * Asked for while standing in the kitchen, this is the most accurate the
   * centre of the delivery area is ever going to be - more so than an address
   * geocoded from a line of text.
   */
  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location permission needed",
          "Allow location access while you are at the restaurant, so customers nearby can find you."
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPoint({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      Alert.alert("Could not read your location", "Please try again in a moment.");
    } finally {
      setLocating(false);
    }
  };

  const changed =
    radius !== (vendor.deliveryRadiusKm ?? null) ||
    point?.latitude !== (vendor.latitude ?? undefined) ||
    point?.longitude !== (vendor.longitude ?? undefined);

  const save = async () => {
    if (!radius) return;
    setSaving(true);
    try {
      await api.patch("/vendor/restaurant", {
        deliveryRadius: radius,
        // Sent only when taken, so saving a radius alone never wipes a
        // location that was already right.
        // Only the coordinates: the rest of the address is already stored,
        // and this screen has it as one formatted line rather than fields.
        ...(point ? { address: { coordinates: point } } : {}),
      });
      await refresh();
      Alert.alert(
        "Delivery area saved",
        `Customers within ${radius} km of your restaurant can now order from you.`
      );
      router.back();
    } catch (reason: any) {
      Alert.alert("Could not save", reason?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScreenHeader title="Delivery Area" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-32">
        {/* Where the circle is centred */}
        <View className="px-4 pt-3">
          <Card className="p-4">
            <Txt weight="bold">Restaurant location</Txt>
            <Txt size="tiny" tone="muted" className="mt-1">
              This is the centre of your delivery area. Set it while you are at
              the restaurant.
            </Txt>

            <Pressable
              onPress={useCurrentLocation}
              disabled={locating}
              className="mt-3 flex-row items-center gap-3 rounded-tile border border-line px-3 py-3 active:opacity-70"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken">
                {locating ? (
                  <ActivityIndicator size="small" color={colors.ok.default} />
                ) : (
                  <Ionicons name="locate" size={18} color={colors.ok.default} />
                )}
              </View>
              <View className="min-w-0 flex-1">
                <Txt weight="semibold">
                  {locating ? "Finding your restaurant…" : "Use my current location"}
                </Txt>
                <Txt size="tiny" tone="muted">
                  {point
                    ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
                    : "Not set — no customer can order from you yet"}
                </Txt>
              </View>
              {!!point && (
                <Ionicons name="checkmark-circle" size={20} color={colors.ok.default} />
              )}
            </Pressable>

            {!point && (
              <View className="mt-3 flex-row items-start gap-2 rounded-tile bg-bad-soft px-3 py-2">
                <Ionicons name="warning" size={15} color={colors.bad.default} />
                <Txt size="tiny" className="flex-1 text-bad-ink">
                  Without a location your restaurant cannot be offered to
                  anyone, whatever radius you choose.
                </Txt>
              </View>
            )}
          </Card>
        </View>

        {/* How far it reaches */}
        <View className="px-4 pt-3">
          <Card className="p-4">
            <Txt weight="bold">Delivery radius</Txt>
            <Txt size="tiny" tone="muted" className="mt-1">
              Customers further than this from your restaurant will not be able
              to order from you. Other restaurants set their own distance.
            </Txt>

            <View className="mt-3 flex-row flex-wrap gap-2">
              {CHOICES.map((km) => (
                <Pressable
                  key={km}
                  onPress={() => setRadius(km)}
                  className={`rounded-tile border px-4 py-2.5 active:opacity-70 ${
                    radius === km ? "border-ok bg-ok-soft" : "border-line"
                  }`}
                >
                  <Txt
                    weight={radius === km ? "bold" : "regular"}
                    tone={radius === km ? "ok" : "default"}
                  >
                    {km} km
                  </Txt>
                </Pressable>
              ))}
            </View>

            {!!radius && (
              <Txt size="tiny" tone="muted" className="mt-3">
                Anyone within {radius} km of your restaurant can order. Anyone
                further away will see that you do not deliver to them.
              </Txt>
            )}
          </Card>
        </View>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-4 pb-6 pt-3">
        <Button
          label={saving ? "Saving…" : "Save delivery area"}
          onPress={save}
          disabled={!radius || !changed || saving}
        />
      </View>
    </SafeAreaView>
  );
}
