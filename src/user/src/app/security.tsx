import React from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Note, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { api } from "@/lib/api";

/**
 * Security.
 *
 * The account menu listed "Security — Change password, Biometric & more" as a
 * row that did nothing at all: it carried no destination, so pressing it was
 * indistinguishable from the app freezing. Changing a password is the part
 * that exists, so that is what this offers.
 */
const MIN_LENGTH = 6;

export default function SecurityScreen() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (password.length < MIN_LENGTH) {
      Alert.alert("Too short", `Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      Alert.alert("They don't match", "Both boxes need the same password.");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(password);
      Alert.alert("Password changed", "Use your new password next time you sign in.");
      router.back();
    } catch (error) {
      Alert.alert(
        "Couldn't change it",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Security" subtitle="Change your password" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <Card className="mx-4 mt-1 p-4">
          <Txt size="tiny" weight="semibold" tone="soft">
            New password
          </Txt>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={`At least ${MIN_LENGTH} characters`}
            placeholderTextColor={colors.ink.faint}
            accessibilityLabel="New password"
            className="mt-1 h-12 rounded-tile border border-line bg-surface px-3 text-ink-default"
          />

          <Txt size="tiny" weight="semibold" tone="soft" className="mt-3">
            Confirm new password
          </Txt>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            placeholder="Type it again"
            placeholderTextColor={colors.ink.faint}
            accessibilityLabel="Confirm new password"
            className="mt-1 h-12 rounded-tile border border-line bg-surface px-3 text-ink-default"
          />

          <Pressable
            onPress={save}
            disabled={saving}
            accessibilityLabel="Change password"
            className={`mt-5 h-12 items-center justify-center rounded-tile bg-brand-600 active:opacity-90 ${
              saving ? "opacity-60" : ""
            }`}
          >
            <Txt weight="bold" tone="white">
              {saving ? "Changing…" : "Change password"}
            </Txt>
          </Pressable>
        </Card>

        <View className="mx-4 mt-4">
          <Note
            icon="information-circle"
            tone="info"
            title="Forgot your password? Sign out and use “Forgot password” on the sign-in screen to get a code."
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
