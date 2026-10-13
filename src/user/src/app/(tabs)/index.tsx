import React from "react";
import {
  AppState,
  Image,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, IconTile, SectionHead, Txt, colors } from "@/components/ui";
import { LinearGradient, Photo } from "@/components/photo";
import { DishCard, RestaurantCard } from "@/components/cards";
import { categories, exploreTiles, offers, trustPoints } from "@/lib/data";
import { accents } from "@/lib/theme";
import { currency } from "@/lib/format";
import { hero, img } from "@/lib/images";
import { useStore } from "@/lib/store";
import { mediaUrl } from "@/lib/api";

/**
 * Home, built to the client's reference screens.
 *
 * The five home mockups are variations on one page, so this is their union in
 * the order they share: header, promo carousel, categories, offer rail, the
 * restaurant rail, the trust strip, the delivery-verification banner, popular
 * dishes, the explore tiles and the two membership strips.
 */

function Header() {
  const router = useRouter();
  const {
    addresses,
    selectedAddressId,
    customer,
    orders,
    itemCount,
    destination,
  } = useStore();

  /** Orders that have not finished; nothing to tell the customer otherwise. */
  const activeOrders = orders.filter(
    (order) => !["Delivered", "Cancelled", "Refunded"].includes(order.status)
  ).length;
  const address = addresses.find((a) => a.id === selectedAddressId) ?? addresses[0];

  /*
   * Where the phone is, detected on open and kept current as it moves.
   *
   * The store owns this now, because the same answer has to reach the order:
   * this row used to show the detected area while every order went to a
   * saved address, so the screen named one destination and the bill another.
   * It was also only consulted when the customer had no address of their
   * own, so anyone who had added one never saw where they actually were.
   */

  return (
    <View className="bg-surface px-4 pb-3 pt-1">
      {/*
        Wordmark row.

        The logo is centred out of the flow, so the row would otherwise be as
        tall as the small controls either side and the logo would spill over
        the address bar below. The row reserves the logo's height instead.
      */}
      <View
        className="relative flex-row items-center justify-between"
        style={{ minHeight: LOGO_WIDTH / LOGO_ASPECT }}
      >
        {/*
          Opens the account tab, which is where everything this icon implies
          actually lives - orders, addresses, wallet, Plus. It had no press
          handler at all, so it was a picture of a menu button.
        */}
        <Pressable
          hitSlop={8}
          className="w-8 active:opacity-60"
          accessibilityLabel="Menu"
          onPress={() => router.push("/(tabs)/account")}
        >
          <Ionicons name="menu" size={26} color={colors.ink.default} />
        </Pressable>

        {/*
          The supplied logo, centred on the bar.
          
          It sat in the flow between the menu button and the two controls on
          the right, and those are far wider than the button - so "middle of
          the row" put it visibly left of the middle of the screen. Taking it
          out of the flow and pinning it across the full width centres it on
          the page itself, whatever sits either side.

          It ignores touches so the controls underneath still take theirs.
        */}
        <View
          pointerEvents="none"
          /*
           * Written as a style rather than utility classes: `inset-x-0` did
           * not survive, so the wrapper sized itself to the logo and pinned
           * to the left edge - which is the very thing this is here to fix.
           */
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          {/*
            Sized to the artwork's own proportions (818x395). The box was
            132x44 - far wider than the logo is shaped - so `contain` fitted
            it by height and drew it at 91px wide: smaller than the vendor and
            delivery apps show the same logo, with the runner and the "Ready
            To Eat" line shrunk to nothing.
          */}
          <Image
            source={require("../../../assets/images/logo-header.png")}
            style={{ width: LOGO_WIDTH, height: LOGO_WIDTH / LOGO_ASPECT }}
            resizeMode="contain"
            accessibilityLabel="Reditoe — Ready To Eat"
          />
        </View>

        <View className="flex-row items-center gap-3">
          {/*
            The count is the customer's own orders still in progress, and the
            badge is absent when there are none. It was the figure 3, drawn on
            every customer's screen whether they had ever ordered or not, on a
            button that did not press.
          */}
          <Pressable
            hitSlop={8}
            accessibilityLabel="Your orders"
            onPress={() => router.push("/(tabs)/orders")}
          >
            <Ionicons name="notifications-outline" size={23} color={colors.ink.default} />
            {activeOrders > 0 && (
              <View className="absolute -right-2 -top-1.5 h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1">
                <Txt size="micro" weight="bold" tone="white">
                  {activeOrders}
                </Txt>
              </View>
            )}
          </Pressable>

          {/*
            The basket, which is what the reference puts here - the wallet
            pill that used to sit in this spot is still one tap away on the
            account tab, and the balance is shown where it is spent.
          */}
          <Pressable
            hitSlop={8}
            accessibilityLabel="Your cart"
            onPress={() => router.push("/cart")}
          >
            <Ionicons name="cart-outline" size={24} color={colors.ink.default} />
            {itemCount > 0 && (
              <View className="absolute -right-2 -top-1.5 h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1">
                <Txt size="micro" weight="bold" tone="white">
                  {itemCount}
                </Txt>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/*
        Address row, two lines as the reference has it: where it is going on
        the first, the address itself underneath. It was one line that ran
        the label and the street together and truncated.
      */}
      <Pressable
        onPress={() => router.push("/addresses")}
        className="mt-3 flex-row items-start gap-1.5 active:opacity-70"
      >
        <Ionicons
          name="location"
          size={18}
          color={colors.brand[600]}
          style={{ marginTop: 1 }}
        />
        <View className="flex-1">
          <View className="flex-row items-center gap-1">
            <Txt weight="semibold" numberOfLines={1}>
              Deliver to {destination.label}
            </Txt>
            <Ionicons name="chevron-down" size={15} color={colors.ink.soft} />
          </View>
          <Txt size="tiny" tone="muted" numberOfLines={1}>
            {destination.line || "Finding you…"}
          </Txt>
        </View>
      </Pressable>

    </View>
  );
}

/**
 * The search bar, which stays at the top while the rest scrolls.
 *
 * It used to carry the cuisine row with it, because a ScrollView pins one
 * child at a time and two sticky children push each other off. The cuisine
 * row has since moved below the banner, where the client's reference puts
 * it, so search is on its own and simply stays put.
 */
function SearchBar() {
  const router = useRouter();

  return (
    <View className="bg-surface pb-3">
      <View className="flex-row items-center gap-2 px-4">
        <Pressable
          onPress={() => router.push("/search")}
          className="h-12 flex-1 flex-row items-center gap-2 rounded-xl border border-line bg-surface px-3 active:opacity-70"
        >
          <Ionicons name="search" size={19} color={colors.ink.muted} />
          <Txt tone="muted" numberOfLines={1} className="flex-1">
            Search for restaurants, cuisines or dishes...
          </Txt>
        </Pressable>
        <Pressable
          onPress={() => router.push("/search")}
          className="h-12 w-12 items-center justify-center rounded-xl border border-brand-200 bg-surface active:opacity-70"
          accessibilityLabel="Filters"
        >
          <Ionicons name="options-outline" size={21} color={colors.brand[600]} />
        </Pressable>
      </View>
    </View>
  );
}

/** How long each banner holds before the next one slides in. */
const BANNER_HOLD_MS = 6000;
/** Longer than the slide takes, so the loop only jumps once it has landed. */
const BANNER_SLIDE_MS = 700;

/**
 * The list with its first entry repeated at the end.
 *
 * That repeat is what lets the strip run on forever: after the last banner it
 * slides on to a copy of the first, then quietly jumps back to the real one.
 * Without it the loop had to scroll all the way back across every banner.
 */
function withLoopSlide<T>(list: T[]): T[] {
  return list.length > 1 ? [...list, list[0]] : list;
}

/**
 * Full-bleed promo banner with paging dots, as the reference shows.
 *
 * It advances by itself every few seconds and keeps going round. A swipe still
 * works and holds the rotation until the customer lets go.
 */
function PromoCarousel() {
  const router = useRouter();
  const [page, setPage] = React.useState(0);
  const { width: screenWidth } = useWindowDimensions();

  const GUTTER = 16;
  const cardWidth = screenWidth - GUTTER * 2;
  const snap = cardWidth + 12;

  const scroller = React.useRef<ScrollView>(null);
  /** Where the strip is, in pixels; read by the timer instead of kept in state. */
  const offset = React.useRef(0);
  /** A finger is on the strip, so the rotation waits. */
  const [touching, setTouching] = React.useState(false);
  /** Home is the tab on screen; the other tabs stay mounted behind it. */
  const [focused, setFocused] = React.useState(true);
  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  /*
   * The admin's posters when there are any, and the offers the screen draws
   * itself when there are not.
   *
   * The four promotional images were compiled into the app, so changing one
   * meant shipping a new build to every phone. A poster set in the console
   * now replaces them, and the drawn cards remain as the fallback rather
   * than leaving a gap at the top of the home screen.
   */
  const { banners: adminBanners } = useStore();
  /*
   * Posters whose picture would not load. A poster is only a link to a file on
   * the server, and the file can be gone - which left a pale empty box at the
   * top of the home screen in place of the offers. A poster that cannot be
   * drawn is dropped, and when none can be, the offers below take over.
   * Keyed by address rather than id, so re-uploading a picture gets a fresh try.
   */
  const [failedImages, setFailedImages] = React.useState<string[]>([]);
  const remoteBanners = adminBanners
    .map((banner) => ({ ...banner, imageUri: mediaUrl(banner.imageUrl) }))
    .filter((banner): banner is typeof banner & { imageUri: string } => Boolean(banner.imageUri))
    .filter((banner) => !failedImages.includes(banner.imageUri));
  const fallbackOffers = offers.slice(0, 4);
  const count = remoteBanners.length > 0 ? remoteBanners.length : fallbackOffers.length;
  const looping = count > 1;

  /** Back to the first poster, without animating. */
  const jumpToStart = React.useCallback(() => {
    offset.current = 0;
    scroller.current?.scrollTo({ x: 0, animated: false });
  }, []);

  /**
   * Swap the copy of the first poster for the real one, if that is where the
   * strip is resting. Checked at the moment it runs, because it is also
   * scheduled behind a slide and the customer may have taken hold since.
   */
  const settleLoop = React.useCallback(() => {
    if (Math.round(offset.current / snap) >= count) jumpToStart();
  }, [snap, count, jumpToStart]);

  /*
   * The rotation.
   *
   * It is torn down and rebuilt whenever a finger lands or lifts, so after a
   * swipe the next banner is a full hold away rather than whatever was left on
   * the old clock. It does nothing while the app is in the background.
   */
  React.useEffect(() => {
    if (!looping || touching || !focused) return;

    const timer = setInterval(() => {
      if (AppState.currentState !== "active") return;

      let current = Math.round(offset.current / snap);
      // Resting on the copy of the first banner is the same picture as the
      // first banner; step back onto the real one before moving on.
      if (current >= count) {
        jumpToStart();
        current = 0;
      }

      const next = current + 1;
      scroller.current?.scrollTo({ x: next * snap, animated: true });
      if (next === count) setTimeout(settleLoop, BANNER_SLIDE_MS);
    }, BANNER_HOLD_MS);

    return () => clearInterval(timer);
  }, [looping, touching, focused, count, snap, jumpToStart, settleLoop]);

  /*
   * The admin added or removed a poster, so the strip is a different length.
   * Start again from the first rather than stay at an offset that may no
   * longer mean anything.
   */
  React.useEffect(() => {
    jumpToStart();
    setPage(0);
  }, [count, jumpToStart]);

  return (
    <View className="mt-1">
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snap}
        snapToAlignment="start"
        scrollEventThrottle={16}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          offset.current = x;
          // The dots follow the strip as it moves, whether the customer or
          // the timer is moving it; the copy at the end counts as the first.
          setPage(Math.round(x / snap) % count);
        }}
        onScrollBeginDrag={() => setTouching(true)}
        onScrollEndDrag={() => setTouching(false)}
        onMomentumScrollEnd={settleLoop}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 12 }}
      >
        {remoteBanners.length > 0
          ? withLoopSlide(remoteBanners).map((banner, i) => {
              const imageUri = banner.imageUri;
              return (
              <Pressable
                key={i === count ? `${banner.id}-loop` : banner.id}
                accessibilityLabel={banner.title}
                onPress={() => {
                  /*
                   * Where it points, as the console recorded it. A poster with
                   * nowhere to go simply does not navigate, rather than
                   * guessing at a screen.
                   */
                  if (banner.actionType === "restaurant" && banner.actionValue) {
                    router.push(`/restaurant/${banner.actionValue}`);
                  } else if (banner.actionType === "category" && banner.actionValue) {
                    router.push(`/search?category=${encodeURIComponent(banner.actionValue)}`);
                  } else if (banner.actionUrl) {
                    router.push(banner.actionUrl as never);
                  }
                }}
                style={{ width: cardWidth }}
                className="active:opacity-90"
              >
                <Photo
                  uri={imageUri}
                  height={160}
                  radius={14}
                  onError={() =>
                    setFailedImages((current) =>
                      current.includes(imageUri) ? current : [...current, imageUri]
                    )
                  }
                />
              </Pressable>
              );
            })
          : withLoopSlide(fallbackOffers).map((offer, i) => (
          <Pressable
            key={i === count ? `${offer.id}-loop` : offer.id}
            onPress={() => router.push("/offers")}
            style={{ width: cardWidth }}
            className="active:opacity-90"
          >
            <Photo uri={hero("biryani", 900)} height={160} radius={14}>
              {/* Gradient rather than a flat wash, so the dish stays visible on
                  the right exactly as the reference banner does. */}
              <LinearGradient
                colors={[
                  "#8f0c1a",
                  "#c20d24",
                  "rgba(194,13,36,0.86)",
                  "rgba(194,13,36,0)",
                ]}
                locations={[0, 0.34, 0.6, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ position: "absolute", inset: 0 }}
              />

              <View className="absolute inset-y-0 left-0 w-[68%] justify-center px-4">
                <View className="mb-2 self-start rounded-md border border-sun-400 px-2 py-1">
                  <Txt size="micro" weight="bold" className="text-sun-300">
                    LIMITED TIME OFFER
                  </Txt>
                </View>

                <View className="flex-row items-baseline gap-1.5">
                  {offer.lead ? (
                    <Txt size="lg" weight="bold" tone="white">
                      {offer.lead}
                    </Txt>
                  ) : null}
                  <Txt weight="bold" className="text-[32px] leading-[34px] text-sun-300">
                    {offer.figure}
                  </Txt>
                  <Txt size="lg" weight="bold" tone="white">
                    {offer.trail}
                  </Txt>
                </View>
                <Txt size="tiny" weight="bold" tone="white" className="mt-0.5">
                  ON ORDERS ABOVE {currency(offer.minOrder)}
                </Txt>

                <View className="mt-3 flex-row items-center gap-2">
                  <View className="rounded border border-sun-400 px-2 py-1.5">
                    <Txt size="micro" weight="bold" tone="white">
                      Code:{" "}
                      <Txt size="micro" weight="bold" className="text-sun-300">
                        {offer.code}
                      </Txt>
                    </Txt>
                  </View>
                  <View className="rounded bg-white px-3 py-1.5">
                    <Txt size="micro" weight="bold">
                      Order Now
                    </Txt>
                  </View>
                </View>
              </View>
            </Photo>
          </Pressable>
        ))}
      </ScrollView>

      <View className="mt-2.5 flex-row justify-center gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            className={`h-1.5 rounded-full ${
              i === page ? "w-4 bg-brand-600" : "w-1.5 bg-line-strong"
            }`}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * The item-wise filter row, in the client's reference layout.
 *
 * Tapping one used to leave the home screen for search. It now narrows the
 * restaurants underneath, which is what the row looks like it should do, and
 * "All" puts them all back.
 *
 * The names come from the menus rather than a list in the bundle, so the row
 * cannot offer a category nobody sells - the artwork for each is still
 * matched from the local set where the name lines up, because vendors upload
 * dish photos, not category ones.
 *
 * The chosen one is underlined rather than outlined: the reference marks it
 * that way, and an outline around a photo of food reads as a border on the
 * plate. A category picked from the "See All" sheet is pulled to the front of
 * the row, so the row always shows what is filtering the list — otherwise
 * choosing the twentieth cuisine left no visible sign of it anywhere.
 */
const ROW_LIMIT = 8;
const ITEM_WIDTH = 78;

function CategoryRow({ onSeeAll }: { onSeeAll: () => void }) {
  const { foodCategories, selectedCategory, setSelectedCategory } = useStore();

  /** The bundled artwork for a category name, where there is one. */
  const artFor = (name: string) =>
    categories.find(
      (entry) => entry.name.toLowerCase() === name.trim().toLowerCase()
    );

  /* The first few, with whatever is filtering the list among them. */
  const shown = React.useMemo(() => {
    const head = foodCategories.slice(0, ROW_LIMIT);
    const wanted = selectedCategory?.trim().toLowerCase();
    if (!wanted || head.some((c) => c.name.toLowerCase() === wanted)) return head;
    const chosen = foodCategories.find((c) => c.name.toLowerCase() === wanted);
    return chosen ? [chosen, ...head.slice(0, ROW_LIMIT - 1)] : head;
  }, [foodCategories, selectedCategory]);

  if (foodCategories.length === 0) return null;

  /** One entry: the picture, its name, and the bar that marks the choice. */
  const Item = ({
    label,
    active,
    onPress,
    children,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
    children: React.ReactNode;
  }) => (
    <Pressable
      accessibilityLabel={`${label}${active ? ", selected" : ""}`}
      onPress={onPress}
      style={{ width: ITEM_WIDTH }}
      className="items-center active:opacity-70"
    >
      <View className="h-[62px] w-[62px] items-center justify-center">
        {children}
      </View>
      <Txt
        size="tiny"
        weight={active ? "bold" : "semibold"}
        numberOfLines={1}
        tone={active ? "brand" : "default"}
        className="mt-1.5 px-0.5"
      >
        {label}
      </Txt>
      {/* The marker keeps its space when it is not drawn, so the row does not
          jump up and down by three pixels as the choice moves along it. */}
      <View
        style={{ backgroundColor: active ? colors.brand[600] : "transparent" }}
        className="mt-1.5 h-[3px] w-[46px] rounded-full"
      />
    </Pressable>
  );

  return (
    <View className="border-b border-line">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-3"
      >
        {/* Everything, which is where the screen starts. */}
        <Item
          label="All"
          active={!selectedCategory}
          onPress={() => setSelectedCategory(null)}
        >
          <View className="h-[54px] w-[54px] items-center justify-center rounded-full bg-brand-50">
            <Ionicons name="restaurant" size={24} color={colors.brand[600]} />
          </View>
        </Item>

        {shown.map((category) => {
          const art = artFor(category.name);
          const active =
            selectedCategory?.toLowerCase() === category.name.toLowerCase();
          return (
            <Item
              key={category.id}
              label={category.name}
              active={active}
              onPress={() => setSelectedCategory(active ? null : category.name)}
            >
              {art ? (
                <Photo uri={img(art.photo, 200)} width={58} height={58} radius={29} />
              ) : category.image ? (
                <Photo uri={category.image} width={58} height={58} radius={29} />
              ) : (
                <View className="h-[54px] w-[54px] items-center justify-center rounded-full bg-brand-50">
                  <Ionicons name="fast-food" size={24} color={colors.brand[600]} />
                </View>
              )}
            </Item>
          );
        })}

        {/* Every cuisine, not just the eight that fit. */}
        <Item label="See All" active={false} onPress={onSeeAll}>
          <View className="h-[54px] w-[54px] items-center justify-center rounded-full bg-surface-sunken">
            <Ionicons name="grid" size={22} color={colors.ink.muted} />
          </View>
        </Item>
      </ScrollView>
    </View>
  );
}

/**
 * Every cuisine on sale, as a grid.
 *
 * Choosing one narrows the restaurants underneath and closes the sheet —
 * the same filter the row applies, reached from a list that shows all of
 * them rather than the handful that fit across the screen.
 */
function AllCategoriesSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { foodCategories, selectedCategory, setSelectedCategory } = useStore();
  const artFor = (name: string) =>
    categories.find(
      (entry) => entry.name.toLowerCase() === name.trim().toLowerCase()
    );

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        className="flex-1 justify-end"
      >
        <Pressable onPress={() => {}} className="max-h-[80%] rounded-t-[22px] bg-surface">
          <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
            <Txt size="xl" weight="bold">
              Cuisines and dishes
            </Txt>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.ink.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="flex-row flex-wrap gap-y-4 px-4 pb-8">
            {foodCategories.map((category) => {
              const art = artFor(category.name);
              const active =
                selectedCategory?.toLowerCase() === category.name.toLowerCase();
              return (
                <Pressable
                  key={category.id}
                  onPress={() => {
                    setSelectedCategory(active ? null : category.name);
                    onClose();
                  }}
                  className="w-1/4 items-center gap-1.5 px-1 active:opacity-70"
                  accessibilityLabel={`${category.name}${active ? ", selected" : ""}`}
                >
                  {/* Round, like the row this sheet feeds — the two are the
                      same control seen at two sizes. */}
                  <View
                    style={{
                      borderWidth: active ? 2 : 0,
                      borderColor: colors.brand[600],
                    }}
                    className="h-[68px] w-[68px] items-center justify-center rounded-full"
                  >
                    {art ? (
                      <Photo uri={img(art.photo, 200)} width={62} height={62} radius={31} />
                    ) : category.image ? (
                      <Photo uri={category.image} width={62} height={62} radius={31} />
                    ) : (
                      <View className="h-[62px] w-[62px] items-center justify-center rounded-full bg-brand-50">
                        <Ionicons name="fast-food" size={26} color={colors.brand[600]} />
                      </View>
                    )}
                  </View>
                  <Txt
                    size="tiny"
                    weight={active ? "bold" : "semibold"}
                    numberOfLines={2}
                    className="text-center"
                    tone={active ? "brand" : "default"}
                  >
                    {category.name}
                  </Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** "Best Offers for You" — pastel coupon tiles with a copyable code. */
function OfferRail() {
  const router = useRouter();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-3 px-4"
    >
      {offers.slice(0, 4).map((offer) => {
        const tint = accents[offer.accent];
        return (
          <Pressable
            key={offer.id}
            onPress={() => router.push("/offers")}
            style={{ width: 168, backgroundColor: tint.bg }}
            className="overflow-hidden rounded-card p-3 active:opacity-80"
          >
            <View className="flex-row items-start justify-between">
              <View className="min-w-0 flex-1">
                {offer.lead ? (
                  <Txt size="tiny" weight="bold" style={{ color: tint.fg }}>
                    {offer.lead}
                  </Txt>
                ) : null}
                <Txt weight="bold" style={{ color: tint.fg }} className="text-[26px] leading-8">
                  {offer.figure}
                </Txt>
                <Txt size="sm" weight="bold" style={{ color: tint.fg }}>
                  {offer.trail}
                </Txt>
              </View>
              <View
                style={{ backgroundColor: tint.fg }}
                className="h-7 w-7 items-center justify-center rounded-full"
              >
                <Ionicons name="pricetag" size={13} color="#ffffff" />
              </View>
            </View>

            <Txt size="tiny" tone="soft" numberOfLines={2} className="mt-2 h-8">
              {offer.maxDiscount ? `Up to ${currency(offer.maxDiscount)}\n` : ""}
              on orders above {currency(offer.minOrder)}
            </Txt>

            <View className="mt-2 flex-row items-center justify-between rounded-lg bg-white px-2.5 py-1.5">
              <Txt size="micro" weight="bold" tone="muted">
                CODE:{" "}
                <Txt size="micro" weight="bold" style={{ color: tint.fg }}>
                  {offer.code}
                </Txt>
              </Txt>
              <Ionicons name="copy-outline" size={13} color={colors.ink.faint} />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Green trust strip the reference places under the restaurant rail. */
function TrustStrip() {
  return (
    <View className="mx-4 mt-6 flex-row items-center rounded-card bg-leaf-50 px-1 py-3">
      {trustPoints.map((item, index) => (
        <View
          key={item.title}
          className={`flex-1 flex-row items-center gap-1.5 px-1.5 ${
            index > 0 ? "border-l border-leaf-100" : ""
          }`}
        >
          <Ionicons name={item.icon} size={18} color={colors.leaf[600]} />
          <View className="min-w-0 flex-1">
            <Txt size="micro" weight="semibold" numberOfLines={1}>
              {item.title}
            </Txt>
            <Txt size="micro" tone="muted" numberOfLines={1}>
              {item.detail}
            </Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

function ExploreTiles() {
  const router = useRouter();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-3 px-4"
    >
      {exploreTiles.map((tile) => (
        <Pressable
          key={tile.id}
          onPress={() => router.push("/search")}
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
  );
}

/** Purple referral strip. */
function ReferralStrip() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push("/account")} className="mx-4 mt-6 active:opacity-90">
      <LinearGradient
        colors={["#6d28d9", "#7c3aed", "#8b5cf6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 14, padding: 14 }}
      >
        <View className="flex-row items-center gap-3">
          <View className="h-14 w-14 items-center justify-center rounded-xl bg-white/95 px-1">
            <Txt size="micro" weight="bold" className="text-center text-brand-600">
              REFER & EARN
            </Txt>
          </View>

          <View className="min-w-0 flex-1">
            <Txt weight="bold" tone="white" numberOfLines={2}>
              Refer your friends & Earn Rewards
            </Txt>
            <Txt size="tiny" className="mt-0.5 text-white/85">
              You get ₹100 · Friend gets ₹100
            </Txt>
          </View>

          <View className="flex-row items-center gap-1">
            <View className="rounded-lg bg-white px-3 py-2">
              <Txt size="tiny" weight="bold" tone="plus">
                Refer Now
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#ffffff" />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

/** "Join Reditoe Plus" strip. */
function PlusStrip() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push("/plus")}
      className="mx-4 mt-6 flex-row items-center gap-3 rounded-card bg-sun-50 px-3 py-3 active:opacity-80"
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-sun-100">
        <Ionicons name="ribbon" size={24} color={colors.sun[600]} />
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Txt weight="bold">Join Reditoe</Txt>
          <View className="rounded bg-brand-600 px-1.5 py-0.5">
            <Txt size="micro" weight="bold" tone="white">
              Plus
            </Txt>
          </View>
        </View>
        <Txt size="tiny" tone="muted" numberOfLines={1}>
          Enjoy FREE delivery, exclusive offers & more!
        </Txt>
      </View>
      <View className="flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-2.5">
        <Txt size="tiny" weight="bold" tone="white">
          Explore Benefits
        </Txt>
        <Ionicons name="chevron-forward" size={13} color="#ffffff" />
      </View>
    </Pressable>
  );
}

/** Green coupon strip the reference closes the page with. */
function CouponStrip() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push("/offers")}
      className="mx-4 mt-6 flex-row items-center gap-3 rounded-card border border-leaf-100 bg-leaf-50 px-3 py-3 active:opacity-80"
    >
      <Ionicons name="pricetags-outline" size={24} color={colors.leaf[600]} />
      <View className="min-w-0 flex-1">
        <Txt weight="bold" numberOfLines={1}>
          Get up to ₹250 OFF
        </Txt>
        <Txt size="tiny" tone="muted" numberOfLines={1}>
          Apply coupons & save more on every order
        </Txt>
      </View>
      <View className="flex-row items-center gap-0.5 rounded-lg bg-white px-2.5 py-2">
        <Txt size="tiny" weight="bold">
          View Offers
        </Txt>
        <Ionicons name="chevron-forward" size={13} color={colors.ink.default} />
      </View>
    </Pressable>
  );
}

/**
 * The header logo, at the artwork's own proportions.
 *
 * 818x395 is the supplied file; sizing the box to anything else makes
 * `contain` letterbox it and draw the logo smaller than the other two apps
 * show the same image.
 */
const LOGO_WIDTH = 138;
const LOGO_ASPECT = 818 / 395;

export default function HomeScreen() {
  const router = useRouter();
  const {
    itemCount,
    popularDishes,
    visibleRestaurants: restaurants,
    selectedCategory,
    setSelectedCategory,
    isFirstTimeCustomer,
    apiError,
    reloadCatalogue,
  } = useStore();
  const popular = popularDishes();
  const [seeAllCategories, setSeeAllCategories] = React.useState(false);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName={itemCount > 0 ? "pb-28" : "pb-6"}
        /*
         * Index 1 is the search bar, which stays at the top while everything
         * under it scrolls — the reference screen's behaviour.
         */
        stickyHeaderIndices={[1]}
      >
        <Header />
        <SearchBar />

        {/*
          The banner first, then the item-wise filters — the order the client
          asked for. The filter row sits directly above the list it narrows,
          so the choice and its result are visible together.
        */}
        <PromoCarousel />
        <View className="mt-4">
          <CategoryRow onSeeAll={() => setSeeAllCategories(true)} />
        </View>

        {/*
          Welcome offers, for people who have not ordered yet.
          
          They were shown to everybody, so a regular customer saw a first-order
          promotion on every visit. Hidden once an order exists - and only once
          the history has actually been read, so it does not flash up on every
          launch before the answer arrives.
        */}
        {isFirstTimeCustomer ? (
          <View className="mt-6">
            <SectionHead
              title="Best Offers for You"
              onAction={() => router.push("/offers")}
              className="mb-3 px-4"
            />
            <OfferRail />
          </View>
        ) : null}

        <View className="mt-6">
          {/* The heading says which category is showing, and the action
              clears it rather than leaving for another screen. */}
          <SectionHead
            title={
              selectedCategory
                ? `${selectedCategory} Restaurants`
                : "Top Restaurants Near You"
            }
            onAction={
              selectedCategory
                ? () => setSelectedCategory(null)
                : () => router.push("/search")
            }
            className="mb-3 px-4"
          />
          {/* An empty list is a real answer — no vendor approved yet, or none
              delivering here. Rendering an empty rail leaves the page looking
              broken, which is how it was reported. */}
          {restaurants.length === 0 && apiError && !selectedCategory ? (
            /*
             * The request failed - which is not the same as there being
             * nothing nearby, and saying "no restaurants" for it sent people
             * away from an app that was only a second from working. This only
             * shows when nothing has ever loaded: once a list has arrived, a
             * failed refresh leaves it on screen.
             */
            <Card className="mx-4 items-center p-6">
              <Ionicons name="cloud-offline-outline" size={30} color={colors.ink.faint} />
              <Txt weight="bold" className="mt-2.5">
                We couldn&apos;t load restaurants
              </Txt>
              <Txt size="tiny" tone="muted" className="mt-1 text-center">
                Please check your connection and try again.
              </Txt>
              <Pressable
                onPress={reloadCatalogue}
                accessibilityLabel="Try loading restaurants again"
                className="mt-3 rounded-lg bg-brand-600 px-4 py-2 active:opacity-80"
              >
                <Txt size="tiny" weight="bold" tone="white">
                  Try again
                </Txt>
              </Pressable>
            </Card>
          ) : restaurants.length === 0 ? (
            <Card className="mx-4 items-center p-6">
              <Ionicons name="storefront-outline" size={30} color={colors.ink.faint} />
              <Txt weight="bold" className="mt-2.5">
                {selectedCategory
                  ? `No ${selectedCategory} nearby`
                  : "No restaurants available yet"}
              </Txt>
              <Txt size="tiny" tone="muted" className="mt-1 text-center">
                {selectedCategory
                  ? `Nobody delivering to you is serving ${selectedCategory} right now.`
                  : "We could not find any restaurants delivering to your area right now. Please check back shortly."}
              </Txt>
              {selectedCategory ? (
                <Pressable
                  onPress={() => setSelectedCategory(null)}
                  className="mt-3 rounded-lg bg-brand-600 px-4 py-2 active:opacity-80"
                >
                  <Txt size="tiny" weight="bold" tone="white">
                    View all restaurants
                  </Txt>
                </Pressable>
              ) : null}
            </Card>
          ) : (
            /*
             * Stacked, each card as wide as the screen. They were a sideways
             * rail of narrow tiles, so every restaurant was clipped at the
             * right edge and the list could only be read by swiping.
             */
            <View className="gap-3 px-4">
              {[...restaurants]
                .sort((a, b) => b.rating - a.rating)
                .map((restaurant, index) => (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    index={index}
                    variant="wide"
                  />
                ))}
            </View>
          )}
        </View>

        <TrustStrip />

        <View className="mt-6">
          <SectionHead
            title="Popular Dishes"
            onAction={() => router.push("/search")}
            className="mb-3 px-4"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3 px-4"
          >
            {popular.map((dish, index) => (
              <DishCard key={dish.id} dish={dish} index={index} />
            ))}
          </ScrollView>
        </View>

        <View className="mt-6">
          <SectionHead title="Explore More" className="mb-3 px-4" />
          <ExploreTiles />
        </View>

        <ReferralStrip />
        <PlusStrip />
        <CouponStrip />
      </ScrollView>


      <AllCategoriesSheet
        open={seeAllCategories}
        onClose={() => setSeeAllCategories(false)}
      />
    </SafeAreaView>
  );
}
