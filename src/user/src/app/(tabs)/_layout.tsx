import { Tabs } from "expo-router";
import { Platform, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { CartBar } from "@/components/cart-bar";

/** Count bubble on the Orders tab — live orders are what people come back for. */
function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View className="absolute -right-2.5 -top-1 h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1">
      <Text className="text-[10px] font-bold text-white">
        {count > 9 ? "9+" : count}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { orders } = useStore();
  // The reference badges Orders with everything still in flight.
  const liveOrders = orders.filter(
    (order) => order.status !== "Delivered" && order.status !== "Cancelled"
  ).length;

  return (
    <View className="flex-1">
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand[600],
        tabBarInactiveTintColor: colors.ink.faint,
        tabBarStyle: {
          backgroundColor: colors.surface.default,
          borderTopColor: colors.line.default,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingTop: 6,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "search" : "search-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, focused }) => (
            <View>
              <Ionicons
                name={focused ? "bag-handle" : "bag-handle-outline"}
                size={22}
                color={color}
              />
              <TabBadge count={liveOrders} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="offers"
        options={{
          title: "Offers",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "pricetag" : "pricetag-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          // The reference labels the last tab "Account", not "Profile".
          title: "Account",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
    <CartBar />
    </View>
  );
}
