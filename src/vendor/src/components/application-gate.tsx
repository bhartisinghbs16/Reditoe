import React from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, IconPlate, Txt, colors } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * What a vendor sees before their application is approved.
 *
 * Signing in and being approved are separate questions. A vendor whose
 * application is still with us reaches the app and is told where it stands,
 * rather than being turned away at sign-in or dropped into order and menu
 * screens for a restaurant that is not live yet.
 *
 * `access` is the server's answer, not something re-derived here, so the app
 * and the API cannot disagree about what to show.
 */

interface Application {
  hasApplication: boolean;
  access: "dashboard" | "review" | "rejected" | "correction" | "none";
  headline: string;
  body?: string;
  reason?: string | null;
  canResubmit?: boolean;
  restaurantName?: string;
}

export function ApplicationGate({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useStore();
  const [state, setState] = React.useState<Application | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [note, setNote] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!session) {
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      setState(await api.get<Application>("/vendor/application"));
    } catch {
      // Unreachable is not a refusal — let the app through and let its own
      // screens report the outage.
      setState(null);
    } finally {
      setChecking(false);
    }
  }, [session]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const resubmit = async () => {
    setSending(true);
    setError(null);
    try {
      await api.post("/vendor/application/resubmit", { note: note.trim() || undefined });
      setNote("");
      await load();
    } catch (reason: any) {
      setError(reason?.message ?? "Could not resubmit your application.");
    } finally {
      setSending(false);
    }
  };

  if (!session) return <>{children}</>;

  if (checking) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-sunken">
        <ActivityIndicator size="large" color={colors.brand[600]} />
      </View>
    );
  }

  if (!state || state.access === "dashboard" || state.access === "none") {
    return <>{children}</>;
  }

  const rejected = state.access === "rejected";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScrollView contentContainerClassName="p-4 pb-10">
        <Card className="items-center p-6">
          <IconPlate
            icon={rejected ? "alert-circle" : "time-outline"}
            tint={rejected ? "red" : "amber"}
            size={54}
          />
          <Txt size="xl" weight="bold" className="mt-3 text-center">
            {state.headline}
          </Txt>
          <Txt size="sm" tone="muted" className="mt-2 text-center">
            {state.body}
          </Txt>

          {state.restaurantName && (
            <Txt size="tiny" tone="faint" className="mt-3">
              Application for {state.restaurantName}
            </Txt>
          )}
        </Card>

        {/* The reason is the whole point of the screen when there is one. */}
        {state.reason && (
          <Card className="mt-3 p-4">
            <Txt size="tiny" tone="muted">
              {rejected ? "Reason for rejection" : "What needs changing"}
            </Txt>
            <Txt size="sm" className="mt-1">
              {state.reason}
            </Txt>
          </Card>
        )}

        {state.canResubmit && (
          <Card className="mt-3 p-4">
            <Txt weight="bold">Send it back for review</Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              Correct your details first, then resubmit.
            </Txt>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Anything to tell the reviewer? (optional)"
              placeholderTextColor={colors.ink.faint}
              multiline
              className="mt-3 min-h-[76px] rounded-tile border border-line p-3 text-[14px] text-ink"
              style={{ textAlignVertical: "top" }}
            />
            {error && (
              <Txt size="tiny" tone="bad" className="mt-2">
                {error}
              </Txt>
            )}
            <Button
              label={sending ? "Sending…" : "Submit for review again"}
              className="mt-3"
              disabled={sending}
              onPress={() => void resubmit()}
            />
          </Card>
        )}

        <View className="mt-3 flex-row gap-3">
          <Button
            label="Check again"
            variant="outline"
            icon="refresh-outline"
            className="flex-1"
            onPress={() => void load()}
          />
          <Button
            label="Sign out"
            variant="outline"
            icon="log-out-outline"
            className="flex-1"
            onPress={() => void signOut()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
