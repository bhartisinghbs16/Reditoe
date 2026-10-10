import React from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, HelpFooter, IconTile, Txt } from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import {
  PlusHero,
  PlusNav,
  PlusSteps,
  PlusTerms,
} from "@/components/plus";
import { accents } from "@/lib/theme";
import { plusBenefits, plusSteps } from "@/lib/data";

/**
 * "Reditoe Plus Benefits" — reference 02_04_27.
 *
 * The benefit grid and the four-step explainer. The other five Plus mockups
 * are their own screens under this route.
 */

export default function PlusBenefitsScreen() {
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

        <Txt size="lg" weight="bold" className="mb-3 px-4">
          Top Benefits
        </Txt>
        <View className="flex-row flex-wrap gap-3 px-4">
          {plusBenefits.slice(0, 6).map((benefit) => (
            <Card key={benefit.id} className="w-[48%] items-center p-3">
              <IconTile icon={benefit.icon} tint={accents[benefit.accent]} size={52} />
              <Txt
                size="sm"
                weight="bold"
                numberOfLines={2}
                className="mt-2 w-full text-center"
              >
                {benefit.title}
              </Txt>
              <Txt
                size="micro"
                tone="muted"
                numberOfLines={3}
                className="mt-1 h-11 w-full text-center"
              >
                {benefit.detail}
              </Txt>
              <View
                style={{ backgroundColor: accents[benefit.accent].bg }}
                className="mt-1 rounded-md px-2 py-1"
              >
                <Txt
                  size="micro"
                  weight="bold"
                  style={{ color: accents[benefit.accent].fg }}
                >
                  {benefit.tag}
                </Txt>
              </View>
            </Card>
          ))}
        </View>

        {/* More perks */}
        <View className="mx-4 mt-6 flex-row items-center gap-3 rounded-card bg-brand-50 px-3 py-4">
          <Txt style={{ fontSize: 34 }}>🎁</Txt>
          <View className="min-w-0 flex-1">
            <Txt weight="bold">More perks, more savings!</Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              We keep adding new benefits every month just for our Plus members.
            </Txt>
          </View>
          <View className="rounded-tile border border-brand-500 px-3 py-2.5">
            <Txt size="tiny" weight="bold" tone="brand">
              See What's New
            </Txt>
          </View>
        </View>

        <PlusSteps steps={plusSteps} />
        <PlusTerms />
        <HelpFooter
          detail="Our support team is here to help you with Reditoe Plus."
          className="mx-4 mt-4"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
