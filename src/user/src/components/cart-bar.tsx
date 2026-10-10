import React from "react";
import { Platform, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Txt, colors } from "@/components/ui";
import { shadow } from "@/lib/theme";
import { currency } from "@/lib/format";
import { useStore } from "@/lib/store";

/**
 * How far the bar sits above the bottom of a screen that has the tab bar.
 *
 * The tab bar is 88 tall on iOS and 64 on Android; this used to sit at a flat
 * 68, so on iOS the cart bar was drawn behind the tabs - the Checkout button
 * was under them and could not be pressed. Kept in step with the height set
 * in (tabs)/_layout.tsx, plus a gap so the two do not touch.
 */
const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 88 : 64;
const GAP = 8;

/**
 * The reference's floating cart bar: a white card carrying a green cart badge,
 * the item count with a "View Cart" link under it, the running total, and a
 * dark green Checkout button.
 *
 * It is pinned to the bottom of the screen, above the navigation bar, and
 * stays there — it is not part of the scrolling content.
 *
 * `offset` lifts it above a tab bar; screens without tabs pass a small value.
 * The device's own bottom inset is added on top, because React Navigation
 * grows the tab bar by that inset: with a gesture bar the tabs are taller
 * than the constant above, and a fixed offset left the cart bar sitting on
 * top of them.
 */
export function CartBar({ offset = TAB_BAR_HEIGHT + GAP }: { offset?: number }) {
  return <FixedCartBar bottom={offset} />;
}

function FixedCartBar({ bottom }: { bottom: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { itemCount, totals } = useStore();
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (dismissedAt !== null && itemCount !== dismissedAt) setDismissedAt(null);
  }, [itemCount, dismissedAt]);

  if (itemCount === 0 || dismissedAt !== null) return null;

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: bottom + insets.bottom,
        zIndex: 999,
        elevation: 24,
        width: "100%",
      }}
      pointerEvents="box-none"
    >
      <View className="px-4">
        <View
          style={shadow.raised}
          className="flex-row items-center gap-2.5 rounded-card border border-line bg-surface p-2.5"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-leaf-50">
            <Ionicons name="cart" size={19} color={colors.leaf[600]} />
          </View>

          <Pressable
            onPress={() => router.push("/cart")}
            className="min-w-0 flex-1 active:opacity-70"
          >
            <Txt weight="bold" numberOfLines={1}>
              {itemCount} {itemCount === 1 ? "Item" : "Items"} in Cart
            </Txt>
            <Txt size="tiny" weight="semibold" className="text-leaf-600">
              View Cart
            </Txt>
          </Pressable>

          <Txt weight="bold">{currency(totals.itemTotal - totals.discount)}</Txt>

          <Pressable
            onPress={() => router.push("/cart")}
            className="h-12 flex-row items-center gap-2 rounded-tile bg-leaf-700 px-4 active:opacity-90"
          >
            <Txt weight="bold" tone="white">
              Checkout
            </Txt>
            <Ionicons name="arrow-forward" size={17} color="#ffffff" />
          </Pressable>

          <Pressable
            onPress={() => setDismissedAt(itemCount)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Hide the cart bar"
            className="h-7 w-7 items-center justify-center rounded-full bg-surface-sunken active:opacity-70"
          >
            <Ionicons name="close" size={15} color={colors.ink.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
