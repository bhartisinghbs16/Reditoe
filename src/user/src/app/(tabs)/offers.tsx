import React from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, IconTile, SectionHead, Txt, colors } from "@/components/ui";
import { HeaderAction } from "@/components/screen-header";
import { LinearGradient } from "@/components/photo";
import { megaOffer, offerGroups, offerSteps } from "@/lib/data";
import { accents } from "@/lib/theme";
import { currency, date } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Offer } from "@/lib/data";

/**
 * "Offers & Coupons", copied from the reference: the code field, the mega
 * savings banner, the circular category row, the perforated coupon tickets and
 * the four-step explainer at the foot.
 */

/** A coupon ticket — tinted stub, perforation, then the detail and Apply. */
function CouponTicket({
  offer,
  applied,
  onApply,
  onRemove,
}: {
  offer: Offer;
  applied: boolean;
  onApply: () => void;
  onRemove: () => void;
}) {
  const tint = accents[offer.accent];

  return (
    <View className="mx-4 mb-3 flex-row overflow-hidden rounded-card">
      {/* Stub */}
      <View
        style={{ backgroundColor: tint.bg }}
        className="w-[88px] items-center justify-center px-1 py-5"
      >
        {offer.lead ? (
          <Txt size="tiny" weight="bold" style={{ color: tint.fg }}>
            {offer.lead}
          </Txt>
        ) : null}
        <Txt weight="bold" style={{ color: tint.fg }} className="text-2xl">
          {offer.figure}
        </Txt>
        <Txt size="tiny" weight="bold" style={{ color: tint.fg }}>
          {offer.trail}
        </Txt>
      </View>

      {/* Perforation — two notches and a dashed seam, as the reference draws. */}
      <View className="w-0">
        <View
          style={{ backgroundColor: "#ffffff" }}
          className="absolute -left-2 -top-2 h-4 w-4 rounded-full"
        />
        <View
          style={{ backgroundColor: "#ffffff" }}
          className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full"
        />
      </View>

      <View
        style={{ backgroundColor: `${tint.bg}80` }}
        className="min-w-0 flex-1 flex-row items-center gap-2 p-3"
      >
        <View className="min-w-0 flex-1">
          <Txt size="sm" weight="bold" numberOfLines={2}>
            {offer.title}
          </Txt>
          <Txt size="tiny" tone="muted" numberOfLines={2}>
            {offer.detail}
          </Txt>

          <View className="mt-2 flex-row items-center gap-1.5 self-start rounded-md border border-line bg-white px-2 py-1">
            <Txt size="micro" weight="semibold" tone="muted">
              Code:{" "}
              <Txt size="micro" weight="bold" style={{ color: tint.fg }}>
                {offer.code}
              </Txt>
            </Txt>
            <Ionicons name="copy-outline" size={12} color={colors.ink.faint} />
          </View>

          <Txt size="micro" tone="muted" className="mt-1.5">
            Valid till {date(offer.expiresOn)}
          </Txt>
        </View>

        <View className="items-end gap-2">
          <Pressable
            onPress={applied ? onRemove : onApply}
            className={`h-9 items-center justify-center rounded-tile border px-4 active:opacity-70 ${
              applied ? "border-leaf-600 bg-leaf-50" : "border-brand-500 bg-white"
            }`}
          >
            <Txt size="sm" weight="bold" tone={applied ? "ok" : "brand"}>
              {applied ? "Applied" : "Apply"}
            </Txt>
          </Pressable>
          <Txt size="micro" weight="semibold" tone="info">
            T&C
          </Txt>
        </View>
      </View>
    </View>
  );
}

export default function OffersScreen() {
  const router = useRouter();
  const { applyOffer, appliedOffer, itemCount, offers } = useStore();
  const [group, setGroup] = React.useState<string>("all");
  const [code, setCode] = React.useState("");

  const shown = offers.filter((offer) => group === "all" || offer.group === group);

  const apply = (offer: Offer) => {
    applyOffer(offer);
    if (itemCount > 0) router.push("/cart");
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <View className="flex-row items-center gap-3 bg-surface px-4 pb-3 pt-2">
        <View className="min-w-0 flex-1">
          <Txt size="2xl" weight="bold">
            Offers & Coupons
          </Txt>
          <Txt size="tiny" tone="muted">
            Save more on every order
          </Txt>
        </View>
        <HeaderAction icon="ticket-outline" label="My Coupons" />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName={itemCount > 0 ? "pb-28" : "pb-8"}
      >
        {/* Coupon code */}
        <Card className="mx-4 flex-row items-center gap-3 p-3">
          <IconTile icon="pricetag" tint={accents.red} size={40} square />
          <View className="min-w-0 flex-1">
            <Txt size="tiny" tone="muted">
              Have a coupon code?
            </Txt>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Enter code here"
              placeholderTextColor={colors.ink.faint}
              autoCapitalize="characters"
              className="h-7 p-0 text-[15px] font-semibold text-ink"
            />
          </View>
          <Pressable
            onPress={() => {
              const match = offers.find(
                (o) => o.code.toLowerCase() === code.trim().toLowerCase()
              );
              if (match) apply(match);
            }}
            className="h-11 items-center justify-center rounded-tile border border-brand-500 px-5 active:opacity-70"
          >
            <Txt weight="bold" tone="brand">
              Apply
            </Txt>
          </Pressable>
        </Card>

        {/* Mega savings banner */}
        <View className="mx-4 mt-4 overflow-hidden rounded-card">
          <LinearGradient
            colors={["#c20d24", "#e8112d", "#f0552b"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 18 }}
          >
            <Txt size="sm" weight="bold" className="text-sun-300">
              {megaOffer.kicker}
            </Txt>
            <Txt size="2xl" weight="bold" tone="white" className="mt-1">
              {megaOffer.headline}
            </Txt>
            <Txt tone="white" className="mt-0.5 opacity-90">
              {megaOffer.sub}
            </Txt>

            <View className="mt-3 self-start rounded-lg border border-dashed border-white/70 px-3 py-2">
              <Txt size="tiny" weight="bold" tone="white">
                USE CODE:{" "}
                <Txt size="tiny" weight="bold" className="text-sun-300">
                  {megaOffer.code}
                </Txt>
              </Txt>
            </View>

            <View className="mt-3 flex-row gap-1.5">
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  className={`h-1.5 rounded-full ${i === 0 ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                />
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* Categories */}
        <Card className="mx-4 mt-4 px-1 py-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-1 px-2"
          >
            {offerGroups.map((entry) => {
              const active = group === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => setGroup(entry.id)}
                  className="w-[74px] items-center gap-1.5 active:opacity-70"
                >
                  <IconTile icon={entry.icon} tint={accents[entry.accent]} size={46} />
                  <Txt
                    size="micro"
                    weight="semibold"
                    tone={active ? "brand" : "soft"}
                    numberOfLines={1}
                  >
                    {entry.label}
                  </Txt>
                  <View
                    className={`h-[3px] w-8 rounded-full ${
                      active ? "bg-brand-600" : "bg-transparent"
                    }`}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </Card>

        {/* Coupons */}
        <SectionHead
          title="Best Offers for You"
          onAction={() => setGroup("all")}
          className="mb-3 mt-6 px-4"
        />

        {shown.map((offer) => (
          <CouponTicket
            key={offer.id}
            offer={offer}
            applied={appliedOffer?.id === offer.id}
            onApply={() => apply(offer)}
            onRemove={() => applyOffer(null)}
          />
        ))}

        {/* How to apply */}
        <Card className="mx-4 mt-3 p-4">
          <Txt weight="bold">How to apply offers?</Txt>
          <View className="mt-4 flex-row">
            {offerSteps.map((step, index) => (
              <React.Fragment key={step.label}>
                {index > 0 && (
                  <View className="w-4 items-center pt-4">
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={colors.ink.faint}
                    />
                  </View>
                )}
                <View className="flex-1 items-center gap-1.5">
                  <IconTile icon={step.icon} tint={accents[step.accent]} size={44} />
                  <Txt
                    size="micro"
                    tone="soft"
                    numberOfLines={3}
                    className="text-center"
                  >
                    {step.label}
                  </Txt>
                  <View
                    style={{ backgroundColor: accents[step.accent].fg }}
                    className="h-5 w-5 items-center justify-center rounded-full"
                  >
                    <Txt size="micro" weight="bold" tone="white">
                      {index + 1}
                    </Txt>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        </Card>

        <View className="mx-4 mt-4 flex-row items-center gap-2 rounded-card bg-surface-sunken px-3 py-3">
          <Ionicons name="information-circle-outline" size={17} color={colors.ink.muted} />
          <Txt size="tiny" tone="muted" className="flex-1">
            One coupon applies per order. Discounts come off the item total before
            taxes; free-delivery codes waive the fee instead. Minimum order{" "}
            {currency(offers[0].minOrder)} and above.
          </Txt>
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}
