import { useEffect } from "react";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { UpdatePrompt } from "@/components/update-prompt";
import { StoreProvider, useStore } from "@/lib/store";
import { colors } from "@/lib/theme";
import "@/global.css";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // The icon set is a font. Without loading it explicitly every glyph renders
  // as a blank box on web, and as a flash of missing icons on device.
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
          <AuthGate />
          <Stack
            screenOptions={{
              headerShown: false,
              // The reference puts every screen on white and separates blocks
              // with card borders rather than a grey canvas.
              contentStyle: { backgroundColor: colors.surface.default },
              // Detail screens slide in from the right; the cart and checkout
              // come up as sheets, which is what "this is a step, not a place"
              // reads as on mobile.
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="cart" options={{ animation: "slide_from_bottom" }} />
            <Stack.Screen name="checkout" options={{ animation: "slide_from_bottom" }} />
            <Stack.Screen name="addresses" />
            <Stack.Screen name="wallet" />
            <Stack.Screen name="payments" />
            <Stack.Screen name="refunds" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="about" />
            {/* Reditoe Plus is six screens in the reference, so it is a
                nested group rather than a single route. */}
            <Stack.Screen name="plus/index" />
            <Stack.Screen name="plus/offers" />
            <Stack.Screen name="plus/more-benefits" />
            <Stack.Screen name="plus/combos" />
            <Stack.Screen name="plus/membership" />
            <Stack.Screen name="plus/features" />
            <Stack.Screen name="verify" />
            <Stack.Screen name="signin" options={{ animation: "slide_from_bottom" }} />
            <Stack.Screen name="signup" />
          </Stack>
          <UpdatePrompt />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Nothing before signing in.
 *
 * The app used to open straight onto the restaurant list, so a first-time
 * visitor browsed as a guest and only met the sign-in screen when they tried
 * to do something with an account. The brief is the other way round: splash,
 * then sign up or sign in, then the restaurants.
 *
 * It waits for `authReady` — routing on `signedIn` alone would bounce a
 * returning customer out to sign-in for the moment before their stored token
 * is checked. `/signin` is exempt for the obvious reason, and so is `/signup`:
 * a number that has just been verified and has no account yet is sent there to
 * finish, and it cannot have a session until it has.
 */
const PUBLIC_ROUTES = ["/signin", "/signup"];

function AuthGate() {
  const { authReady, signedIn } = useStore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!authReady) return;
    const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
    if (!signedIn && !isPublic) {
      router.replace("/signin");
    }
  }, [authReady, signedIn, pathname, router]);

  return null;
}
