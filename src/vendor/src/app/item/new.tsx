import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageBar } from "@/components/screen-header";
import { Photo } from "@/components/photo";
import {
  CheckRow,
  KeyValue,
  NoteCard,
  RadioCard,
  SelectField,
  TagToggle,
  TextField,
  UploadTile,
  WizardSteps,
} from "@/components/form";
import {
  Badge,
  Button,
  Card,
  Divider,
  IconPlate,
  Toggle,
  Txt,
  VegMark,
  colors,
} from "@/components/ui";
import { currency, money } from "@/lib/format";
import { photoFor } from "@/lib/adapters";
import { img } from "@/lib/images";
import { categoryTint, tints, type TintName } from "@/lib/theme";
import {
  useStore,
  type FoodType,
  type ItemAddon,
  type ItemVariantGroup,
  type MenuItem,
} from "@/lib/store";

/**
 * Add / Edit Menu Item — a copy of the reference five-step wizard.
 *
 * Item Details → Variants / Add-ons → Pricing → Availability → Review, with
 * the same explainer panels, the same controls and the same footer pairing.
 *
 * `?id=` opens the form on an existing item and saves with PATCH; without it
 * the final step POSTs a new one. Variants map to the API's modifierGroups
 * and add-ons to its addons array.
 *
 * Spice level, tags and the image strip are still presentational — FoodItem
 * has no field for any of them.
 */

const STEPS = ["Item Details", "Variants / Add-ons", "Pricing", "Availability", "Review"];

const TAGS: { label: string; icon: keyof typeof Ionicons.glyphMap; tint: TintName }[] = [
  { label: "Bestseller", icon: "star", tint: "green" },
  { label: "Popular", icon: "flame", tint: "amber" },
  { label: "New", icon: "sparkles", tint: "blue" },
  { label: "Chef's Special", icon: "ribbon", tint: "violet" },
  { label: "Healthy", icon: "heart", tint: "pink" },
  { label: "Jain Friendly", icon: "leaf", tint: "teal" },
];

/* ── Step 1 — Item Details ──────────────────────────────────────────────── */

function ItemDetailsStep({
  name,
  setName,
  description,
  setDescription,
  type,
  setType,
  tags,
  toggleTag,
  visible,
  setVisible,
  category,
  setCategory,
}: {
  name: string;
  setName: (next: string) => void;
  description: string;
  setDescription: (next: string) => void;
  type: string;
  setType: (next: string) => void;
  tags: string[];
  toggleTag: (tag: string) => void;
  visible: boolean;
  setVisible: (next: boolean) => void;
  category: string;
  setCategory: (next: string) => void;
}) {
  return (
    <View className="gap-3">
      <Card className="p-4">
        <View className="flex-row gap-3">
          <View>
            <Photo uri={img("curryBread", 260)} width={96} height={96} radius={10} />
            <View className="absolute bottom-1.5 right-1.5 h-7 w-7 items-center justify-center rounded-lg bg-white">
              <Ionicons name="camera" size={14} color={colors.ink.default} />
            </View>
          </View>
          <View className="min-w-0 flex-1 gap-3">
            <TextField
              label="Item Name"
              required
              placeholder="Enter item name"
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
          </View>
        </View>

        <TextField
          label="Description"
          required
          placeholder="Describe the dish"
          value={description}
          onChangeText={setDescription}
          maxLength={200}
          multiline
          className="mt-3"
        />

        {/* Free text, not a picker: the API stores category as a string and
            exposes no taxonomy endpoint to choose from. */}
        <TextField
          label="Category"
          required
          placeholder="North Indian, Biryani, Desserts…"
          icon="grid-outline"
          value={category}
          onChangeText={setCategory}
          className="mt-3"
        />
      </Card>

      <Card className="p-4">
        <Txt size="sm" weight="bold">
          Item Type <Txt size="sm" weight="bold" tone="brand">*</Txt>
        </Txt>
        <View className="mt-2 gap-2">
          {[
            { label: "Veg", icon: "ellipse" as const, tint: "green" as const },
            { label: "Non-Veg", icon: "triangle" as const, tint: "red" as const },
            { label: "Eggetarian", icon: "ellipse" as const, tint: "amber" as const },
          ].map((option) => (
            <RadioCard
              key={option.label}
              label={option.label}
              icon={option.icon}
              tint={option.tint}
              selected={type === option.label}
              onPress={() => setType(option.label)}
              accent="ok"
            />
          ))}
        </View>

        <View className="mt-3 flex-row gap-2.5">
          <SelectField
            label="Spice Level"
            value="Medium"
            placeholder="Select"
            icon="flame-outline"
            className="flex-1"
          />
        </View>
      </Card>

      <Card className="p-4">
        <Txt size="sm" weight="bold">
          Item Tags{" "}
          <Txt size="tiny" tone="muted">
            (Select all that apply)
          </Txt>
        </Txt>
        <View className="mt-2.5 flex-row flex-wrap gap-2">
          {TAGS.map((tag) => (
            <TagToggle
              key={tag.label}
              label={tag.label}
              icon={tag.icon}
              tint={tag.tint}
              selected={tags.includes(tag.label)}
              onPress={() => toggleTag(tag.label)}
            />
          ))}
        </View>
      </Card>

      <Card className="p-4">
        <Txt size="sm" weight="bold">
          Upload Images{" "}
          <Txt size="tiny" tone="muted">
            (Max 5 images)
          </Txt>
        </Txt>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2.5 pt-3"
        >
          {[0, 1, 2].map((index) => (
            <View key={index}>
              <Photo
                uri={img("curryBread", 200)}
                width={76}
                height={76}
                radius={10}
                tint={categoryTint(index)}
              />
              {index === 0 ? (
                <View className="absolute bottom-1 left-1 rounded-[4px] bg-brand-600 px-1.5 py-0.5">
                  <Txt size="micro" weight="bold" tone="white">
                    Cover
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

      <Card className="flex-row items-center gap-3 p-4">
        <View className="min-w-0 flex-1">
          <Txt weight="bold">Item Status</Txt>
          <Txt size="tiny" tone="muted">
            Show this item to customers
          </Txt>
        </View>
        <Toggle value={visible} onValueChange={setVisible} accessibilityLabel="Item visible" />
      </Card>
    </View>
  );
}

/* ── Step 2 — Variants & add-ons ────────────────────────────────────────── */

/**
 * A name + price row that edits in place. Used for both lists.
 *
 * `leading` carries the variant list's default marker and `trailing` the
 * add-on list's on-sale switch, so the two lists stay one row component.
 */
function EditableRow({
  name,
  price,
  onName,
  onPrice,
  onRemove,
  placeholder,
  leading,
  trailing,
}: {
  name: string;
  price: number;
  onName: (next: string) => void;
  onPrice: (next: number) => void;
  onRemove: () => void;
  placeholder: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-2 border-t border-line px-3 py-2">
      {leading}
      <View className="min-w-0 flex-[1.6]">
        <TextField placeholder={placeholder} value={name} onChangeText={onName} />
      </View>
      <View className="w-[86px]">
        <TextField
          placeholder="₹0"
          keyboardType="numeric"
          value={price ? String(price) : ""}
          onChangeText={(next) => onPrice(Number(next.replace(/[^0-9.]/g, "")) || 0)}
        />
      </View>
      {trailing}
      <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${name || placeholder}`}>
        <Ionicons name="trash-outline" size={17} color={colors.brand[600]} />
      </Pressable>
    </View>
  );
}

/** The "this one is the default" marker on a variant row. */
function DefaultMark({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`Make ${label} the default`}
    >
      <Ionicons
        name={on ? "radio-button-on" : "radio-button-off"}
        size={19}
        color={on ? colors.indigo[600] : colors.ink.faint}
      />
    </Pressable>
  );
}

function VariantsStep({
  variants,
  setVariants,
  addons,
  setAddons,
}: {
  variants: ItemVariantGroup[];
  setVariants: React.Dispatch<React.SetStateAction<ItemVariantGroup[]>>;
  addons: ItemAddon[];
  setAddons: React.Dispatch<React.SetStateAction<ItemAddon[]>>;
}) {
  // The API models variants as one modifier group with options, so the UI
  // edits a single group rather than pretending each size is independent.
  const group = variants[0];

  /**
   * Writes the option list back, keeping exactly one default.
   *
   * Without this the menu quotes whichever option happens to be first, so
   * dragging a cheaper size to the top would change the advertised price.
   */
  /*
   * Items saved before variants had a default carry none, so the first option
   * stands in until one is picked — the same rule the API applies when it
   * stores them. Without this every radio read as empty on an existing item.
   */
  const marked = (group?.options ?? []).findIndex((option) => option.isDefault);
  const shownDefault = marked === -1 ? 0 : marked;

  const setOptions = (options: { name: string; price: number; isDefault?: boolean }[]) => {
    if (!options.length) {
      setVariants([]);
      return;
    }
    const chosen = options.findIndex((option) => option.isDefault);
    const defaultIndex = chosen === -1 ? 0 : chosen;
    setVariants([
      {
        name: group?.name || "Size",
        required: true,
        options: options.map((option, index) => ({ ...option, isDefault: index === defaultIndex })),
      },
    ]);
  };

  return (
    <View className="gap-3">
      <NoteCard
        icon="cube"
        tint="violet"
        title="Make it your way!"
        detail="Add variants and add-ons to give customers more choices."
      />

      <Card className="overflow-hidden">
        <View className="flex-row items-center justify-between gap-3 p-3.5">
          <View className="min-w-0 flex-1">
            <Txt weight="bold">
              Variants{" "}
              <Txt size="tiny" tone="muted">
                (Optional)
              </Txt>
            </Txt>
            <Txt size="tiny" tone="muted">
              Add variants like size or type
            </Txt>
          </View>
          <Button
            label="Add Variant"
            icon="add"
            variant="outline"
            accent="indigo"
            size="sm"
            onPress={() => setOptions([...(group?.options ?? []), { name: "", price: 0 }])}
          />
        </View>

        {group?.options.length ? (
          <>
            <View className="border-t border-line px-3 pt-2">
              <TextField
                label="Group name"
                placeholder="Size"
                value={group.name}
                onChangeText={(next) =>
                  setVariants([{ ...group, name: next }])
                }
              />
            </View>
            {group.options.map((option, index) => (
              <EditableRow
                key={index}
                name={option.name}
                price={option.price}
                placeholder="Half / Full"
                leading={
                  <DefaultMark
                    on={index === shownDefault}
                    label={option.name || `option ${index + 1}`}
                    onPress={() =>
                      setOptions(
                        group.options.map((o, i) => ({ ...o, isDefault: i === index }))
                      )
                    }
                  />
                }
                /* Always the same width, marked or not: rendering the badge
                   only on one row pushed that row's fields out of line with
                   the rest of the list. */
                trailing={
                  <View className="w-[52px] items-end">
                    {index === shownDefault ? <Badge label="Default" tone="ok" /> : null}
                  </View>
                }
                onName={(next) =>
                  setOptions(
                    group.options.map((o, i) => (i === index ? { ...o, name: next } : o))
                  )
                }
                onPrice={(next) =>
                  setOptions(
                    group.options.map((o, i) => (i === index ? { ...o, price: next } : o))
                  )
                }
                onRemove={() => setOptions(group.options.filter((_, i) => i !== index))}
              />
            ))}
            <Txt size="micro" tone="muted" className="px-3.5 pb-3 pt-1">
              The marked variant is the one customers start on, and the price
              shown on the menu.
            </Txt>
          </>
        ) : (
          <Txt size="tiny" tone="muted" className="border-t border-line px-3.5 py-4 text-center">
            No variants. The item sells at its base price.
          </Txt>
        )}
      </Card>

      <Card className="overflow-hidden">
        <View className="flex-row items-center justify-between gap-3 p-3.5">
          <View className="min-w-0 flex-1">
            <Txt weight="bold">
              Add-ons{" "}
              <Txt size="tiny" tone="muted">
                (Optional)
              </Txt>
            </Txt>
            <Txt size="tiny" tone="muted">
              Let customers add extras
            </Txt>
          </View>
          <Button
            label="Add Add-on"
            icon="add"
            variant="outline"
            accent="indigo"
            size="sm"
            onPress={() =>
              setAddons((current) => [...current, { name: "", price: 0, available: true }])
            }
          />
        </View>

        {addons.length ? (
          addons.map((addon, index) => (
            <EditableRow
              key={index}
              name={addon.name}
              price={addon.price}
              placeholder="Extra cheese"
              /* An extra that has run out is switched off for the day rather
                 than deleted, which would lose its name and price. */
              trailing={
                <Toggle
                  value={addon.available}
                  onValueChange={(next) =>
                    setAddons((current) =>
                      current.map((a, i) => (i === index ? { ...a, available: next } : a))
                    )
                  }
                  accessibilityLabel={`${addon.available ? "Stop offering" : "Offer"} ${
                    addon.name || "this add-on"
                  }`}
                />
              }
              onName={(next) =>
                setAddons((current) =>
                  current.map((a, i) => (i === index ? { ...a, name: next } : a))
                )
              }
              onPrice={(next) =>
                setAddons((current) =>
                  current.map((a, i) => (i === index ? { ...a, price: next } : a))
                )
              }
              onRemove={() => setAddons((current) => current.filter((_, i) => i !== index))}
            />
          ))
        ) : (
          <Txt size="tiny" tone="muted" className="border-t border-line px-3.5 py-4 text-center">
            No add-ons yet.
          </Txt>
        )}
      </Card>

      <NoteCard
        icon="checkmark-circle"
        tint="green"
        title="Why add variants & add-ons?"
        bullets={[
          "More choices for your customers",
          "Increase average order value",
          "Better dining experience",
        ]}
      />
    </View>
  );
}

/* ── Step 3 — Pricing ───────────────────────────────────────────────────── */

function PricingStep({
  perVariant,
  setPerVariant,
  price,
  setPrice,
  variants,
  setVariants,
}: {
  perVariant: boolean;
  setPerVariant: (next: boolean) => void;
  price: string;
  setPrice: (next: string) => void;
  variants: ItemVariantGroup[];
  setVariants: React.Dispatch<React.SetStateAction<ItemVariantGroup[]>>;
}) {
  const group = variants[0];
  const base = Number(price) || 0;
  const addons = 0;

  return (
    <View className="gap-3">
      <NoteCard
        icon="cash"
        tint="violet"
        title="Set the right price!"
        detail="Good pricing helps you get more orders and grow your business."
      />

      <Card className="p-4">
        <Txt weight="bold">Base Pricing</Txt>
        <Txt size="tiny" tone="muted" className="mt-0.5">
          Choose how you want to set the price
        </Txt>

        {/* The base price is what the API stores on the item; variant prices
            live on the modifier options. Both are editable here. */}
        <TextField
          label="Base Price"
          required
          placeholder="Enter selling price"
          icon="cash-outline"
          keyboardType="numeric"
          value={price}
          onChangeText={(next) => setPrice(next.replace(/[^0-9.]/g, ""))}
          className="mt-3"
        />

        {group?.options.length ? (
          <>
            <View className="mt-3 gap-2">
              <RadioCard
                label="Set Different Price for Each Variant"
                detail="Recommended"
                selected={perVariant}
                onPress={() => setPerVariant(true)}
              />
              <RadioCard
                label="Same Price for All Variants"
                detail="Every variant sells at the base price"
                selected={!perVariant}
                onPress={() => {
                  setPerVariant(false);
                  setVariants([
                    { ...group, options: group.options.map((o) => ({ ...o, price: base })) },
                  ]);
                }}
              />
            </View>

            <View className="mt-3 overflow-hidden rounded-tile border border-line">
              <View className="flex-row gap-2 bg-surface-sunken px-3 py-2">
                <Txt size="micro" tone="muted" className="flex-1">
                  VARIANT
                </Txt>
                <Txt size="micro" tone="muted" className="w-[110px] text-right">
                  SELLING (₹)
                </Txt>
              </View>
              {group.options.map((option, index) => (
                <View
                  key={index}
                  className="flex-row items-center gap-2 border-t border-line px-3 py-2"
                >
                  <View className="flex-1">
                    <TextField
                      placeholder="Name, e.g. Half"
                      value={option.name}
                      onChangeText={(next) =>
                        setVariants([
                          {
                            ...group,
                            options: group.options.map((o, i) =>
                              i === index ? { ...o, name: next } : o
                            ),
                          },
                        ])
                      }
                    />
                  </View>
                  <View className="w-[110px]">
                    <TextField
                      placeholder="₹0"
                      keyboardType="numeric"
                      value={option.price ? String(option.price) : ""}
                      onChangeText={(next) =>
                        setVariants([
                          {
                            ...group,
                            options: group.options.map((o, i) =>
                              i === index
                                ? { ...o, price: Number(next.replace(/[^0-9.]/g, "")) || 0 }
                                : o
                            ),
                          },
                        ])
                      }
                    />
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          /*
           * Variants can be started here, not only on the earlier step.
           *
           * A vendor who did not add any on step 2 reached Pricing and was
           * told the item has no variants, with no way to make one - so the
           * half and full portions of a dish had to be entered as two
           * separate items with two separate photographs.
           */
          <View className="mt-2">
            <Txt size="tiny" tone="muted">
              This item has no variants, so the base price is what customers
              pay. Add variants if it is sold in more than one size.
            </Txt>
            <Button
              label="Add variants"
              icon="add"
              variant="outline"
              accent="indigo"
              size="sm"
              className="mt-2.5"
              onPress={() =>
                setVariants([
                  {
                    name: "Size",
                    required: true,
                    options: [
                      { name: "Half", price: base },
                      { name: "Full", price: base },
                    ],
                  },
                ])
              }
            />
          </View>
        )}

        {/* A row can be added or dropped from here too, so the list is not
            fixed at whatever step 2 happened to leave behind. */}
        {group?.options.length ? (
          <View className="mt-2 flex-row gap-2">
            <Button
              label="Add variant"
              icon="add"
              variant="outline"
              accent="indigo"
              size="sm"
              onPress={() =>
                setVariants([
                  { ...group, options: [...group.options, { name: "", price: base }] },
                ])
              }
            />
            {group.options.length > 1 && (
              <Button
                label="Remove last"
                icon="remove"
                variant="outline"
                accent="neutral"
                size="sm"
                onPress={() =>
                  setVariants([{ ...group, options: group.options.slice(0, -1) }])
                }
              />
            )}
          </View>
        ) : null}

        <View className="mt-3 flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Txt size="sm" weight="bold">
              Taxes
            </Txt>
            <Ionicons name="information-circle-outline" size={14} color={colors.ink.faint} />
          </View>
          <SelectField value="Included in Price" placeholder="Select" className="w-[168px]" />
        </View>

        <View
          style={{ backgroundColor: tints.green.bg }}
          className="mt-3 flex-row items-center gap-2.5 rounded-tile px-3 py-2.5"
        >
          <Ionicons name="checkmark-circle" size={18} color={tints.green.fg} />
          <View className="min-w-0 flex-1">
            <Txt size="sm" weight="semibold">
              GST will be calculated automatically
            </Txt>
            <Txt size="micro" tone="muted">
              5% GST on food items, as per government norms.
            </Txt>
          </View>
        </View>
      </Card>

      <Card className="p-4">
        <Txt weight="bold">
          Price Summary{" "}
          <Txt size="tiny" tone="muted">
            (Example)
          </Txt>
        </Txt>
        {/*
          The item's own price, without tax. GST was added here and the sum
          labelled "Total Amount (Customer Pays)", which is not what a menu
          price is - tax belongs on the bill, worked out once against the whole
          order. The add-ons line also named two specific extras whatever the
          item had against it.
        */}
        <Txt size="tiny" tone="muted" className="mt-0.5">
          What this item is listed at
        </Txt>
        <View className="mt-2.5">
          <KeyValue label="Item Price" value={money(base)} />
        </View>
        <View
          style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.line.strong }}
          className="mt-2 flex-row justify-between pt-2.5"
        >
          <Txt weight="bold">Item total</Txt>
          <Txt size="lg" weight="bold">
            {money(base + addons)}
          </Txt>
        </View>
        <Txt size="micro" tone="muted" className="mt-2">
          GST is added once on the order invoice, not to this price.
        </Txt>
      </Card>

      <NoteCard
        icon="bulb"
        tint="blue"
        title="Pricing Tips"
        bullets={[
          "Keep your prices competitive.",
          "Combos and add-ons increase average order value.",
          "Offer discounts smartly to attract more customers.",
        ]}
      />
    </View>
  );
}

/* ── Step 4 — Availability ──────────────────────────────────────────────── */

/** Reads a window back in words, so the saved meaning is visible before saving. */
function availabilityHint(from: string, to: string) {
  if (!from && !to) return "Set both times to limit when this item can be ordered.";
  if (!from || !to) return "Both times are needed — one on its own is ignored.";
  if (from === to) return "Start and end are the same, so this item is never orderable.";
  // The API treats an end earlier than the start as running past midnight.
  if (to < from) return `Orderable ${from} until ${to} the next day.`;
  return `Orderable ${from} to ${to} each day.`;
}

/**
 * A 24-hour "HH:mm" entry.
 *
 * Typing is left alone until the field is left, so a half-written "9" is not
 * rewritten under the cursor; on blur it is normalised ("9" → 09:00, "930" →
 * 09:30, "9:5" → 09:05) or cleared if it cannot be read as a time. Digits only,
 * so there is no way to enter a string the API will reject.
 */
/** Every half hour of the day, as a kitchen would open and close. */
const TIME_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
});

/** 24-hour value, shown the way it is read aloud. */
function readableTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h)) return value;
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * A time chosen from a list.
 *
 * This was a free-text box that guessed at whatever was typed - "7" became
 * 07:00, "730" became 07:30 - so anything unexpected saved a time the vendor
 * had not chosen, with no way to see the mistake afterwards.
 */
function TimeSelect({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <View className={className}>
      <Txt size="tiny" tone="muted">
        {label}
      </Txt>
      <Pressable
        onPress={() => setOpen(true)}
        className="mt-1 h-11 flex-row items-center justify-between rounded-tile border border-line px-3 active:opacity-70"
      >
        <Txt size="sm" tone={value ? "default" : "muted"}>
          {value ? readableTime(value) : "Select"}
        </Txt>
        <Ionicons name="time-outline" size={16} color={colors.ink.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        >
          <Pressable onPress={() => {}} className="rounded-t-[22px] bg-surface pb-8 pt-4">
            <View className="mb-2 flex-row items-center justify-between px-4">
              <Txt weight="bold" size="lg">
                {label}
              </Txt>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.ink.muted} />
              </Pressable>
            </View>
            <ScrollView className="max-h-96">
              {TIME_SLOTS.map((slot) => {
                const chosen = slot === value;
                return (
                  <Pressable
                    key={slot}
                    onPress={() => {
                      onChange(slot);
                      setOpen(false);
                    }}
                    className="flex-row items-center justify-between px-4 py-3 active:opacity-70"
                  >
                    <Txt weight={chosen ? "bold" : "regular"} tone={chosen ? "indigo" : "default"}>
                      {readableTime(slot)}
                    </Txt>
                    {chosen && (
                      <Ionicons name="checkmark" size={18} color={colors.indigo[600]} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}


/** The days of the week, as a kitchen writes them. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function AvailabilityStep({
  mode,
  setMode,
  days,
  setDays,
  availableFrom,
  setAvailableFrom,
  availableTo,
  setAvailableTo,
  prepMinutes,
  setPrepMinutes,
}: {
  mode: "always" | "hours" | "days";
  setMode: (next: "always" | "hours" | "days") => void;
  days: string[];
  setDays: React.Dispatch<React.SetStateAction<string[]>>;
  availableFrom: string;
  setAvailableFrom: (next: string) => void;
  availableTo: string;
  setAvailableTo: (next: string) => void;
  prepMinutes: string;
  setPrepMinutes: (next: string) => void;
}) {
  return (
    <View className="gap-3">
      {/* preparationTime is a real FoodItem field, so it lives with the other
          availability settings rather than beside the spice level. */}
      <Card className="p-4">
        <Txt weight="bold">Preparation Time</Txt>
        <Txt size="tiny" tone="muted" className="mt-0.5">
          How long the kitchen needs once an order lands
        </Txt>
        <TextField
          placeholder="20"
          icon="time-outline"
          keyboardType="numeric"
          value={prepMinutes}
          onChangeText={(next) => setPrepMinutes(next.replace(/[^0-9]/g, ""))}
          className="mt-2.5"
        />
        <Txt size="micro" tone="faint" className="mt-1">
          Minutes
        </Txt>
      </Card>
      <NoteCard
        icon="calendar"
        tint="amber"
        title="When can customers order this?"
        detail="Set when this item can be ordered and the stock alert for it."
      />

      <Card className="p-4">
        <Txt weight="bold">Available For</Txt>
        <View className="mt-2.5 flex-row gap-2">
          <RadioCard
            label="Always Available"
            detail="Available all the time"
            selected={mode === "always"}
            onPress={() => setMode("always")}
            className="flex-1"
          />
          <RadioCard
            label="Specific Hours"
            detail="Set daily time slots"
            selected={mode === "hours"}
            onPress={() => setMode("hours")}
            className="flex-1"
          />
          <RadioCard
            label="Specific Days"
            detail="Choose days of week"
            selected={mode === "days"}
            onPress={() => setMode("days")}
            className="flex-1"
          />
        </View>

        {/* The days this item is sold at all, when it is not every day. */}
        {mode === "days" && (
          <View className="mt-3 flex-row flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => {
              const on = days.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() =>
                    setDays((current) =>
                      current.includes(day)
                        ? current.filter((d) => d !== day)
                        : [...current, day]
                    )
                  }
                  style={{
                    backgroundColor: on ? colors.indigo[600] : "transparent",
                    borderColor: on ? colors.indigo[600] : colors.line.default,
                  }}
                  className="rounded-pill border px-3 py-1.5 active:opacity-70"
                >
                  <Txt size="tiny" weight="bold" tone={on ? "white" : "muted"}>
                    {day}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Only shown for a window — under "Always Available" there is nothing
            to set, and two greyed-out times invite the reading that a window
            was saved when none was. */}
        {mode !== "always" && (
          <>
            {/*
              Picked from a list rather than typed.
              
              These were free-text boxes that guessed at whatever was entered -
              "7" became 07:00, "730" became 07:30 - so a vendor who typed
              anything unexpected saved a time they had not chosen. Half-hour
              slots cover how a kitchen actually opens.
            */}
            <View className="mt-3 flex-row gap-2.5">
              <TimeSelect
                label="Start Time"
                value={availableFrom}
                onChange={setAvailableFrom}
                className="flex-1"
              />
              <TimeSelect
                label="End Time"
                value={availableTo}
                onChange={setAvailableTo}
                className="flex-1"
              />
            </View>
            <Txt size="micro" tone="faint" className="mt-1.5">
              {availabilityHint(availableFrom, availableTo)}
            </Txt>
          </>
        )}
      </Card>


    </View>
  );
}

/* ── Step 5 — Review ────────────────────────────────────────────────────── */

function ReviewStep({
  name,
  description,
  type,
  tags,
  category,
  price,
  prepMinutes,
  addons: addonList,
  variants,
  image,
  mode,
  days,
  availableFrom,
  availableTo,
}: {
  name: string;
  description: string;
  type: string;
  tags: string[];
  category: string;
  price: number;
  prepMinutes: number;
  addons: ItemAddon[];
  variants: ItemVariantGroup[];
  image?: string;
  mode: "always" | "hours" | "days";
  days: string[];
  availableFrom: string;
  availableTo: string;
}) {
  const base = price;
  // Only extras that are actually on sale; a switched-off add-on is not part
  // of what the customer can be charged.
  const addons = addonList
    .filter((addon) => addon.available)
    .reduce((sum, addon) => sum + addon.price, 0);

  /* Read back from what was chosen in the previous step. This card used to be
     six fixed lines, so a vendor who set Specific Days was told, on the screen
     they confirm from, that the item was always available. */
  const availableFor =
    mode === "always"
      ? "Always Available"
      : mode === "days"
        ? days.length
          ? `Specific Days — ${days.join(", ")}`
          : "Specific Days — none chosen yet"
        : "Specific Hours";

  const hours =
    mode === "always"
      ? "All day"
      : availableFrom && availableTo
        ? `${readableTime(availableFrom)} - ${readableTime(availableTo)}`
        : "Not set";

  return (
    <View className="gap-3">
      <NoteCard
        icon="checkmark-circle"
        tint="green"
        title="Almost done!"
        detail="Please review all the details before adding this item to your menu."
      />

      <Card className="p-4">
        <View className="flex-row items-center justify-between">
          <Txt weight="bold">Item Preview</Txt>
          <Txt size="tiny" weight="semibold" tone="indigo">
            Edit
          </Txt>
        </View>
        <View className="mt-3 flex-row gap-3">
          {/* The item's own photograph, not a stock curry: this preview is
              what the vendor confirms the item by. */}
          <Photo uri={image || photoFor(name)} width={88} height={88} radius={10} />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-start gap-1.5">
              <Txt weight="bold" className="shrink" numberOfLines={2}>
                {name || "Untitled item"}
              </Txt>
              <VegMark veg={type === "Veg"} size={13} />
            </View>
            <Txt size="tiny" tone="muted">
              {[category, type].filter(Boolean).join("  •  ") || "No category"}
            </Txt>
            <Txt size="tiny" tone="soft" className="mt-1" numberOfLines={3}>
              {description || "No description yet."}
            </Txt>
            <View className="mt-1.5 flex-row flex-wrap gap-1.5">
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag} label={tag} tone="ok" />
              ))}
            </View>
          </View>
        </View>
      </Card>

      <Card className="p-4">
        <Txt weight="bold">Variants</Txt>
        <Txt size="tiny" tone="soft" className="mt-1">
          {variants[0]?.options.length
            ? variants[0].options
                .map(
                  (option) =>
                    `${option.name || "Unnamed"} (${currency(option.price)})${
                      option.isDefault ? " — default" : ""
                    }`
                )
                .join("  •  ")
            : "None"}
        </Txt>
        <Divider className="my-3" />
        <Txt weight="bold">Add-ons</Txt>
        <Txt size="tiny" tone="soft" className="mt-1">
          {addonList.length
            ? addonList
                .map(
                  (addon) =>
                    `${addon.name || "Unnamed"} (${currency(addon.price)})${
                      addon.available ? "" : " — off"
                    }`
                )
                .join("  •  ")
            : "None"}
        </Txt>
        <Divider className="my-3" />
        <Txt weight="bold">Details</Txt>
        <Txt size="tiny" tone="soft" className="mt-1">
          {category || "No category"}  •  {type}  •  {prepMinutes} min prep
        </Txt>
      </Card>

      <Card className="p-4">
        {/* The review step, showing the same item amount the pricing step did. */}
        <Txt weight="bold">Pricing Summary</Txt>
        <View className="mt-2">
          <KeyValue label="Item Price" value={money(base)} />
        </View>
        <View
          style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.line.strong }}
          className="mt-2 flex-row justify-between pt-2.5"
        >
          <Txt weight="bold">Item total</Txt>
          <Txt size="lg" weight="bold">
            {money(base + addons)}
          </Txt>
        </View>
        <Txt size="micro" tone="muted" className="mt-2">
          GST is added once on the order invoice, not to this price.
        </Txt>
      </Card>

      <Card className="p-4">
        <Txt weight="bold">Availability</Txt>
        <View className="mt-2">
          <KeyValue label="Available For" value={availableFor} />
          <KeyValue label="Orderable Hours" value={hours} />
          <KeyValue
            label="Prep Time"
            value={prepMinutes ? `${prepMinutes} mins` : "Not set"}
          />
        </View>
      </Card>

      <NoteCard
        icon="shield-checkmark"
        tint="blue"
        title="Please double check!"
        detail="Make sure all details are correct. You can always edit after adding the item."
      />
    </View>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

/** The UI's words for FoodItem.foodType. */
const TYPE_TO_FOOD: Record<string, FoodType> = {
  Veg: "veg",
  "Non-Veg": "non-veg",
  Eggetarian: "egg",
};
const FOOD_TO_TYPE: Record<FoodType, string> = {
  veg: "Veg",
  "non-veg": "Non-Veg",
  egg: "Eggetarian",
};

/**
 * Resolves the item before the form mounts.
 *
 * The form seeds its fields with `useState(existing?.name ?? "")`, and those
 * initialisers run once. The store loads asynchronously, so mounting the form
 * before the menu arrives captured a blank item and silently discarded every
 * saved value. Waiting here — and keying the form by item id — means the
 * fields are seeded from real data exactly once.
 */
export default function AddEditItem() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { menu, loading } = useStore();

  if (!id) return <ItemForm key="new" />;

  const existing = menu.find((entry) => entry.id === id);

  if (!existing) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
        <View className="border-b border-line bg-surface">
          <PageBar title="Edit Menu Item" leading="back" />
        </View>
        <View className="flex-1 items-center justify-center gap-2">
          {loading || menu.length === 0 ? (
            <>
              <ActivityIndicator color={colors.brand[600]} />
              <Txt size="tiny" tone="muted">
                Loading item…
              </Txt>
            </>
          ) : (
            <Txt size="sm" tone="muted">
              That item no longer exists.
            </Txt>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return <ItemForm key={existing.id} existing={existing} />;
}

function ItemForm({ existing }: { existing?: MenuItem }) {
  const router = useRouter();
  const { saveItem } = useStore();

  const [step, setStep] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(existing?.name ?? "");
  const [description, setDescription] = React.useState(existing?.description ?? "");
  const [category, setCategory] = React.useState(existing?.category ?? "");
  const [price, setPrice] = React.useState(String(existing?.price ?? ""));
  const [prepMinutes, setPrepMinutes] = React.useState(String(existing?.prepMinutes ?? "20"));
  const [type, setType] = React.useState(FOOD_TO_TYPE[existing?.foodType ?? "veg"]);
  const [tags, setTags] = React.useState<string[]>([]);
  const [visible, setVisible] = React.useState(existing?.available ?? true);
  const [perVariant, setPerVariant] = React.useState(true);
  const [availableFrom, setAvailableFrom] = React.useState(existing?.availableFrom ?? "");
  const [availableTo, setAvailableTo] = React.useState(existing?.availableTo ?? "");
  /*
   * How this item is made available. An item that arrived with a window
   * opens on "Specific Hours" rather than "Always".
   */
  const [mode, setMode] = React.useState<"always" | "hours" | "days">(
    existing?.availableFrom && existing?.availableTo ? "hours" : "always"
  );
  const [days, setDays] = React.useState<string[]>(existing?.availableDays ?? []);

  const [addons, setAddons] = React.useState<ItemAddon[]>(existing?.addons ?? []);
  const [variants, setVariants] = React.useState<ItemVariantGroup[]>(existing?.variants ?? []);

  const toggleTag = (tag: string) =>
    setTags((current) =>
      current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]
    );


  const last = step === STEPS.length - 1;

  /** The one field the API refuses without, plus a price it can store. */
  const problem = !name.trim()
    ? "Give the item a name before saving."
    : !Number.isFinite(Number(price)) || Number(price) <= 0
      ? "Enter a price greater than zero."
      : null;

  const save = async () => {
    if (problem) {
      setSaveError(problem);
      setStep(0);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const savedId = await saveItem(
        {
          name,
          description,
          category,
          price: Number(price),
          foodType: TYPE_TO_FOOD[type] ?? "veg",
          prepMinutes: Number(prepMinutes) || 0,
          available: visible,
          // "Always Available" clears the window rather than leaving the last
          // typed times behind to take effect silently.
          // "Always Available" clears the window and the days rather than
          // leaving the last choice behind to take effect silently.
          availableFrom: mode === "always" ? "" : availableFrom,
          availableTo: mode === "always" ? "" : availableTo,
          availableDays: mode === "days" ? days : [],
          addons,
          variants,
        },
        existing?.id
      );
      router.replace(`/item/${savedId}`);
    } catch (reason: any) {
      setSaveError(reason?.message ?? "Couldn't save this item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <View className="border-b border-line bg-surface">
        <PageBar
          title={existing ? "Edit Menu Item" : "Add Menu Item"}
          subtitle={existing ? existing.name : "Add delicious items to your menu"}
          leading="back"
          /* A "Preview" button stood here with no handler; nothing in this
             app shows an item the way a customer would see it. */
        />
        <WizardSteps steps={STEPS} current={step} onStep={setStep} />
      </View>

      {saveError && (
        <View className="flex-row items-start gap-2 border-b border-line bg-bad-soft px-4 py-2.5">
          <Ionicons name="alert-circle" size={15} color={colors.bad.default} />
          <Txt size="tiny" className="flex-1 text-bad-ink">
            {saveError}
          </Txt>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-4 pb-6 pt-3">
        {step === 0 && (
          <ItemDetailsStep
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            type={type}
            setType={setType}
            tags={tags}
            toggleTag={toggleTag}
            visible={visible}
            setVisible={setVisible}
            category={category}
            setCategory={setCategory}
          />
        )}
        {step === 1 && (
          <VariantsStep
            variants={variants}
            setVariants={setVariants}
            addons={addons}
            setAddons={setAddons}
          />
        )}
        {step === 2 && (
          <PricingStep
            perVariant={perVariant}
            setPerVariant={setPerVariant}
            price={price}
            setPrice={setPrice}
            variants={variants}
            setVariants={setVariants}
          />
        )}
        {step === 3 && (
          <AvailabilityStep
            mode={mode}
            setMode={setMode}
            days={days}
            setDays={setDays}
            availableFrom={availableFrom}
            setAvailableFrom={setAvailableFrom}
            availableTo={availableTo}
            setAvailableTo={setAvailableTo}
            prepMinutes={prepMinutes}
            setPrepMinutes={setPrepMinutes}
          />
        )}
        {step === 4 && (
          <ReviewStep
            name={name}
            description={description}
            type={type}
            tags={tags}
            category={category}
            price={Number(price) || 0}
            prepMinutes={Number(prepMinutes) || 0}
            addons={addons}
            variants={variants}
            image={existing?.image}
            mode={mode}
            days={days}
            availableFrom={availableFrom}
            availableTo={availableTo}
          />
        )}
      </ScrollView>

      <View className="flex-row gap-2.5 border-t border-line bg-surface px-4 pb-6 pt-3">
        {/*
          The first step used to offer "Save as Draft" with no handler, and
          there are no drafts: an item is either on the menu or it is not.
          Leaving the wizard is what the back arrow does.
        */}
        {step === 0 ? (
          <Button
            label="Cancel"
            icon="close"
            variant="outline"
            className="flex-1"
            onPress={() => router.back()}
          />
        ) : (
          <Button
            label="Back"
            icon="chevron-back"
            variant="plain"
            className="flex-1"
            onPress={() => setStep((current) => current - 1)}
          />
        )}
        <Button
          label={
            saving
              ? "Saving…"
              : last
                ? existing
                  ? "Save Changes"
                  : "Add Item to Menu"
                : "Save & Continue"
          }
          iconRight={last ? undefined : "chevron-forward"}
          icon={last && !existing ? "add" : undefined}
          loading={saving}
          className="flex-[1.4]"
          onPress={() => (last ? save() : setStep((current) => current + 1))}
        />
      </View>
    </SafeAreaView>
  );
}
