import React from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Chip, Divider, EmptyState, IconTile, TabStrip, Txt, colors } from "@/components/ui";
import { MenuDishRow, RestaurantRow } from "@/components/cards";
import { accents } from "@/lib/theme";
import { categories, exploreTiles } from "@/lib/data";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

/**
 * Search. The reference set has no search mockup, so this follows the language
 * of the screens it does show — the same header type, the same underline tab
 * strip, the same result rows as the restaurant and order pages.
 */

const TABS = ["Restaurants", "Dishes"] as const;

const SORTS = [
  { id: "relevance", label: "Relevance" },
  { id: "rating", label: "Top rated" },
  { id: "eta", label: "Fastest" },
  { id: "price", label: "Cost: low to high" },
] as const;

export default function SearchScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("Restaurants");
  const [sort, setSort] = React.useState<(typeof SORTS)[number]["id"]>("relevance");
  const [vegOnly, setVegOnly] = React.useState(false);
  const [category, setCategory] = React.useState<string | undefined>(params.category);

  const { dishes, itemCount, restaurantById, restaurants, destination } = useStore();
  const [focused, setFocused] = React.useState(false);
  const [remoteRestaurants, setRemoteRestaurants] = React.useState<typeof restaurants | null>(null);
  const [notServiceable, setNotServiceable] = React.useState<{ name: string; distanceKm: number | null; message: string }[]>([]);
  const categoryName = categories.find((c) => c.id === category)?.name;

  React.useEffect(() => {
    const needle = query.trim();
    if (!needle) {
      setRemoteRestaurants(null);
      setNotServiceable([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void api
        .searchRestaurants(
          needle,
          destination.latitude != null && destination.longitude != null
            ? { latitude: destination.latitude, longitude: destination.longitude }
            : undefined,
          destination.city
        )
        .then((result) => {
          if (cancelled) return;
          setRemoteRestaurants(result.restaurants);
          setNotServiceable(result.notServiceableRestaurants);
        })
        .catch(() => {
          if (!cancelled) {
            setRemoteRestaurants([]);
            setNotServiceable([]);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, destination.city]);

  const matchedRestaurants = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = query.trim() && remoteRestaurants !== null ? remoteRestaurants : restaurants;
    let list = source.filter((restaurant) => {
      if (vegOnly && !restaurant.veg) return false;
      if (categoryName && !restaurant.cuisines.some((c) => c.includes(categoryName)))
        return false;
      if (!needle) return true;
      return (
        restaurant.name.toLowerCase().includes(needle) ||
        restaurant.cuisines.some((c) => c.toLowerCase().includes(needle)) ||
        restaurant.area.toLowerCase().includes(needle)
      );
    });

    if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    if (sort === "eta") list = [...list].sort((a, b) => a.etaMinutes[0] - b.etaMinutes[0]);
    if (sort === "price") list = [...list].sort((a, b) => a.priceForTwo - b.priceForTwo);
    return list;
  }, [query, vegOnly, categoryName, sort, restaurants, remoteRestaurants]);

  const matchedDishes = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = dishes.filter((dish) => {
      if (vegOnly && !dish.veg) return false;
      if (categoryName && dish.category !== categoryName) return false;
      if (!needle) return true;
      return (
        dish.name.toLowerCase().includes(needle) ||
        dish.description.toLowerCase().includes(needle) ||
        dish.category.toLowerCase().includes(needle)
      );
    });
    if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    if (sort === "price") list = [...list].sort((a, b) => a.price - b.price);
    return list;
  }, [query, vegOnly, categoryName, sort]);

  const results =
    tab === "Restaurants" ? matchedRestaurants.length : matchedDishes.length;

  const clearAll = () => {
    setQuery("");
    setVegOnly(false);
    setCategory(undefined);
    setSort("relevance");
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <View className="bg-surface px-4 pb-3 pt-2">
        <Txt size="2xl" weight="bold">
          Search
        </Txt>
        <Txt size="tiny" tone="muted">
          Find restaurants, cuisines and dishes near you
        </Txt>

        <View className="mt-3 flex-row items-center gap-2">
          <View
            className={`h-12 min-w-0 flex-1 flex-row items-center gap-2 rounded-xl border px-3 ${
              focused ? "border-brand-500" : "border-line"
            }`}
          >
            <Ionicons name="search" size={19} color={colors.ink.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search for restaurants, cuisines or dishes..."
              placeholderTextColor={colors.ink.faint}
              className="flex-1 p-0 text-[15px] text-ink"
              returnKeyType="search"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.ink.faint} />
              </Pressable>
            )}
          </View>
          <View className="h-12 w-12 items-center justify-center rounded-xl border border-brand-200">
            <Ionicons name="options-outline" size={21} color={colors.brand[600]} />
          </View>
        </View>
      </View>

      <TabStrip tabs={TABS} value={tab} onChange={setTab} />

      <View className="border-b border-line">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4 py-3"
        >
          <Chip
            label="Veg only"
            icon="leaf-outline"
            active={vegOnly}
            onPress={() => setVegOnly((v) => !v)}
          />
          {categoryName && (
            <Chip
              label={categoryName}
              icon="close"
              active
              onPress={() => setCategory(undefined)}
            />
          )}
          {SORTS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              active={sort === option.id}
              onPress={() => setSort(option.id)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName={itemCount > 0 ? "pb-28 pt-3" : "pb-6 pt-3"}
      >
        {/* Explore shortcuts, so an empty search isn't a dead end. */}
        {!query && !categoryName && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3 px-4 pb-4"
          >
            {exploreTiles.map((tile) => (
              <Pressable
                key={tile.id}
                onPress={() => tile.id === "x2" && setVegOnly(true)}
                style={{ width: 176 }}
                className="flex-row items-center gap-2.5 rounded-card bg-surface-sunken p-3 active:opacity-80"
              >
                <IconTile icon={tile.icon} tint={accents[tile.accent]} size={34} />
                <View className="min-w-0 flex-1">
                  <Txt size="sm" weight="bold" numberOfLines={1}>
                    {tile.title}
                  </Txt>
                  <Txt size="micro" tone="muted" numberOfLines={1}>
                    {tile.detail}
                  </Txt>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Txt size="tiny" tone="muted" className="mb-2 px-4">
          {/* "restaurant" pluralises with -s, "dish" with -es. Sharing one
              suffix produced "restaurantes". */}
          {results}{" "}
          {tab === "Restaurants"
            ? `restaurant${results === 1 ? "" : "s"}`
            : `dish${results === 1 ? "" : "es"}`}{" "}
          found
        </Txt>

        {results === 0 ? (
          <EmptyState
            icon="search-outline"
            title={notServiceable.length > 0 ? "Not serviceable" : "Nothing matched"}
            detail={
              notServiceable.length > 0
                ? `${notServiceable[0].name} is more than 10 km from your delivery location.`
                : "This restaurant or dish is not available in your delivery area. Try a different search."
            }
            action="Clear filters"
            onAction={clearAll}
          />
        ) : tab === "Restaurants" ? (
          matchedRestaurants.map((restaurant, index) => (
            <RestaurantRow key={restaurant.id} restaurant={restaurant} index={index} />
          ))
        ) : (
          matchedDishes.map((dish, index) => (
            <React.Fragment key={dish.id}>
              {index > 0 && <Divider className="mx-4" />}
              <MenuDishRow
                dish={dish}
                index={index}
                showRestaurant={restaurantById(dish.restaurantId)?.name}
              />
            </React.Fragment>
          ))
        )}
      </ScrollView>

    </SafeAreaView>
  );
}
