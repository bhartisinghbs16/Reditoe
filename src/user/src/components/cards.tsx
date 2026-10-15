import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Badge,
  Button,
  Card,
  Rating,
  Stepper,
  Thumb,
  Txt,
  VegMark,
  colors,
} from "@/components/ui";
import { Photo } from "@/components/photo";
import { categoryTint } from "@/lib/theme";
import { currency, compactCount } from "@/lib/format";
import { hero, img, photoUri } from "@/lib/images";
import { useDishQuantity, useStore } from "@/lib/store";
import type { Dish, Restaurant } from "@/lib/data";

/**
 * The tiles the reference screens are built from. Each one is a copy of a
 * specific card in the mockups — the home restaurant tile, the "Recommended
 * for you" menu card, the bestseller row, the "Best with" square.
 */

/** Photo where we have a verified one, a tinted plate with an emoji where not. */
export function DishImage({
  dish,
  size,
  height,
  radius = 12,
  index = 0,
  children,
}: {
  dish: Pick<Dish, "photo" | "emoji" | "name" | "imageUrl">;
  size?: number;
  height?: number;
  radius?: number;
  index?: number;
  children?: React.ReactNode;
}) {
  const h = height ?? size ?? 100;

  // The vendor's uploaded photo wins over the keyword stand-in. Without this
  // an uploaded image was discarded and a stock picture of some other dish
  // was shown in its place.
  const uri = dish.imageUrl ?? (dish.photo ? img(dish.photo, 420) : null);

  if (!uri) {
    return (
      <View style={{ width: size ?? "100%", height: h }}>
        <Thumb
          label={dish.name}
          tint={categoryTint(index)}
          size={h}
          radius={radius}
          emoji={dish.emoji}
        />
        {children}
      </View>
    );
  }
  return (
    <Photo
      uri={uri}
      width={size}
      height={h}
      radius={radius}
      tint={categoryTint(index)}
    >
      {children}
    </Photo>
  );
}

const tagStyle = (tag?: Dish["tag"]) =>
  tag === "Bestseller" ? "bg-leaf-600" : tag === "Popular" ? "bg-sun-600" : "bg-brand-600";

/* ── Restaurant tiles ───────────────────────────────────────────────────── */

/**
 * Home rail tile: photo with an offer flag and a favourite heart, then name,
 * cuisines, rating · eta and price for two — the reference's "Popular
 * Restaurants" card.
 */
/**
 * The card's picture: one image, or a slow rotation through several.
 *
 * The client asked for the restaurant's own photo followed by four of its
 * dishes, cycling. Every card is the same height whatever it has to show, so
 * a restaurant with one picture still lines up with one that has five.
 *
 * It rotates on a timer rather than by dragging: the card sits inside a
 * horizontal list, and a swipeable image inside a swipeable row fights the
 * gesture that scrolls the row.
 */
function CardGallery({
  images,
  height = 124,
  children,
}: {
  images: string[];
  height?: number;
  children?: React.ReactNode;
}) {
  const [frame, setFrame] = React.useState(0);
  const many = images.length > 1;

  React.useEffect(() => {
    if (!many) return;
    const timer = setInterval(
      () => setFrame((current) => (current + 1) % images.length),
      3200
    );
    return () => clearInterval(timer);
  }, [many, images.length]);

  // Guard against the list shrinking under a frame index that outran it.
  const uri = images[Math.min(frame, images.length - 1)];

  return (
    <Photo uri={uri} height={height} radius={0}>
      {children}
      {many ? (
        <View className="absolute inset-x-0 bottom-1.5 flex-row justify-center gap-1">
          {images.map((image, index) => (
            <View
              key={image}
              className={
                "h-1 rounded-full " +
                (index === frame ? "w-3 bg-white" : "w-1 bg-white/60")
              }
            />
          ))}
        </View>
      ) : null}
    </Photo>
  );
}

export function RestaurantCard({
  restaurant,
  index,
  width = 196,
  variant = "rail",
}: {
  restaurant: Restaurant;
  index: number;
  width?: number;
  /**
   * "rail" is the narrow tile used inside a horizontal row.
   *
   * "wide" is the home list: one restaurant per line, the card as wide as
   * the screen. The client's reference stacks them that way, and the rail
   * cut every card off at the right edge — a kitchen's name, its rating and
   * what it sells could not all be read without swiping sideways.
   */
  variant?: "rail" | "wide";
}) {
  const router = useRouter();
  const { favourites, toggleFavourite, dishesForRestaurant, selectedCategory } =
    useStore();
  const isFavourite = favourites.includes(restaurant.id);
  const wide = variant === "wide";

  /*
   * One dish and its price, on the card.
   *
   * The card said what the kitchen was called and what two people might
   * spend; it never said what it sells. The reference screen names a dish and
   * its price on every restaurant, which is what makes the list browsable by
   * food rather than only by name.
   *
   * When a category is chosen it is that category's dish — filtering to
   * Biryani should show each kitchen's biryani and what it costs, not an
   * unrelated cheapest item. Otherwise the cheapest, which is the honest
   * answer to "what does it cost to order from here".
   *
   * A dish counts when its category matches or its name carries the word,
   * which is the rule the server uses to decide the restaurant belongs in the
   * filtered list at all. Matching on category alone left a kitchen listed
   * under "Idli" because it sells "Idli Sambar" showing an unrelated ₹49 pav
   * on its card — the chosen food was the one thing the card did not name.
   */
  const highlight = React.useMemo(() => {
    const dishes = dishesForRestaurant(restaurant.id);
    if (dishes.length === 0) return null;
    const wanted = selectedCategory?.trim().toLowerCase();
    const matches = wanted
      ? dishes.filter(
          (dish) =>
            dish.category?.trim().toLowerCase() === wanted ||
            dish.name.toLowerCase().includes(wanted)
        )
      : [];
    const pool = matches.length > 0 ? matches : dishes;
    return pool.reduce((cheapest, dish) =>
      dish.price < cheapest.price ? dish : cheapest
    );
  }, [dishesForRestaurant, restaurant.id, selectedCategory]);

  return (
    <Pressable
      onPress={() => router.push(`/restaurant/${restaurant.id}`)}
      style={wide ? undefined : { width }}
      className={wide ? "active:opacity-80" : "active:opacity-80"}
    >
      <Card className="overflow-hidden">
        <CardGallery
          images={
            restaurant.gallery && restaurant.gallery.length > 0
              ? restaurant.gallery
              : [restaurant.imageUrl ?? hero(restaurant.photo, 560)]
          }
          height={wide ? 186 : 124}
        >
          {restaurant.offerBadge && (
            <View className="absolute left-0 top-0 rounded-br-lg bg-brand-600 px-2 py-1">
              <Txt size="micro" weight="bold" tone="white">
                {restaurant.offerBadge}
              </Txt>
            </View>
          )}

          {highlight && (
            <View className="absolute bottom-2 left-2 max-w-[86%] flex-row items-center gap-1 rounded-md bg-black/70 px-2 py-1">
              <Txt
                size={wide ? "tiny" : "micro"}
                weight="semibold"
                tone="white"
                numberOfLines={1}
              >
                {highlight.name}
              </Txt>
              <Txt size={wide ? "tiny" : "micro"} weight="bold" tone="white">
                · {currency(highlight.price)}
              </Txt>
            </View>
          )}

          <Pressable
            onPress={() => toggleFavourite(restaurant.id)}
            hitSlop={8}
            className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-black/25"
            accessibilityLabel={
              isFavourite ? "Remove from favourites" : "Add to favourites"
            }
          >
            <Ionicons
              name={isFavourite ? "heart" : "heart-outline"}
              size={15}
              color="#ffffff"
            />
          </Pressable>
        </CardGallery>

        {/*
          The full-width card has room to read, so it puts the rating beside
          the name and the time, the distance and the cost on one line under
          it — the reference's layout. The rail tile keeps its fixed row
          heights so tiles in a row end level whether or not a restaurant
          carries an offer or a long cuisine list.
        */}
        {wide ? (
          <View className="gap-0.5 px-3 py-2">
            <View className="flex-row items-center gap-2">
              <Txt weight="bold" numberOfLines={1} className="min-w-0 flex-1">
                {restaurant.name}
              </Txt>
              <View className="flex-row items-center gap-0.5 rounded bg-leaf-600 px-1.5 py-0.5">
                <Ionicons name="star" size={10} color="#ffffff" />
                <Txt size="micro" weight="bold" tone="white">
                  {restaurant.rating.toFixed(1)}
                </Txt>
              </View>
            </View>

            <Txt size="tiny" tone="muted" numberOfLines={1}>
              {restaurant.cuisines.join(", ")}
            </Txt>

            <View className="flex-row items-center gap-1.5">
              <Ionicons name="time-outline" size={12} color={colors.ink.muted} />
              <Txt size="tiny" tone="muted">
                {restaurant.etaMinutes[0]}-{restaurant.etaMinutes[1]} mins
              </Txt>
              <Txt size="tiny" tone="faint">
                |
              </Txt>
              <Txt size="tiny" tone="muted">
                {restaurant.distanceKm.toFixed(1)} km
              </Txt>
              <Txt size="tiny" tone="faint">
                |
              </Txt>
              <Txt size="tiny" tone="muted" numberOfLines={1} className="min-w-0 flex-1">
                {currency(restaurant.priceForTwo)} for two
              </Txt>
            </View>
          </View>
        ) : (
          <View className="gap-1 p-3">
            <Txt weight="bold" numberOfLines={1} className="h-5">
              {restaurant.name}
            </Txt>
            <Txt size="tiny" tone="muted" numberOfLines={1} className="h-4">
              {restaurant.cuisines.join(", ")}
            </Txt>

            <View className="h-5 flex-row items-center gap-2">
              <Rating value={restaurant.rating} />
              <View className="h-3 w-px bg-line" />
              <Txt size="tiny" tone="muted">
                {restaurant.etaMinutes[0]}-{restaurant.etaMinutes[1]} min
              </Txt>
            </View>

            <Txt size="tiny" tone="muted" className="h-4">
              {currency(restaurant.priceForTwo)} for two
            </Txt>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

/** Wide restaurant row for search results and listings. */
export function RestaurantRow({
  restaurant,
  index,
}: {
  restaurant: Restaurant;
  index: number;
}) {
  const router = useRouter();
  const { favourites, toggleFavourite } = useStore();
  const isFavourite = favourites.includes(restaurant.id);

  return (
    <Pressable
      onPress={() => router.push(`/restaurant/${restaurant.id}`)}
      className="active:opacity-80"
    >
      <Card className="mx-4 mb-3 flex-row gap-3 p-3">
        <Photo
          uri={photoUri(restaurant, 260)}
          width={92}
          height={92}
          radius={10}
          tint={categoryTint(index)}
        />

        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              {restaurant.veg && <VegMark veg size={12} />}
              <Txt weight="bold" numberOfLines={1} className="flex-1">
                {restaurant.name}
              </Txt>
            </View>
            <Pressable onPress={() => toggleFavourite(restaurant.id)} hitSlop={10}>
              <Ionicons
                name={isFavourite ? "heart" : "heart-outline"}
                size={19}
                color={isFavourite ? colors.brand[600] : colors.ink.faint}
              />
            </Pressable>
          </View>

          <Txt size="tiny" tone="muted" numberOfLines={1}>
            {restaurant.cuisines.join(", ")} · {restaurant.area}
          </Txt>

          <View className="mt-0.5 flex-row items-center gap-2">
            <Rating value={restaurant.rating} count={compactCount(restaurant.ratingCount)} />
            <Txt size="tiny" tone="muted">
              {restaurant.etaMinutes[0]}-{restaurant.etaMinutes[1]} mins
            </Txt>
          </View>

          {restaurant.offer && (
            <View className="mt-1 flex-row items-center gap-1">
              <Ionicons name="pricetag" size={11} color={colors.brand[600]} />
              <Txt size="tiny" weight="semibold" tone="brand" numberOfLines={1}>
                {restaurant.offer}
              </Txt>
            </View>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

/* ── Dish tiles ─────────────────────────────────────────────────────────── */

/**
 * "Popular Dishes" rail tile — photo with a corner tag and the reference's
 * white square add button hanging off the image.
 */
export function DishCard({ dish, index }: { dish: Dish; index: number }) {
  const router = useRouter();
  const { addLine } = useStore();
  const quantity = useDishQuantity(dish.id);
  const hasOptions = Boolean(dish.portions?.length || dish.extras?.length);

  return (
    <Pressable
      onPress={() => router.push(`/dish/${dish.id}`)}
      style={{ width: 156 }}
      className="active:opacity-80"
    >
      <View>
        <DishImage dish={dish} height={128} radius={12} index={index}>
          {dish.tag && (
            <View
              className={`absolute left-0 top-0 rounded-br-lg px-2 py-1 ${tagStyle(dish.tag)}`}
            >
              <Txt size="micro" weight="bold" tone="white">
                {dish.tag}
              </Txt>
            </View>
          )}
        </DishImage>

        <View className="absolute -bottom-3 right-2">
          {quantity > 0 ? (
            <View className="rounded-lg bg-white">
              <Stepper
                quantity={quantity}
                onChange={() => router.push(`/dish/${dish.id}`)}
                compact
              />
            </View>
          ) : (
            <Pressable
              onPress={() => (hasOptions ? router.push(`/dish/${dish.id}`) : addLine(dish))}
              className="h-8 w-8 items-center justify-center rounded-lg border border-leaf-500 bg-white active:opacity-70"
              style={{
                shadowColor: "#0f172a",
                shadowOpacity: 0.12,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
              }}
              accessibilityLabel={`Add ${dish.name}`}
            >
              <Ionicons name="add" size={18} color={colors.leaf[600]} />
            </Pressable>
          )}
        </View>
      </View>

      <View className="mt-4 gap-1">
        <Txt size="sm" weight="semibold" numberOfLines={1} className="h-5">
          {dish.name}
        </Txt>
        <View className="h-5 flex-row items-center justify-between">
          <Txt size="sm" weight="bold">
            {currency(dish.price)}
          </Txt>
          <Rating value={dish.rating} />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * "Recommended for you" card on the restaurant screen — portrait photo, name,
 * two lines of description, price, then a full-width green ADD button.
 */
export function MenuDishCard({ dish, index }: { dish: Dish; index: number }) {
  const router = useRouter();
  const { addLine, setQuantity, lines } = useStore();
  const quantity = useDishQuantity(dish.id);
  const forDish = lines.filter((l) => l.dishId === dish.id);
  const single = forDish.length === 1 ? forDish[0] : null;
  const hasOptions = Boolean(dish.portions?.length || dish.extras?.length);

  return (
    <Pressable
      onPress={() => router.push(`/dish/${dish.id}`)}
      style={{ width: 182 }}
      className="active:opacity-90"
    >
      <Card className="overflow-hidden">
        <DishImage dish={dish} height={124} radius={0} index={index}>
          {dish.tag && (
            <View
              className={`absolute left-0 top-0 rounded-br-lg px-2 py-1 ${tagStyle(dish.tag)}`}
            >
              <Txt size="micro" weight="bold" tone="white">
                {dish.tag}
              </Txt>
            </View>
          )}
          <View className="absolute bottom-1.5 left-1.5">
            <VegMark veg={dish.veg} size={13} />
          </View>
        </DishImage>

        <View className="p-3">
          <Txt weight="bold" numberOfLines={1}>
            {dish.name}
          </Txt>
          {/* Reserved height keeps every card in the rail the same size. */}
          <Txt size="tiny" tone="muted" numberOfLines={3} className="mt-1 h-12">
            {dish.description}
          </Txt>
          <Txt weight="bold" className="mt-1">
            {currency(dish.price)}
          </Txt>

          <View className="mt-3">
            {quantity > 0 ? (
              <View className="h-10 flex-row items-center justify-center rounded-tile border border-leaf-100 bg-leaf-50">
                <Stepper
                  quantity={quantity}
                  onChange={(next) =>
                    single ? setQuantity(single.key, next) : router.push(`/dish/${dish.id}`)
                  }
                />
              </View>
            ) : (
              <Pressable
                onPress={() =>
                  hasOptions ? router.push(`/dish/${dish.id}`) : addLine(dish)
                }
                className="h-10 flex-row items-center justify-center gap-2 rounded-tile border border-leaf-500 bg-surface active:opacity-70"
              >
                <Txt size="sm" weight="bold" className="text-leaf-600">
                  ADD
                </Txt>
                <Ionicons name="add" size={14} color={colors.leaf[600]} />
              </Pressable>
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * Menu list row — the reference's "Bestsellers" list: square photo on the
 * left, name, description and price on the right, control on the far right.
 */
export function MenuDishRow({
  dish,
  index,
  showRestaurant,
}: {
  dish: Dish;
  index: number;
  showRestaurant?: string;
}) {
  const router = useRouter();
  const { addLine, setQuantity, lines } = useStore();
  const quantity = useDishQuantity(dish.id);
  const forDish = lines.filter((l) => l.dishId === dish.id);
  const single = forDish.length === 1 ? forDish[0] : null;
  const hasOptions = Boolean(dish.portions?.length || dish.extras?.length);

  return (
    <View className="flex-row items-center gap-3 px-4 py-4">
      <Pressable onPress={() => router.push(`/dish/${dish.id}`)}>
        <DishImage dish={dish} size={84} height={84} radius={10} index={index}>
          <View className="absolute left-1 top-1">
            <VegMark veg={dish.veg} size={12} />
          </View>
        </DishImage>
      </Pressable>

      <Pressable
        onPress={() => router.push(`/dish/${dish.id}`)}
        className="min-w-0 flex-1"
      >
        <Txt weight="bold" numberOfLines={1}>
          {dish.name}
        </Txt>
        <Txt size="tiny" tone="muted" numberOfLines={2} className="mt-0.5">
          {dish.description}
        </Txt>
        {showRestaurant && (
          <Txt size="micro" tone="faint" numberOfLines={1} className="mt-0.5">
            {showRestaurant}
          </Txt>
        )}
        <View className="mt-1 flex-row items-center gap-2">
          <Txt weight="bold">{currency(dish.price)}</Txt>
          {dish.originalPrice && dish.originalPrice > dish.price && (
            <Txt size="tiny" tone="faint" className="line-through">
              {currency(dish.originalPrice)}
            </Txt>
          )}
        </View>
      </Pressable>

      <View className="w-[112px] items-end">
        {quantity > 0 ? (
          <Stepper
            quantity={quantity}
            onChange={(next) =>
              single ? setQuantity(single.key, next) : router.push(`/dish/${dish.id}`)
            }
          />
        ) : (
          <Pressable
            onPress={() => (hasOptions ? router.push(`/dish/${dish.id}`) : addLine(dish))}
            className="h-10 w-[104px] flex-row items-center justify-center gap-1.5 rounded-tile border border-brand-500 bg-surface active:opacity-70"
          >
            <Txt size="sm" weight="bold" tone="brand">
              ADD
            </Txt>
            {hasOptions && <Ionicons name="add" size={13} color={colors.brand[600]} />}
          </Pressable>
        )}
        {hasOptions && quantity === 0 && (
          <Txt size="micro" tone="faint" className="mt-1">
            customisable
          </Txt>
        )}
      </View>
    </View>
  );
}

/**
 * Small square used by "Best with", "You might also like" and the member
 * combo rails — photo, name, price and a bordered + in the corner.
 */
export function SmallDishTile({
  dish,
  index,
  width = 138,
}: {
  dish: Dish;
  index: number;
  width?: number;
}) {
  const router = useRouter();
  const { addLine } = useStore();
  const hasOptions = Boolean(dish.portions?.length || dish.extras?.length);

  return (
    <Pressable
      onPress={() => router.push(`/dish/${dish.id}`)}
      style={{ width }}
      className="active:opacity-80"
    >
      <Card className="overflow-hidden p-2">
        <DishImage dish={dish} height={92} radius={8} index={index} />
        <View className="mt-2 flex-row items-end justify-between gap-2">
          <View className="min-w-0 flex-1">
            <Txt size="tiny" weight="semibold" numberOfLines={1}>
              {dish.name}
            </Txt>
            <Txt size="tiny" weight="bold" className="mt-0.5">
              {currency(dish.price)}
            </Txt>
          </View>
          <Pressable
            onPress={() => (hasOptions ? router.push(`/dish/${dish.id}`) : addLine(dish))}
            hitSlop={6}
            className="h-7 w-7 items-center justify-center rounded-md border border-leaf-500 bg-surface active:opacity-70"
            accessibilityLabel={`Add ${dish.name}`}
          >
            <Ionicons name="add" size={15} color={colors.leaf[600]} />
          </Pressable>
        </View>
      </Card>
    </Pressable>
  );
}

/** Kept for screens that still list dishes in the older dense row. */
export const DishRow = MenuDishRow;
