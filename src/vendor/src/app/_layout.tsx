import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StoreProvider, useStore } from "@/lib/store";
import { ApplicationGate } from "@/components/application-gate";
import { colors } from "@/lib/theme";
import "@/global.css";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** The two routes reachable without a session. */
const PUBLIC_ROUTES = new Set(["login", "signup", "forgot-password"]);

/**
 * Sends a signed-out vendor to the login screen and a signed-in one back into
 * the app. Lives inside the provider because it needs the session, and inside
 * the navigator because redirecting before mount is a no-op.
 */
function SessionGate({ children }: { children: React.ReactNode }) {
  const { authReady, session } = useStore();
  const segments = useSegments();
  const router = useRouter();

  const route = segments[0] ?? "";
  const onPublicRoute = PUBLIC_ROUTES.has(route);

  useEffect(() => {
    if (!authReady) return;
    if (!session && !onPublicRoute) router.replace("/login");
    else if (session && route === "login") router.replace("/");
  }, [authReady, session, onPublicRoute, route, router]);

  if (!authReady) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-sunken">
        <ActivityIndicator size="large" color={colors.brand[600]} />
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
        <StoreProvider>
          <StatusBar style="dark" />
          <SessionGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.surface.sunken },
                animation: "slide_from_right",
              }}
            />
          </SessionGate>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
