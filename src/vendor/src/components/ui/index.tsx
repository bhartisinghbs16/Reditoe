import React from "react";
import {
  ActivityIndicator,
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
import { colors, shadow, tints, toneStyles, type TintName, type Tone } from "@/lib/theme";

/**
 * The component vocabulary of the reference screens.
 *
 * Two accents run through the app exactly as the reference draws them: red on
 * Dashboard / Orders / Menu, indigo on Payments and Settings. Every control
 * below takes an `accent`, so a screen picks its family once and the parts
 * follow.
 */

export type Accent = "brand" | "indigo" | "ok" | "neutral";

const accentColor: Record<Accent, string> = {
  brand: colors.brand[600],
  indigo: colors.indigo[600],
  ok: colors.ok.default,
  neutral: colors.ink.soft,
};

const accentSoft: Record<Accent, string> = {
  brand: colors.brand[50],
  indigo: colors.indigo[50],
  ok: colors.ok.soft,
  neutral: "#eef1f6",
};

/* ── Type ───────────────────────────────────────────────────────────────── */

type TextTone =
  | "default"
  | "soft"
  | "muted"
  | "faint"
  | "brand"
  | "indigo"
  | "ok"
  | "warn"
  | "bad"
  | "info"
  | "white";

const textTones: Record<TextTone, string> = {
  default: "text-ink",
  soft: "text-ink-soft",
  muted: "text-ink-muted",
  faint: "text-ink-faint",
  brand: "text-brand-600",
  indigo: "text-indigo-600",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  info: "text-info",
  white: "text-white",
};

export function Txt({
  children,
  size = "base",
  weight = "regular",
  tone = "default",
  className = "",
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
  style,
}: {
  children: React.ReactNode;
  size?: "micro" | "tiny" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl";
  weight?: "regular" | "medium" | "semibold" | "bold";
  tone?: TextTone;
  className?: string;
  numberOfLines?: number;
  /**
   * Shrink to fit rather than truncate. For figures that come from data and
   * have no sensible abbreviation — a rupee total reading "₹18,45…" is worse
   * than the same total a point smaller.
   */
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  /** For one-off colours that come from data (stage rails, tints), not tokens. */
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
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
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
  accent = "brand",
  right,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  accent?: Accent;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <View className="flex-row items-center justify-between gap-3 px-4 pb-3 pt-4">
        <View className="min-w-0 flex-1">
          <Txt size="lg" weight="bold" numberOfLines={1}>
            {title}
          </Txt>
          {subtitle && (
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              {subtitle}
            </Txt>
          )}
        </View>
        {right}
        {action && <ActionLink label={action} onPress={onAction} accent={accent} />}
      </View>
      <View className={bodyClassName}>{children}</View>
    </Card>
  );
}

/** "View All ›" — the link that closes almost every panel header. */
export function ActionLink({
  label,
  onPress,
  accent = "brand",
  size = "sm",
}: {
  label: string;
  onPress?: () => void;
  accent?: Accent;
  size?: "tiny" | "sm";
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
      <Ionicons name="chevron-forward" size={13} color={accentColor[accent]} />
    </Pressable>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <View className={`h-px bg-line ${className}`} />;
}

/* ── Plates & tiles ─────────────────────────────────────────────────────── */

/** The tinted circle (or squircle) behind every icon in the reference. */
export function IconPlate({
  icon,
  tint = "red",
  size = 40,
  shape = "circle",
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
 * The KPI tile of the "Today's Overview" row. `filled` gives it the pastel
 * background the Orders and Payments screens use; the Dashboard leaves it
 * white with a hairline.
 */
export function StatTile({
  icon,
  tint = "green",
  label,
  value,
  footnote,
  footnoteTone = "muted",
  footnoteIcon,
  filled,
  compact,
  onPress,
  className = "",
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint?: TintName;
  label: string;
  value: string;
  footnote?: string;
  footnoteTone?: TextTone;
  footnoteIcon?: keyof typeof Ionicons.glyphMap;
  filled?: boolean;
  /**
   * Four tiles to a row instead of two.
   *
   * At a quarter of a phone's width the full tile cannot hold its label or a
   * rupee figure on one line, so the compact form shrinks the plate and the
   * value and lets the label take a second line rather than truncating it.
   */
  compact?: boolean;
  onPress?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = tints[tint];
  const Wrapper: React.ComponentType<any> = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={[
        filled ? { backgroundColor: t.bg, borderColor: t.bg } : undefined,
        !filled ? shadow.card : undefined,
        style,
      ]}
      className={`rounded-card border border-line bg-surface ${compact ? "p-2" : "p-3"} ${
        onPress ? "active:opacity-80" : ""
      } ${className}`}
    >
      <IconPlate
        icon={icon}
        tint={tint}
        size={compact ? 28 : 36}
        background={filled ? "#ffffff" : undefined}
      />
      <Txt
        size={compact ? "micro" : "tiny"}
        tone="muted"
        className={compact ? "mt-1.5" : "mt-2.5"}
        numberOfLines={compact ? 2 : 1}
      >
        {label}
      </Txt>
      <Txt
        /* A quarter of a phone's width holds about ten characters at this
           weight, which is "₹18,540.00" exactly. adjustsFontSizeToFit does
           nothing on web, so the size has to be right rather than elastic. */
        size={compact ? "sm" : "2xl"}
        weight="bold"
        className="mt-0.5"
        numberOfLines={1}
        adjustsFontSizeToFit={compact}
        minimumFontScale={0.7}
      >
        {value}
      </Txt>
      {footnote && (
        <View className="mt-1 flex-row items-center gap-1">
          {footnoteIcon && (
            <Ionicons
              name={footnoteIcon}
              size={11}
              color={
                footnoteTone === "ok"
                  ? colors.ok.default
                  : footnoteTone === "bad"
                    ? colors.bad.default
                    : footnoteTone === "warn"
                      ? colors.warn.default
                      : colors.ink.muted
              }
            />
          )}
          <Txt size="micro" weight="semibold" tone={footnoteTone} numberOfLines={1}>
            {footnote}
          </Txt>
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
  accent = "brand",
  size = "md",
  icon,
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

  const content = variant === "solid" ? "#ffffff" : variant === "plain" ? colors.ink.default : tint;

  const sizes = {
    sm: "h-9 px-3",
    md: "h-11 px-4",
    lg: "h-[52px] px-5",
  }[size];

  const label_ = {
    sm: "text-[13px]",
    md: "text-[15px]",
    lg: "text-[16px]",
  }[size];

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
        icon && <Ionicons name={icon} size={size === "sm" ? 15 : 17} color={content} />
      )}
      <Text style={{ color: content }} className={`font-semibold ${label_}`}>
        {label}
      </Text>
      {iconRight && !loading && (
        <Ionicons name={iconRight} size={size === "sm" ? 14 : 16} color={content} />
      )}
    </Pressable>
  );
}

/** Square icon-only control — the bell, the "…" overflow, pager arrows. */
export function IconButton({
  icon,
  onPress,
  size = 38,
  tone = "plain",
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
      <Ionicons name={icon} size={size * 0.5} color={color ?? colors.ink.soft} />
      {badge !== undefined && badge > 0 && <CountDot count={badge} />}
    </Pressable>
  );
}

/** The red count bubble on the bell and the Orders tab. */
export function CountDot({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <View
      className={`absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-brand-600 px-1 ${className}`}
    >
      <Text className="text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  icon,
  accent = "brand",
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: Accent;
}) {
  const tint = accentColor[accent];
  return (
    <Pressable
      onPress={onPress}
      style={
        active
          ? { borderColor: tint, backgroundColor: accentSoft[accent] }
          : { borderColor: colors.line.default, backgroundColor: "#ffffff" }
      }
      className="h-9 flex-row items-center gap-1.5 rounded-pill border px-3.5 active:opacity-80"
    >
      {icon && <Ionicons name={icon} size={13} color={active ? tint : colors.ink.muted} />}
      <Text
        style={{ color: active ? tint : colors.ink.soft }}
        className="text-[13px] font-medium"
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Status pill — soft background, coloured label, optional leading dot. */
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
      className={`h-11 flex-row items-center gap-2 rounded-tile border border-line bg-surface px-3 ${className}`}
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

/** "Filter" / "Sort" — a hairline button with an icon and a word. */
export function ToolButton({
  label,
  icon,
  onPress,
  className = "",
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-11 flex-row items-center justify-center gap-1.5 rounded-tile border border-line bg-surface px-3.5 active:opacity-80 ${className}`}
    >
      <Ionicons name={icon} size={15} color={colors.ink.soft} />
      <Text className="text-[14px] font-medium text-ink-soft">{label}</Text>
    </Pressable>
  );
}

/** Dropdown-looking control — a label and a chevron on a hairline. */
export function SelectButton({
  label,
  onPress,
  icon,
  accent,
  className = "",
}: {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: Accent;
  className?: string;
}) {
  const tint = accent ? accentColor[accent] : colors.ink.soft;
  return (
    <Pressable
      onPress={onPress}
      className={`h-10 flex-row items-center gap-2 rounded-tile border border-line bg-surface px-3 active:opacity-80 ${className}`}
    >
      {icon && <Ionicons name={icon} size={15} color={tint} />}
      <Text style={{ color: tint }} className="flex-1 text-[13px] font-medium" numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={14} color={colors.ink.faint} />
    </Pressable>
  );
}

/**
 * The underline tab strip that scopes each list. Active tab is the accent, in
 * accent-coloured text over a 2px accent rule.
 */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  accent = "brand",
  className = "",
}: {
  tabs: { id: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (next: T) => void;
  accent?: Accent;
  className?: string;
}) {
  const tint = accentColor[accent];
  return (
    <View className={`border-b border-line ${className}`}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4"
      >
        {tabs.map((tab) => {
          const active = tab.id === value;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onChange(tab.id)}
              style={{ borderBottomColor: active ? tint : "transparent" }}
              className="flex-row items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-3 active:opacity-70"
            >
              {tab.icon && (
                <Ionicons name={tab.icon} size={14} color={active ? tint : colors.ink.muted} />
              )}
              <Text
                style={{ color: active ? tint : colors.ink.muted }}
                className={`text-[13px] ${active ? "font-semibold" : "font-medium"}`}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Green pill toggle — item availability, store open, add-on on/off. */
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
      trackColor={{ false: colors.line.strong, true: colors.ok.default }}
      thumbColor="#ffffff"
      ios_backgroundColor={colors.line.strong}
    />
  );
}

/** Green/red square — the standard veg marker on Indian menus. */
export function VegMark({ veg, size = 14 }: { veg: boolean; size?: number }) {
  const tint = veg ? colors.veg : colors.nonveg;
  return (
    <View
      style={{ width: size, height: size, borderColor: tint }}
      className="items-center justify-center rounded-[3px] border-[1.5px]"
      accessibilityLabel={veg ? "Vegetarian" : "Non-vegetarian"}
    >
      {veg ? (
        <View
          style={{ width: size / 2.4, height: size / 2.4, backgroundColor: tint }}
          className="rounded-full"
        />
      ) : (
        <Ionicons name="triangle" size={size * 0.5} color={tint} />
      )}
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
      <Ionicons name="star" size={size === "md" ? 14 : 12} color="#f59e0b" />
      <Text className={`font-semibold text-ink ${size === "md" ? "text-[15px]" : "text-[13px]"}`}>
        {value.toFixed(1)}
      </Text>
      {count !== undefined && (
        <Text className="text-xs text-ink-muted">({count} Reviews)</Text>
      )}
    </View>
  );
}

/** Small +/− control used on variant and add-on rows. */
export function Stepper({
  quantity,
  onChange,
  compact,
  accent = "brand",
}: {
  quantity: number;
  onChange: (next: number) => void;
  compact?: boolean;
  accent?: Accent;
}) {
  const tint = accentColor[accent];
  return (
    <View
      style={{ borderColor: tint, backgroundColor: accentSoft[accent] }}
      className={`flex-row items-center rounded-tile border ${compact ? "h-8" : "h-9"}`}
    >
      <Pressable
        onPress={() => onChange(quantity - 1)}
        hitSlop={6}
        className="h-full w-8 items-center justify-center"
        accessibilityLabel="Decrease quantity"
      >
        <Ionicons name="remove" size={16} color={tint} />
      </Pressable>
      <Text style={{ color: tint }} className="w-6 text-center text-sm font-bold">
        {quantity}
      </Text>
      <Pressable
        onPress={() => onChange(quantity + 1)}
        hitSlop={6}
        className="h-full w-8 items-center justify-center"
        accessibilityLabel="Increase quantity"
      >
        <Ionicons name="add" size={16} color={tint} />
      </Pressable>
    </View>
  );
}

/**
 * The tinted promo strip that closes most screens — an icon plate, a pitch and
 * a button.
 */
export function PromoBanner({
  title,
  detail,
  action,
  onAction,
  icon = "megaphone",
  accent = "brand",
  className = "",
}: {
  title: string;
  detail: string;
  action: string;
  onAction?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: Accent;
  className?: string;
}) {
  return (
    <View
      style={{ backgroundColor: accentSoft[accent] }}
      className={`flex-row items-center gap-3 rounded-card p-4 ${className}`}
    >
      <View
        style={{ backgroundColor: "#ffffff" }}
        className="h-11 w-11 items-center justify-center rounded-full"
      >
        <Ionicons name={icon} size={20} color={accentColor[accent]} />
      </View>
      <View className="min-w-0 flex-1">
        <Text style={{ color: accentColor[accent] }} className="text-[15px] font-bold">
          {title}
        </Text>
        <Txt size="tiny" tone="soft" className="mt-0.5">
          {detail}
        </Txt>
      </View>
      <Button label={action} accent={accent} size="sm" onPress={onAction} />
    </View>
  );
}

export function EmptyState({
  icon = "cube-outline",
  title,
  detail,
  action,
  onAction,
  accent = "brand",
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
