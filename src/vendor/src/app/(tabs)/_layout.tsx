import React from "react";
import { Tabs } from "expo-router";
import { Platform, Text, View, type ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";
import { useStore } from "@/lib/store";

/**
 * The reference tab bar: five destinations on white, the active one marked by
 * a short rule above its icon as well as by colour. Dashboard, Orders and Menu
 * wear the red chrome; Payments and Settings wear the indigo one, exactly as
 * the reference screens do.
 */

/** Count of orders still needing the vendor to act. */
function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View className="absolute -right-2.5 -top-1.5 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1">
      <Text className="text-[10px] font-bold text-white">{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

function TabIcon({
  name,
  focused,
  color,
  badge,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: ColorValue;
  badge?: number;
}) {
  return (
    <View className="items-center">
      <View
        style={{
          height: 3,
          width: 26,
          borderRadius: 2,
          marginBottom: 5,
          backgroundColor: focused ? color : "transparent",
        }}
      />
      <View>
        <Ionicons name={name} size={22} color={color} />
        {badge !== undefined && <TabBadge count={badge} />}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { orders } = useStore();
  const actionable = orders.filter(
    (o) => o.stage === "new" || o.stage === "preparing" || o.stage === "ready"
  ).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand[600],
        tabBarInactiveTintColor: colors.ink.faint,
        tabBarStyle: {
          backgroundColor: colors.surface.default,
          borderTopColor: colors.line.default,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 66,
          paddingTop: 4,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "home" : "home-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "bag-handle" : "bag-handle-outline"}
              focused={focused}
              color={color}
              badge={actionable}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menu",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "restaurant" : "restaurant-outline"}
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Payments",
          tabBarActiveTintColor: colors.indigo[600],
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "wallet" : "wallet-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarActiveTintColor: colors.indigo[600],
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "grid" : "grid-outline"} focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
