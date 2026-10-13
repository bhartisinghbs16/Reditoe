import React from "react";
import { TextInput, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  Card,
  DashedRule,
  EmptyState,
  SectionHead,
  Stepper,
  Txt,
  VegMark,
  colors,
} from "@/components/ui";
import { ScreenHeader, HeaderIcon } from "@/components/screen-header";
import { DishImage, SmallDishTile } from "@/components/cards";
import { BillBreakdown } from "@/components/bill";
import { shadow } from "@/lib/theme";
import { currency, currencyExact } from "@/lib/format";
import { useStore } from "@/lib/store";

/**
 * "Your Cart", copied from the reference: the address card, the item rows with
 * their variant and tag, the two secondary actions, an upsell rail, the offers
 * strip, the bill, and the secure-payment checkout bar.
 */

export default function CartScreen() {
  const router = useRouter();
  const [notesOpen, setNotesOpen] = React.useState(false);
  const { appliedOffer, cartRestaurantId, clearCart, destination, dishById, dishesForRestaurant, lines, setQuantity, totals, orderNotes, setOrderNotes } = useStore();

  if (lines.length === 0) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
        <ScreenHeader title="Your Cart" />
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          detail="Add a dish and it'll show up here."
          action="Browse restaurants"
          onAction={() => router.replace("/")}
        />
      </SafeAreaView>
    );
  }

  // Upsell from the same kitchen, skipping anything already in the cart.
  const inCart = new Set(lines.map((l) => l.dishId));
  const suggestions = (cartRestaurantId ? dishesForRestaurant(cartRestaurantId) : [])
    .filter((d) => !inCart.has(d.id))
    .slice(0, 6);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Your Cart"
        subtitle="You're saving with best offers"
        subtitleIcon="shield-checkmark"
        right={
          <>
            <HeaderIcon icon="heart" color={colors.brand[600]} label="Favourites" />
            <HeaderIcon icon="trash-outline" onPress={clearCart} label="Empty cart" />
          </>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-44">
        {/* Deliver to */}
        <Card className="mx-4 mt-1 flex-row items-start gap-3 p-3">
          <Ionicons name="location" size={22} color={colors.brand[600]} />
          <View className="min-w-0 flex-1">
            <Txt size="tiny" tone="muted">
              Deliver to
            </Txt>
            <View className="flex-row items-center gap-1">
              <Txt weight="bold" numberOfLines={2} className="min-w-0 flex-shrink">
                {destination.label} -{" "}
                {destination.line.split(",").slice(0, 2).join(",")}
              </Txt>
              <Ionicons name="chevron-down" size={14} color={colors.ink.soft} />
            </View>
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              {destination.line.split(",").slice(2).join(",").trim() || destination.city}
            </Txt>
          </View>
          <Pressable onPress={() => router.push("/addresses")} hitSlop={10}>
            <Txt size="sm" weight="bold" tone="brand">
              Change
            </Txt>
          </Pressable>
        </Card>

        {/* Items */}
        <View className="mt-4">
          {lines.map((line, index) => {
            const dish = dishById(line.dishId);
            return (
              <React.Fragment key={line.key}>
                {index > 0 && <DashedRule className="mx-4" />}
                <View className="flex-row items-start gap-3 px-4 py-3">
                  <DishImage
                    dish={dish ?? { name: line.name, emoji: "🍽️" }}
                    size={80}
                    height={80}
                    radius={10}
                    index={index}
                  >
                    <View className="absolute left-1 top-1">
                      <VegMark veg={line.veg} size={12} />
                    </View>
                  </DishImage>

                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-start gap-2">
                      <Txt weight="bold" numberOfLines={2} className="min-w-0 flex-1">
                        {line.name}
                      </Txt>
                      <Pressable
                        onPress={() => setQuantity(line.key, 0)}
                        hitSlop={10}
                        accessibilityLabel={`Remove ${line.name}`}
                      >
                        <Ionicons name="close" size={19} color={colors.ink.soft} />
                      </Pressable>
                    </View>

                    {(line.portionName || line.extras.length > 0) && (
                      <Txt size="tiny" tone="muted" numberOfLines={2} className="mt-0.5">
                        {[line.portionName, ...line.extras.map((e) => e.name)]
                          .filter(Boolean)
                          .join(" · ")}
                      </Txt>
                    )}

                    {dish?.tag && (
                      <Badge
                        label={dish.tag}
                        tone={dish.tag === "Bestseller" ? "ok" : "warn"}
                        className="mt-1.5"
                      />
                    )}

                    <View className="mt-2 flex-row items-center justify-between gap-2">
                      <Txt weight="bold">{currency(line.unitPrice)}</Txt>
                      <Stepper
                        quantity={line.quantity}
                        onChange={(next) => setQuantity(line.key, next)}
                        compact
                      />
                      <Txt weight="bold">{currency(line.unitPrice * line.quantity)}</Txt>
                    </View>
                  </View>
                </View>
              </React.Fragment>
            );
          })}
        </View>

        {/* Secondary actions */}
        <View className="mx-4 mt-2 flex-row gap-3">
          <Pressable
            onPress={() =>
              router.push(cartRestaurantId ? `/restaurant/${cartRestaurantId}` : "/")
            }
            className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-card border border-line bg-surface active:opacity-70"
          >
            <Ionicons name="add-circle-outline" size={19} color={colors.brand[600]} />
            <Txt size="sm" weight="bold" tone="brand">
              Add more items
            </Txt>
          </Pressable>

          {/*
            This opened nothing. The order has carried a notes field the whole
            time and the server stores it - the kitchen simply never received
            anything, because there was no way to type it.
          */}
          <Pressable
            onPress={() => setNotesOpen((open) => !open)}
            className="h-14 flex-1 flex-row items-center gap-2 rounded-card border border-line bg-surface px-3 active:opacity-70"
          >
            <Ionicons name="document-text-outline" size={19} color={colors.ink.soft} />
            <View className="min-w-0 flex-1">
              <Txt size="tiny" weight="bold" numberOfLines={2}>
                Special instructions
              </Txt>
              <Txt size="micro" tone="muted" numberOfLines={1}>
                {orderNotes.trim() ? orderNotes.trim() : "Add order notes"}
              </Txt>
            </View>
            <Ionicons
              name={notesOpen ? "chevron-down" : "chevron-forward"}
              size={15}
              color={colors.ink.faint}
            />
          </Pressable>
        </View>

        {notesOpen && (
          <View className="mx-4 mt-2">
            <TextInput
              value={orderNotes}
              onChangeText={setOrderNotes}
              placeholder="Less spicy, no onion, ring the bell…"
              placeholderTextColor={colors.ink.faint}
              multiline
              className="min-h-16 rounded-card border border-line bg-surface px-3 py-2.5"
            />
          </View>
        )}

        {/* Upsell */}
        {suggestions.length > 0 && (
          <View className="mt-6">
            <SectionHead
              title="You might also like"
              onAction={() =>
                router.push(cartRestaurantId ? `/restaurant/${cartRestaurantId}` : "/")
              }
              className="mb-3 px-4"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3 px-4"
            >
              {suggestions.map((dish, index) => (
                <SmallDishTile key={dish.id} dish={dish} index={index} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Offers */}
        <Pressable
          onPress={() => router.push("/offers")}
          className="mx-4 mt-6 flex-row items-center gap-3 rounded-card border border-leaf-100 bg-leaf-50 px-3 py-3 active:opacity-80"
        >
          <Ionicons name="pricetags-outline" size={24} color={colors.leaf[600]} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold" numberOfLines={1}>
              {appliedOffer ? `${appliedOffer.code} applied` : "Save more with offers"}
            </Txt>
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              {appliedOffer
                ? totals.couponError
                  ? `Not applied: ${totals.couponError}`
                  : `You saved ${currencyExact(totals.discount)} on this order`
                : "Apply coupon & save upto ₹250"}
            </Txt>
          </View>
          <View className="flex-row items-center gap-0.5 rounded-lg border border-line bg-white px-2.5 py-2">
            <Txt size="tiny" weight="bold">
              View offers
            </Txt>
            <Ionicons name="chevron-forward" size={13} color={colors.ink.default} />
          </View>
        </Pressable>

        {/* Bill */}
        <View className="mt-6 px-4">
          <Txt size="lg" weight="bold" className="mb-2">
            Bill Details
          </Txt>
          <BillBreakdown totals={totals} />
        </View>
      </ScrollView>

      {/* Checkout bar */}
      <View className="absolute inset-x-0 bottom-0 bg-surface px-4 pb-4 pt-2">
        {/* The reference sets the trust mark beside the total; on a phone all
            three columns plus the button only fit once it takes its own line. */}
        <View
          style={shadow.raised}
          className="rounded-card border border-line bg-surface p-2.5"
        >
          <View className="mb-2 flex-row items-center justify-center gap-1.5">
            <Ionicons name="shield-checkmark" size={14} color={colors.leaf[600]} />
            <Txt size="micro" weight="bold">
              Safe & Secure Payments
            </Txt>
            <Txt size="micro" className="text-leaf-600">
              · 100% Secure
            </Txt>
          </View>

          <View className="flex-row items-center gap-3">
            {/* Same figure as Net Payable in the bill above, so the strip never
                disagrees with it. */}
            <View className="min-w-0 flex-1">
              <Txt size="lg" weight="bold">
                {currencyExact(totals.toPay)}
              </Txt>
              <Txt size="micro" tone="soft">
                Net payable · incl. all charges
              </Txt>
            </View>

            <Pressable
              onPress={() => router.push("/checkout")}
              className="h-12 flex-row items-center gap-2 rounded-tile bg-leaf-700 px-8 active:opacity-90"
            >
              <Txt weight="bold" tone="white">
                Checkout
              </Txt>
              <Ionicons name="arrow-forward" size={17} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
