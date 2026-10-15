import { useEffect } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SessionProvider, useSession } from "@/lib/session";
import { ApplicationGate } from "@/components/application-gate";
import { UpdatePrompt } from "@/components/update-prompt";
import { StoreProvider } from "@/lib/store";
import { Button, Txt } from "@/components/ui";
import { colors } from "@/lib/theme";
import "@/global.css";

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * What a rider sees when a screen throws while it is being drawn.
 *
 * Expo Router only catches render errors in a route that exports one of these,
 * and none did - so React tore the whole tree down and the phone was left on
 * a blank grey screen: no message, nothing to tap, and nothing to report. This
 * puts the message on screen and a way to try again.
 *
 * It stands in for the whole layout, so it sits outside the session, store and
 * safe-area providers and can use none of them.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 items-center justify-center bg-surface-sunken px-6">
      <Txt size="xl" weight="bold" className="text-center">
        Something went wrong
      </Txt>
      <Txt size="sm" tone="muted" className="mt-2 text-center">
        {error?.message || "Please try again."}
      </Txt>
      <Button
        label="Try again"
        accent="brand"
        size="lg"
        className="mt-6 self-stretch"
        onPress={() => void retry()}
      />
    </View>
  );
}

/**
 * Sends the partner to Login when there is no session and into the app when
 * there is. Runs after the stored token has been checked, so a reload resumes
 * where it left off instead of flashing the Login screen.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, restoring } = useSession();
  const segments = useSegments();
  const router = useRouter();

  const inAuthFlow = segments[0] === "(auth)";

  useEffect(() => {
    if (restoring) return;
    if (!user && !inAuthFlow) router.replace("/login");
    else if (user && inAuthFlow) router.replace("/(tabs)");
  }, [user, restoring, inAuthFlow, router]);

  if (restoring) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-sunken">
        <ActivityIndicator color={colors.brand[500]} />
      </View>
    );
  }

  /* Signed in is not the same as approved: the gate shows where the
     application stands until it is, and lets the app through once it is. */
  return <ApplicationGate>{children}</ApplicationGate>;
}

export default function RootLayout() {
  // The icon set is a font; without loading it every glyph is a blank box.
  const [fontsLoaded] = useFonts({ ...Ionicons.font });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StoreProvider>
            <StatusBar style="dark" />
            <AuthGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.surface.sunken },
                  animation: "slide_from_right",
                }}
              />
            </AuthGate>
            <UpdatePrompt />
          </StoreProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
