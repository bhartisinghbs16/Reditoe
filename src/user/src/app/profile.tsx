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
 * there was nowhere in the app to correct a misspelt name. The email and the
 * mobile number are shown but not edited: the number is what the account is
 * signed into with, and both are support jobs rather than text fields.
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
  const { customer, authUser, reloadAuthedData } = useStore();

  // The account's own name, not the display one: an account without a usable
  // name shows as "Customer" elsewhere, and that must not be offered here as if
  // it were what the customer typed.
  const [name, setName] = React.useState(authUser?.name ?? "");
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert("Name needed", "Please enter your name.");
      return;
    }
    setSaving(true);
    try {
      // Not the number: it is how this account is signed into, and the server
      // refuses a change to it that has not been proved by a code.
      await api.updateProfile({ name: name.trim() });
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
            label="Mobile number"
            value={customer.phone ?? ""}
            editable={false}
            hint="This is how you sign in, so it can't be changed here. Contact support if you need to change it."
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
