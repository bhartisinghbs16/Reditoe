import React from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { IndigoHeader } from "@/components/screen-header";
import { Photo } from "@/components/photo";
import { ActionLink, Card, IconPlate, Txt, colors } from "@/components/ui";
import { img } from "@/lib/images";
import { useStore } from "@/lib/store";

/**
 * Settings — a copy of the reference more/settings screen: the indigo header,
 * the profile card overlapping it, then four grouped lists and the logout
 * action.
 */

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  meta?: string;
  /** Rows without a destination are inert until their screen exists. */
  href?: string;
}

function SettingsRow({ row, last }: { row: Row; last?: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={row.href ? () => router.push(row.href as never) : undefined}
      className={`flex-row items-center gap-3 px-3.5 py-3 active:opacity-70 ${
        last ? "" : "border-b border-line"
      }`}
    >
      <IconPlate icon={row.icon} tint="violet" size={38} shape="square" />
      <View className="min-w-0 flex-1">
        <Txt weight="semibold" numberOfLines={1}>
          {row.label}
        </Txt>
        <Txt size="tiny" tone="muted" numberOfLines={2}>
          {row.detail}
        </Txt>
      </View>
      {row.meta && (
        <Txt size="tiny" weight="semibold" tone="indigo">
          {row.meta}
        </Txt>
      )}
      <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
    </Pressable>
  );
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <Card className="mx-4 mt-3 overflow-hidden">
      <Txt size="lg" weight="bold" className="px-3.5 pb-2.5 pt-3.5">
        {title}
      </Txt>
      <View className="border-t border-line">
        {rows.map((row, index) => (
          <SettingsRow key={row.label} row={row} last={index === rows.length - 1} />
        ))}
      </View>
    </Card>
  );
}

function ProfileCard() {
  const { vendor } = useStore();

  return (
    <Card className="mx-4 -mt-8 flex-row items-center gap-3 p-3.5" raised>
      <View>
        <Photo uri={img(vendor.photo, 160)} width={62} height={62} radius={31} />
        <View className="absolute -bottom-0.5 -right-0.5 h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-indigo-600">
          <Ionicons name="camera" size={12} color="#ffffff" />
        </View>
      </View>

      <View className="min-w-0 flex-1">
        <Txt size="lg" weight="bold" numberOfLines={1}>
          {vendor.name}
        </Txt>
        <Txt size="tiny" tone="muted" numberOfLines={1}>
          {vendor.cuisines}
        </Txt>
        {vendor.verified && (
          <View className="mt-1.5 flex-row items-center gap-1 self-start rounded-chip bg-ok-soft px-2 py-1">
            <Ionicons name="checkmark-circle" size={12} color={colors.ok.default} />
            <Txt size="micro" weight="semibold" tone="ok">
              Verified
            </Txt>
          </View>
        )}
      </View>

      <ActionLink label="Edit Profile" accent="indigo" />
    </Card>
  );
}

export default function VendorMore() {
  const { vendor, offers, signOut } = useStore();
  const router = useRouter();

  const restaurant: Row[] = [
    {
      icon: "storefront-outline",
      label: "Restaurant Information",
      href: "/restaurant-info",
      detail: "Manage your restaurant details, address, cuisine, and more",
    },
    {
      icon: "time-outline",
      label: "Working Hours",
      href: "/working-hours",
      detail: `Currently ${vendor.hours}`,
    },
    {
      icon: "bicycle-outline",
      label: "Delivery Area",
      // This row promised radius management and led nowhere; the radius is
      // the setting that decides which customers may order at all.
      detail: "Set how far you deliver, and your restaurant's location",
      href: "/delivery-area",
    },
    {
      icon: "document-text-outline",
      label: "Order Settings",
      href: "/order-settings",
      detail: "Manage order acceptance, auto-accept, and order preferences",
    },
    {
      icon: "notifications-outline",
      label: "Notifications",
      href: "/notifications",
      detail: "Manage push notifications and in-app alerts",
    },
    /*
     * "Register New Outlet" is gone at the client's request. It pointed at
     * the sign-up form, which creates a whole new vendor account rather than
     * a second outlet under this one - so it never did what it said.
     */
  ];

  const marketing: Row[] = [
    {
      icon: "pricetag-outline",
      label: "Offers & Coupons",
      detail: "Create and manage offers, coupons, and promotions",
      meta: `${offers.filter((offer) => offer.status === "Active").length} Active`,
      href: "/offers",
    },
    {
      icon: "megaphone-outline",
      label: "Marketing Tools",
      href: "/offers",
      detail: "Banners, featured listings and promotional tools",
    },
    {
      icon: "gift-outline",
      label: "Loyalty Program",
      href: "/offers",
      detail: "Manage your loyalty program and rewards",
    },
  ];

  const money: Row[] = [
    {
      icon: "wallet-outline",
      label: "Payouts & Transactions",
      detail: "View payouts, settlements and transaction history",
      href: "/earnings",
    },
    {
      icon: "business-outline",
      label: "Bank Details",
      href: "/bank-details",
      detail: "Manage bank account and payout details",
    },
    {
      icon: "shield-checkmark-outline",
      label: "Documents",
      href: "/documents",
      detail: "Manage your KYC, FSSAI, PAN, GST and other documents",
    },
  ];

  const account: Row[] = [
    {
      icon: "person-outline",
      label: "Account Settings",
      href: "/account-settings",
      detail: "Change password, mobile number and email",
    },
    {
      icon: "lock-closed-outline",
      label: "Privacy & Security",
      href: "/privacy-security",
      detail: "Manage privacy settings and account security",
    },
    {
      icon: "help-circle-outline",
      label: "Help & Support",
      href: "/support",
      detail: "Message our team and track your requests",
    },
    {
      icon: "information-circle-outline",
      label: "About Reditoe Vendor",
      href: "/about",
      detail: "App version, terms & conditions and privacy policy",
    },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-indigo-900">
      <StatusBar style="light" />
      <ScrollView
        className="flex-1 bg-surface-sunken"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-8"
      >
        <IndigoHeader
          title="Settings"
          subtitle="Manage your restaurant account and preferences"
          leading="menu"
          overlap={26}
        />

        <ProfileCard />

        <Group title="Restaurant Settings" rows={restaurant} />
        <Group title="Offers & Marketing" rows={marketing} />
        <Group title="Payments & Documents" rows={money} />
        <Group title="Account & Support" rows={account} />

        {/*
          Logout. The button had no press handler at all, so the only way out
          of the account was to uninstall. Confirmed first: signing back in
          means waiting for a code.
        */}
        <Pressable
          accessibilityLabel="Logout"
          className="mx-4 mt-4 h-12 flex-row items-center justify-center gap-2 rounded-card border border-brand-100 bg-brand-50 active:opacity-70"
          onPress={() =>
            Alert.alert("Log out?", "You'll need to sign in again to manage orders.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Log out",
                style: "destructive",
                onPress: () => {
                  void signOut();
                  router.replace("/signin");
                },
              },
            ])
          }
        >
          <Ionicons name="log-out-outline" size={18} color={colors.brand[600]} />
          <Txt weight="bold" tone="brand">
            Logout
          </Txt>
        </Pressable>

        <Txt size="tiny" tone="faint" className="mt-2 text-center">
          Logged in as {vendor.email}
        </Txt>
      </ScrollView>
    </SafeAreaView>
  );
}
