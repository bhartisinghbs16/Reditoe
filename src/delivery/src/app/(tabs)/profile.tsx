import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Badge,
  Button,
  Card,
  Divider,
  IconPlate,
  LinkRow,
  Panel,
  Rating,
  StatCell,
  Txt,
  colors,
} from "@/components/ui";
import { AppBar } from "@/components/screen-header";
import { Avatar } from "@/components/partner-card";
import { DutyPill } from "@/components/ui";
import { money } from "@/lib/format";
import type { TintName } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { useSession } from "@/lib/session";

/**
 * Profile, reproduced from the reference: the identity card, the wallet
 * summary, the account menu, the performance strip, the referral card and the
 * logout row with the app version beneath it.
 */

const MENU: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: TintName;
  title: string;
  detail: string;
  href: string;
}[] = [
  {
    icon: "person-outline",
    tint: "green",
    title: "Personal Information",
    detail: "Name, Phone, Email, DOB",
    href: "/personal-information",
  },
  {
    icon: "document-text-outline",
    tint: "blue",
    title: "Documents",
    detail: "Aadhaar, PAN, Driving License, RC etc.",
    href: "/documents",
  },
  {
    icon: "business-outline",
    tint: "violet",
    title: "Bank Details",
    detail: "Bank account, IFSC, UPI ID",
    href: "/payout-summary",
  },
  {
    icon: "call-outline",
    tint: "orange",
    title: "Emergency Contact",
    detail: "Add or update emergency contact",
    // Its own screen. This opened Personal Information, which shows the whole
    // account with the emergency details as one card among several.
    href: "/emergency-contact",
  },
  {
    icon: "bicycle-outline",
    tint: "green",
    title: "Vehicle Details",
    detail: "Bike details, RC, Insurance",
    // This opened the full Documents list, so there was nowhere to see the
    // vehicle itself - only the papers, mixed in with the rider's own.
    href: "/vehicle",
  },
  {
    icon: "settings-outline",
    tint: "blue",
    title: "Settings",
    detail: "App language, Notifications, Privacy",
    href: "/settings",
  },
  {
    icon: "headset-outline",
    tint: "red",
    title: "Help & Support",
    detail: "FAQs, Contact us, Raise a ticket",
    href: "/support",
  },
];

function IdentityCard() {
  const router = useRouter();
  const { rider, online, setOnline } = useStore();

  return (
    <Card className="flex-row items-center gap-3 p-4">
      <Avatar size={72} badge="camera" />

      <View className="min-w-0 flex-1">
        <Txt size="xl" weight="bold" numberOfLines={1}>
          {rider.name}
        </Txt>
        <Badge
          label="Verified Partner"
          tone="ok"
          icon="shield-checkmark"
          className="mt-1"
        />
        <View className="mt-1">
          <Rating value={rider.rating} count={rider.totalOrders} />
        </View>
        <View className="mt-1 flex-row items-center gap-1.5">
          <Ionicons name="ribbon" size={13} color={colors.info.default} />
          <Txt size="tiny" weight="semibold" tone="info">
            {rider.tier}
          </Txt>
        </View>
      </View>

      <View className="items-end gap-1.5">
        <DutyPill online={online} onPress={() => setOnline(!online)} compact />
        <Txt size="micro" tone="muted">
          Partner ID
        </Txt>
        <View className="flex-row items-center gap-1">
          <Txt size="tiny" weight="bold">
            {rider.id}
          </Txt>
          <Ionicons name="copy-outline" size={13} color={colors.ink.faint} />
        </View>
      </View>

      <Pressable onPress={() => router.push("/personal-information")} hitSlop={8}>
        <Ionicons name="chevron-forward" size={18} color={colors.ink.faint} />
      </Pressable>
    </Card>
  );
}

function WalletCard() {
  const router = useRouter();
  const { wallet } = useStore();

  const cells = [
    { icon: "wallet" as const, tint: "green" as const, label: "Today's Earnings", value: money(wallet.today.amount) },
    { icon: "calendar" as const, tint: "blue" as const, label: "This Week", value: money(wallet.week.amount) },
    { icon: "calendar-number" as const, tint: "violet" as const, label: "This Month", value: money(wallet.month.amount) },
    { icon: "gift" as const, tint: "amber" as const, label: "Total Incentives", value: money(wallet.incentivesTotal) },
  ];

  return (
    <Card className="overflow-hidden">
      <View className="flex-row items-center justify-between gap-3 p-4">
        <View className="min-w-0 flex-1">
          <Txt weight="semibold">Wallet Balance</Txt>
          <Txt size="2xl" weight="bold" tone="green" className="mt-1" numberOfLines={1}>
            {money(wallet.balance)}
          </Txt>
        </View>
        <Button
          label="View Wallet"
          variant="outline"
          icon="wallet-outline"
          iconRight="chevron-forward"
          size="sm"
          onPress={() => router.push("/earnings")}
        />
      </View>

      <Divider />

      <View className="flex-row px-2 py-4">
        {cells.map((cell, index) => (
          <StatCell key={cell.label} {...cell} valueSize="sm" divided={index > 0} />
        ))}
      </View>
    </Card>
  );
}

export default function Profile() {
  const router = useRouter();
  const { rider, performance, unread } = useStore();
  const { signOut } = useSession();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8">
        <AppBar title="Profile" trailing="bell"
          notifications={unread}
          onTrailing={() => router.push("/notifications")}
        />

        <View className="gap-3.5 px-4 pt-3.5">
          <IdentityCard />
          <WalletCard />

          <Card className="overflow-hidden">
            {MENU.map((row, index) => (
              <View key={row.title}>
                {index > 0 && <Divider className="ml-16" />}
                <LinkRow
                  icon={row.icon}
                  tint={row.tint}
                  title={row.title}
                  detail={row.detail}
                  onPress={() => router.push(row.href as never)}
                />
              </View>
            ))}
          </Card>

          <Panel
            title="My Performance"
            action="View Details"
            bodyClassName="flex-row px-2 pb-4"
          >
            {performance.map((row, index) => (
              <StatCell
                key={row.label}
                icon={row.icon}
                tint={row.tint}
                value={row.value}
                label={row.label}
                note={row.note}
                noteTone="green"
                order="value-first"
                divided={index > 0}
              />
            ))}
          </Panel>

          <Card className="flex-row items-center gap-3 p-4">
            <IconPlate icon="gift-outline" tint="green" size={42} />
            <View className="min-w-0 flex-1">
              <Txt weight="bold">Invite &amp; Earn</Txt>
              <Txt size="tiny" tone="muted" className="mt-0.5">
                Refer friends and earn exciting rewards
              </Txt>
            </View>
            <Badge label={`Earn up to ${money(500)}`} tone="ok" />
            <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
          </Card>

          <Card>
            <LinkRow
              icon="log-out-outline"
              tint="red"
              title="Logout"
              titleTone="bad"
              detail={`Logged in as ${rider.name}`}
              onPress={async () => {
                await signOut();
                router.replace("/login");
              }}
            />
          </Card>

          <Txt size="tiny" tone="faint" className="text-center">
            App Version {rider.appVersion}
          </Txt>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
