import React from "react";
import { Alert, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Chip, Txt } from "@/components/ui";
import { TextField } from "@/components/form";
import { ScreenHeader } from "@/components/screen-header";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * Create an offer.
 *
 * "Create" on the Offers screen had no handler, and neither did the "Create
 * Offer" on its empty state - so a vendor with no offers was shown a button
 * inviting them to make one, and nothing happened when they pressed it. The
 * coupon API has had create, toggle and delete the whole time.
 *
 * Checked here as well as on the server, so a vendor is told what is wrong
 * before the round trip rather than after it.
 */
const TYPES = [
  { id: "percentage", label: "% off" },
  { id: "fixed", label: "Rs off" },
] as const;

/** Types the slashes in, so only digits are entered. */
function formatDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** DD/MM/YYYY to the ISO date the server stores, or null if it is not real. */
function isoFrom(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (
    date.getFullYear() !== Number(yyyy) ||
    date.getMonth() !== Number(mm) - 1 ||
    date.getDate() !== Number(dd)
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

export default function NewOffer() {
  const router = useRouter();
  const { refresh } = useStore();

  const [code, setCode] = React.useState("");
  const [discountType, setDiscountType] = React.useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = React.useState("");
  const [minOrder, setMinOrder] = React.useState("");
  const [maxDiscount, setMaxDiscount] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const problem = (() => {
    if (code.trim().length < 3) return "Give the offer a code of at least three characters.";
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return "Enter how much comes off.";
    if (discountType === "percentage" && amount > 100)
      return "A percentage discount cannot be more than 100.";
    const iso = isoFrom(expiry);
    if (!iso) return "Enter the expiry date as DD/MM/YYYY.";
    if (new Date(iso) <= new Date()) return "The expiry date has already passed.";
    return null;
  })();

  const save = async () => {
    if (problem) {
      Alert.alert("Check the offer", problem);
      return;
    }
    setSaving(true);
    try {
      await api.post("/vendor/coupons", {
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: Number(value),
        expiryDate: isoFrom(expiry),
        description: description.trim(),
        minOrderAmount: minOrder ? Number(minOrder) : undefined,
        // Only meaningful on a percentage: a flat amount off is already capped.
        maxDiscountAmount:
          discountType === "percentage" && maxDiscount ? Number(maxDiscount) : undefined,
      });
      await refresh();
      Alert.alert("Offer created", `${code.trim().toUpperCase()} is live.`);
      router.back();
    } catch (error) {
      Alert.alert(
        "Could not create the offer",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Create Offer" />
      <ScrollView contentContainerClassName="px-4 pb-28 pt-3">
        <Card className="p-4">
          <TextField
            label="Offer code"
            placeholder="e.g. WELCOME50"
            icon="pricetag-outline"
            value={code}
            onChangeText={(next) => setCode(next.toUpperCase().replace(/\s/g, ""))}
          />

          <Txt size="tiny" tone="muted" className="mb-1.5 mt-3">
            Discount type
          </Txt>
          <View className="flex-row gap-2">
            {TYPES.map((entry) => (
              <Chip
                key={entry.id}
                label={entry.label}
                active={discountType === entry.id}
                onPress={() => setDiscountType(entry.id)}
              />
            ))}
          </View>

          <TextField
            label={discountType === "percentage" ? "Percent off" : "Amount off"}
            placeholder={discountType === "percentage" ? "10" : "50"}
            icon="cash-outline"
            keyboardType="numeric"
            value={value}
            onChangeText={(next) => setValue(next.replace(/\D/g, "").slice(0, 5))}
            className="mt-3"
          />

          <TextField
            label="Minimum order (optional)"
            placeholder="199"
            icon="basket-outline"
            keyboardType="numeric"
            value={minOrder}
            onChangeText={(next) => setMinOrder(next.replace(/\D/g, "").slice(0, 6))}
            className="mt-3"
          />

          {discountType === "percentage" && (
            <TextField
              label="Maximum discount (optional)"
              placeholder="100"
              icon="trending-down-outline"
              keyboardType="numeric"
              value={maxDiscount}
              onChangeText={(next) => setMaxDiscount(next.replace(/\D/g, "").slice(0, 6))}
              className="mt-3"
            />
          )}

          <TextField
            label="Expires on"
            placeholder="DD/MM/YYYY"
            icon="calendar-outline"
            keyboardType="numeric"
            value={expiry}
            onChangeText={(next) => setExpiry(formatDate(next))}
            className="mt-3"
          />

          <TextField
            label="Description (optional)"
            placeholder="What customers see"
            icon="document-text-outline"
            value={description}
            onChangeText={setDescription}
            className="mt-3"
          />
        </Card>

        {problem && (
          <Txt size="tiny" className="mt-3 text-red-600">
            {problem}
          </Txt>
        )}
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-4 pb-6 pt-3">
        <Button
          label={saving ? "Creating…" : "Create offer"}
          onPress={save}
          disabled={saving || Boolean(problem)}
        />
      </View>
    </SafeAreaView>
  );
}
