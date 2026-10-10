import React from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

/**
 * Personal information.
 *
 * "Personal Information" and "Edit Profile" both pointed at the sign-in
 * screen, which for a customer who was already signed in did nothing useful —
 * there was nowhere in the app to correct a misspelt name or a changed phone
 * number. The email is shown but not edited: it identifies the account, and
 * changing it is a support job rather than a text field.
 */
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  editable = true,
  hint,
}: {
  label: string;
  value: string;
  onChangeText?: (next: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad";
  editable?: boolean;
  hint?: string;
}) {
  return (
    <View className="mt-3">
      <Txt size="tiny" weight="semibold" tone="soft">
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink.faint}
        keyboardType={keyboardType}
        editable={editable}
        accessibilityLabel={label}
        className={`mt-1 h-12 rounded-tile border border-line px-3 text-ink-default ${
          editable ? "bg-surface" : "bg-surface-sunken"
        }`}
      />
      {hint ? (
        <Txt size="micro" tone="muted" className="mt-1">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { customer, reloadAuthedData } = useStore();

  const [name, setName] = React.useState(customer.name ?? "");
  const [phone, setPhone] = React.useState(customer.phone ?? "");
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert("Name needed", "Please enter your name.");
      return;
    }
    setSaving(true);
    try {
      await api.updateProfile({ name: name.trim(), phone: phone.trim() });
      await reloadAuthedData();
      Alert.alert("Saved", "Your details have been updated.");
      router.back();
    } catch (error) {
      Alert.alert(
        "Couldn't save",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Personal Information" subtitle="Your name, phone and email" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <Card className="mx-4 mt-1 p-4">
          <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" />
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="10-digit mobile number"
            keyboardType="phone-pad"
          />
          <Field
            label="Email"
            value={customer.email ?? ""}
            editable={false}
            hint="Your email identifies this account. Contact support to change it."
          />

          <Pressable
            onPress={save}
            disabled={saving}
            accessibilityLabel="Save your details"
            className={`mt-5 h-12 items-center justify-center rounded-tile bg-brand-600 active:opacity-90 ${
              saving ? "opacity-60" : ""
            }`}
          >
            <Txt weight="bold" tone="white">
              {saving ? "Saving…" : "Save changes"}
            </Txt>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
