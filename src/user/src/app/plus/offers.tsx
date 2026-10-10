import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, SectionHead, Txt, colors } from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { Photo } from "@/components/photo";
import {
  PlusFaqs,
  PlusHero,
  PlusNav,
  PlusSteps,
  SavingsPanel,
} from "@/components/plus";
import { photoUri } from "@/lib/images";
import { memberOffers, plusFaqs, plusSavings, plusSteps } from "@/lib/data";
import { useStore } from "@/lib/store";

/**
 * "Reditoe Plus Benefits" — reference 02_04_29: the exclusive member offers
 * rail, the savings figures, how it works, and the FAQ list.
 */

export default function PlusOffersScreen() {
  const router = useRouter();
  const { restaurantById } = useStore();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Reditoe Plus Benefits"
        subtitle="Enjoy exclusive perks with Reditoe Plus"
        right={<HeaderAction icon="headset-outline" label="Help" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <PlusHero />
        <PlusNav />

        <SectionHead
          title="Exclusive Member Offers"
          action="View All Offers"
          tone="plus"
          onAction={() => router.push("/offers")}
          className="mb-3 px-4"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4"
        >
          {memberOffers.map((offer) => {
            const restaurant = restaurantById(offer.restaurantId);
            return (
              <Pressable
                key={offer.id}
                onPress={() => router.push(`/restaurant/${offer.restaurantId}` as never)}
                style={{ width: 170 }}
                className="active:opacity-80"
              >
                <Card className="overflow-hidden">
                  <Photo uri={photoUri(restaurant, 400, "pizza")} height={104} radius={0}>
                    <View className="absolute right-2 top-2 rounded-md bg-brand-600 px-1.5 py-0.5">
                      <Txt size="micro" weight="bold" tone="white">
                        {offer.badge}
                      </Txt>
                    </View>
                  </Photo>

                  <View className="items-center p-3">
                    <Txt size="sm" weight="bold" numberOfLines={1} className="w-full text-center">
                      {restaurant?.name ?? "Restaurant"}
                    </Txt>
                    <Txt size="tiny" tone="soft" numberOfLines={1} className="mt-0.5 w-full text-center">
                      {offer.title}
                    </Txt>
                    <Txt size="tiny" tone="muted" numberOfLines={1} className="w-full text-center">
                      {offer.detail}
                    </Txt>
                    <View className="mt-2 rounded-md bg-brand-50 px-4 py-1.5">
                      <Txt size="tiny" weight="bold" tone="brand">
                        Use Now
                      </Txt>
                    </View>
                  </View>

                  <View className="border-t border-line px-3 py-2">
                    <Txt size="micro" tone="muted" className="w-full text-center">
                      Valid till {offer.validTill}
                    </Txt>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </ScrollView>

        <SectionHead
          title="See how much you can save!"
          action="Calculate Savings"
          tone="plus"
          onAction={() => router.push("/plus/combos")}
          className="mb-3 mt-6 px-4"
        />
        <SavingsPanel
          entries={plusSavings}
          footnote="These are your all-time savings as a Reditoe Plus member"
        />

        <PlusSteps steps={plusSteps} />

        <SectionHead
          title="Frequently Asked Questions"
          action="View All FAQs"
          tone="plus"
          onAction={() => {}}
          className="mb-3 mt-6 px-4"
        />
        <PlusFaqs faqs={plusFaqs.slice(0, 4)} />

        <View className="mx-4 mt-6 flex-row items-center gap-3 rounded-card border border-plus-200 bg-plus-50 px-3 py-4">
          <Txt style={{ fontSize: 34 }}>🎉</Txt>
          <View className="min-w-0 flex-1">
            <Txt weight="bold">More perks coming your way!</Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              We add new benefits every month exclusively for Reditoe Plus members.
            </Txt>
          </View>
          <View className="flex-row items-center gap-1 rounded-tile border border-plus-500 px-3 py-2.5">
            <Txt size="tiny" weight="bold" tone="plus">
              See What's New
            </Txt>
            <Ionicons name="chevron-forward" size={12} color={colors.plus[600]} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
