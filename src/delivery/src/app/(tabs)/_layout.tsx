import React from "react";
import { Tabs } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, shadow } from "@/lib/theme";
import { useStore } from "@/lib/store";

/**
 * The reference's bottom bar: Home, Orders, the raised red Scan button, then
 * Earnings and Profile. The active tab is red and carries a short rule beneath
 * its label.
 */

function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View className="absolute -right-2.5 -top-1 h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-white bg-brand-500 px-1">
      <Text className="text-[9px] font-bold text-white">{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

/** Label with the reference's underline on the active tab. */
function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View className="items-center">
      <Text
        style={{ color: focused ? colors.brand[500] : colors.ink.muted }}
        className={`text-[11px] ${focused ? "font-bold" : "font-medium"}`}
      >
        {label}
      </Text>
      {focused && (
        <View
          style={{ backgroundColor: colors.brand[500] }}
          className="mt-0.5 h-0.5 w-4 rounded-full"
        />
      )}
    </View>
  );
}

/**
 * The Scan control, raised into the tab bar's centre slot as the reference
 * draws it. Confirming a pickup or a handover is the action a rider takes most
 * often, so it gets the largest target on screen.
 */
function ScanButton({ focused, onPress }: { focused: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center justify-start"
      accessibilityLabel="Scan a QR code"
    >
      <View
        style={{ ...shadow.raised, shadowColor: colors.brand[500], shadowOpacity: 0.35 }}
        className="-mt-7 h-[54px] w-[54px] items-center justify-center rounded-full border-4 border-white bg-brand-500"
      >
        <Ionicons name="scan" size={25} color="#ffffff" />
      </View>
      <View className="mt-1">
        <TabLabel label="Scan" focused={focused} />
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { counts } = useStore();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand[500],
        tabBarInactiveTintColor: colors.ink.muted,
        tabBarStyle: {
          backgroundColor: colors.surface.default,
          borderTopColor: colors.line.default,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 28 : 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Home" focused={focused} />,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Orders" focused={focused} />,
          tabBarIcon: ({ color, focused }) => (
            <View>
              <Ionicons
                name={focused ? "bag-handle" : "bag-handle-outline"}
                size={22}
                color={color}
              />
              <TabBadge count={counts.New} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          tabBarButton: (props) => (
            <ScanButton
              focused={props.accessibilityState?.selected ?? false}
              onPress={props.onPress as () => void}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Earnings" focused={focused} />,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Profile" focused={focused} />,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
