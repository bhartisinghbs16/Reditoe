import React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, IconPlate, NoteBar, Panel, Txt, colors } from "@/components/ui";
import { request } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * What a rider sees before their application is approved.
 *
 * The mirror of the vendor's gate: signing in and being approved are separate
 * questions, so a rider whose application is still with us reaches the app and
 * is told where it stands rather than being dropped onto a dashboard for work
 * they cannot yet take.
 *
 * `access` is the server's answer rather than something re-derived here, so
 * the app and the API cannot disagree about what a state means.
 */

interface Application {
  applicationStatus?: string;
  access: "dashboard" | "review" | "rejected";
  headline: string;
  body?: string;
  reason?: string | null;
  canResubmit?: boolean;
  riderId?: string;
}

export function ApplicationGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useSession();
  const [state, setState] = React.useState<Application | null>(null);
  const [checking, setChecking] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!user) {
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      setState(await request<Application>("/rider/application"));
    } catch {
      // Unreachable is not a refusal: let the app through and let its own
      // screens report the outage.
      setState(null);
    } finally {
      setChecking(false);
    }
  }, [user]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!user) return <>{children}</>;

  if (checking) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-sunken">
        <ActivityIndicator color={colors.brand[500]} />
      </View>
    );
  }

  if (!state || state.access === "dashboard") return <>{children}</>;

  const rejected = state.access === "rejected";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScrollView contentContainerClassName="p-4 pb-10">
        <Panel title={rejected ? "Application" : "Welcome to Reditoe"}>
          <View className="items-center py-2">
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
            {state.riderId && (
              <Txt size="tiny" tone="faint" className="mt-3">
                Partner ID: {state.riderId}
              </Txt>
            )}
          </View>
        </Panel>

        {/* The reason is the whole point of the screen when there is one. */}
        {state.reason && (
          <View className="mt-3">
            <NoteBar
              tone="red"
              icon="information-circle"
              title={rejected ? "Reason" : "What needs changing"}
              detail={state.reason}
            />
          </View>
        )}

        <View className="mt-3 flex-row gap-3">
          <Button
            label="Check again"
            variant="outline"
            accent="brand"
            icon="refresh-outline"
            className="flex-1"
            onPress={() => void load()}
          />
          <Button
            label="Sign out"
            variant="outline"
            accent="brand"
            icon="log-out-outline"
            className="flex-1"
            onPress={() => void signOut()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
