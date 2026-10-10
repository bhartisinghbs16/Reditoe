import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Divider,
  EmptyState,
  OutlineBadge,
  Rating,
  Stepper,
  Txt,
  VegMark,
  colors,
} from "@/components/ui";
import { ScreenHeader, HeaderIcon } from "@/components/screen-header";
import { DishImage, SmallDishTile } from "@/components/cards";
import { Photo } from "@/components/photo";
import { hero } from "@/lib/images";
import { compactCount, currency } from "@/lib/format";
import { shadow } from "@/lib/theme";
import { useStore } from "@/lib/store";
import type { Extra } from "@/lib/data";

/**
 * The dish screen, copied from the reference: hero photo, title with its
 * bestseller flag, rating, price beside a stepper, the portion picker as three
 * cards, the extras checklist, a "Best with" rail, then the add bar and the
 * three reassurance points under it.
 */

function PortionCard({
  name,
  serves,
  price,
  selected,
  onPress,
}: {
  name: string;
  serves: string;
  price: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-card border p-3 active:opacity-80 ${
        selected ? "border-leaf-600 bg-surface" : "border-line bg-surface"
      }`}
    >
      <View className="flex-row items-start gap-2">
        <Ionicons
          name={selected ? "radio-button-on" : "radio-button-off"}
          size={18}
          color={selected ? colors.leaf[600] : colors.ink.faint}
        />
        {/* "Family Pack" ellipsises on one line in a third of a phone. */}
        <Txt size="sm" weight="bold" numberOfLines={2} className="min-w-0 flex-1">
          {name}
        </Txt>
      </View>
      <Txt size="tiny" tone="muted" className="ml-6 mt-1">
        {serves}
      </Txt>
      <Txt size="sm" weight="bold" className="ml-6 mt-1">
        {currency(price)}
      </Txt>
    </Pressable>
  );
}

export default function DishScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { addLine, cartRestaurantId, dishById, restaurantById } = useStore();
  const dish = dishById(id);

  /*
   * Nothing is chosen until the customer chooses.
   *
   * This seeded itself from the dish, but the initialiser runs once and the
   * menu arrives after the first render, so it captured undefined and no
   * portion was ever selected — the screen quoted the dish's base price while
   * the server billed the vendor's default size.
   */
  const [portionId, setPortionId] = React.useState<string | undefined>(undefined);
  const [selectedExtras, setSelectedExtras] = React.useState<Extra[]>([]);
  const [quantity, setQuantity] = React.useState(1);

  if (!dish) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
        <ScreenHeader title="Dish" />
        <EmptyState
          icon="fast-food-outline"
          title="Dish not found"
          action="Back to home"
          onAction={() => router.replace("/")}
        />
      </SafeAreaView>
    );
  }

  const restaurant = restaurantById(dish.restaurantId);
  // The vendor's default stands until the customer picks another, so the price
  // on screen is the price that will be charged.
  const defaultPortionId =
    dish.portions?.find((p) => p.isDefault)?.id ?? dish.portions?.[0]?.id;
  const chosenPortionId = portionId ?? defaultPortionId;
  const portion = dish.portions?.find((p) => p.id === chosenPortionId);
  const basePrice = portion?.price ?? dish.price;
  const extrasTotal = selectedExtras.reduce((sum, extra) => sum + extra.price, 0);
  const lineTotal = (basePrice + extrasTotal) * quantity;

  // Adding from a different kitchen replaces the cart — say so before it happens.
  const willReplaceCart =
    cartRestaurantId !== null && cartRestaurantId !== dish.restaurantId;

  const toggleExtra = (extra: Extra) =>
    setSelectedExtras((current) =>
      current.some((e) => e.id === extra.id)
        ? current.filter((e) => e.id !== extra.id)
        : [...current, extra]
    );

  const onAdd = () => {
    for (let i = 0; i < quantity; i++) {
      addLine(dish, {
        portionName: portion?.name,
        // Named on the order, so the kitchen and the bill agree with what was
        // chosen here rather than falling back to the default size.
        portion:
          portion?.groupId && portion.id
            ? { groupId: portion.groupId, optionId: portion.id }
            : undefined,
        unitPrice: basePrice,
        extras: selectedExtras,
      });
    }
    router.back();
  };

  const pairings = (dish.pairsWith ?? [])
    .map((pairId) => dishById(pairId))
    .filter(Boolean);

  const reassurance = [
    { icon: "shield-checkmark-outline" as const, label: "Safe & Hygienic" },
    {
      icon: "bicycle-outline" as const,
      label: `${restaurant?.etaMinutes[0] ?? 30}-${restaurant?.etaMinutes[1] ?? 40} mins`,
    },
    { icon: "cube-outline" as const, label: "Secure Packaging" },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title={dish.name}
        right={
          <>
            <HeaderIcon icon="heart" color={colors.brand[600]} label="Favourite" />
            <HeaderIcon icon="share-social-outline" label="Share" />
          </>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-52">
        {/* Hero */}
        <View className="mx-4 mt-1">
          {dish.imageUrl || dish.photo ? (
            <Photo uri={dish.imageUrl ?? hero(dish.photo!, 900)} height={230} radius={12}>
              <View className="absolute left-3 top-3 h-9 w-9 items-center justify-center rounded-full bg-white/90">
                <Ionicons name="chevron-back" size={20} color={colors.ink.default} />
              </View>
              <View className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-full bg-white/90">
                <Ionicons name="expand-outline" size={17} color={colors.ink.default} />
              </View>
              <View className="absolute bottom-3 left-3">
                <VegMark veg={dish.veg} size={16} />
              </View>
              <View className="absolute bottom-3 right-3 rounded-md bg-black/55 px-2 py-0.5">
                <Txt size="micro" weight="semibold" tone="white">
                  1/5
                </Txt>
              </View>
            </Photo>
          ) : (
            <DishImage dish={dish} height={230} radius={12} />
          )}
        </View>

        {/* Title block */}
        <View className="px-4 pt-4">
          <View className="flex-row items-start justify-between gap-3">
            <Txt size="2xl" weight="bold" className="min-w-0 flex-1">
              {dish.name}
            </Txt>
            {dish.tag && <OutlineBadge label={dish.tag} tone="ok" />}
          </View>

          <Txt tone="muted" className="mt-1.5">
            {dish.description}
          </Txt>

          <View className="mt-3">
            <Rating
              value={dish.rating}
              count={`${compactCount(dish.ratingCount)} ratings`}
              size="md"
              boxed
            />
          </View>

          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Txt size="2xl" weight="bold">
                {currency(basePrice)}
              </Txt>
              {dish.originalPrice && dish.originalPrice > dish.price && (
                <Txt tone="faint" className="line-through">
                  {currency(dish.originalPrice)}
                </Txt>
              )}
            </View>
            <Stepper quantity={quantity} onChange={(n) => setQuantity(Math.max(1, n))} />
          </View>
        </View>

        <Divider className="mx-4 my-4" />

        {/* Portions */}
        {dish.portions && dish.portions.length > 0 && (
          <View className="px-4">
            <Txt size="lg" weight="bold">
              Choose Portion
            </Txt>
            <View className="mt-3 flex-row gap-2.5">
              {dish.portions.map((option) => (
                <PortionCard
                  key={option.id}
                  name={option.name}
                  serves={option.serves}
                  price={option.price}
                  selected={option.id === chosenPortionId}
                  onPress={() => setPortionId(option.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Extras */}
        {dish.extras && dish.extras.length > 0 && (
          <View className="mt-6 px-4">
            <Txt size="lg" weight="bold">
              Add Extras
            </Txt>
            <View className="mt-2">
              {dish.extras.map((extra, index) => {
                const selected = selectedExtras.some((e) => e.id === extra.id);
                return (
                  <React.Fragment key={extra.id}>
                    {index > 0 && <Divider />}
                    <Pressable
                      onPress={() => toggleExtra(extra)}
                      className="flex-row items-center gap-3 py-3 active:opacity-70"
                    >
                      <Ionicons
                        name={selected ? "checkbox" : "square-outline"}
                        size={21}
                        color={selected ? colors.leaf[600] : colors.ink.faint}
                      />
                      <Txt className="min-w-0 flex-1">{extra.name}</Txt>
                      <Txt weight="medium" tone="soft">
                        {currency(extra.price)}
                      </Txt>
                      <View
                        className={`h-7 w-7 items-center justify-center rounded-md border ${
                          selected
                            ? "border-leaf-600 bg-leaf-50"
                            : "border-leaf-500 bg-surface"
                        }`}
                      >
                        <Ionicons
                          name={selected ? "checkmark" : "add"}
                          size={15}
                          color={colors.leaf[600]}
                        />
                      </View>
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        )}

        {/* Best with */}
        {pairings.length > 0 && (
          <View className="mt-6">
            <Txt size="lg" weight="bold" className="mb-3 px-4">
              Best with
            </Txt>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3 px-4"
            >
              {pairings.map((pair, index) => (
                <SmallDishTile key={pair!.id} dish={pair!} index={index + 3} />
              ))}
            </ScrollView>
          </View>
        )}

        {willReplaceCart && (
          <View className="mx-4 mt-6 flex-row gap-2 rounded-tile bg-warn-soft px-3 py-2.5">
            <Ionicons name="alert-circle-outline" size={16} color={colors.warn.ink} />
            <Txt size="tiny" className="flex-1 text-warn-ink">
              Your cart has items from another restaurant. Adding this will start a new
              cart.
            </Txt>
          </View>
        )}
      </ScrollView>

      {/* Add bar */}
      <View className="absolute inset-x-0 bottom-0 bg-surface px-4 pb-4 pt-2">
        <View
          style={shadow.raised}
          className="flex-row items-center gap-4 rounded-card border border-line bg-surface p-3"
        >
          <View>
            <Txt size="lg" weight="bold">
              {currency(lineTotal)}
            </Txt>
            <Pressable
              onPress={() => router.push("/cart")}
              className="mt-0.5 flex-row items-center gap-1 active:opacity-70"
            >
              <Txt size="tiny" weight="bold" className="text-leaf-600">
                View Cart
              </Txt>
              <Ionicons name="arrow-forward" size={12} color={colors.leaf[600]} />
            </Pressable>
          </View>

          <Pressable
            onPress={onAdd}
            className="h-14 min-w-0 flex-1 items-center justify-center rounded-tile bg-leaf-700 active:opacity-90"
          >
            <Txt size="lg" weight="bold" tone="white">
              Add to Cart
            </Txt>
            <Txt size="tiny" weight="semibold" tone="white">
              {currency(lineTotal)}
            </Txt>
          </Pressable>
        </View>

        <View className="mt-2 flex-row items-center rounded-card bg-surface-sunken py-2.5">
          {reassurance.map((item, index) => (
            <View
              key={item.label}
              className={`flex-1 flex-row items-center justify-center gap-1.5 ${
                index > 0 ? "border-l border-line" : ""
              }`}
            >
              <Ionicons name={item.icon} size={15} color={colors.leaf[600]} />
              <Txt size="micro" tone="soft" weight="medium" numberOfLines={1}>
                {item.label}
              </Txt>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
