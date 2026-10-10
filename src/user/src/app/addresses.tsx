import React from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  HelpFooter,
  IconTile,
  Note,
  OutlineBadge,
  Txt,
  colors,
} from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { accents } from "@/lib/theme";
import { addressTypeStyle, type Address } from "@/lib/data";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

/**
 * "Saved Addresses", copied from the reference: the type summary strip, the
 * dashed add row, then one card per address with its edit and delete column
 * and a "Deliver here" pill, closing on the privacy note and help footer.
 */

function AddressCard({
  address,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  address: Address;
  selected: boolean;
  onSelect: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const style = addressTypeStyle[address.type];
  const tint = accents[style.accent];

  return (
    <Card className="mx-4 mb-3 flex-row p-3">
      <View className="items-center gap-2">
        <IconTile icon={style.icon} tint={tint} size={48} />
      </View>

      <View className="min-w-0 flex-1 px-3">
        <View className="flex-row items-center gap-2">
          <Txt size="lg" weight="bold" numberOfLines={1} className="min-w-0 flex-shrink">
            {address.label}
          </Txt>
          {address.isDefault && <OutlineBadge label="Default" tone="brand" />}
        </View>

        <View className="mt-1 flex-row items-center gap-1.5">
          <Txt size="tiny" tone="muted">
            {address.receiver}
          </Txt>
          <Ionicons name="call" size={12} color={colors.brand[600]} />
          <Txt size="tiny" tone="muted">
            {address.phone}
          </Txt>
        </View>

        <Txt size="tiny" tone="soft" className="mt-1.5">
          {address.line},
        </Txt>
        <Txt size="tiny" tone="soft">
          {address.city}
        </Txt>

        <Pressable
          onPress={onSelect}
          style={{ backgroundColor: selected ? tint.fg : tint.bg }}
          className="mt-2 self-start rounded-md px-2.5 py-1 active:opacity-70"
        >
          <Txt
            size="tiny"
            weight="bold"
            style={{ color: selected ? "#ffffff" : tint.fg }}
          >
            {selected ? "Delivering here" : "Deliver here"}
          </Txt>
        </Pressable>
      </View>

      {/*
        Both of these were pictures of buttons. The endpoints for changing and
        removing an address have existed the whole time, so a customer who
        moved could add a second address but never correct or remove the first.
      */}
      <View className="items-center justify-center gap-3 border-l border-line pl-3">
        <Pressable
          hitSlop={6}
          onPress={() => onEdit(address.id)}
          className="items-center active:opacity-60"
        >
          <Ionicons name="create-outline" size={19} color={colors.ink.default} />
          <Txt size="micro" tone="soft">
            Edit
          </Txt>
        </Pressable>
        <Pressable
          hitSlop={6}
          onPress={() => onDelete(address.id)}
          className="items-center active:opacity-60"
        >
          <Ionicons name="trash-outline" size={19} color={colors.brand[600]} />
          <Txt size="micro" tone="brand">
            Delete
          </Txt>
        </Pressable>
      </View>

      <View className="justify-center pl-1">
        <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
      </View>
    </Card>
  );
}

export default function AddressesScreen() {
  const router = useRouter();
  const {
    addresses,
    savedAddresses,
    signedIn,
    selectedAddressId,
    selectAddress,
    reloadAuthedData,
    here,
    usingHere,
    useHereAsAddress,
  } =
    useStore();

  /**
   * Editing reuses the screen that creates one, which already knows how to
   * locate an address and save it - a second, half-featured editor would only
   * disagree with it.
   */
  const editAddress = (id: string) => router.push(`/address/new?id=${id}`);

  const removeAddress = (id: string) =>
    Alert.alert("Remove this address?", "You can add it again later.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteAddress(id);
            await reloadAuthedData();
          } catch (error) {
            Alert.alert(
              "Could not remove it",
              error instanceof Error ? error.message : "Please try again."
            );
          }
        },
      },
    ]);

  // Saved addresses come from the account once signed in; the sample book
  // stands in while anonymous so the screen is never blank.
  const live = signedIn && savedAddresses.length > 0;
  const shown = live
    ? savedAddresses.map((a) => ({
        id: a.id,
        label: (a.label === "Office" ? "Work" : a.label) as Address["label"],
        type: (a.label === "Office" ? "Work" : a.label === "Home" ? "Home" : "Other") as Address["type"],
        receiver: "",
        phone: "",
        line: a.street,
        city: `${a.city} - ${a.zipCode}, ${a.state}`,
        isDefault: a.isDefault,
      }))
    : addresses;

  const counts = {
    Home: shown.filter((a) => a.type === "Home").length,
    Work: shown.filter((a) => a.type === "Work").length,
    Other: shown.filter((a) => a.type === "Other").length,
    All: shown.length,
  };

  const summary = [
    { key: "Home", icon: "home" as const, accent: "red" as const, count: counts.Home },
    { key: "Work", icon: "briefcase" as const, accent: "amber" as const, count: counts.Work },
    { key: "Other", icon: "heart" as const, accent: "purple" as const, count: counts.Other },
    { key: "All Addresses", icon: "location" as const, accent: "green" as const, count: counts.All },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Saved Addresses"
        subtitle="Manage your delivery addresses"
        right={<HeaderAction icon="location-outline" label="Map View" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        {/* Type summary */}
        <Card className="mx-4 mt-1 flex-row py-3">
          {summary.map((entry, index) => (
            <View
              key={entry.key}
              className={`flex-1 items-center gap-1.5 px-1 ${
                index > 0 ? "border-l border-line" : ""
              }`}
            >
              <IconTile icon={entry.icon} tint={accents[entry.accent]} size={46} />
              <Txt size="tiny" weight="bold" numberOfLines={1}>
                {entry.key}
              </Txt>
              <Txt size="micro" tone="muted">
                {entry.count} {entry.count === 1 ? "Address" : "Addresses"}
              </Txt>
            </View>
          ))}
        </Card>

        {/* Add new */}
        {/*
          This had no press handler, so a customer whose address was not one
          of the seeded two had no way to enter their own.
        */}
        <Pressable
          onPress={() => router.push("/address/new" as never)}
          className="mx-4 mt-4 flex-row items-center gap-3 rounded-card border border-dashed border-brand-300 bg-brand-50 px-3 py-3 active:opacity-80"
        >
          <IconTile icon="add" tint={accents.red} size={40} />
          <View className="min-w-0 flex-1">
            <Txt weight="bold" tone="brand">
              Add New Address
            </Txt>
            <Txt size="tiny" tone="muted">
              Add a new delivery address
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.brand[600]} />
        </Pressable>

        {/*
          The way back to the detected position. Picking a saved address holds
          for the session, so without this a customer who tapped one could not
          return to where they actually are until they restarted the app.
        */}
        <Pressable
          onPress={() => {
            useHereAsAddress();
            router.back();
          }}
          className="mx-4 mt-3 flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 active:opacity-80"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name="locate" size={19} color={colors.brand[600]} />
          </View>
          <View className="min-w-0 flex-1">
            <Txt weight="bold" tone="brand">
              Use my current location
            </Txt>
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              {here?.line ?? here?.area ?? "Detecting where you are…"}
            </Txt>
          </View>
          {usingHere && (
            <Ionicons name="checkmark-circle" size={20} color={colors.brand[600]} />
          )}
        </Pressable>

        <View className="mb-3 mt-6 flex-row items-center justify-between px-4">
          <Txt size="lg" weight="bold">
            Your Addresses
          </Txt>
          <Txt size="tiny" tone="muted">
            {shown.length} Addresses
          </Txt>
        </View>

        {shown.map((address) => (
          <AddressCard
            key={address.id}
            address={address}
            onEdit={editAddress}
            onDelete={removeAddress}
            selected={address.id === selectedAddressId}
            onSelect={() => {
              selectAddress(address.id);
              router.back();
            }}
          />
        ))}

        <View className="mx-4 mt-2">
          <Note
            icon="shield-checkmark"
            tone="info"
            title="Your privacy is important to us"
            detail="We don't share your address with anyone. It is used only for delivery purposes."
            action="Learn More"
          />
        </View>

        <HelpFooter className="mx-4 mt-4" />
      </ScrollView>
    </SafeAreaView>
  );
}
