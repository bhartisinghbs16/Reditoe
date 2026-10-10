import React from "react";
import { Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { PageBar } from "@/components/screen-header";
import { Photo } from "@/components/photo";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconPlate,
  SearchField,
  Toggle,
  ToolButton,
  Txt,
  UnderlineTabs,
  VegMark,
  colors,
} from "@/components/ui";
import { currency } from "@/lib/format";
import { img } from "@/lib/images";
import { categoryTint, type Tone } from "@/lib/theme";
import { useStore, type ItemTag, type MenuItem } from "@/lib/store";
import { uploadMenuSheet } from "@/lib/api";

/**
 * Menu Management — a copy of the reference menu screen: the counts strip, the
 * search / filter / sort row, the item-type tabs, item rows carrying a photo,
 * tags, price and an availability switch, then the pager and the tips panel.
 */

type Tab = "all" | "bestsellers" | "veg" | "nonveg" | "out";

/** Each tag keeps one tone and one glyph wherever it appears. */
const tagStyle: Record<ItemTag, { tone: Tone; icon: keyof typeof Ionicons.glyphMap }> = {
  Bestseller: { tone: "ok", icon: "star" },
  Popular: { tone: "warn", icon: "flame" },
  New: { tone: "info", icon: "sparkles" },
  "Chef's Special": { tone: "indigo", icon: "ribbon" },
};

/* ── Counts strip ───────────────────────────────────────────────────────── */

function CountsStrip() {
  const { menu, refresh } = useStore();
  const active = menu.filter((m) => m.available).length;
  const out = menu.filter((m) => !m.inStock).length;
  const categories = new Set(menu.map((m) => m.category)).size;

  const cells = [
    { icon: "restaurant-outline" as const, tint: "red" as const, label: "Total Items", value: menu.length },
    { icon: "checkmark-circle-outline" as const, tint: "green" as const, label: "Active Items", value: active },
    { icon: "eye-off-outline" as const, tint: "amber" as const, label: "Out of Stock", value: out },
    { icon: "grid-outline" as const, tint: "violet" as const, label: "Categories", value: categories },
  ];

  /*
   * The four counts across one row, as the client's reference draws them.
   *
   * They were laid out two by two at half width each, so the card was twice
   * as tall as it needed to be and pushed the menu itself off the screen.
   * At a quarter of a phone the icon goes above the figure rather than
   * beside it, or every label truncates.
   */
  return (
    <Card className="mx-4 mt-3 flex-row p-3">
      {cells.map((cell, index) => (
        <View
          key={cell.label}
          className={`flex-1 items-center gap-1 ${
            index > 0 ? "border-l border-line" : ""
          }`}
        >
          <IconPlate icon={cell.icon} tint={cell.tint} size={30} />
          <Txt size="xl" weight="bold">
            {cell.value}
          </Txt>
          <Txt size="micro" tone="muted" numberOfLines={2} className="text-center">
            {cell.label}
          </Txt>
        </View>
      ))}
    </Card>
  );
}

/* ── Item row ───────────────────────────────────────────────────────────── */

function ItemRow({ item, index }: { item: MenuItem; index: number }) {
  const { toggleAvailability, deleteItem } = useStore();
  const router = useRouter();
  const tag = item.tag ? tagStyle[item.tag] : null;
  const open = () => router.push(`/item/${item.id}`);

  /** Removing a dish is not recoverable, so it asks first. */
  const confirmDelete = () => {
    const remove = () => {
      void deleteItem(item.id).catch(() => {});
    };

    if (Platform.OS === "web") {
      // React Native Web has no Alert with buttons.
      if (window.confirm(`Delete ${item.name}? Customers will no longer see it.`)) remove();
      return;
    }

    Alert.alert(
      `Delete ${item.name}?`,
      "Customers will no longer see this item. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: remove },
      ]
    );
  };

  return (
    <Card className="flex-row gap-3 p-3">
      <Pressable onPress={open} accessibilityLabel={`Open ${item.name}`}>
        <Photo
          uri={item.image}
          width={88}
          height={88}
          radius={10}
          tint={categoryTint(index)}
        />
      </Pressable>

      <Pressable onPress={open} className="min-w-0 flex-1 active:opacity-70">
        {/* Two lines, not one: at phone width the row loses ~200px to the
            photo and the availability controls, and a clipped dish name is
            the one thing on this screen that has to stay readable. */}
        <View className="flex-row items-start gap-1.5">
          <Txt weight="bold" numberOfLines={2} className="shrink">
            {item.name}
          </Txt>
          <VegMark veg={item.veg} size={13} />
        </View>

        <Txt size="tiny" tone="muted" className="mt-0.5" numberOfLines={1}>
          {item.category} • {item.subCategory}
        </Txt>

        <Txt size="lg" weight="bold" className="mt-1">
          {currency(item.price)}
        </Txt>

        <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
          {item.tag && tag && <Badge label={item.tag} tone={tag.tone} icon={tag.icon} />}
          <Badge
            label={item.inStock ? "In Stock" : "Out of Stock"}
            tone={item.inStock ? "ok" : "bad"}
          />
        </View>
      </Pressable>

      <View className="items-end justify-between gap-2">
        <Toggle
          value={item.available}
          onValueChange={() => toggleAvailability(item.id)}
          accessibilityLabel={`Show ${item.name} to customers`}
        />
        <View className="flex-row gap-1.5">
          <Pressable
            onPress={() => router.push(`/item/new?id=${item.id}`)}
            accessibilityLabel={`Edit ${item.name}`}
            className="h-9 w-11 items-center justify-center rounded-tile border border-line active:opacity-70"
          >
            <Ionicons name="pencil-outline" size={15} color={colors.ink.soft} />
            <Txt size="micro" tone="muted">
              Edit
            </Txt>
          </Pressable>
          <Pressable
            onPress={confirmDelete}
            accessibilityLabel={`Delete ${item.name}`}
            className="h-9 w-11 items-center justify-center rounded-tile border border-line active:opacity-70"
          >
            <Ionicons name="trash-outline" size={15} color={colors.brand[600]} />
            <Txt size="micro" tone="brand">
              Delete
            </Txt>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

/* ── Pager & tips ───────────────────────────────────────────────────────── */

function Pager({ shown, total }: { shown: number; total: number }) {
  return (
    <View className="mt-4 flex-row items-center justify-between gap-3 px-4">
      <Txt size="tiny" tone="muted" className="flex-1" numberOfLines={1}>
        {shown === total
          ? `${total} item${total === 1 ? "" : "s"}`
          : `${shown} of ${total} items`}
      </Txt>
      {/*
        No page arrows. The list is not paginated - every item that matches
        the search and the tab is already on screen - so the arrows had
        nowhere to go, the page number was the character "1" regardless, and
        together they suggested there were items further on that a vendor
        could not reach.
      */}
    </View>
  );
}

function MenuTips() {
  const router = useRouter();
  return (
    <View className="mx-4 mt-4 flex-row items-start gap-3 rounded-card bg-brand-50 p-4">
      <IconPlate icon="clipboard-outline" tint="red" size={40} background="#ffffff" />
      <View className="min-w-0 flex-1">
        <Txt weight="bold">Tips to improve your sales</Txt>
        {[
          "Add more photos to your menu items",
          "Keep your bestseller items in stock",
          "Mark popular items to increase visibility",
        ].map((tip) => (
          <View key={tip} className="mt-1 flex-row items-start gap-1.5">
            <Txt size="tiny" tone="soft">
              •
            </Txt>
            <Txt size="tiny" tone="soft" className="flex-1">
              {tip}
            </Txt>
          </View>
        ))}
        <Button
          label="View Insights"
          icon="trending-up-outline"
          variant="outline"
          size="sm"
          className="mt-3 self-start px-4"
          onPress={() => router.push("/(tabs)/earnings")}
        />
      </View>
    </View>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

/** How the menu can be ordered. The Sort button used to do nothing. */
type SortKey = "name" | "priceLow" | "priceHigh" | "stock";

const SORTS: Record<
  SortKey,
  { label: string; short: string; compare: (a: MenuItem, b: MenuItem) => number }
> = {
  name: {
    label: "Name (A–Z)",
    short: "A–Z",
    compare: (a, b) => a.name.localeCompare(b.name),
  },
  priceLow: {
    label: "Price (low to high)",
    short: "₹ ↑",
    compare: (a, b) => a.price - b.price,
  },
  priceHigh: {
    label: "Price (high to low)",
    short: "₹ ↓",
    compare: (a, b) => b.price - a.price,
  },
  stock: {
    label: "Out of stock first",
    short: "Stock",
    compare: (a, b) => Number(a.inStock) - Number(b.inStock),
  },
};

export default function VendorMenu() {
  const { menu, refresh } = useStore();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("all");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("name");
  const [sortOpen, setSortOpen] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  /**
   * Import a menu from a spreadsheet.
   *
   * The button had nothing behind it. The importer already existed for the
   * admin console; the vendor route puts their own restaurant in the path, so
   * a vendor cannot import a menu into somebody else's kitchen.
   */
  const importMenuSheet = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const file = picked.assets[0];
      setImporting(true);

      const body = new FormData();
      if (file.file) {
        body.append("file", file.file, file.name ?? "menu.xlsx");
      } else {
        body.append("file", {
          uri: file.uri,
          name: file.name ?? "menu.xlsx",
          type:
            file.mimeType ??
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        } as any);
      }

      const result: any = await uploadMenuSheet(body);
      await refresh();

      const created = result?.data?.created ?? result?.created ?? 0;
      const problems: string[] = result?.data?.problems ?? result?.problems ?? [];
      Alert.alert(
        problems.length > 0 ? "Imported with problems" : "Menu imported",
        problems.length > 0
          ? `${created} item(s) added. ${problems.slice(0, 3).join(" ")}`
          : `${created} item(s) added to your menu.`
      );
    } catch (reason: any) {
      Alert.alert("Could not import", reason?.message ?? "Please check the file and try again.");
    } finally {
      setImporting(false);
    }
  };

  const matches = (item: MenuItem, id: Tab) => {
    if (id === "all") return true;
    if (id === "bestsellers") return item.tag === "Bestseller";
    if (id === "veg") return item.veg;
    if (id === "nonveg") return !item.veg;
    return !item.inStock;
  };

  const term = query.trim().toLowerCase();
  const visible = menu
    .filter((item) => matches(item, tab))
    .filter((item) =>
      term
        ? item.name.toLowerCase().includes(term) || item.category.toLowerCase().includes(term)
        : true
    )
    // The Sort button did nothing at all; the list was always in whatever
    // order the API returned it.
    .sort(SORTS[sort].compare);

  const tabs: { id: Tab; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
    { id: "all", label: `All Items (${menu.length})` },
    { id: "bestsellers", label: `Bestsellers (${menu.filter((m) => m.tag === "Bestseller").length})` },
    { id: "veg", label: `Veg (${menu.filter((m) => m.veg).length})`, icon: "ellipse" },
    { id: "nonveg", label: `Non-Veg (${menu.filter((m) => !m.veg).length})`, icon: "triangle" },
    { id: "out", label: `Out of Stock (${menu.filter((m) => !m.inStock).length})` },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <View className="border-b border-line bg-surface">
        <PageBar
          title="Menu Management"
          subtitle="Add, edit and manage your restaurant menu"
        />
        <View className="flex-row gap-2.5 px-4 pb-3">
          <Button
            label={importing ? "Importing…" : "Excel Upload"}
            icon="document-text-outline"
            variant="outline"
            accent="ok"
            size="sm"
            className="flex-1"
            onPress={importMenuSheet}
          />
          <Button
            label="Add Item"
            icon="add"
            size="sm"
            className="flex-1"
            onPress={() => router.push("/item/new")}
          />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6">
        <CountsStrip />

        <View className="flex-row gap-2.5 px-4 pt-3">
          <SearchField
            placeholder="Search menu items…"
            value={query}
            onChangeText={setQuery}
            className="flex-1"
          />
          {/*
            Filter is the tab strip immediately below - "All items", veg,
            non-veg, bestsellers, out of stock - so a second Filter button
            beside it had nothing left to filter by, and did nothing.
          */}
          <ToolButton
            label={SORTS[sort].short}
            icon="swap-vertical-outline"
            onPress={() => setSortOpen((open) => !open)}
          />
        </View>

        {sortOpen && (
          <View className="mx-4 mt-2 overflow-hidden rounded-card border border-line">
            {(Object.keys(SORTS) as SortKey[]).map((key, index) => (
              <Pressable
                key={key}
                onPress={() => {
                  setSort(key);
                  setSortOpen(false);
                }}
                className={`flex-row items-center justify-between px-3 py-2.5 active:opacity-70 ${
                  index > 0 ? "border-t border-line" : ""
                }`}
              >
                <Txt size="sm" weight={sort === key ? "bold" : "regular"}>
                  {SORTS[key].label}
                </Txt>
                {sort === key && (
                  <Ionicons name="checkmark" size={16} color={colors.brand[600]} />
                )}
              </Pressable>
            ))}
          </View>
        )}

        <UnderlineTabs tabs={tabs} value={tab} onChange={setTab} className="mt-3 bg-surface" />

        <View className="gap-2.5 px-4 pt-3">
          {visible.length === 0 ? (
            <EmptyState
              icon="restaurant-outline"
              title="No items here"
              detail="Nothing matches this filter or search."
              action="Add Item"
              onAction={() => router.push("/item/new")}
            />
          ) : (
            visible.map((item, index) => <ItemRow key={item.id} item={item} index={index} />)
          )}
        </View>

        {visible.length > 0 && <Pager shown={visible.length} total={menu.length} />}
        <MenuTips />
      </ScrollView>
    </SafeAreaView>
  );
}
