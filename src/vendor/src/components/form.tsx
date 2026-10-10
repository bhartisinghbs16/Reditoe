import React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Txt, accentColor, accentSoft, colors, type Accent } from "@/components/ui";
import { tints, type TintName } from "@/lib/theme";

/**
 * Form parts for the item screens.
 *
 * The reference forms have a consistent grammar — a bold label with a red
 * asterisk when required, a hairline control with a leading glyph, and a
 * character counter tucked into the right of the field. These encode that once
 * so the wizard steps stay declarative.
 */

/* ── Progress ───────────────────────────────────────────────────────────── */

/**
 * The numbered stepper at the top of both wizards. Steps behind the current
 * one turn into green ticks; the current one is a filled accent circle.
 */
export function WizardSteps({
  steps,
  current,
  accent = "brand",
  onStep,
  icons,
}: {
  steps: string[];
  current: number;
  accent?: Accent;
  onStep?: (index: number) => void;
  /**
   * Icon per step. The item wizard numbers its steps; the signup wizard draws
   * a glyph in an outlined ring with the step number as a corner badge, so
   * both spellings live here.
   */
  icons?: (keyof typeof Ionicons.glyphMap)[];
}) {
  const tint = accentColor[accent];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="px-4 py-3"
    >
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        const glyph = icons?.[index];

        // Numbered spelling: the circle fills. Icon spelling: the ring tints
        // and the glyph carries the colour, as in the signup reference.
        const fill = glyph
          ? done || active
            ? accentSoft[accent]
            : "#ffffff"
          : done
            ? colors.ok.default
            : active
              ? tint
              : "#ffffff";

        const edge = done || active ? tint : colors.line.strong;
        const label_ = done || active ? tint : colors.ink.muted;

        return (
          <View key={label} className="flex-row items-center">
            <Pressable
              onPress={onStep ? () => onStep(index) : undefined}
              className="w-[86px] items-center active:opacity-70"
            >
              <View>
                <View
                  style={{ backgroundColor: fill, borderColor: edge }}
                  className={`items-center justify-center rounded-full border ${
                    glyph ? "h-10 w-10 border-2" : "h-8 w-8"
                  }`}
                >
                  {glyph ? (
                    <Ionicons
                      name={glyph}
                      size={19}
                      color={done || active ? tint : colors.ink.faint}
                    />
                  ) : done ? (
                    <Ionicons name="checkmark" size={16} color="#ffffff" />
                  ) : (
                    <Text
                      style={{ color: active ? "#ffffff" : colors.ink.faint }}
                      className="text-[13px] font-bold"
                    >
                      {index + 1}
                    </Text>
                  )}
                </View>

                {glyph && (done || active) && (
                  <View
                    style={{ backgroundColor: done ? colors.ok.default : tint }}
                    className="absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white px-1"
                  >
                    {done ? (
                      <Ionicons name="checkmark" size={9} color="#ffffff" />
                    ) : (
                      <Text className="text-[9px] font-bold text-white">{index + 1}</Text>
                    )}
                  </View>
                )}
              </View>

              <Text
                style={{ color: glyph ? label_ : done ? colors.ok.default : active ? tint : colors.ink.muted }}
                className={`mt-1.5 text-center text-[11px] ${active ? "font-bold" : "font-medium"}`}
                numberOfLines={2}
              >
                {label}
              </Text>
            </Pressable>

            {index < steps.length - 1 && (
              <View
                style={{ backgroundColor: done ? tint : colors.line.default }}
                className="mb-5 h-0.5 w-3"
              />
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

/* ── Fields ─────────────────────────────────────────────────────────────── */

export function FieldLabel({
  label,
  required,
  hint,
}: {
  label: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <View className="mb-1.5 flex-row items-center gap-1">
      <Txt size="sm" weight="bold">
        {label}
      </Txt>
      {required && (
        <Text style={{ color: colors.brand[600] }} className="text-[13px] font-bold">
          *
        </Text>
      )}
      {hint && (
        <Txt size="tiny" tone="muted">
          {hint}
        </Txt>
      )}
    </View>
  );
}

export function TextField({
  label,
  required,
  hint,
  placeholder,
  value,
  onChangeText,
  onBlur,
  icon,
  maxLength,
  multiline,
  keyboardType,
  secure,
  className = "",
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  placeholder: string;
  value?: string;
  onChangeText?: (next: string) => void;
  /** Fires when the field loses focus — for fields that tidy their input. */
  onBlur?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  maxLength?: number;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad";
  secure?: boolean;
  className?: string;
}) {
  return (
    <View className={className}>
      {label && <FieldLabel label={label} required={required} hint={hint} />}
      <View
        className={`flex-row gap-2 rounded-tile border border-line bg-surface px-3 ${
          multiline ? "py-2.5" : "h-12 items-center"
        }`}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={17}
            color={colors.ink.faint}
            style={multiline ? { marginTop: 2 } : undefined}
          />
        )}
        <TextInput
          placeholder={placeholder}
          placeholderTextColor={colors.ink.faint}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          maxLength={maxLength}
          multiline={multiline}
          keyboardType={keyboardType}
          secureTextEntry={secure}
          autoCapitalize={keyboardType === "email-address" || secure ? "none" : undefined}
          autoCorrect={secure ? false : undefined}
          className={`flex-1 text-[14px] text-ink ${multiline ? "min-h-[72px]" : "h-full"}`}
          style={multiline ? { textAlignVertical: "top" } : undefined}
        />
        {maxLength !== undefined && (
          <Txt size="tiny" tone="faint" className={multiline ? "self-end" : ""}>
            {(value ?? "").length}/{maxLength}
          </Txt>
        )}
      </View>
    </View>
  );
}

/** A field that opens a picker — rendered as a control with a chevron. */
export function SelectField({
  label,
  required,
  hint,
  value,
  placeholder,
  icon,
  onPress,
  className = "",
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  value?: string;
  placeholder: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  className?: string;
}) {
  return (
    <View className={className}>
      {label && <FieldLabel label={label} required={required} hint={hint} />}
      <Pressable
        onPress={onPress}
        className="h-12 flex-row items-center gap-2 rounded-tile border border-line bg-surface px-3 active:opacity-80"
      >
        {icon && <Ionicons name={icon} size={17} color={colors.ink.faint} />}
        <Text
          className={`flex-1 text-[14px] ${value ? "text-ink" : "text-ink-faint"}`}
          numberOfLines={1}
        >
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.ink.faint} />
      </Pressable>
    </View>
  );
}

/**
 * The bordered choice card the reference uses for item type, pricing mode and
 * "applies on" — a radio dot, an optional glyph, a title and a caption.
 */
export function RadioCard({
  label,
  detail,
  selected,
  onPress,
  icon,
  tint,
  accent = "brand",
  className = "",
}: {
  label: string;
  detail?: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: TintName;
  accent?: Accent;
  className?: string;
}) {
  const active = accentColor[accent];
  const plate = tint ? tints[tint] : null;

  return (
    <Pressable
      onPress={onPress}
      style={
        selected
          ? { borderColor: active, backgroundColor: accentSoft[accent] }
          : { borderColor: colors.line.default, backgroundColor: "#ffffff" }
      }
      className={`flex-row items-center gap-2.5 rounded-tile border p-3 active:opacity-80 ${className}`}
    >
      <View
        style={{ borderColor: selected ? active : colors.line.strong }}
        className="h-[18px] w-[18px] items-center justify-center rounded-full border-2"
      >
        {selected && (
          <View style={{ backgroundColor: active }} className="h-2.5 w-2.5 rounded-full" />
        )}
      </View>

      {icon && plate && (
        <View
          style={{ backgroundColor: plate.bg }}
          className="h-8 w-8 items-center justify-center rounded-full"
        >
          <Ionicons name={icon} size={16} color={plate.fg} />
        </View>
      )}

      <View className="min-w-0 flex-1">
        <Txt size="sm" weight="semibold" numberOfLines={1}>
          {label}
        </Txt>
        {detail && (
          <Txt size="tiny" tone="muted" numberOfLines={1}>
            {detail}
          </Txt>
        )}
      </View>

      {selected && <Ionicons name="checkmark-circle" size={18} color={active} />}
    </Pressable>
  );
}

export function CheckRow({
  label,
  detail,
  checked,
  onToggle,
  icon,
  accent = "brand",
}: {
  label: string;
  detail?: string;
  checked?: boolean;
  onToggle?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: Accent;
}) {
  const active = accentColor[accent];
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-center gap-2.5 py-2 active:opacity-70"
    >
      <View
        style={{
          borderColor: checked ? active : colors.line.strong,
          backgroundColor: checked ? active : "#ffffff",
        }}
        className="h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2"
      >
        {checked && <Ionicons name="checkmark" size={12} color="#ffffff" />}
      </View>
      {icon && <Ionicons name={icon} size={16} color={colors.ink.muted} />}
      <View className="min-w-0 flex-1">
        <Txt size="sm" numberOfLines={1}>
          {label}
        </Txt>
        {detail && (
          <Txt size="tiny" tone="muted" numberOfLines={1}>
            {detail}
          </Txt>
        )}
      </View>
    </Pressable>
  );
}

/** The multi-select tag pills — Bestseller, Popular, Jain Friendly, and so on. */
export function TagToggle({
  label,
  icon,
  tint,
  selected,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: TintName;
  selected?: boolean;
  onPress?: () => void;
}) {
  const plate = tints[tint];
  return (
    <Pressable
      onPress={onPress}
      style={
        selected
          ? { borderColor: plate.fg, backgroundColor: plate.bg }
          : { borderColor: colors.line.default, backgroundColor: "#ffffff" }
      }
      className="flex-row items-center gap-1.5 rounded-tile border px-3 py-2.5 active:opacity-80"
    >
      <Ionicons name={icon} size={14} color={selected ? plate.fg : colors.ink.muted} />
      <Text
        style={{ color: selected ? plate.fg : colors.ink.soft }}
        className="text-[13px] font-medium"
      >
        {label}
      </Text>
      {selected && <Ionicons name="checkmark-circle" size={14} color={plate.fg} />}
    </Pressable>
  );
}

/**
 * The tinted explainer panels the reference opens most wizard steps with —
 * "Make it your way!", "Set the right price!", "Pricing Tips".
 */
export function NoteCard({
  title,
  detail,
  bullets,
  icon,
  tint = "violet",
  className = "",
}: {
  title?: string;
  detail?: string;
  bullets?: string[];
  icon: keyof typeof Ionicons.glyphMap;
  tint?: TintName;
  className?: string;
}) {
  const plate = tints[tint];
  return (
    <View
      style={{ backgroundColor: plate.bg }}
      className={`flex-row items-start gap-3 rounded-card p-3.5 ${className}`}
    >
      <View
        style={{ backgroundColor: "#ffffff" }}
        className="h-9 w-9 items-center justify-center rounded-full"
      >
        <Ionicons name={icon} size={18} color={plate.fg} />
      </View>
      <View className="min-w-0 flex-1">
        {title && (
          <Text style={{ color: plate.fg }} className="text-[15px] font-bold">
            {title}
          </Text>
        )}
        {detail && (
          <Txt size="tiny" tone="soft" className="mt-0.5">
            {detail}
          </Txt>
        )}
        {bullets?.map((bullet) => (
          <View key={bullet} className="mt-1 flex-row items-start gap-1.5">
            <Txt size="tiny" tone="soft">
              •
            </Txt>
            <Txt size="tiny" tone="soft" className="flex-1">
              {bullet}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The dashed "Add Image" slot at the end of the image strip. */
export function UploadTile({
  size = 76,
  label = "Add Image",
  onPress,
  accent = "brand",
}: {
  size?: number;
  label?: string;
  onPress?: () => void;
  accent?: Accent;
}) {
  const tint = accentColor[accent];
  return (
    <Pressable
      onPress={onPress}
      style={{ width: size, height: size, borderColor: tint }}
      className="items-center justify-center gap-1 rounded-tile border border-dashed active:opacity-70"
    >
      <Ionicons name="camera-outline" size={18} color={tint} />
      <Text style={{ color: tint }} className="text-[10px] font-semibold">
        {label}
      </Text>
    </Pressable>
  );
}

/** A key/value line — the shape every review and detail panel repeats. */
export function KeyValue({
  label,
  value,
  children,
  className = "",
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`flex-row items-center justify-between gap-3 py-1.5 ${className}`}>
      <Txt size="sm" tone="muted" className="flex-1" numberOfLines={1}>
        {label}
      </Txt>
      {children ?? (
        <Txt size="sm" weight="semibold" className="flex-1 text-right" numberOfLines={2}>
          {value}
        </Txt>
      )}
    </View>
  );
}
