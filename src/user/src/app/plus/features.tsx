import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, IconTile, SectionHead, Txt, colors } from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { PlusHero, PlusNav, SavingsPanel } from "@/components/plus";
import { accents } from "@/lib/theme";
import { plusBenefits, plusReasons, plusSavings } from "@/lib/data";

/**
 * "Reditoe Plus Features" — reference 02_04_36. The only Plus mockup with its
 * own title: the eight-feature grid, the experience flow, estimated monthly
 * savings with a total, and the reassurance strip.
 */

const FLOW = [
  { id: "f1", title: "1. Order More", detail: "Order from your favorite restaurants.", icon: "bag-handle" as const, accent: "green" as const },
  { id: "f2", title: "2. Enjoy Benefits", detail: "Unlock exclusive benefits instantly.", icon: "ribbon" as const, accent: "purple" as const },
  { id: "f3", title: "3. Save More", detail: "Save more with every order you place.", icon: "wallet" as const, accent: "orange" as const },
  { id: "f4", title: "4. Happy You!", detail: "Better food, better deals, happier you!", icon: "heart" as const, accent: "blue" as const },
];

export default function PlusFeaturesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Reditoe Plus Features"
        subtitle="More than a membership, it's a smarter way to order!"
        right={<HeaderAction icon="headset-outline" label="Help" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <PlusHero />
        <PlusNav />

        <Txt size="lg" weight="bold" className="mb-3 px-4">
          Powerful Features for You
        </Txt>
        <View className="flex-row flex-wrap gap-3 px-4">
          {plusBenefits.map((benefit) => (
            <Card key={benefit.id} className="w-[48%] items-center p-3">
              <IconTile icon={benefit.icon} tint={accents[benefit.accent]} size={48} />
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
                <Txt size="micro" weight="bold" style={{ color: accents[benefit.accent].fg }}>
                  {benefit.tag}
                </Txt>
              </View>
            </Card>
          ))}
        </View>

        {/* Experience flow */}
        <Card className="mx-4 mt-6 p-4">
          <Txt size="lg" weight="bold">
            How Reditoe Plus Enhances Your Experience
          </Txt>
          <View className="mt-4 flex-row">
            {FLOW.map((step, index) => (
              <React.Fragment key={step.id}>
                {index > 0 && (
                  <View className="w-5 items-center pt-6">
                    <Ionicons name="arrow-forward" size={14} color={colors.ink.faint} />
                  </View>
                )}
                <View className="flex-1 items-center gap-1.5">
                  <IconTile icon={step.icon} tint={accents[step.accent]} size={48} />
                  <Txt
                    size="micro"
                    weight="bold"
                    style={{ color: accents[step.accent].fg }}
                    numberOfLines={2}
                    className="w-full text-center"
                  >
                    {step.title}
                  </Txt>
                  <Txt size="micro" tone="muted" numberOfLines={5} className="w-full text-center">
                    {step.detail}
                  </Txt>
                </View>
              </React.Fragment>
            ))}
          </View>
        </Card>

        <SectionHead
          title="See Your Estimated Monthly Savings"
          action="Calculate Again"
          tone="plus"
          onAction={() => router.push("/plus/combos")}
          className="mb-3 mt-6 px-4"
        />
        <SavingsPanel
          entries={plusSavings}
          total={{ figure: "₹3,140+", label: "Total Savings — every month" }}
          footnote="More you order, more you save!"
        />

        {/* Why choose */}
        <Txt size="lg" weight="bold" className="mb-3 mt-6 px-4">
          Why Choose Reditoe Plus?
        </Txt>
        <Card className="mx-4 flex-row py-4">
          {plusReasons.map((reason, index) => (
            <View
              key={reason.id}
              className={`flex-1 items-center gap-1.5 px-1 ${
                index > 0 ? "border-l border-line" : ""
              }`}
            >
              <IconTile icon={reason.icon} tint={accents[reason.accent]} size={38} />
              <Txt
                size="micro"
                weight="semibold"
                numberOfLines={3}
                className="w-full text-center"
              >
                {reason.label}
              </Txt>
            </View>
          ))}
        </Card>

        <View className="mx-4 mt-6 flex-row items-center gap-3 rounded-card border border-plus-200 bg-plus-50 px-3 py-4">
          <IconTile icon="ribbon" tint={accents.purple} size={44} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold">Unlock all premium features with Reditoe Plus</Txt>
            <Txt size="tiny" tone="muted">
              It's simple. It's smart. It's worth it.
            </Txt>
          </View>
          <Pressable
            onPress={() => router.push("/plus/membership")}
            className="flex-row items-center gap-1 rounded-tile bg-plus-600 px-3 py-2.5 active:opacity-90"
          >
            <Txt size="tiny" weight="bold" tone="white">
              Explore Plans
            </Txt>
            <Ionicons name="chevron-forward" size={12} color="#ffffff" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
