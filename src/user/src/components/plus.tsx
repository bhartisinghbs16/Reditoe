import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { IconTile, Note, OutlineBadge, Txt, colors } from "@/components/ui";
import { accents } from "@/lib/theme";
import { membership, plusScreens } from "@/lib/data";
import { shareReferral } from "@/lib/referral";

/**
 * The blocks every Reditoe Plus screen repeats.
 *
 * The reference draws six Plus screens and each one opens with the same purple
 * membership card and closes on the same T&C line, so they live here rather
 * than being copied six times.
 */

/** The purple membership card at the top of every Plus screen. */
export function PlusHero() {
  return (
    <View className="mx-4 mt-1 flex-row items-center gap-3 rounded-card border border-plus-200 bg-plus-50 p-4">
      <IconTile icon="ribbon" tint={accents.purple} size={62} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Txt size="xl" weight="bold" numberOfLines={1} className="min-w-0 flex-shrink">
            {membership.name}
          </Txt>
          <OutlineBadge label={membership.active ? "Active" : "Inactive"} tone="ok" />
        </View>
        <Txt size="sm" tone="soft" className="mt-0.5">
          {membership.tagline}
        </Txt>
        <Txt size="sm" weight="bold" tone="ok" className="mt-0.5">
          Valid till {membership.validTill}
        </Txt>
      </View>
      <Ionicons name="gift" size={46} color={colors.plus[500]} />
    </View>
  );
}

/**
 * Moves between the six Plus screens. The reference has no such control — each
 * mockup is a standalone page — but without one the other five are unreachable.
 */
export function PlusNav() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4 py-3"
    >
      {plusScreens.map((screen) => {
        const active = pathname === screen.href;
        return (
          <Pressable
            key={screen.href}
            onPress={() => router.push(screen.href as never)}
            className={`h-9 items-center justify-center rounded-pill border px-3.5 active:opacity-70 ${
              active ? "border-plus-500 bg-plus-50" : "border-line bg-surface"
            }`}
          >
            <Txt size="tiny" weight="bold" tone={active ? "plus" : "muted"}>
              {screen.label}
            </Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The amber non-refundable note every Plus screen closes on. */
export function PlusTerms() {
  return (
    <View className="mx-4 mt-4">
      <Note
        icon="information-circle"
        tone="warn"
        title="Reditoe Plus is non-refundable and valid till the end date."
        action="T&C Apply"
      />
    </View>
  );
}

/** The purple "share and earn" strip. */
export function PlusShare() {
  return (
    <View className="mx-4 mt-4 flex-row items-center gap-3 rounded-card border border-plus-200 bg-plus-50 px-3 py-3.5">
      <IconTile icon="gift" tint={accents.purple} size={44} />
      <View className="min-w-0 flex-1">
        <Txt weight="bold">Share Reditoe Plus & Earn!</Txt>
        <Txt size="tiny" tone="muted" numberOfLines={2}>
          Invite your friends to Reditoe and earn exciting rewards.
        </Txt>
      </View>
      <Pressable
        onPress={shareReferral}
        accessibilityLabel="Invite friends to Reditoe"
        className="flex-row items-center gap-1 rounded-tile border border-plus-500 px-3 py-2.5 active:opacity-70"
      >
        <Txt size="tiny" weight="bold" tone="plus">
          Invite Now
        </Txt>
        <Ionicons name="chevron-forward" size={12} color={colors.plus[600]} />
      </Pressable>
    </View>
  );
}

/** A row of figures over a pale green panel — the savings block. */
export function SavingsPanel({
  entries,
  footnote,
  total,
}: {
  entries: readonly {
    id: string;
    figure: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    accent: keyof typeof accents;
  }[];
  footnote?: string;
  total?: { figure: string; label: string };
}) {
  return (
    <View className="mx-4 rounded-card bg-leaf-50 py-4">
      <View className="flex-row">
        {entries.map((entry, index) => (
          <View
            key={entry.id}
            className={`flex-1 items-center gap-1.5 px-1 ${
              index > 0 ? "border-l border-leaf-100" : ""
            }`}
          >
            <IconTile icon={entry.icon} tint={accents[entry.accent]} size={40} />
            <Txt
              size="sm"
              weight="bold"
              style={{ color: accents[entry.accent].fg }}
              numberOfLines={1}
              className="w-full text-center"
            >
              {entry.figure}
            </Txt>
            <Txt size="micro" tone="muted" numberOfLines={3} className="w-full text-center">
              {entry.label}
            </Txt>
          </View>
        ))}
      </View>

      {total && (
        <View className="mx-3 mt-3 items-center rounded-card bg-white py-3">
          <Txt size="sm" weight="semibold" tone="ok">
            {total.label}
          </Txt>
          <Txt size="2xl" weight="bold" tone="ok">
            {total.figure}
          </Txt>
        </View>
      )}

      {footnote && (
        <View className="mt-3 flex-row items-center justify-center gap-1.5 px-3">
          <Ionicons name="star" size={13} color={colors.leaf[600]} />
          <Txt size="tiny" weight="semibold" tone="ok" className="flex-1">
            {footnote}
          </Txt>
        </View>
      )}
    </View>
  );
}

/** The four-step "How Reditoe Plus Works" card. */
export function PlusSteps({
  steps,
  title = "How Reditoe Plus Works",
}: {
  steps: readonly {
    id: string;
    title: string;
    detail: string;
    icon: keyof typeof Ionicons.glyphMap;
    accent: keyof typeof accents;
  }[];
  title?: string;
}) {
  return (
    <View className="mx-4 mt-6 rounded-card border border-line bg-surface p-4">
      <Txt size="lg" weight="bold">
        {title}
      </Txt>
      <View className="mt-4 flex-row">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            {index > 0 && (
              <View className="w-5 items-center pt-6">
                <View className="h-px w-full border-t border-dashed border-line-strong" />
              </View>
            )}
            <View className="flex-1 items-center gap-1.5">
              <IconTile icon={step.icon} tint={accents[step.accent]} size={50} />
              <Txt
                size="micro"
                weight="bold"
                style={{ color: accents[step.accent].fg }}
                numberOfLines={2}
                className="w-full text-center"
              >
                {step.title}
              </Txt>
              <Txt size="micro" tone="muted" numberOfLines={3} className="w-full text-center">
                {step.detail}
              </Txt>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

/** The FAQ accordion. */
export function PlusFaqs({ faqs }: { faqs: readonly string[] }) {
  const [open, setOpen] = React.useState<string | null>(null);

  return (
    <View className="mx-4 overflow-hidden rounded-card border border-line bg-surface">
      {faqs.map((faq, index) => {
        const isOpen = open === faq;
        return (
          <React.Fragment key={faq}>
            {index > 0 && <View className="h-px bg-line" />}
            <Pressable
              onPress={() => setOpen(isOpen ? null : faq)}
              className="px-3 py-3.5 active:opacity-70"
            >
              <View className="flex-row items-center gap-2">
                <Txt size="sm" className="min-w-0 flex-1">
                  {faq}
                </Txt>
                <Ionicons
                  name={isOpen ? "chevron-down" : "chevron-forward"}
                  size={16}
                  color={colors.ink.faint}
                />
              </View>
              {isOpen && (
                <Txt size="tiny" tone="muted" className="mt-2">
                  Reditoe Plus is a paid membership that waives delivery fees, unlocks
                  member-only discounts and coupons, and puts you at the front of the
                  support queue. It renews monthly and can be cancelled at any time from
                  Manage Membership.
                </Txt>
              )}
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}
