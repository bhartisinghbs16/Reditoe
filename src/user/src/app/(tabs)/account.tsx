import React from "react";
import { Alert, Pressable, ScrollView, Share, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  Divider,
  IconTile,
  ListRow,
  OutlineBadge,
  SectionHead,
  StatStrip,
  Thumb,
  Txt,
  colors,
} from "@/components/ui";
import { HeaderIcon } from "@/components/screen-header";
import { LinearGradient } from "@/components/photo";
import { accents } from "@/lib/theme";
import { currency, number } from "@/lib/format";
import { addressTypeStyle, membership } from "@/lib/data";
import { useStore } from "@/lib/store";

import Constants from "expo-constants";
import { api } from "@/lib/api";

/**
 * "My Account". The reference has two versions of this page; this is their
 * union in the order they share — profile and stats, the wallet banner, the
 * order shortcuts, membership, saved addresses, settings, refer & earn, the
 * remaining options, and logout.
 */

export default function AccountScreen() {
  const router = useRouter();
  const { customer, addresses, favourites, signedIn, authUser, signOut } =
    useStore();

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const addressStyle = addressTypeStyle[defaultAddress.type];

  const orderShortcuts = [
    { icon: "bag-handle-outline" as const, label: "All Orders", accent: "red" as const, filter: "All" },
    { icon: "restaurant-outline" as const, label: "Preparing", accent: "amber" as const, filter: "Ongoing" },
    { icon: "bicycle-outline" as const, label: "On the Way", accent: "blue" as const, filter: "Ongoing" },
    { icon: "checkmark-circle-outline" as const, label: "Delivered", accent: "green" as const, filter: "Delivered" },
    { icon: "close-circle-outline" as const, label: "Cancelled", accent: "purple" as const, filter: "Cancelled" },
  ];

  const settings = [
    { icon: "person-outline" as const, accent: "red" as const, label: signedIn ? "Personal Information" : "Sign in / Create account", detail: signedIn ? "Name, Email & Phone" : "Access your orders, wallet and Plus", href: signedIn ? "/profile" : "/signin" },
    { icon: "location-outline" as const, accent: "green" as const, label: "Addresses", detail: "Manage saved delivery addresses", href: "/addresses" },
    { icon: "card-outline" as const, accent: "blue" as const, label: "Payment Methods", detail: "UPI, Cards, Wallets & more", href: "/payments" },
    { icon: "wallet-outline" as const, accent: "purple" as const, label: "Reditoe Wallet", detail: "View balance, transactions & history", href: "/wallet" },
    { icon: "notifications-outline" as const, accent: "amber" as const, label: "Notifications", detail: "Manage your notification preferences", href: "/notifications" },
    { icon: "headset-outline" as const, accent: "teal" as const, label: "Help & Support", detail: "Message our team and track your requests", href: "/support" },
  ];

  const moreOptions = [
    { icon: "receipt-outline" as const, accent: "blue" as const, label: "Payments & Refunds", href: "/payments" },
    { icon: "swap-horizontal-outline" as const, accent: "orange" as const, label: "Returns & Refunds", href: "/refunds" },
    { icon: "pricetags-outline" as const, accent: "green" as const, label: "Offers & Coupons", href: "/offers" },
    { icon: "shield-outline" as const, accent: "red" as const, label: "Secure Delivery Verification", href: "/verify" },
    { icon: "log-in-outline" as const, accent: "teal" as const, label: signedIn ? "Switch account" : "Sign in / Create account", href: "/signin" },
    { icon: "information-circle-outline" as const, accent: "purple" as const, label: "About Reditoe", href: "/about" },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <View className="flex-row items-center gap-4 bg-surface px-4 pb-3 pt-2">
        <View className="min-w-0 flex-1">
          <Txt size="2xl" weight="bold">
            My Account
          </Txt>
          <Txt size="tiny" tone="muted">
            Manage your profile and preferences
          </Txt>
        </View>
        <View>
          <HeaderIcon icon="notifications-outline" label="Notifications" />
          <View className="absolute -right-2 -top-1.5 h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1">
            <Txt size="micro" weight="bold" tone="white">
              3
            </Txt>
          </View>
        </View>
        <HeaderIcon icon="settings-outline" label="Settings" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-28">
        {/* Signed out: prompt rather than showing a profile nobody owns. */}
        {!signedIn && (
          <Pressable
            onPress={() => router.push("/signin")}
            className="mx-4 flex-row items-center gap-3 rounded-card border border-brand-200 bg-brand-50 p-4 active:opacity-80"
          >
            <IconTile icon="person-circle-outline" tint={accents.red} size={52} />
            <View className="min-w-0 flex-1">
              <Txt size="lg" weight="bold">
                Sign in or create account
              </Txt>
              <Txt size="tiny" tone="muted" numberOfLines={2} className="mt-0.5">
                To see your orders, wallet, addresses and Reditoe Plus benefits
              </Txt>
            </View>
            <View className="rounded-tile bg-brand-600 px-4 py-2.5">
              <Txt size="tiny" weight="bold" tone="white">
                Sign In
              </Txt>
            </View>
          </Pressable>
        )}

        {/* Profile */}
        <Card className={`mx-4 p-4 ${signedIn ? "" : "mt-4"}`}>
          <View className="flex-row items-start gap-3">
            <View>
              <Thumb label={customer.name} tint={accents.red} size={56} radius={28} />
              <View className="absolute -bottom-0.5 -right-0.5 h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-ink">
                <Ionicons name="camera" size={11} color="#ffffff" />
              </View>
            </View>

            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-2">
                <Txt size="lg" weight="bold" numberOfLines={1} className="min-w-0 flex-shrink">
                  {authUser?.name || customer.name}
                </Txt>
                <OutlineBadge label={customer.rating.toFixed(1)} icon="star" tone="brand" />
              </View>

              <View className="mt-1 flex-row items-center gap-1.5">
                <Ionicons name="call-outline" size={13} color={colors.ink.muted} />
                <Txt size="tiny" tone="muted" numberOfLines={1}>
                  {customer.phone}
                </Txt>
                {/* Text-only: with the shield glyph the badge pushes the phone
                    number into an ellipsis at phone width. */}
                {customer.verified && <OutlineBadge label="Verified" tone="ok" />}
              </View>
              <View className="mt-1 flex-row items-center gap-1.5">
                <Ionicons name="mail-outline" size={13} color={colors.ink.muted} />
                <Txt size="tiny" tone="muted" numberOfLines={1}>
                  {authUser?.email || customer.email}
                </Txt>
              </View>
            </View>

            <Pressable
              hitSlop={8}
              onPress={() => router.push(signedIn ? "/profile" : "/signin")}
              accessibilityLabel="Edit your profile"
              className="flex-row items-center gap-0.5 pt-1 active:opacity-70"
            >
              <Txt size="micro" weight="bold" tone="brand">
                Edit Profile
              </Txt>
              <Ionicons name="chevron-forward" size={11} color={colors.brand[600]} />
            </Pressable>
          </View>

          <Divider className="my-3" />

          {/* Four figures across a phone leaves no room for an icon beside the
              label, so the tile sits above it rather than ellipsising both. */}
          <StatStrip>
            {[
              { icon: "bag-handle" as const, accent: "red" as const, value: number(customer.orderCount), label: "Orders" },
              { icon: "heart" as const, accent: "amber" as const, value: String(favourites.length || customer.favouriteCount), label: "Favourites" },
              { icon: "ticket" as const, accent: "purple" as const, value: String(customer.couponCount), label: "Coupons" },
              { icon: "wallet" as const, accent: "green" as const, value: currency(customer.walletBalance), label: "Wallet" },
            ].map((stat) => (
              <View key={stat.label} className="items-center gap-1">
                <IconTile icon={stat.icon} tint={accents[stat.accent]} size={30} square />
                <Txt size="sm" weight="bold" numberOfLines={1}>
                  {stat.value}
                </Txt>
                <Txt size="micro" tone="muted" numberOfLines={1}>
                  {stat.label}
                </Txt>
              </View>
            ))}
          </StatStrip>
        </Card>

        {/* Wallet banner */}
        <Pressable onPress={() => router.push("/wallet")} className="mx-4 mt-4 active:opacity-90">
          <LinearGradient
            colors={["#1c1c1c", "#2d2d2d", "#171717"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 14, padding: 16 }}
          >
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1">
                <Txt size="tiny" tone="white" className="opacity-80">
                  Reditoe Wallet
                </Txt>
                <Txt weight="bold" tone="white">
                  Load money, place orders & save more!
                </Txt>
                <View className="mt-3 self-start rounded-lg bg-brand-600 px-4 py-2">
                  <Txt size="tiny" weight="bold" tone="white">
                    Add Money
                  </Txt>
                </View>
              </View>
              <Ionicons name="wallet" size={40} color={colors.brand[500]} />
              <Ionicons name="chevron-forward" size={18} color="#ffffff" />
            </View>
          </LinearGradient>
        </Pressable>

        {/* Order shortcuts */}
        <Card className="mx-4 mt-4 p-4">
          <SectionHead
            title="My Orders"
            action="View All Orders"
            onAction={() => router.push("/orders")}
          />
          <Divider className="my-3" />
          <View className="flex-row">
            {orderShortcuts.map((shortcut) => (
              <Pressable
                key={shortcut.label}
                onPress={() => router.push("/orders")}
                className="flex-1 items-center gap-1.5 active:opacity-70"
              >
                <IconTile icon={shortcut.icon} tint={accents[shortcut.accent]} size={38} />
                <Txt size="micro" weight="semibold" numberOfLines={1}>
                  {shortcut.label}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Membership */}
        <Card className="mx-4 mt-4 p-4">
          <SectionHead
            title="Your Membership"
            onAction={() => router.push("/plus")}
          />
          <Divider className="my-3" />
          <View className="flex-row items-center gap-3">
            <IconTile icon="ribbon" tint={accents.amber} size={48} />
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-2">
                <Txt size="lg" weight="bold" numberOfLines={1} className="min-w-0 flex-shrink">
                  {membership.name}
                </Txt>
                <OutlineBadge label={membership.active ? "Active" : "Inactive"} tone="brand" />
              </View>
              <Txt size="tiny" tone="muted" numberOfLines={1}>
                {membership.tagline}
              </Txt>
              <Txt size="tiny" weight="semibold" tone="ok">
                Valid till {membership.validTill}
              </Txt>
            </View>
          </View>

          {/* Beside the block the button would squeeze the plan name off the
              line on a phone, so it takes its own row. */}
          <Pressable
            onPress={() => router.push("/plus")}
            className="mt-3 flex-row items-center justify-center gap-1 rounded-tile bg-brand-50 py-3 active:opacity-70"
          >
            <Txt size="sm" weight="bold" tone="brand">
              Explore Benefits
            </Txt>
            <Ionicons name="chevron-forward" size={13} color={colors.brand[600]} />
          </Pressable>
        </Card>

        {/* Addresses */}
        <Card className="mx-4 mt-4 p-4">
          <SectionHead title="My Addresses" onAction={() => router.push("/addresses")} />
          <Divider className="my-3" />
          <Pressable
            onPress={() => router.push("/addresses")}
            className="flex-row items-start gap-3 active:opacity-70"
          >
            <IconTile
              icon={addressStyle.icon}
              tint={accents[addressStyle.accent]}
              size={44}
            />
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-2">
                <Txt weight="bold">{defaultAddress.label}</Txt>
                {defaultAddress.isDefault && <OutlineBadge label="Default" tone="brand" />}
              </View>
              <Txt size="tiny" tone="muted" className="mt-0.5">
                {defaultAddress.line}
              </Txt>
              <Txt size="tiny" tone="muted">
                {defaultAddress.city}
              </Txt>
              <Txt size="tiny" tone="muted" className="mt-0.5">
                {defaultAddress.phone}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/addresses")}
            className="mt-3 flex-row items-center justify-center gap-2 rounded-tile border border-dashed border-brand-300 py-3 active:opacity-70"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.brand[600]} />
            <Txt size="sm" weight="bold" tone="brand">
              Add New Address
            </Txt>
          </Pressable>
        </Card>

        {/* Settings */}
        <Card className="mx-4 mt-4 overflow-hidden">
          <Txt size="lg" weight="bold" className="px-4 pb-1 pt-4">
            Account Settings
          </Txt>
          {settings.map((row, index) => (
            <React.Fragment key={row.label}>
              {index > 0 && <Divider className="ml-14" />}
              <ListRow
                icon={row.icon}
                tint={accents[row.accent]}
                label={row.label}
                detail={row.detail}
                onPress={() => row.href && router.push(row.href as never)}
              />
            </React.Fragment>
          ))}
        </Card>

        <Pressable
          accessibilityLabel="Refer and earn"
          className="mx-4 mt-4 flex-row items-center gap-3 rounded-card bg-sun-50 px-3 py-3.5 active:opacity-80"
          onPress={() => router.push("/referrals" as never)}
        >
          <IconTile icon="gift" tint={{ bg: colors.sun[600], fg: "#ffffff" }} size={44} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold">Refer &amp; Earn</Txt>
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              Refer users, vendors or delivery partners
            </Txt>
          </View>
          <View className="rounded-lg bg-sun-600 px-4 py-2.5">
            <Txt size="tiny" weight="bold" tone="white">Refer Now</Txt>
          </View>
        </Pressable>

        {/* More options */}
        <Card className="mx-4 mt-4 overflow-hidden">
          <Txt size="lg" weight="bold" className="px-4 pb-1 pt-4">
            More Options
          </Txt>
          {moreOptions.map((row, index) => (
            <React.Fragment key={row.label}>
              {index > 0 && <Divider className="ml-14" />}
              <ListRow
                icon={row.icon}
                tint={accents[row.accent]}
                label={row.label}
                onPress={() => row.href && router.push(row.href as never)}
              />
            </React.Fragment>
          ))}
        </Card>

        {/*
          Logout.

          The button had no press handler at all - it looked like every other
          control on the screen and did nothing. Confirmed first, because
          signing back in means waiting for an OTP, and a mis-tap here is easy.
        */}
        <Pressable
          className="mx-4 mt-4 flex-row items-center justify-center gap-2 rounded-card border border-line py-4 active:opacity-70"
          accessibilityLabel="Logout"
          onPress={() =>
            Alert.alert("Log out?", "You'll need to sign in again to order.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Log out",
                style: "destructive",
                onPress: () => {
                  signOut();
                  router.replace("/signin");
                },
              },
            ])
          }
        >
          <Ionicons name="log-out-outline" size={19} color={colors.brand[600]} />
          <Txt weight="bold" tone="brand">
            Logout
          </Txt>
        </Pressable>

        {/* The build's own version, not a number typed in once and left. */}
        <Txt size="micro" tone="faint" className="mt-4 text-center">
          Reditoe · Version {Constants.expoConfig?.version ?? "—"}
        </Txt>
      </ScrollView>

    </SafeAreaView>
  );
}
