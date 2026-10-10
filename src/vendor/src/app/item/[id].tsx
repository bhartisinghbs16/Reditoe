import React from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageBar } from "@/components/screen-header";
import { Photo, PhotoScrim } from "@/components/photo";
import { KeyValue, NoteCard, UploadTile } from "@/components/form";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconPlate,
  Toggle,
  Txt,
  UnderlineTabs,
  VegMark,
  colors,
} from "@/components/ui";
import { currency, friendlyDateTime, money } from "@/lib/format";
import { img } from "@/lib/images";
import { categoryTint, tints } from "@/lib/theme";
import { useStore, type MenuItem } from "@/lib/store";

/**
 * Menu Item Details — a copy of the reference item screen: the hero, the four
 * lifetime counters, the section tabs, the Basic Info pane with its status
 * side-panel, the image strip and the three-way action bar.
 */

type Tab = "basic" | "variants" | "addons" | "pricing" | "availability" | "more";

const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "basic", label: "Basic Info", icon: "information-circle-outline" },
  { id: "variants", label: "Variants", icon: "options-outline" },
  { id: "addons", label: "Add-ons", icon: "grid-outline" },
  { id: "pricing", label: "Pricing", icon: "pricetag-outline" },
  { id: "availability", label: "Availability", icon: "calendar-outline" },
  { id: "more", label: "More Info", icon: "list-outline" },
];

function Hero({ item }: { item: MenuItem }) {
  return (
    <Card className="mx-4 mt-3 p-3.5">
      <View className="flex-row gap-3">
        <Photo uri={item.image} width={112} height={112} radius={11}>
          <PhotoScrim height={34} />
          <View className="absolute bottom-1.5 left-0 right-0 flex-row items-center justify-center gap-1">
            <Ionicons name="camera" size={12} color="#ffffff" />
            <Txt size="micro" weight="semibold" tone="white">
              Change Photo
            </Txt>
          </View>
        </Photo>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-start gap-1.5">
            <Txt size="lg" weight="bold" className="shrink" numberOfLines={2}>
              {item.name}
            </Txt>
            <VegMark veg={item.veg} size={14} />
          </View>
          <Txt size="tiny" tone="muted" className="mt-0.5">
            {item.category} • {item.subCategory}
          </Txt>
          <Txt size="tiny" tone="soft" className="mt-1.5" numberOfLines={3}>
            {item.description || "No description yet."}
          </Txt>
          <View className="mt-2 flex-row flex-wrap gap-1.5">
            <Badge
              label={item.available ? "Active" : "Inactive"}
              tone={item.available ? "ok" : "neutral"}
            />
            {item.tag && <Badge label={item.tag} tone="ok" icon="star" />}
          </View>
        </View>
      </View>
    </Card>
  );
}

/**
 * How this item has actually sold, counted from the orders already loaded.
 *
 * The reference also shows a per-item rating and a "customers liked" count.
 * No vendor endpoint exposes either, so rather than print invented numbers
 * this reports what the order history can prove, over the window the orders
 * endpoint returns.
 */
function Counters({ item }: { item: MenuItem }) {
  const { orders } = useStore();

  const stats = React.useMemo(() => {
    let units = 0;
    let revenue = 0;
    let orderCount = 0;

    for (const order of orders) {
      if (order.stage === "cancelled") continue;
      const lines = order.lines.filter((line) => line.name === item.name);
      if (!lines.length) continue;
      orderCount += 1;
      for (const line of lines) {
        units += line.quantity;
        revenue += line.price * line.quantity;
      }
    }

    return { units, revenue, orderCount };
  }, [orders, item.name]);

  const cells = [
    { icon: "receipt-outline" as const, tint: "violet" as const, value: String(stats.orderCount), label: "Orders" },
    { icon: "cube-outline" as const, tint: "blue" as const, value: String(stats.units), label: "Units sold" },
    { icon: "trending-up-outline" as const, tint: "green" as const, value: money(stats.revenue), label: "Revenue" },
    { icon: "time-outline" as const, tint: "amber" as const, value: `${item.prepMinutes || "—"}`, label: "Prep (min)" },
  ];

  return (
    <Card className="mx-4 mt-3 flex-row flex-wrap p-3.5">
      {cells.map((cell, index) => (
        <View
          key={cell.label}
          className={`w-1/2 flex-row items-center gap-2.5 ${index < 2 ? "pb-3" : ""} ${
            index % 2 === 0 ? "border-r border-line pr-2" : "pl-3"
          }`}
        >
          <IconPlate icon={cell.icon} tint={cell.tint} size={34} shape="square" />
          <View className="min-w-0 flex-1">
            <Txt size="lg" weight="bold" numberOfLines={1}>
              {cell.value}
            </Txt>
            <Txt size="micro" tone="muted" numberOfLines={1}>
              {cell.label}
            </Txt>
          </View>
        </View>
      ))}
    </Card>
  );
}

function BasicInfo({ item }: { item: MenuItem }) {
  const { toggleAvailability } = useStore();

  return (
    <View className="gap-3">
      <Card className="p-4">
        <KeyValue label="Item Name" value={item.name} />
        <KeyValue label="Category" value={item.category} />
        <KeyValue label="Cuisine" value={item.subCategory} />
        <KeyValue label="Food Type">
          <Badge label={item.veg ? "Vegetarian" : "Non-Vegetarian"} tone={item.veg ? "ok" : "bad"} />
        </KeyValue>
        <KeyValue label="Price" value={currency(item.price)} />
        <KeyValue label="Prep Time" value={item.prepMinutes ? `${item.prepMinutes} mins` : "—"} />
        <KeyValue label="Description" value={item.description || "—"} />
      </Card>

      <Card className="p-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Txt size="tiny" tone="muted">
              Item Status
            </Txt>
            <Txt size="sm" weight="semibold" tone={item.available ? "ok" : "muted"}>
              {item.available ? "Active" : "Inactive"}
            </Txt>
          </View>
          <Toggle
            value={item.available}
            onValueChange={() => toggleAvailability(item.id)}
            accessibilityLabel={`Show ${item.name} to customers`}
          />
        </View>

        <View className="mt-3 gap-2 border-t border-line pt-3">
          <KeyValue label="Item ID">
            <Txt size="sm" weight="semibold" numberOfLines={1}>
              {item.id.slice(-10).toUpperCase()}
            </Txt>
          </KeyValue>
          <KeyValue label="Created On" value={friendlyDateTime(item.createdAt)} />
          <KeyValue label="Last Updated" value={friendlyDateTime(item.updatedAt)} />
        </View>
      </Card>

      <Card className="p-4">
        <Txt weight="bold">Item Images</Txt>
        <Txt size="tiny" tone="muted" className="mt-0.5">
          Add high quality images to attract more customers
        </Txt>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2.5 pt-3"
        >
          {[0, 1, 2].map((index) => (
            <View key={index}>
              <Photo
                uri={item.image}
                width={76}
                height={76}
                radius={10}
                tint={categoryTint(index)}
              />
              {index === 0 ? (
                <View className="absolute bottom-1 left-1 rounded-[4px] bg-brand-600 px-1.5 py-0.5">
                  <Txt size="micro" weight="bold" tone="white">
                    Primary
                  </Txt>
                </View>
              ) : (
                <View className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full bg-brand-600">
                  <Ionicons name="close" size={12} color="#ffffff" />
                </View>
              )}
            </View>
          ))}
          <UploadTile />
        </ScrollView>
      </Card>

      <NoteCard
        icon="information-circle"
        tint="blue"
        title="Item Description"
        detail="Soft cubes cooked in a rich, creamy tomato gravy flavoured with butter, cashew paste and aromatic spices."
      />

      <NoteCard
        icon="nutrition"
        tint="green"
        title="Nutritional Information (Optional)"
        detail="Provide nutritional details to help customers make better choices."
      />
    </View>
  );
}

/** Read-only here — editing happens in the wizard, which owns validation. */
function EmptyList({ label }: { label: string }) {
  return (
    <Card className="items-center px-4 py-6">
      <Txt size="tiny" tone="muted" className="text-center">
        {label}
      </Txt>
    </Card>
  );
}

function VariantList({ item }: { item: MenuItem }) {
  const options = item.variants[0]?.options ?? [];
  if (!options.length) return <EmptyList label="No variants. This item sells at its base price." />;

  return (
    <Card className="overflow-hidden">
      {options.map((option, index) => (
        <View
          key={`${option.name}-${index}`}
          className={`flex-row items-center gap-3 px-3.5 py-3 ${
            index === options.length - 1 ? "" : "border-b border-line"
          }`}
        >
          <Ionicons name="ellipse-outline" size={15} color={colors.ink.faint} />
          <Txt size="sm" weight="semibold" className="flex-1" numberOfLines={1}>
            {option.name}
          </Txt>
          <Txt size="sm" weight="bold">
            {currency(option.price)}
          </Txt>
        </View>
      ))}
    </Card>
  );
}

function AddonList({ item }: { item: MenuItem }) {
  if (!item.addons.length) return <EmptyList label="No add-ons on this item." />;

  return (
    <Card className="overflow-hidden">
      {item.addons.map((addon, index) => (
        <View
          key={`${addon.name}-${index}`}
          className={`flex-row items-center gap-3 px-3.5 py-2.5 ${
            index === item.addons.length - 1 ? "" : "border-b border-line"
          }`}
        >
          <Ionicons name="add-circle-outline" size={15} color={colors.ink.faint} />
          <Txt size="sm" className="flex-1" numberOfLines={1}>
            {addon.name}
          </Txt>
          <Txt size="sm" weight="semibold">
            {currency(addon.price)}
          </Txt>
        </View>
      ))}
    </Card>
  );
}

/**
 * What this item costs, and nothing else.
 *
 * GST used to be added to the item here and the sum labelled "Total Amount
 * (Customer Pays)", which is not what a menu price is: tax belongs on the
 * bill, worked out once against the whole order, not folded into each line.
 * A vendor reading this screen was being told their 200 dish costs 210, and
 * the figure did not match what the order or the invoice showed either.
 *
 * The add-ons line also named two specific extras - "Extra Paneer + Extra
 * Gravy" - whatever the item actually had against it.
 */
function Pricing({ item }: { item: MenuItem }) {
  const addons = item.addons.reduce((sum, addon) => sum + addon.price, 0);

  return (
    <Card className="p-4">
      <Txt weight="bold">Price Summary</Txt>
      <Txt size="tiny" tone="muted" className="mt-0.5">
        What this item is listed at
      </Txt>
      <View className="mt-3 gap-1">
        <KeyValue label="Item Price" value={money(item.price)} />
        {item.addons.length > 0 && (
          <KeyValue
            label={`Add-ons (${item.addons.map((addon) => addon.name).join(", ")})`}
            value={money(addons)}
          />
        )}
      </View>
      <View
        style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.line.strong }}
        className="mt-2 flex-row justify-between pt-2.5"
      >
        <Txt weight="bold">Item total</Txt>
        <Txt size="lg" weight="bold">
          {money(item.price + addons)}
        </Txt>
      </View>
      <View
        style={{ backgroundColor: tints.green.bg }}
        className="mt-3 flex-row items-center gap-2 rounded-tile px-3 py-2.5"
      >
        <Ionicons name="information-circle" size={16} color={tints.green.fg} />
        <Txt size="tiny" tone="soft" className="flex-1">
          GST is added once on the order invoice, not to the item price.
        </Txt>
      </View>
    </Card>
  );
}

/** "09:00" → "9:00 AM", for reading back a window the vendor typed in 24h. */
function clockLabel(value: string) {
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Number(rawHours);
  if (!Number.isFinite(hours)) return value;
  const suffix = hours < 12 ? "AM" : "PM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${rawMinutes ?? "00"} ${suffix}`;
}

function Availability({ item }: { item: MenuItem }) {
  const windowed = Boolean(item.availableFrom && item.availableTo);
  // A window ending before it starts runs past midnight; say so rather than
  // printing a range that reads as backwards.
  const overnight = windowed && item.availableTo < item.availableFrom;

  const rows = [
    {
      icon: "time-outline" as const,
      tint: "green" as const,
      label: "Available For",
      value: windowed ? "Specific Hours" : "Always Available",
    },
    {
      icon: "calendar-outline" as const,
      tint: "blue" as const,
      label: "Operating Hours",
      value: windowed
        ? `${clockLabel(item.availableFrom)} - ${clockLabel(item.availableTo)}${
            overnight ? " (next day)" : " (Everyday)"
          }`
        : "Whenever the store is open",
    },
    {
      icon: "timer-outline" as const,
      tint: "amber" as const,
      label: "Prep Time",
      value: item.prepMinutes > 0 ? `${item.prepMinutes} mins` : "Not set",
    },
    { icon: "bicycle-outline" as const, tint: "green" as const, label: "Delivery", value: "Available" },
    { icon: "bag-handle-outline" as const, tint: "teal" as const, label: "Self Pickup", value: "Available" },
    { icon: "notifications-outline" as const, tint: "violet" as const, label: "Low Stock Alert", value: "When stock is less than 10 portions" },
  ];

  return (
    <Card className="overflow-hidden">
      {rows.map((row, index) => (
        <View
          key={row.label}
          className={`flex-row items-center gap-3 px-3.5 py-3 ${
            index === rows.length - 1 ? "" : "border-b border-line"
          }`}
        >
          <IconPlate icon={row.icon} tint={row.tint} size={32} />
          <View className="min-w-0 flex-1">
            <Txt size="tiny" tone="muted">
              {row.label}
            </Txt>
            <Txt size="sm" weight="semibold" numberOfLines={2}>
              {row.value}
            </Txt>
          </View>
        </View>
      ))}
    </Card>
  );
}

export default function ItemDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { menu, deleteItem, toggleAvailability } = useStore();
  const [tab, setTab] = React.useState<Tab>("basic");
  const item = menu.find((entry) => entry.id === id);

  const confirmDelete = () => {
    if (!item) return;
    const remove = () => {
      void deleteItem(item.id)
        .then(() => router.back())
        .catch(() => {});
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Delete ${item.name}? Customers will no longer see it.`)) remove();
      return;
    }

    Alert.alert(`Delete ${item.name}?`, "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: remove },
    ]);
  };

  if (!item) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
        <View className="border-b border-line bg-surface">
          <PageBar title="Menu Item Details" leading="back" />
        </View>
        <EmptyState
          icon="restaurant-outline"
          title="Item not found"
          detail={`No menu item matches ${id}.`}
          action="Back to menu"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <View className="border-b border-line bg-surface">
        <PageBar
          title="Menu Item Details"
          subtitle={`Menu › ${item.category} › ${item.name}`}
          leading="back"
        />
        <View className="flex-row gap-2.5 px-4 pb-3">
          {/* A "Preview" button stood here with no handler: there is no
              screen in this app that shows an item as a customer sees it. */}
          <Button
            label="Edit Item"
            icon="pencil-outline"
            size="sm"
            className="flex-1"
            onPress={() => router.push(`/item/new?id=${item.id}`)}
          />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6">
        <Hero item={item} />
        <Counters item={item} />

        <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} className="mt-3 bg-surface" />

        <View className="px-4 pt-3">
          {tab === "basic" && <BasicInfo item={item} />}
          {tab === "variants" && <VariantList item={item} />}
          {tab === "addons" && <AddonList item={item} />}
          {tab === "pricing" && <Pricing item={item} />}
          {tab === "availability" && <Availability item={item} />}
          {tab === "more" && (
            <Card className="p-4">
              <KeyValue label="Item ID" value={item.id.slice(-10).toUpperCase()} />
              <KeyValue label="Stock" value={item.inStock ? "In Stock" : "Out of Stock"} />
              <KeyValue label="Variants" value={`${item.variants[0]?.options.length ?? 0}`} />
              <KeyValue label="Add-ons" value={`${item.addons.length}`} />
              <KeyValue label="Created" value={friendlyDateTime(item.createdAt)} />
            </Card>
          )}
        </View>

        {/* Editing happens in the wizard, so this bar only carries the two
            actions that make sense in place. */}
        <View className="mx-4 mt-4 flex-row gap-2.5">
          <Button
            label="Delete Item"
            icon="trash-outline"
            variant="outline"
            accent="brand"
            className="flex-1"
            onPress={confirmDelete}
          />
          <Button
            label={item.available ? "Mark Inactive" : "Mark Active"}
            icon="pause-circle-outline"
            variant="plain"
            className="flex-1"
            onPress={() => toggleAvailability(item.id)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
