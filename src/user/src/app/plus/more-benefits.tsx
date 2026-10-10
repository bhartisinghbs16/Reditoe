import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Divider, IconTile, SectionHead, Txt, colors } from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { PlusHero, PlusNav, SavingsPanel } from "@/components/plus";
import { accents } from "@/lib/theme";
import { plusBenefits, plusComparison, plusSavings } from "@/lib/data";

/**
 * "Reditoe Plus Benefits" — reference 02_04_31: the member benefits as a list
 * rather than a grid, the annual savings, and the Plus vs Regular table.
 */

export default function PlusMoreBenefitsScreen() {
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
          title="More Member Benefits"
          action="View All Benefits"
          tone="plus"
          onAction={() => {}}
          className="mb-3 px-4"
        />

        <Card className="mx-4 overflow-hidden">
          {plusBenefits.map((benefit, index) => (
            <React.Fragment key={benefit.id}>
              {index > 0 && <Divider />}
              {/* A description of a benefit, not a link: it had no handler,
                  and there is no screen behind an individual benefit. */}
              <View className="flex-row items-center gap-3 px-3 py-3.5">
                <IconTile icon={benefit.icon} tint={accents[benefit.accent]} size={44} />
                <View className="min-w-0 flex-1">
                  <Txt weight="bold">{benefit.title}</Txt>
                  <Txt size="tiny" tone="muted" numberOfLines={2} className="mt-0.5">
                    {benefit.detail}
                  </Txt>
                </View>
                <View
                  style={{ backgroundColor: accents[benefit.accent].bg }}
                  className="rounded-md px-2 py-1"
                >
                  <Txt
                    size="micro"
                    weight="bold"
                    style={{ color: accents[benefit.accent].fg }}
                  >
                    {benefit.tag}
                  </Txt>
                </View>
              </View>
            </React.Fragment>
          ))}
        </Card>

        <View className="mb-3 mt-6 flex-row items-end justify-between px-4">
          <Txt size="lg" weight="bold" tone="plus">
            Your Potential Annual Savings
          </Txt>
          <Txt size="tiny" tone="muted">
            Based on your order history
          </Txt>
        </View>
        <SavingsPanel entries={plusSavings} />

        {/* Plus vs Regular */}
        <Card className="mx-4 mt-6 p-4">
          <View className="flex-row items-start justify-between">
            <View className="min-w-0 flex-1">
              <Txt size="lg" weight="bold">
                Reditoe Plus vs Regular
              </Txt>
              <Txt size="tiny" tone="muted">
                See how much more you save with Plus
              </Txt>
            </View>
            {/* "See Comparison" had no handler, and the comparison it offered
                is the table immediately below. */}
          </View>

          <View className="mt-4 flex-row">
            <View className="flex-1" />
            <View className="w-[88px] items-center">
              <Txt size="tiny" tone="muted">
                Regular
              </Txt>
            </View>
            <View className="w-[88px] items-center">
              <View className="rounded-md bg-plus-600 px-2 py-0.5">
                <Txt size="micro" weight="bold" tone="white">
                  Plus
                </Txt>
              </View>
            </View>
          </View>

          {plusComparison.map((row, index) => (
            <View
              key={row.label}
              className={`flex-row items-center py-2.5 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <Txt size="tiny" tone="soft" className="min-w-0 flex-1">
                {row.label}
              </Txt>
              <Txt size="micro" tone="muted" className="w-[88px] text-center">
                {row.regular}
              </Txt>
              <Txt size="micro" weight="bold" tone="plus" className="w-[88px] text-center">
                {row.plus}
              </Txt>
            </View>
          ))}
        </Card>

        <View className="mx-4 mt-6 flex-row items-center gap-3 rounded-card border border-plus-200 bg-plus-50 px-3 py-4">
          <Txt style={{ fontSize: 32 }}>🎁</Txt>
          <View className="min-w-0 flex-1">
            <Txt weight="bold">Thank you for being a Reditoe Plus member!</Txt>
            <Txt size="tiny" tone="muted">
              We are glad to have you with us.
            </Txt>
          </View>
          <View className="flex-row items-center gap-1.5 rounded-tile bg-plus-600 px-3 py-2.5">
            <Ionicons name="share-social-outline" size={14} color="#ffffff" />
            <Txt size="tiny" weight="bold" tone="white">
              Share & Earn
            </Txt>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
