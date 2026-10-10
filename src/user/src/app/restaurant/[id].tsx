import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  Divider,
  EmptyState,
  Rating,
  SectionHead,
  TabStrip,
  Txt,
  colors,
} from "@/components/ui";
import { DishImage, MenuDishCard, MenuDishRow } from "@/components/cards";
import { Photo } from "@/components/photo";
import { photoUri } from "@/lib/images";
import { CartBar } from "@/components/cart-bar";
import { ScreenHeader, HeaderIcon } from "@/components/screen-header";
import { compactCount, currency } from "@/lib/format";
import { useStore } from "@/lib/store";

/**
 * The restaurant screen, laid out as the reference draws it: identity block,
 * coupon strip, the three delivery facts, a menu tab strip, the "Recommended
 * for you" rail, the combo card, then the bestseller list.
 */

/** The three delivery facts the reference rules into one card. */
function DeliveryFacts({
  eta,
  freeAbove,
  packaging,
}: {
  eta: string;
  freeAbove: number;
  packaging: number;
}) {
  const facts = [
    { icon: "bicycle-outline" as const, title: "Delivery", detail: eta },
    {
      icon: "pricetag-outline" as const,
      title: "Free Delivery",
      detail: `on orders above ${currency(freeAbove)}`,
    },
    {
      icon: "cube-outline" as const,
      title: "Packaging Fee",
      detail: currency(packaging),
    },
  ];

  return (
    <Card className="mx-4 mt-3 flex-row px-1 py-3">
      {facts.map((fact, index) => (
        <View
          key={fact.title}
          className={`flex-1 flex-row items-center gap-1.5 px-1.5 ${
            index > 0 ? "border-l border-line" : ""
          }`}
        >
          <Ionicons name={fact.icon} size={18} color={colors.ink.soft} />
          <View className="min-w-0 flex-1">
            {/* Left to wrap: "Free Delivery" and "Packaging Fee" both ellipsise
                on one line at phone width. */}
            <Txt size="micro" weight="bold" numberOfLines={2}>
              {fact.title}
            </Txt>
            <Txt size="micro" tone="muted" numberOfLines={2}>
              {fact.detail}
            </Txt>
          </View>
        </View>
      ))}
    </Card>
  );
}

/** "Make it a perfect meal!" — the amber combo card. */
function ComboCard({
  name,
  contents,
  price,
  originalPrice,
  dishIds,
  onAdd,
}: {
  name: string;
  contents: string;
  price: number;
  originalPrice: number;
  dishIds: string[];
  onAdd: () => void;
}) {
  const { dishById } = useStore();
  const percent = Math.round(((originalPrice - price) / originalPrice) * 100);
  const parts = dishIds.map((id) => dishById(id)).filter(Boolean);

  return (
    <View className="mx-4 mt-6 rounded-card bg-sun-50 p-3">
      <Txt size="sm" weight="semibold" tone="soft">
        Make it a perfect meal!
      </Txt>
      <Txt size="lg" weight="bold" className="mt-0.5">
        {name}
      </Txt>
      <Txt size="tiny" tone="muted" numberOfLines={2} className="mt-0.5">
        {contents}
      </Txt>

      {/* The reference sets the plates and the button beside the copy; at phone
          width that squeezes the title to one word per line, so they sit under
          it instead. */}
      <View className="mt-3 flex-row items-center gap-3">
        <View className="flex-row items-center gap-1">
          {parts.map((part, index) => (
            <React.Fragment key={part!.id}>
              {index > 0 && (
                <Txt size="tiny" tone="muted">
                  +
                </Txt>
              )}
              <DishImage dish={part!} size={40} height={40} radius={8} index={index} />
            </React.Fragment>
          ))}
        </View>

        <View className="min-w-0 flex-1 flex-row items-baseline gap-1.5">
          <Txt weight="bold">{currency(price)}</Txt>
          <Txt size="tiny" tone="faint" className="line-through">
            {currency(originalPrice)}
          </Txt>
          <Txt size="tiny" weight="bold" tone="ok">
            {percent}% OFF
          </Txt>
        </View>

        <Pressable
          onPress={onAdd}
          className="h-10 items-center justify-center rounded-tile border border-brand-500 bg-surface px-5 active:opacity-70"
        >
          <Txt size="sm" weight="bold" tone="brand">
            ADD
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { addLine, combosForRestaurant, dishById, dishesForRestaurant, favourites, restaurantById, toggleFavourite } = useStore();
  const restaurant = restaurantById(id);

  const menu = restaurant ? dishesForRestaurant(restaurant.id) : [];
  const sections = React.useMemo(() => {
    const bestsellers = menu.filter((d) => d.tag === "Bestseller");
    const byCategory = [...new Set(menu.map((d) => d.category))];
    return ["Recommended", ...(bestsellers.length ? ["Bestsellers"] : []), ...byCategory];
  }, [menu]);

  const [tab, setTab] = React.useState("Recommended");

  if (!restaurant) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
        <ScreenHeader title="Restaurant" />
        <EmptyState
          icon="storefront-outline"
          title="Restaurant not found"
          detail="It may have closed, or the link is out of date."
          action="Back to home"
          onAction={() => router.replace("/")}
        />
      </SafeAreaView>
    );
  }

  const isFavourite = favourites.includes(restaurant.id);
  const combos = combosForRestaurant(restaurant.id);
  const recommended = menu.slice(0, 6);
  const bestsellers = menu.filter((d) => d.tag === "Bestseller");

  const listed =
    tab === "Recommended"
      ? menu
      : tab === "Bestsellers"
        ? bestsellers
        : menu.filter((d) => d.category === tab);

  const addCombo = (dishIds: string[]) => {
    dishIds.forEach((dishId) => {
      const dish = dishById(dishId);
      if (dish) addLine(dish);
    });
    router.push("/cart");
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title={restaurant.name}
        border
        right={
          <>
            <HeaderIcon
              icon={isFavourite ? "heart" : "heart-outline"}
              color={isFavourite ? colors.brand[600] : colors.ink.default}
              onPress={() => toggleFavourite(restaurant.id)}
              label={isFavourite ? "Remove from favourites" : "Add to favourites"}
            />
            <HeaderIcon icon="share-social-outline" label="Share" />
            <HeaderIcon icon="ellipsis-horizontal" size={20} label="More" />
          </>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-32">
        {/* Identity block */}
        <View className="flex-row gap-3 px-4 pt-4">
          <Photo uri={photoUri(restaurant, 300)} width={84} height={84} radius={12} />

          <View className="min-w-0 flex-1">
            {restaurant.offer && (
              <View className="mb-1.5 self-start rounded-md bg-leaf-50 px-2 py-1">
                <Txt size="tiny" weight="bold" className="text-leaf-700">
                  {restaurant.offer}
                </Txt>
              </View>
            )}

            <Txt size="2xl" weight="bold" numberOfLines={1}>
              {restaurant.name}
            </Txt>
            <Txt size="sm" tone="muted" numberOfLines={1} className="mt-0.5">
              {restaurant.cuisines.join(", ")}
            </Txt>

            <View className="mt-1.5 flex-row items-center gap-1.5">
              <Rating
                value={restaurant.rating}
                count={`${compactCount(restaurant.ratingCount)}`}
              />
              <Txt size="tiny" tone="muted">
                · {restaurant.etaMinutes[0]}-{restaurant.etaMinutes[1]} mins ·{" "}
                {currency(restaurant.priceForTwo)} for two
              </Txt>
            </View>

            <View className="mt-1 flex-row items-center gap-1">
              <Txt size="sm" weight="semibold" tone="ok">
                Open now
              </Txt>
              <Txt size="sm" tone="muted">
                · Closes at {restaurant.closesAt}
              </Txt>
            </View>
          </View>
        </View>

        {/* Coupon strip */}
        <Pressable
          onPress={() => router.push("/offers")}
          className="mx-4 mt-3 flex-row items-center gap-2 rounded-card border border-sun-100 bg-sun-50 px-3 py-2.5 active:opacity-80"
        >
          <Ionicons name="pricetag-outline" size={18} color={colors.sun[600]} />
          <Txt size="tiny" tone="soft" className="min-w-0 flex-1">
            Use code <Txt size="tiny" weight="bold">RED20</Txt> & get {restaurant.offer}{" "}
            on orders above ₹199
          </Txt>
          <View className="flex-row items-center gap-0.5">
            <Txt size="tiny" weight="bold" tone="brand">
              View all offers
            </Txt>
            <Ionicons name="chevron-forward" size={12} color={colors.brand[600]} />
          </View>
        </Pressable>

        <DeliveryFacts
          eta={`${restaurant.etaMinutes[0]}-${restaurant.etaMinutes[1]} mins`}
          freeAbove={restaurant.freeDeliveryAbove}
          packaging={restaurant.packagingFee}
        />

        <TabStrip
          tabs={sections}
          value={tab}
          onChange={setTab}
          className="mt-4"
        />

        {tab === "Recommended" ? (
          <>
            <View className="mt-5">
              <SectionHead
                title="Recommended for you"
                action="See more"
                onAction={() => setTab(sections[1] ?? "Recommended")}
                className="mb-3 px-4"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3 px-4"
              >
                {recommended.map((dish, index) => (
                  <MenuDishCard key={dish.id} dish={dish} index={index} />
                ))}
              </ScrollView>
            </View>

            {combos.map((combo) => (
              <ComboCard
                key={combo.id}
                name={combo.name}
                contents={combo.contents}
                price={combo.price}
                originalPrice={combo.originalPrice}
                dishIds={combo.dishIds}
                onAdd={() => addCombo(combo.dishIds)}
              />
            ))}

            {bestsellers.length > 0 && (
              <View className="mt-6">
                <SectionHead
                  title="Bestsellers"
                  action="See more"
                  onAction={() => setTab("Bestsellers")}
                  className="mb-1 px-4"
                />
                {bestsellers.map((dish, index) => (
                  <React.Fragment key={dish.id}>
                    {index > 0 && <Divider className="mx-4" />}
                    <MenuDishRow dish={dish} index={index} />
                  </React.Fragment>
                ))}
              </View>
            )}
          </>
        ) : listed.length === 0 ? (
          <EmptyState
            icon="restaurant-outline"
            title="Nothing here yet"
            detail="No dishes in this section."
            action="See recommended"
            onAction={() => setTab("Recommended")}
          />
        ) : (
          <View className="mt-2">
            {listed.map((dish, index) => (
              <React.Fragment key={dish.id}>
                {index > 0 && <Divider className="mx-4" />}
                <MenuDishRow dish={dish} index={index} />
              </React.Fragment>
            ))}
          </View>
        )}
      </ScrollView>

      <CartBar offset={16} />
    </SafeAreaView>
  );
}
