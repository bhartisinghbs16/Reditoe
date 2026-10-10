import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Card, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * Adding a delivery address.
 *
 * The address screen had an "Add New Address" panel that was not connected to
 * anything - a dashed box with a chevron and no handler - so a customer whose
 * address was not one of the two seeded ones had no way to enter their own.
 *
 * The coordinates matter as much as the words. Without them the rider's route
 * has no destination and the tracking map cannot draw the last leg, so this
 * offers to take the current position rather than leaving it to be typed.
 */

const LABELS = ["Home", "Office", "Other"] as const;

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View className="mt-3">
      <Txt size="tiny" tone="muted" className="mb-1.5">
        {label}
      </Txt>
      <View
        className={`h-12 justify-center rounded-tile border px-3 ${
          focused ? "border-brand-500" : "border-line"
        }`}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.ink.faint}
          keyboardType={keyboardType ?? "default"}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="p-0 text-[15px] text-ink"
        />
      </View>
    </View>
  );
}

export default function NewAddressScreen() {
  /*
   * The same screen adds and edits. It already knows how to locate an address
   * and validate one, and a second half-featured editor beside it would only
   * disagree with this one.
   */
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof id === "string" && id ? id : null;
  const router = useRouter();
  const { reloadAuthedData, savedAddresses } = useStore();

  const [label, setLabel] = React.useState<(typeof LABELS)[number]>("Home");
  const [street, setStreet] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [zip, setZip] = React.useState("");

  /* Filled from the address being corrected, once it has loaded. */
  React.useEffect(() => {
    if (!editingId) return;
    const existing = savedAddresses.find((entry) => entry.id === editingId);
    if (!existing) return;
    setLabel(
      (LABELS as readonly string[]).includes(existing.label)
        ? (existing.label as (typeof LABELS)[number])
        : "Home"
    );
    setStreet(existing.street ?? "");
    setCity(existing.city ?? "");
    setState(existing.state ?? "");
    setZip(existing.zipCode ?? "");
    if (existing.latitude != null && existing.longitude != null) {
      setPoint({ latitude: existing.latitude, longitude: existing.longitude });
    }
  }, [editingId, savedAddresses]);
  const [point, setPoint] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  /**
   * Fills the address in from where the phone is.
   *
   * Reverse geocoding is best-effort: it gives a street and a city on a good
   * day and nothing useful on a bad one, so whatever comes back is offered
   * as a starting point rather than written in. The coordinates are kept
   * either way, because those are what the rider actually navigates to.
   */
  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location permission needed",
          "Allow location access to fill your address automatically, or type it in below."
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const here = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setPoint(here);

      const [place] = await Location.reverseGeocodeAsync(here).catch(() => []);
      if (place) {
        const line = [place.name, place.street, place.district]
          .filter(Boolean)
          .join(", ");
        if (line && !street) setStreet(line);
        if (place.city && !city) setCity(place.city);
        if (place.region && !state) setState(place.region);
        if (place.postalCode && !zip) setZip(place.postalCode);
      }
    } catch {
      Alert.alert(
        "Could not read your location",
        "Please type your address in below."
      );
    } finally {
      setLocating(false);
    }
  };

  const ready =
    street.trim().length > 2 &&
    city.trim().length > 1 &&
    state.trim().length > 1 &&
    zip.trim().length >= 5;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        label,
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        zipCode: zip.trim(),
        ...(point ? { coordinates: point } : {}),
      };

      if (editingId) {
        await api.updateAddress(editingId, payload);
      } else {
        await api.addAddress(payload);
      }
      // The list on the previous screen is loaded with the rest of the
      // signed-in data, so it has to be told this happened.
      await reloadAuthedData();
      router.back();
    } catch (error) {
      Alert.alert(
        "Could not save the address",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title={editingId ? "Edit Address" : "Add New Address"} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-32"
        keyboardShouldPersistTaps="handled"
      >
        <Card className="mx-4 mt-2 p-3">
          <Pressable
            onPress={useCurrentLocation}
            disabled={locating}
            className="flex-row items-center gap-3 active:opacity-70"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
              {locating ? (
                <ActivityIndicator size="small" color={colors.brand[600]} />
              ) : (
                <Ionicons name="locate" size={19} color={colors.brand[600]} />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Txt weight="bold" tone="brand">
                {locating ? "Finding you…" : "Use my current location"}
              </Txt>
              <Txt size="tiny" tone="muted">
                {point
                  ? `Saved: ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`
                  : "Fills the address and helps your rider find you"}
              </Txt>
            </View>
            {!!point && (
              <Ionicons name="checkmark-circle" size={20} color={colors.leaf[600]} />
            )}
          </Pressable>
        </Card>

        <View className="mx-4 mt-4 flex-row gap-2">
          {LABELS.map((option) => (
            <Pressable
              key={option}
              onPress={() => setLabel(option)}
              className={`flex-1 items-center rounded-tile border py-2.5 active:opacity-70 ${
                label === option ? "border-brand-500 bg-brand-50" : "border-line"
              }`}
            >
              <Txt
                size="sm"
                weight={label === option ? "bold" : "regular"}
                tone={label === option ? "brand" : "default"}
              >
                {option}
              </Txt>
            </Pressable>
          ))}
        </View>

        <View className="mx-4">
          <Field
            label="Flat, house no., building, street"
            value={street}
            onChange={setStreet}
            placeholder="2nd Cross, Srinivas Nagar"
          />
          <Field label="City" value={city} onChange={setCity} placeholder="Tirupati" />
          <Field label="State" value={state} onChange={setState} placeholder="Andhra Pradesh" />
          <Field
            label="PIN code"
            value={zip}
            onChange={(next) => setZip(next.replace(/\D/g, "").slice(0, 6))}
            placeholder="517501"
            keyboardType="number-pad"
          />
        </View>

        {!point && (
          <View className="mx-4 mt-4 flex-row items-start gap-2 rounded-tile bg-surface-sunken px-3 py-2.5">
            <Ionicons name="information-circle" size={15} color={colors.ink.muted} />
            <Txt size="tiny" tone="muted" className="flex-1">
              Without your location the rider only has the written address to go
              on. Tapping the button above helps them find your door.
            </Txt>
          </View>
        )}
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-4 pb-6 pt-3">
        <Pressable
          onPress={save}
          disabled={!ready || saving}
          className={`h-13 items-center justify-center rounded-tile py-3.5 ${
            ready && !saving ? "bg-brand-600 active:opacity-90" : "bg-line-strong"
          }`}
        >
          <Txt weight="bold" tone="white">
            {saving ? "Saving…" : "Save address"}
          </Txt>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
