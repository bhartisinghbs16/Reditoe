import React from "react";
import { Alert, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Divider, Toggle, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * How this kitchen takes orders.
 *
 * Order Settings on the More menu opened Delivery Area, so the screen showed
 * a map and a radius where the order controls should have been.
 *
 * Only settings the server actually holds are here. A switch that looks real
 * and saves nowhere is worse than no switch, which is most of what this menu
 * used to offer.
 */
function NumberRow({
  label,
  detail,
  value,
  suffix,
  onChange,
}: {
  label: string;
  detail: string;
  value: string;
  suffix: string;
  onChange: (next: string) => void;
}) {
  return (
    <View className="flex-row items-center gap-3 px-3 py-3">
      <View className="min-w-0 flex-1">
        <Txt weight="semibold">{label}</Txt>
        <Txt size="tiny" tone="muted">
          {detail}
        </Txt>
      </View>
      <View className="flex-row items-center gap-1.5">
        <TextInput
          value={value}
          onChangeText={(next) => onChange(next.replace(/\D/g, "").slice(0, 3))}
          keyboardType="number-pad"
          placeholderTextColor={colors.ink.faint}
          className="w-16 rounded-xl border border-line px-2 py-2 text-center"
        />
        <Txt size="tiny" tone="muted">
          {suffix}
        </Txt>
      </View>
    </View>
  );
}

export default function OrderSettings() {
  const { vendor, storeOpen, setStoreOpen, refresh } = useStore();
  const [prep, setPrep] = React.useState("");
  const [packing, setPacking] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setPrep(String(vendor.prepMinutes ?? ""));
    setPacking(String(vendor.packagingFee ?? ""));
  }, [vendor.prepMinutes, vendor.packagingFee]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/vendor/restaurant", {
        ...(prep ? { currentPrepTimeMinutes: Number(prep) } : {}),
        ...(packing ? { dailyPackagingFee: Number(packing) } : {}),
      });
      await refresh();
      Alert.alert("Saved", "Your order settings have been updated.");
    } catch (error) {
      Alert.alert(
        "Could not save",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Order Settings" />
      <ScrollView contentContainerClassName="pb-28">
        <Card className="mx-4 mt-3 overflow-hidden">
          <View className="flex-row items-center gap-3 px-3 py-3">
            <View className="min-w-0 flex-1">
              <Txt weight="semibold">Accepting orders</Txt>
              <Txt size="tiny" tone="muted">
                Turn this off to stop new orders reaching your kitchen.
              </Txt>
            </View>
            <Toggle value={storeOpen} onValueChange={(open) => setStoreOpen(open)} />
          </View>
          <Divider />
          <NumberRow
            label="Preparation time"
            detail="How long the kitchen needs before a rider should arrive."
            value={prep}
            suffix="min"
            onChange={setPrep}
          />
          <Divider />
          <NumberRow
            label="Packaging charge"
            detail="Added to every order and shown to the customer separately."
            value={packing}
            suffix="₹"
            onChange={setPacking}
          />
        </Card>

        <Txt size="tiny" tone="muted" className="mx-4 mt-3">
          Delivery distance and the area you serve are set under Delivery Area.
          Opening times are set under Working Hours.
        </Txt>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-4 pb-6 pt-3">
        <Button label={saving ? "Saving…" : "Save settings"} onPress={save} disabled={saving} />
      </View>
    </SafeAreaView>
  );
}
