import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, IconTile, SectionHead, Txt, colors } from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { Photo } from "@/components/photo";
import { PlusFaqs, PlusHero, PlusNav, PlusTerms, SavingsPanel } from "@/components/plus";
import { img } from "@/lib/images";
import { accents } from "@/lib/theme";
import { memberCombos, plusFaqs, plusSavings } from "@/lib/data";

/**
 * "Reditoe Plus Benefits" — reference 02_04_32: monthly savings, the member
 * only combo rail, the FAQ list and the renewal prompts.
 */

export default function PlusCombosScreen() {
  const router = useRouter();

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

        <View className="mb-3 flex-row items-end justify-between px-4">
          <Txt size="lg" weight="bold">
            How much you save every month!
          </Txt>
          <View className="flex-row items-center gap-1">
            <Txt size="tiny" tone="muted">
              Based on your usage
            </Txt>
            <Ionicons name="information-circle-outline" size={13} color={colors.ink.faint} />
          </View>
        </View>
        <SavingsPanel entries={plusSavings} />

        <SectionHead
          title="Member Only Combos"
          action="View All Combos"
          tone="plus"
          onAction={() => router.push("/offers")}
          className="mb-3 mt-6 px-4"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4"
        >
          {memberCombos.map((combo) => (
            <Pressable
              key={combo.id}
              onPress={() => router.push("/offers")}
              style={{ width: 168 }}
              className="active:opacity-80"
            >
              <Card className="overflow-hidden">
                <Photo uri={img(combo.photo, 400)} height={106} radius={0}>
                  <View
                    style={{ backgroundColor: accents[combo.accent].fg }}
                    className="absolute right-2 top-2 rounded-md px-1.5 py-0.5"
                  >
                    <Txt size="micro" weight="bold" tone="white">
                      {combo.badge}
                    </Txt>
                  </View>
                </Photo>

                <View className="items-center p-3">
                  <Txt size="sm" weight="bold" numberOfLines={1} className="w-full text-center">
                    {combo.name}
                  </Txt>
                  <Txt
                    size="tiny"
                    weight="semibold"
                    tone="ok"
                    numberOfLines={1}
                    className="mt-0.5 w-full text-center"
                  >
                    {combo.price}
                  </Txt>
                  <Txt size="micro" tone="muted" numberOfLines={2} className="w-full text-center">
                    {combo.tag}
                  </Txt>
                </View>

                <View className="flex-row items-center justify-center gap-1 border-t border-line py-2.5">
                  <Txt size="tiny" weight="bold" tone="brand">
                    Use Now
                  </Txt>
                  <Ionicons name="chevron-forward" size={12} color={colors.brand[600]} />
                </View>
              </Card>
            </Pressable>
          ))}
        </ScrollView>

        <SectionHead
          title="Frequently Asked Questions"
          action="View All FAQs"
          tone="plus"
          onAction={() => {}}
          className="mb-3 mt-6 px-4"
        />
        <PlusFaqs faqs={plusFaqs} />

        {/* Renewal prompt */}
        <View className="mx-4 mt-6 flex-row items-center gap-3 rounded-card border border-plus-200 bg-plus-50 px-3 py-4">
          <IconTile icon="calendar" tint={accents.purple} size={44} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold">Don't miss out!</Txt>
            <Txt size="tiny" tone="muted" numberOfLines={2}>
              Your Reditoe Plus membership is active. Keep ordering and enjoy unlimited
              benefits.
            </Txt>
          </View>
          <Pressable
            onPress={() => router.push("/plus/membership")}
            className="rounded-tile border border-plus-500 px-3 py-2.5 active:opacity-70"
          >
            <Txt size="tiny" weight="bold" tone="plus">
              Manage Membership
            </Txt>
          </Pressable>
        </View>

        <PlusTerms />

        <View className="mx-4 mt-4 flex-row items-center gap-3 rounded-card border border-plus-200 bg-plus-50 px-3 py-4">
          <IconTile icon="ribbon" tint={accents.purple} size={44} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold">Upgrade your experience!</Txt>
            <Txt size="tiny" tone="muted" numberOfLines={2}>
              You are enjoying the best of Reditoe. Keep saving more with Reditoe Plus.
            </Txt>
          </View>
          <Pressable
            onPress={() => router.push("/offers")}
            className="rounded-tile bg-plus-600 px-3 py-2.5 active:opacity-90"
          >
            <Txt size="tiny" weight="bold" tone="white">
              Explore More Offers
            </Txt>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
