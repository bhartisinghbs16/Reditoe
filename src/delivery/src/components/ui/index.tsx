import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  noteStyle,
  shadow,
  tints,
  toneStyles,
  type NoteTone,
  type TintName,
  type Tone,
} from "@/lib/theme";

/**
 * The component vocabulary of the reference screens.
 *
 * Green is the primary — Accept, earnings, Verified, Online. Red is the brand
 * and the chrome — auth CTAs, Scan, the active tab, Reject. Every control
 * takes an `accent`, so a screen picks its family once and the parts follow.
 */

export type Accent = "green" | "brand" | "info" | "neutral";

const accentColor: Record<Accent, string> = {
  green: colors.green[600],
  brand: colors.brand[500],
  info: colors.info.default,
  neutral: colors.ink.soft,
};

const accentSoft: Record<Accent, string> = {
  green: colors.green[50],
  brand: colors.brand[50],
  info: colors.info.soft,
  neutral: "#eef1f6",
};

/* ── Type ───────────────────────────────────────────────────────────────── */

type TextTone =
  | "default"
  | "soft"
  | "muted"
  | "faint"
  | "brand"
  | "green"
  | "ok"
  | "warn"
  | "bad"
  | "info"
  | "violet"
  | "white";

const textTones: Record<TextTone, string> = {
  default: "text-ink",
  soft: "text-ink-soft",
  muted: "text-ink-muted",
  faint: "text-ink-faint",
  brand: "text-brand-500",
  green: "text-green-700",
  ok: "text-ok",
  warn: "text-warn-ink",
  bad: "text-bad",
  info: "text-info",
  violet: "text-violet",
  white: "text-white",
};

export function Txt({
  children,
  size = "base",
  weight = "regular",
  tone = "default",
  className = "",
  numberOfLines,
  style,
}: {
  children: React.ReactNode;
  size?: "micro" | "tiny" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
  weight?: "regular" | "medium" | "semibold" | "bold";
  tone?: TextTone;
  className?: string;
  numberOfLines?: number;
  /** For one-off colours that come from data (tints, chart marks), not tokens. */
  style?: StyleProp<TextStyle>;
}) {
  const sizes = {
    micro: "text-[11px] leading-4",
    tiny: "text-xs",
    sm: "text-[13px] leading-[18px]",
    base: "text-[15px]",
    lg: "text-[17px]",
    xl: "text-xl",
    "2xl": "text-[22px] leading-7",
    "3xl": "text-[26px] leading-8",
    "4xl": "text-[32px] leading-10",
  }[size];

  const weights = {
    regular: "font-normal",
    medium: "font-medium",
    semibold: "font-semibold",
    bold: "font-bold",
  }[weight];

  return (
    <Text
      numberOfLines={numberOfLines}
      style={style}
      className={`${sizes} ${weights} ${textTones[tone]} ${className}`}
    >
      {children}
    </Text>
  );
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

export function Screen({
  children,
  scroll = true,
  className = "",
  edges = ["top"],
  contentClassName = "",
}: {
  children: React.ReactNode;
  scroll?: boolean;
  className?: string;
  edges?: ("top" | "bottom")[];
  contentClassName?: string;
}) {
  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName={`pb-8 ${contentClassName}`}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 ${contentClassName}`}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} className={`flex-1 bg-surface-sunken ${className}`}>
      {body}
    </SafeAreaView>
  );
}

export function Card({
  children,
  className = "",
  raised,
  style,
  ...rest
}: ViewProps & { className?: string; raised?: boolean }) {
  return (
    <View
      style={[raised ? shadow.raised : shadow.card, style]}
      className={`rounded-card border border-line bg-surface ${className}`}
      {...rest}
    >
      {children}
    </View>
  );
}

/**
 * The standard titled surface — a card whose first row is a heading and an
 * optional "View All ›" link, exactly as every panel in the reference opens.
 */
export function Panel({
  title,
  subtitle,
  action,
  onAction,
  actionIcon,
  accent = "info",
  right,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  /** "none" drops the chevron — the Edit links carry a pencil on the left. */
  actionIcon?: keyof typeof Ionicons.glyphMap | "none";
  accent?: Accent;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      {(title || action || right) && (
        <View className="flex-row items-center justify-between gap-3 px-4 pb-3 pt-4">
          <View className="min-w-0 flex-1">
            {title && (
              <Txt size="lg" weight="bold" numberOfLines={1}>
                {title}
              </Txt>
            )}
            {subtitle && (
              <Txt size="tiny" tone="muted" numberOfLines={2}>
                {subtitle}
              </Txt>
            )}
          </View>
          {right}
          {action && (
            <ActionLink
              label={action}
              onPress={onAction}
              accent={accent}
              icon={actionIcon}
            />
          )}
        </View>
      )}
      <View className={bodyClassName}>{children}</View>
    </Card>
  );
}

/** "View All ›" — the link that closes almost every panel header. */
export function ActionLink({
  label,
  onPress,
  accent = "info",
  size = "sm",
  icon = "chevron-forward",
}: {
  label: string;
  onPress?: () => void;
  accent?: Accent;
  size?: "tiny" | "sm";
  icon?: keyof typeof Ionicons.glyphMap | "none";
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className="flex-row items-center gap-0.5 active:opacity-60"
    >
      <Text
        style={{ color: accentColor[accent] }}
        className={`font-semibold ${size === "tiny" ? "text-xs" : "text-[13px]"}`}
      >
        {label}
      </Text>
      {icon !== "none" && (
        <Ionicons name={icon} size={13} color={accentColor[accent]} />
      )}
    </Pressable>
  );
}

/** Section heading that sits on the page background, above a card or a row. */
export function SectionTitle({
  title,
  action,
  onAction,
  accent = "info",
  dot,
  className = "",
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  accent?: Accent;
  /** The coloured bullet the Orders screen puts before each group heading. */
  dot?: string;
  className?: string;
}) {
  return (
    <View className={`flex-row items-center justify-between gap-3 ${className}`}>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        {dot && (
          <View style={{ backgroundColor: dot }} className="h-2 w-2 rounded-full" />
        )}
        <Txt size="lg" weight="bold" numberOfLines={1}>
          {title}
        </Txt>
      </View>
      {action && <ActionLink label={action} onPress={onAction} accent={accent} />}
    </View>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <View className={`h-px bg-line ${className}`} />;
}

/* ── Plates & tiles ─────────────────────────────────────────────────────── */

/** The tinted circle (or squircle) behind every icon in the reference. */
export function IconPlate({
  icon,
  tint = "green",
  size = 40,
  shape = "square",
  color,
  background,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint?: TintName;
  size?: number;
  shape?: "circle" | "square";
  color?: string;
  background?: string;
}) {
  const t = tints[tint];
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: background ?? t.bg,
        borderRadius: shape === "circle" ? size / 2 : size * 0.3,
      }}
      className="items-center justify-center"
    >
      <Ionicons name={icon} size={size * 0.48} color={color ?? t.fg} />
    </View>
  );
}

/**
 * One cell of a divided figure strip. The reference uses this shape in three
 * places — the green banner (white on green), the white performance card, and
 * Today's Progress — so the cell takes its own colours rather than three
 * near-identical components existing.
 */
export function StatCell({
  icon,
  tint,
  label,
  value,
  valueSize,
  order,
  note,
  noteTone,
  onDark,
  divided,
  action,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: TintName;
  label: string;
  value: string;
  /**
   * Four rupee figures across a phone leaves under 100pt a cell, which a
   * 17pt "₹12,450.00" does not fit. Strips carrying money set this to "sm";
   * strips carrying counts and percentages keep the default.
   */
  valueSize?: "sm" | "base" | "lg";
  /**
   * The reference orders these two both ways: money strips lead with the
   * period ("This Week" over "₹4,750.00"), figure strips lead with the number
   * ("92%" over "Acceptance Rate").
   */
  order?: "label-first" | "value-first";
  note?: string;
  noteTone?: TextTone;
  /** White-on-green, as used inside the earnings banner. */
  onDark?: boolean;
  /** Hairline on the leading edge — every cell but the first. */
  divided?: boolean;
  action?: string;
  onPress?: () => void;
}) {
  const Wrapper: React.ComponentType<any> = onPress ? Pressable : View;
  const t = tint ? tints[tint] : tints.green;

  const labelNode = (
    <Txt
      key="label"
      size="micro"
      tone={onDark ? "white" : "muted"}
      className={`text-center ${onDark ? "opacity-85" : ""}`}
      numberOfLines={2}
    >
      {label}
    </Txt>
  );

  const valueNode = (
    <Txt
      key="value"
      size={valueSize ?? "lg"}
      weight="bold"
      tone={onDark ? "white" : "default"}
      className="text-center"
      numberOfLines={1}
    >
      {value}
    </Txt>
  );

  return (
    <Wrapper
      onPress={onPress}
      className={`flex-1 items-center gap-0.5 px-1.5 ${
        divided ? (onDark ? "border-l border-white/20" : "border-l border-line") : ""
      } ${onPress ? "active:opacity-70" : ""}`}
    >
      {icon &&
        (onDark ? (
          <Ionicons name={icon} size={20} color="#ffffff" style={{ marginBottom: 4 }} />
        ) : (
          <IconPlate icon={icon} tint={tint ?? "green"} size={34} shape="circle" />
        ))}

      {order === "value-first" ? [valueNode, labelNode] : [labelNode, valueNode]}

      {note && (
        <Txt
          size="micro"
          weight={onDark ? "regular" : "semibold"}
          tone={onDark ? "white" : (noteTone ?? "muted")}
          className={`text-center ${onDark ? "opacity-75" : ""}`}
          numberOfLines={1}
          style={!onDark && !noteTone ? { color: t.fg } : undefined}
        >
          {note}
        </Txt>
      )}
      {action && (
        <View className="mt-1 flex-row items-center gap-0.5">
          <Text
            className={`text-[11px] font-medium ${onDark ? "text-white/85" : "text-info"}`}
          >
            {action}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={11}
            color={onDark ? "rgba(255,255,255,0.85)" : colors.info.default}
          />
        </View>
      )}
    </Wrapper>
  );
}

/**
 * Stand-in for photography — a tinted plate carrying the item's initial, so a
 * slow or missing image reads as deliberate rather than broken.
 */
export function Thumb({
  label,
  tint,
  size = 72,
  radius = 12,
  emoji,
}: {
  label: string;
  tint: { bg: string; fg: string };
  size?: number;
  radius?: number;
  emoji?: string;
}) {
  return (
    <View
      style={{ width: size, height: size, backgroundColor: tint.bg, borderRadius: radius }}
      className="items-center justify-center overflow-hidden"
    >
      {emoji ? (
        <Text style={{ fontSize: size * 0.42 }}>{emoji}</Text>
      ) : (
        <Text style={{ color: tint.fg, fontSize: size * 0.34 }} className="font-bold">
          {label.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

/* ── Controls ───────────────────────────────────────────────────────────── */

export function Button({
  label,
  onPress,
  variant = "solid",
  accent = "green",
  size = "md",
  icon,
  iconAccent,
  iconRight,
  loading,
  disabled,
  className = "",
  ...rest
}: PressableProps & {
  label: string;
  /** solid — filled accent. outline — accent border + accent label. soft —
   *  tinted background. plain — hairline border, ink label. */
  variant?: "solid" | "outline" | "soft" | "plain";
  accent?: Accent;
  size?: "sm" | "md" | "lg";
  icon?: keyof typeof Ionicons.glyphMap;
  /** Tints the leading icon alone — "Verify with Phone Call" sets a red
   *  handset beside an ink label, as the reference draws it. */
  iconAccent?: Accent;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  className?: string;
}) {
  const tint = accentColor[accent];

  const surface: StyleProp<ViewStyle> = {
    solid: { backgroundColor: tint, borderColor: tint },
    outline: { backgroundColor: "#ffffff", borderColor: tint },
    soft: { backgroundColor: accentSoft[accent], borderColor: accentSoft[accent] },
    plain: { backgroundColor: "#ffffff", borderColor: colors.line.default },
  }[variant];

  const content =
    variant === "solid" ? "#ffffff" : variant === "plain" ? colors.ink.default : tint;

  const sizes = { sm: "h-9 px-3", md: "h-11 px-4", lg: "h-[52px] px-5" }[size];
  const type = { sm: "text-[13px]", md: "text-[15px]", lg: "text-[16px]" }[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={surface}
      className={`flex-row items-center justify-center gap-2 rounded-tile border ${sizes} ${
        disabled || loading ? "opacity-50" : "active:opacity-80"
      } ${className}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={content} />
      ) : (
        icon && (
          <Ionicons
            name={icon}
            size={size === "sm" ? 15 : 17}
            color={iconAccent ? accentColor[iconAccent] : content}
          />
        )
      )}
      <Text style={{ color: content }} className={`font-semibold ${type}`}>
        {label}
      </Text>
      {iconRight && !loading && (
        <Ionicons name={iconRight} size={size === "sm" ? 14 : 17} color={content} />
      )}
    </Pressable>
  );
}

/** Square icon-only control — the bell, the "…" overflow, pager arrows. */
export function IconButton({
  icon,
  onPress,
  size = 38,
  tone = "bare",
  color,
  badge,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  tone?: "plain" | "bare";
  color?: string;
  badge?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? icon}
      hitSlop={6}
      style={{ width: size, height: size }}
      className={`items-center justify-center rounded-tile active:opacity-60 ${
        tone === "plain" ? "border border-line bg-surface" : ""
      }`}
    >
      <Ionicons name={icon} size={size * 0.55} color={color ?? colors.ink.default} />
      {badge !== undefined && badge > 0 && <CountDot count={badge} />}
    </Pressable>
  );
}

/** The red count bubble on the bell and the Orders tab. */
export function CountDot({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <View
      className={`absolute -right-1.5 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-brand-500 px-1 ${className}`}
    >
      <Text className="text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

/**
 * The Orders screen's filter pill: a word, then the matching count in a small
 * circle. Active fills green; the rest stay on a hairline.
 */
export function FilterChip({
  label,
  count,
  active,
  onPress,
  tone = "neutral",
}: {
  label: string;
  count?: number;
  active?: boolean;
  onPress?: () => void;
  tone?: Tone;
}) {
  const t = toneStyles[tone];
  return (
    <Pressable
      onPress={onPress}
      style={
        active
          ? { backgroundColor: colors.green[700], borderColor: colors.green[700] }
          : { backgroundColor: "#ffffff", borderColor: colors.line.default }
      }
      className="h-10 flex-row items-center gap-1.5 rounded-tile border px-3.5 active:opacity-80"
    >
      <Text
        style={{ color: active ? "#ffffff" : colors.ink.soft }}
        className="text-[13px] font-semibold"
      >
        {label}
      </Text>
      {count !== undefined && (
        <View
          style={{ backgroundColor: active ? "rgba(255,255,255,0.22)" : t.bg }}
          className="h-[18px] min-w-[18px] items-center justify-center rounded-full px-1"
        >
          <Text
            style={{ color: active ? "#ffffff" : t.fg }}
            className="text-[10px] font-bold"
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Status pill — soft background, coloured label, optional leading dot or tick. */
export function Badge({
  label,
  tone = "neutral",
  icon,
  dot,
  className = "",
}: {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  dot?: boolean;
  className?: string;
}) {
  const style = toneStyles[tone];
  return (
    <View
      style={{ backgroundColor: style.bg }}
      className={`flex-row items-center gap-1 self-start rounded-chip px-2 py-1 ${className}`}
    >
      {dot && (
        <View style={{ backgroundColor: style.fg }} className="h-1.5 w-1.5 rounded-full" />
      )}
      {icon && <Ionicons name={icon} size={11} color={style.fg} />}
      <Text style={{ color: style.fg }} className="text-[11px] font-semibold">
        {label}
      </Text>
    </View>
  );
}

/** The green outlined "● Online ⌄" control the reference puts on every screen. */
export function DutyPill({
  online,
  onPress,
  compact,
}: {
  online: boolean;
  onPress?: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={online ? "Go offline" : "Go online"}
      style={{
        borderColor: online ? colors.green[500] : colors.line.strong,
        backgroundColor: online ? colors.green[50] : "#ffffff",
      }}
      className={`flex-row items-center gap-1.5 rounded-pill border px-3 active:opacity-70 ${
        compact ? "h-8" : "h-9"
      }`}
    >
      <View
        style={{ backgroundColor: online ? colors.green[600] : colors.ink.faint }}
        className="h-2 w-2 rounded-full"
      />
      <Text
        style={{ color: online ? colors.green[700] : colors.ink.muted }}
        className="text-[13px] font-semibold"
      >
        {online ? "Online" : "Offline"}
      </Text>
      <Ionicons
        name="chevron-down"
        size={13}
        color={online ? colors.green[700] : colors.ink.muted}
      />
    </Pressable>
  );
}

/* ── Fields ─────────────────────────────────────────────────────────────── */

/**
 * The reference's form field: a hairline box with the label set small at the
 * top and the value or placeholder beneath. Leading icon, trailing icon and a
 * "select" chevron are all optional so one component covers every field on the
 * Complete Profile and KYC screens.
 */
/**
 * Six boxes that actually take a code, as the login reference draws it.
 *
 * `OtpBoxes` above only draws the boxes - it shows how far along a code is on
 * the verification cards and accepts nothing. This one is for typing into.
 *
 * One real input sits invisibly over the boxes and takes the typing, so
 * paste, autofill and the SMS code the keyboard offers all still work. Six
 * separate inputs look identical and break all three.
 */
export function OtpInput({
  value,
  onChangeText,
  length = 6,
}: {
  value: string;
  onChangeText: (next: string) => void;
  length?: number;
}) {
  const inputRef = React.useRef<TextInput>(null);
  const [focused, setFocused] = React.useState(false);
  const digits = value.padEnd(length).slice(0, length).split("");
  const cursor = Math.min(value.length, length - 1);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} className="relative">
      <View className="flex-row justify-between gap-2">
        {digits.map((digit, index) => {
          const active = focused && index === cursor;
          return (
            <View
              key={index}
              style={{
                borderColor: active
                  ? colors.bad.default
                  : digit.trim()
                    ? colors.line.strong
                    : colors.line.default,
                borderWidth: active ? 2 : 1,
              }}
              className="h-12 flex-1 items-center justify-center rounded-tile bg-surface"
            >
              <Txt size="lg" weight="bold">
                {digit.trim()}
              </Txt>
            </View>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(next) => onChangeText(next.replace(/[^0-9]/g, "").slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        maxLength={length}
        textContentType="oneTimeCode"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: 0 }}
      />
    </Pressable>
  );
}

/**
 * A field that offers a fixed set of answers instead of a text box.
 *
 * `Field` already draws a select - a tappable row with a chevron - but
 * nothing opened when it was tapped, so the two on the profile screen were
 * pictures of dropdowns. This one carries the list and the sheet that shows
 * it.
 *
 * Free typing is the wrong tool where the answers are known: "Wife", "wife"
 * and "spouse" are the same relationship, and only one of them sorts.
 */
export function SelectField({
  label,
  placeholder,
  value,
  options,
  onSelect,
  icon,
  title,
}: {
  label?: string;
  placeholder: string;
  value?: string;
  options: readonly string[];
  onSelect: (next: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Heading on the sheet; defaults to the field's own label. */
  title?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel={label ?? placeholder}>
        {/* Not editable: the sheet is the only way to set it, so a keyboard
            must never appear over the top of it. */}
        <View pointerEvents="none">
          <Field label={label} placeholder={placeholder} value={value} icon={icon} select />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        >
          {/* Swallows taps so choosing does not close by hitting the backdrop. */}
          <Pressable onPress={() => {}} className="rounded-t-[22px] bg-surface pb-8 pt-4">
            <View className="mb-2 flex-row items-center justify-between px-4">
              <Txt weight="bold" size="lg">
                {title ?? label ?? placeholder}
              </Txt>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.ink.muted} />
              </Pressable>
            </View>

            <ScrollView className="max-h-96">
              {options.map((option) => {
                const chosen = option === value;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                    className="flex-row items-center justify-between px-4 py-3.5 active:opacity-70"
                  >
                    <Txt weight={chosen ? "bold" : "regular"} tone={chosen ? "bad" : "default"}>
                      {option}
                    </Txt>
                    {chosen && (
                      <Ionicons name="checkmark" size={19} color={colors.bad.default} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function Field({
  label,
  placeholder,
  value,
  onChangeText,
  icon,
  iconTint = "red",
  trailing,
  onTrailing,
  select,
  keyboardType,
  secure,
  prefix,
  focusedAccent = "brand",
  className = "",
}: {
  label?: string;
  placeholder: string;
  value?: string;
  onChangeText?: (next: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTint?: TintName;
  trailing?: keyof typeof Ionicons.glyphMap;
  onTrailing?: () => void;
  /** Renders as a tappable row with a chevron instead of a text input. */
  select?: boolean;
  keyboardType?: "default" | "number-pad" | "email-address" | "phone-pad";
  secure?: boolean;
  /** "+91 ⌄" — the country prefix on every phone field. */
  prefix?: string;
  focusedAccent?: Accent;
  className?: string;
}) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View
      style={{
        borderColor: focused ? accentColor[focusedAccent] : colors.line.default,
      }}
      // min-w-0 so a field sharing a row (Full Name / Date of Birth) can shrink
      // rather than push its trailing icon past the card edge.
      className={`min-w-0 rounded-tile border bg-surface px-3 ${label ? "py-2" : "py-0"} ${className}`}
    >
      {label && (
        <Txt size="tiny" tone="muted" className="mb-0.5">
          {label}
        </Txt>
      )}

      <View className={`flex-row items-center gap-2 ${label ? "" : "h-12"}`}>
        {icon && (
          <Ionicons name={icon} size={18} color={tints[iconTint].fg} />
        )}

        {prefix && (
          <>
            <Text className="text-[15px] font-semibold text-ink">{prefix}</Text>
            <Ionicons name="chevron-down" size={13} color={colors.ink.muted} />
            <View className="h-5 w-px bg-line" />
          </>
        )}

        {select ? (
          <Text
            className={`flex-1 text-[15px] ${value ? "text-ink" : "text-ink-muted"}`}
            numberOfLines={1}
          >
            {value || placeholder}
          </Text>
        ) : (
          <TextInput
            placeholder={placeholder}
            placeholderTextColor={colors.ink.faint}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType={keyboardType}
            secureTextEntry={secure}
            className={`flex-1 text-[15px] text-ink ${label ? "py-1" : "h-full"}`}
          />
        )}

        {select && <Ionicons name="chevron-down" size={16} color={colors.ink.muted} />}

        {trailing && (
          <Pressable onPress={onTrailing} hitSlop={8} className="active:opacity-60">
            <Ionicons name={trailing} size={18} color={colors.ink.faint} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Search field with a leading magnifier, as it appears above every list. */
export function SearchField({
  placeholder,
  value,
  onChangeText,
  className = "",
}: {
  placeholder: string;
  value?: string;
  onChangeText?: (next: string) => void;
  className?: string;
}) {
  return (
    <View
      className={`h-12 flex-row items-center gap-2 rounded-tile border border-line bg-surface px-3 ${className}`}
    >
      <Ionicons name="search" size={17} color={colors.ink.faint} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={colors.ink.faint}
        value={value}
        onChangeText={onChangeText}
        className="h-full flex-1 text-[14px] text-ink"
      />
    </View>
  );
}

/** "Filter" / "Today ⌄" — a hairline button with an icon and a word. */
export function ToolButton({
  label,
  icon,
  onPress,
  chevron,
  accent = "green",
  className = "",
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  chevron?: boolean;
  accent?: Accent;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-12 flex-row items-center justify-center gap-1.5 rounded-tile border border-line bg-surface px-3.5 active:opacity-80 ${className}`}
    >
      {icon && <Ionicons name={icon} size={16} color={accentColor[accent]} />}
      <Text style={{ color: accentColor[accent] }} className="text-[14px] font-semibold">
        {label}
      </Text>
      {chevron && <Ionicons name="chevron-down" size={14} color={colors.ink.muted} />}
    </Pressable>
  );
}

/**
 * The six-box OTP row. Read-only by design — this is a layout reproduction,
 * not a working auth flow, so the first box carries the caret and the rest sit
 * empty exactly as the reference draws them.
 */
export function OtpBoxes({
  length = 6,
  filled = 0,
  accent = "brand",
  boxed,
}: {
  length?: number;
  filled?: number;
  accent?: Accent;
  /** Larger squares, as on the Aadhaar and Bank verification cards. */
  boxed?: boolean;
}) {
  return (
    <View className="flex-row justify-between gap-2">
      {Array.from({ length }).map((_, index) => {
        const active = index === filled;
        return (
          <View
            key={index}
            style={{
              borderColor: active ? accentColor[accent] : colors.line.default,
              borderWidth: active ? 1.5 : 1,
            }}
            className={`flex-1 items-center justify-center rounded-tile bg-surface ${
              boxed ? "h-14" : "h-12"
            }`}
          >
            {index < filled ? (
              <Text className="text-[18px] font-bold text-ink">•</Text>
            ) : active ? (
              <View
                style={{ backgroundColor: accentColor[accent] }}
                className="h-5 w-[1.5px]"
              />
            ) : (
              <Text className="text-[15px] text-ink-faint">-</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** The dashed "Tap to upload" plate on every document screen. */
export function UploadBox({
  title = "Tap to upload",
  detail = "JPG, PNG or PDF (Max. 5MB)",
  accent = "brand",
  dashed = true,
  action,
  onAction,
  onPress,
}: {
  title?: string;
  detail?: string;
  accent?: Accent;
  dashed?: boolean;
  action?: string;
  onAction?: () => void;
  onPress?: () => void;
}) {
  const tint = accentColor[accent];
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderColor: dashed ? tint : colors.line.strong,
        borderStyle: "dashed",
        backgroundColor: dashed ? accentSoft[accent] : colors.surface.raised,
      }}
      className="items-center rounded-tile border px-4 py-6 active:opacity-80"
    >
      <View
        style={{ backgroundColor: dashed ? "#ffffff" : accentSoft[accent] }}
        className="h-14 w-14 items-center justify-center rounded-full"
      >
        <Ionicons name="cloud-upload-outline" size={26} color={tint} />
      </View>
      <Txt weight="semibold" className="mt-2.5">
        {title}
      </Txt>
      <Txt size="tiny" tone="faint" className="mt-0.5">
        {detail}
      </Txt>
      {action && (
        <Button
          label={action}
          variant="outline"
          accent="green"
          size="sm"
          icon="folder-open-outline"
          onPress={onAction}
          className="mt-3"
        />
      )}
    </Pressable>
  );
}

/** Green pill toggle — notifications, duty preferences. */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: colors.line.strong, true: colors.green[500] }}
      thumbColor="#ffffff"
      ios_backgroundColor={colors.line.strong}
    />
  );
}

/** Checkbox — the red tick beside every "I confirm …" line in the reference. */
export function CheckBox({
  checked,
  onChange,
  accent = "brand",
  accessibilityLabel,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  accent?: Accent;
  accessibilityLabel?: string;
}) {
  const tint = accentColor[accent];
  return (
    <Pressable
      onPress={() => onChange?.(!checked)}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      style={{
        backgroundColor: checked ? tint : "#ffffff",
        borderColor: checked ? tint : colors.line.strong,
      }}
      className="h-[19px] w-[19px] items-center justify-center rounded-[5px] border-[1.5px] active:opacity-70"
    >
      {checked && <Ionicons name="checkmark" size={13} color="#ffffff" />}
    </Pressable>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */

/**
 * The underline tab strip — Documents uses it for My Documents / Verification
 * Status / Expired.
 */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  accent = "green",
  className = "",
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  accent?: Accent;
  className?: string;
}) {
  const tint = accentColor[accent];
  return (
    <View className={`flex-row border-b border-line ${className}`}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={{ borderBottomColor: active ? tint : "transparent" }}
            className="flex-1 items-center border-b-2 px-2 pb-2.5 pt-3 active:opacity-70"
          >
            <Text
              style={{ color: active ? tint : colors.ink.muted }}
              className={`text-[13px] ${active ? "font-bold" : "font-medium"}`}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The two-up "Scan QR / Enter Code" switch on the Scan screen. */
export function SegmentSwitch<T extends string>({
  options,
  value,
  onChange,
  accent = "brand",
}: {
  options: { id: T; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (next: T) => void;
  accent?: Accent;
}) {
  const tint = accentColor[accent];
  return (
    <View className="flex-row overflow-hidden rounded-tile border border-line bg-surface">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            style={{
              backgroundColor: active ? accentSoft[accent] : "#ffffff",
              borderBottomColor: active ? tint : "transparent",
            }}
            className="flex-1 flex-row items-center justify-center gap-2 border-b-2 py-3.5 active:opacity-80"
          >
            <Ionicons
              name={option.icon}
              size={17}
              color={active ? tint : colors.ink.soft}
            />
            <Text
              style={{ color: active ? tint : colors.ink.soft }}
              className="text-[14px] font-semibold"
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Rows, notes and meters ─────────────────────────────────────────────── */

/** Icon plate, title, optional detail, chevron — the profile menu row. */
export function LinkRow({
  icon,
  tint = "green",
  title,
  detail,
  right,
  onPress,
  titleTone = "default",
  className = "",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint?: TintName;
  title: string;
  detail?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  titleTone?: TextTone;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:opacity-70 ${className}`}
    >
      <IconPlate icon={icon} tint={tint} size={38} />
      <View className="min-w-0 flex-1">
        <Txt weight="semibold" tone={titleTone} numberOfLines={1}>
          {title}
        </Txt>
        {detail && (
          <Txt size="tiny" tone="muted" numberOfLines={1}>
            {detail}
          </Txt>
        )}
      </View>
      {right}
      <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
    </Pressable>
  );
}

/** "Label : Value" — the Personal Information and Transaction Details rows. */
export function DetailRow({
  icon,
  tint = "green",
  label,
  value,
  valueNode,
  align = "right",
  className = "",
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: TintName;
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  align?: "right" | "left";
  className?: string;
}) {
  return (
    <View className={`flex-row items-center gap-3 px-4 py-3 ${className}`}>
      {icon && <IconPlate icon={icon} tint={tint} size={32} />}
      <Txt size="sm" tone="soft" className="flex-1" numberOfLines={1}>
        {label}
      </Txt>
      {valueNode ?? (
        <Txt
          size="sm"
          weight="semibold"
          className={`max-w-[58%] ${align === "right" ? "text-right" : ""}`}
        >
          {value}
        </Txt>
      )}
    </View>
  );
}

/**
 * The tinted note strip that closes most screens — "100% Secure", "Why we need
 * your PAN?", "Your documents are safe with us".
 */
export function NoteBar({
  tone = "blue",
  icon,
  title,
  titleTone,
  detail,
  right,
  bordered = true,
  className = "",
  children,
}: {
  tone?: NoteTone;
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  /**
   * The reference sets the green and red notes' headings in their own colour
   * ("Your document is verified and secure.", "How to use?") and the blue and
   * amber ones in ink ("Safety First", "How Payout Works?", "Important:").
   */
  titleTone?: "accent" | "ink";
  detail?: string;
  right?: React.ReactNode;
  bordered?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const style = noteStyle[tone];
  const headingInk =
    (titleTone ?? (tone === "green" || tone === "red" ? "accent" : "ink")) === "ink";

  return (
    <View
      style={{
        backgroundColor: style.bg,
        borderColor: bordered ? style.border : "transparent",
      }}
      className={`rounded-card border p-3.5 ${className}`}
    >
      <View className="flex-row items-start gap-2.5">
        {icon && (
          <View
            style={{ backgroundColor: "#ffffff" }}
            className="h-9 w-9 items-center justify-center rounded-full"
          >
            <Ionicons name={icon} size={17} color={style.fg} />
          </View>
        )}
        <View className="min-w-0 flex-1">
          {title && (
            <Text
              style={{ color: headingInk ? colors.ink.default : style.fg }}
              className="text-[14px] font-bold"
            >
              {title}
            </Text>
          )}
          {detail && (
            <Txt size="tiny" tone="soft" className={title ? "mt-0.5" : ""}>
              {detail}
            </Txt>
          )}
          {children}
        </View>
        {right}
      </View>
    </View>
  );
}

/** Single-line footnote — the lock-and-sentence that ends most screens. */
export function FootNote({
  icon = "lock-closed",
  text,
  tone = "muted",
  className = "",
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  text: string;
  tone?: TextTone;
  className?: string;
}) {
  return (
    <View className={`flex-row items-center justify-center gap-1.5 ${className}`}>
      <Ionicons
        name={icon}
        size={13}
        color={tone === "green" ? colors.green[600] : colors.ink.muted}
      />
      <Txt size="tiny" tone={tone}>
        {text}
      </Txt>
    </View>
  );
}

/** The orange incentive meter and the KYC progress rule. */
export function ProgressBar({
  value,
  color = colors.orange.default,
  track = "#f1d9b8",
  height = 6,
  className = "",
}: {
  /** 0–1. */
  value: number;
  color?: string;
  track?: string;
  height?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      style={{ height, backgroundColor: track }}
      className={`overflow-hidden rounded-full ${className}`}
    >
      <View style={{ width: `${pct}%`, backgroundColor: color }} className="h-full rounded-full" />
    </View>
  );
}

export function Rating({
  value,
  count,
  size = "sm",
}: {
  value: number;
  count?: number;
  size?: "sm" | "md";
}) {
  return (
    <View className="flex-row items-center gap-1">
      <Ionicons name="star" size={size === "md" ? 15 : 13} color={colors.star} />
      <Text
        className={`font-bold text-ink ${size === "md" ? "text-[15px]" : "text-[13px]"}`}
      >
        {value.toFixed(1)}
      </Text>
      {count !== undefined && (
        <Text className="text-xs text-ink-muted">({count} Orders)</Text>
      )}
    </View>
  );
}

export function EmptyState({
  icon = "cube-outline",
  title,
  detail,
  action,
  onAction,
  accent = "green",
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
  accent?: Accent;
}) {
  return (
    <View className="items-center px-8 py-16">
      <View
        style={{ backgroundColor: accentSoft[accent] }}
        className="h-16 w-16 items-center justify-center rounded-full"
      >
        <Ionicons name={icon} size={28} color={accentColor[accent]} />
      </View>
      <Txt size="lg" weight="semibold" className="mt-4 text-center">
        {title}
      </Txt>
      {detail && (
        <Txt tone="muted" size="sm" className="mt-1 text-center">
          {detail}
        </Txt>
      )}
      {action && (
        <Button label={action} accent={accent} onPress={onAction} className="mt-5 px-6" />
      )}
    </View>
  );
}

export { colors, tints, accentColor, accentSoft };
