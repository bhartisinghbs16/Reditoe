import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  HelpFooter,
  IconTile,
  SectionHead,
  Thumb,
  Txt,
  colors,
} from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { PlusHero, PlusNav, PlusShare, PlusTerms } from "@/components/plus";
import { accents } from "@/lib/theme";
import { membership, plusReviews, plusValuePoints } from "@/lib/data";

/**
 * "Reditoe Plus Benefits" — reference 02_04_34: the value strip, member
 * reviews, the order-more nudge and the membership details block.
 */

export default function PlusMembershipScreen() {
  const router = useRouter();

  const details = [
    { icon: "calendar-outline" as const, accent: "purple" as const, label: "Plan Type", value: membership.name, detail: membership.plan },
    { icon: "checkmark-circle-outline" as const, accent: "green" as const, label: "Member Since", value: membership.memberSince, detail: "10:30 AM" },
    { icon: "time-outline" as const, accent: "orange" as const, label: "Valid Till", value: membership.validTill, detail: "11:59 PM" },
    { icon: "refresh-outline" as const, accent: "blue" as const, label: "Auto Renewal", value: membership.autoRenewal ? "Enabled" : "Off", detail: `Renews on ${membership.validTill}` },
  ];

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
          How Reditoe Plus adds more value!
        </Txt>
        <Card className="mx-4 flex-row py-4">
          {plusValuePoints.map((point, index) => (
            <View
              key={point.id}
              className={`flex-1 items-center gap-1.5 px-1 ${
                index > 0 ? "border-l border-line" : ""
              }`}
            >
              <IconTile icon={point.icon} tint={accents[point.accent]} size={42} />
              <Txt
                size="micro"
                weight="bold"
                numberOfLines={2}
                className="w-full text-center"
              >
                {point.title}
              </Txt>
              <Txt size="micro" tone="muted" numberOfLines={3} className="w-full text-center">
                {point.detail}
              </Txt>
            </View>
          ))}
        </Card>

        {/* Reviews */}
        <SectionHead
          title="Members are loving Reditoe Plus ❤️"
          action="View All Reviews"
          tone="plus"
          onAction={() => {}}
          className="mb-3 mt-6 px-4"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4"
        >
          {plusReviews.map((review, index) => (
            <Card key={review.id} style={{ width: 224 }} className="p-3">
              <View className="flex-row items-center gap-2">
                <Thumb
                  label={review.name}
                  tint={accents[index === 0 ? "blue" : index === 1 ? "pink" : "green"]}
                  size={38}
                  radius={19}
                />
                <View className="min-w-0 flex-1">
                  <Txt size="sm" weight="bold" numberOfLines={1}>
                    {review.name}
                  </Txt>
                  <View className="flex-row">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Ionicons key={star} name="star" size={12} color={colors.sun[500]} />
                    ))}
                  </View>
                </View>
              </View>
              <Txt size="tiny" tone="soft" className="mt-2">
                “{review.quote}”
              </Txt>
            </Card>
          ))}
        </ScrollView>

        {/* Order more */}
        <View className="mx-4 mt-6 flex-row items-center gap-3 rounded-card bg-sun-50 px-3 py-4">
          <View className="min-w-0 flex-1">
            <Txt size="lg" weight="bold">
              The more you order, the more you save!
            </Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              Enjoy unlimited benefits and save big on every order.
            </Txt>
            <Pressable
              onPress={() => router.push("/")}
              className="mt-3 self-start rounded-tile bg-brand-600 px-4 py-2.5 active:opacity-90"
            >
              <Txt size="tiny" weight="bold" tone="white">
                Order Now
              </Txt>
            </Pressable>
          </View>
          <Txt style={{ fontSize: 40 }}>👑</Txt>
        </View>

        {/* Membership details */}
        <Card className="mx-4 mt-6 overflow-hidden">
          <Txt size="lg" weight="bold" className="px-4 pb-3 pt-4">
            Membership Details
          </Txt>

          <View className="flex-row border-y border-line py-3">
            {details.map((cell, index) => (
              <View
                key={cell.label}
                className={`flex-1 items-center gap-1 px-1 ${
                  index > 0 ? "border-l border-line" : ""
                }`}
              >
                <Ionicons name={cell.icon} size={20} color={accents[cell.accent].fg} />
                <Txt size="micro" tone="muted" numberOfLines={1} className="w-full text-center">
                  {cell.label}
                </Txt>
                <Txt
                  size="tiny"
                  weight="bold"
                  numberOfLines={2}
                  tone={cell.label === "Auto Renewal" ? "ok" : "default"}
                  className="w-full text-center"
                >
                  {cell.value}
                </Txt>
                <Txt size="micro" tone="muted" numberOfLines={2} className="w-full text-center">
                  {cell.detail}
                </Txt>
              </View>
            ))}
          </View>

          {/* "Manage Membership" sat here with no handler, offering to show
              the membership, payment and renewal details that this screen is
              already showing above it. */}
        </Card>

        <PlusShare />
        <PlusTerms />
        <HelpFooter
          title="Have any questions?"
          detail="Our support team is here to help you anytime."
          className="mx-4 mt-4"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
