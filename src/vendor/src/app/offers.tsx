import React from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { IndigoHeader } from "@/components/screen-header";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  PromoBanner,
  SearchField,
  SelectButton,
  StatTile,
  Toggle,
  Txt,
  colors,
} from "@/components/ui";
import { currency, money } from "@/lib/format";
import { tints } from "@/lib/theme";
import { useStore, type Offer } from "@/lib/store";

/**
 * Offers & Coupons — a copy of the reference offers screen: the indigo header
 * with Create Offer, the four programme counters, the status tabs, and the
 * offer cards with their coupon tile, terms and usage.
 */

type Tab = "active" | "scheduled" | "expired" | "performance";

const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "active", label: "Active", icon: "pricetag-outline" },
  { id: "scheduled", label: "Scheduled", icon: "calendar-outline" },
  { id: "expired", label: "Expired", icon: "time-outline" },
  { id: "performance", label: "Performance", icon: "bar-chart-outline" },
];

/** The perforated coupon tile on the left of every offer card. */
function CouponTile({ offer }: { offer: Offer }) {
  const tint = tints[offer.tint];
  return (
    <View
      style={{ backgroundColor: tint.bg }}
      className="h-[68px] w-[68px] items-center justify-center rounded-tile"
    >
      <Txt size="lg" weight="bold" style={{ color: tint.fg }} numberOfLines={1}>
        {offer.badge}
      </Txt>
      <Txt size="micro" weight="bold" style={{ color: tint.fg }} numberOfLines={1}>
        {offer.badgeSub}
      </Txt>
    </View>
  );
}

function Term({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="min-w-[30%] flex-1 flex-row items-start gap-1.5">
      <Ionicons name={icon} size={13} color={colors.ink.muted} />
      <View className="min-w-0 flex-1">
        <Txt size="micro" tone="muted" numberOfLines={1}>
          {label}
        </Txt>
        <Txt size="micro" weight="semibold" numberOfLines={1}>
          {value}
        </Txt>
      </View>
    </View>
  );
}

function OfferCard({ offer }: { offer: Offer }) {
  const { toggleOffer } = useStore();
  const tint = tints[offer.tint];
  const tone =
    offer.status === "Active" ? "ok" : offer.status === "Scheduled" ? "warn" : "neutral";

  return (
    <Card className="overflow-hidden">
      <View style={{ backgroundColor: tint.fg }} className="absolute bottom-0 left-0 top-0 w-1" />

      {/* Two columns, as in the reference: the coupon and its terms on the
          left, how it has performed on the right. */}
      <View className="flex-row gap-3 p-3.5 pl-4">
        <View className="min-w-0 flex-1 gap-2.5">
          <View className="flex-row items-start gap-3">
            <CouponTile offer={offer} />

            <View className="min-w-0 flex-1">
              <Badge label={offer.status} tone={tone} />
              <Txt size="lg" weight="bold" className="mt-1.5" numberOfLines={1}>
                {offer.code}
              </Txt>
              <Txt size="tiny" tone="muted" numberOfLines={2}>
                {offer.description}
              </Txt>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-y-2">
            <Term icon="calendar-outline" label={offer.validityLabel} value={offer.validity} />
            <Term icon="time-outline" label="Time" value={offer.time} />
            <Term icon="person-outline" label="Min. Order" value={currency(offer.minOrder)} />
          </View>
        </View>

        <View className="w-[116px] gap-2 border-l border-line pl-3">
          {/* A coupon can be paused without expiring, so the switch is its
              own control rather than something behind the overflow menu. */}
          <View className="flex-row items-center justify-end gap-1">
            <Toggle
              value={offer.active}
              onValueChange={() => toggleOffer(offer.id)}
              accessibilityLabel={`${offer.active ? "Pause" : "Resume"} ${offer.code}`}
            />
            <IconButton icon="ellipsis-horizontal" tone="bare" size={26} />
          </View>

          {offer.startsIn ? (
            <>
              <Txt size="micro" tone="muted">
                Will be active in
              </Txt>
              <View className="flex-row gap-1">
                {[
                  { value: offer.startsIn.days, label: "Days" },
                  { value: offer.startsIn.hours, label: "Hrs" },
                  { value: offer.startsIn.mins, label: "Mins" },
                ].map((unit) => (
                  <View key={unit.label} className="flex-1 items-center">
                    <View className="w-full items-center rounded-tile border border-line bg-surface-sunken px-1 py-1">
                      <Txt size="sm" weight="bold" tone="indigo">
                        {String(unit.value).padStart(2, "0")}
                      </Txt>
                    </View>
                    <Txt size="micro" tone="muted">
                      {unit.label}
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              <View>
                <Txt size="micro" tone="muted">
                  Used
                </Txt>
                <Txt size="sm" weight="semibold">
                  {offer.used} times
                </Txt>
              </View>
              <View>
                <Txt size="micro" tone="muted">
                  Discount Given
                </Txt>
                <Txt size="sm" weight="semibold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {money(offer.discountGiven)}
                </Txt>
              </View>
              {/* "View Details" had no handler and no screen behind it; the
                  offer's redemptions and discount given are on this card. */}
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

/** The Performance tab — the offer-wise breakdown table of the reference. */
function Performance() {
  const { offers } = useStore();
  const ranked = [...offers].sort((a, b) => b.used - a.used);

  return (
    <Card className="mt-3 overflow-hidden">
      <Txt size="lg" weight="bold" className="px-3.5 pb-2.5 pt-3.5">
        Offer-wise Breakdown
      </Txt>

      <View className="flex-row gap-2 border-y border-line bg-surface-sunken px-3.5 py-2">
        <Txt size="micro" tone="muted" className="flex-[1.4]">
          Offer
        </Txt>
        <Txt size="micro" tone="muted" className="flex-1 text-right">
          Used
        </Txt>
        <Txt size="micro" tone="muted" className="flex-1 text-right">
          Discount
        </Txt>
      </View>

      {ranked.map((offer, index) => (
        <View
          key={offer.code}
          className={`flex-row items-center gap-2 px-3.5 py-2.5 ${
            index === ranked.length - 1 ? "" : "border-b border-line"
          }`}
        >
          <View className="flex-[1.4]">
            <Txt size="sm" weight="semibold" numberOfLines={1}>
              {offer.code}
            </Txt>
            <Badge
              label={offer.status}
              tone={
                offer.status === "Active" ? "ok" : offer.status === "Scheduled" ? "warn" : "neutral"
              }
            />
          </View>
          <Txt size="sm" className="flex-1 text-right">
            {offer.used}
          </Txt>
          <Txt size="sm" weight="medium" className="flex-1 text-right">
            {money(offer.discountGiven)}
          </Txt>
        </View>
      ))}
    </Card>
  );
}

export default function Offers() {
  const router = useRouter();
  const { offers, offerStats } = useStore();
  const [tab, setTab] = React.useState<Tab>("active");
  const [query, setQuery] = React.useState("");

  const counts = {
    active: offers.filter((o) => o.status === "Active").length,
    scheduled: offers.filter((o) => o.status === "Scheduled").length,
    expired: offers.filter((o) => o.status === "Expired").length,
  };

  const term = query.trim().toLowerCase();
  const visible = offers
    .filter((offer) =>
      tab === "active"
        ? offer.status === "Active"
        : tab === "scheduled"
          ? offer.status === "Scheduled"
          : tab === "expired"
            ? offer.status === "Expired"
            : true
    )
    .filter((offer) =>
      term
        ? offer.code.toLowerCase().includes(term) ||
          offer.description.toLowerCase().includes(term)
        : true
    );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-indigo-900">
      <StatusBar style="light" />
      <ScrollView
        className="flex-1 bg-surface-sunken"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-6"
      >
        <IndigoHeader
          title="Offers & Coupons"
          subtitle="Create and manage offers"
          leading="back"
          /* "Create Offer" in the reference — shortened so the title itself
             survives at phone width. */
          right={
            <Button
              label="Create"
              icon="add"
              variant="plain"
              size="sm"
              onPress={() => router.push("/offer/new")}
            />
          }
          overlap={22}
        />

        {/* Tabs sit on the card that overlaps the header, as in the reference. */}
        <Card className="mx-4 -mt-6 overflow-hidden" raised>
          <View className="flex-row">
            {TABS.map((entry) => {
              const active = entry.id === tab;
              const count =
                entry.id === "performance"
                  ? undefined
                  : counts[entry.id as "active" | "scheduled" | "expired"];
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => setTab(entry.id)}
                  style={{ borderBottomColor: active ? colors.indigo[600] : "transparent" }}
                  className="flex-1 items-center gap-1 border-b-2 px-1 pb-2.5 pt-3 active:opacity-70"
                >
                  <Ionicons
                    name={entry.icon}
                    size={16}
                    color={active ? colors.indigo[600] : colors.ink.muted}
                  />
                  <Txt
                    size="micro"
                    weight={active ? "semibold" : "medium"}
                    tone={active ? "indigo" : "muted"}
                    numberOfLines={1}
                  >
                    {count === undefined ? entry.label : `${entry.label} (${count})`}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* One row of four, as in the reference. These wrapped into a 2x2
            block before, which is the "should be side by side" note. */}
        <View className="mt-3 flex-row gap-1.5 px-4">
          <StatTile
            icon="pricetag-outline"
            tint="violet"
            label="Active Offers"
            value={String(counts.active)}
            footnote="Running now"
            filled
            compact
            className="flex-1"
          />
          <StatTile
            icon="ticket-outline"
            tint="green"
            label="Total Coupons Used"
            value={String(offerStats.couponsUsed)}
            footnote="This Month"
            filled
            compact
            className="flex-1"
          />
          <StatTile
            icon="cash-outline"
            tint="amber"
            label="Discount Given"
            value={money(offerStats.discountGiven)}
            footnote="This Month"
            filled
            compact
            className="flex-1"
          />
          <StatTile
            icon="trending-up-outline"
            tint="blue"
            label="Revenue from Offers"
            value={money(offerStats.revenueFromOffers)}
            footnote="This Month"
            filled
            compact
            className="flex-1"
          />
        </View>

        {tab === "performance" ? (
          <View className="px-4">
            <Performance />
          </View>
        ) : (
          <>
            <View className="mt-3 flex-row gap-2.5 px-4">
              <SearchField
                placeholder="Search offers by name or code"
                value={query}
                onChangeText={setQuery}
                className="flex-1"
              />
              <SelectButton label="All Offers" className="h-11 w-[118px]" />
            </View>

            <View className="mt-3 gap-2.5 px-4">
              {visible.length === 0 ? (
                <EmptyState
                  icon="pricetag-outline"
                  title="No offers here"
                  detail="Nothing matches this tab or search."
                  action="Create Offer"
                  accent="indigo"
                  onAction={() => router.push("/offer/new")}
                />
              ) : (
                visible.map((offer) => <OfferCard key={offer.code} offer={offer} />)
              )}
            </View>
          </>
        )}

        {/* "Ideas" led nowhere and there is no such page; it makes an offer. */}
        <PromoBanner
          title="Boost your sales with offers!"
          detail="Well planned offers help you get more customers and increase sales."
          action="Create one"
          onAction={() => router.push("/offer/new")}
          accent="indigo"
          icon="bulb"
          className="mx-4 mt-3"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
