import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, shadow, toneStyles, type Tone } from "@/lib/theme";

/**
 * The kit the reference screens are built from.
 *
 * Every shape below appears on at least three of the client's screens — the
 * tinted icon tile, the underline tab strip, the divided stat row, the pale
 * note strip, the "Need help?" footer. Building them once is what makes the
 * pages copies of the reference rather than approximations of it.
 */

/* ── Type ───────────────────────────────────────────────────────────────── */

type TextTone =
  | "default"
  | "soft"
  | "muted"
  | "faint"
  | "brand"
  | "ok"
  | "bad"
  | "warn"
  | "info"
  | "plus"
  | "white";

const textTones: Record<TextTone, string> = {
  default: "text-ink",
  soft: "text-ink-soft",
  muted: "text-ink-muted",
  faint: "text-ink-faint",
  brand: "text-brand-600",
  ok: "text-ok",
  bad: "text-bad",
  warn: "text-warn",
  info: "text-info",
  plus: "text-plus-600",
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
  size?: "micro" | "tiny" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl";
  weight?: "regular" | "medium" | "semibold" | "bold";
  tone?: TextTone;
  className?: string;
  numberOfLines?: number;
  /** For one-off colours that come from data (accent tints), not tokens. */
  style?: StyleProp<TextStyle>;
}) {
  const sizes = {
    micro: "text-[11px] leading-4",
    tiny: "text-xs",
    sm: "text-sm",
    base: "text-[15px]",
    lg: "text-[17px]",
    xl: "text-xl",
    "2xl": "text-2xl",
    "3xl": "text-3xl",
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

/**
 * The reference puts every screen on white and separates blocks with hairline
 * card borders rather than a grey canvas, so that is the default here.
 */
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
    <SafeAreaView edges={edges} className={`flex-1 bg-surface ${className}`}>
      {body}
    </SafeAreaView>
  );
}

export function Card({
  children,
  className = "",
  raised,
  ...rest
}: ViewProps & { className?: string; raised?: boolean }) {
  return (
    <View
      style={raised ? shadow.raised : undefined}
      className={`rounded-card border border-line bg-surface ${className}`}
      {...rest}
    >
      {children}
    </View>
  );
}

/** Bold heading with the reference's red "View All ›" affordance. */
export function SectionHead({
  title,
  action = "View All",
  onAction,
  tone = "brand",
  className = "",
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  tone?: "brand" | "plus";
  className?: string;
}) {
  return (
    <View className={`flex-row items-center justify-between ${className}`}>
      <Txt size="lg" weight="bold">
        {title}
      </Txt>
      {onAction && (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          className="flex-row items-center gap-0.5 active:opacity-60"
        >
          <Txt size="sm" weight="semibold" tone={tone}>
            {action}
          </Txt>
          <Ionicons
            name="chevron-forward"
            size={13}
            color={tone === "plus" ? colors.plus[600] : colors.brand[600]}
          />
        </Pressable>
      )}
    </View>
  );
}

export function Section({
  title,
  action,
  onAction,
  children,
  className = "",
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`mt-6 ${className}`}>
      <SectionHead
        title={title}
        action={action}
        onAction={onAction}
        className="mb-3 px-4"
      />
      {children}
    </View>
  );
}

/* ── Controls ───────────────────────────────────────────────────────────── */

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading,
  disabled,
  className = "",
  ...rest
}: PressableProps & {
  label: string;
  variant?:
    | "primary"
    | "green"
    | "plus"
    | "secondary"
    | "outline"
    | "ghost"
    | "muted";
  size?: "sm" | "md" | "lg";
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  className?: string;
}) {
  const variants = {
    primary: "bg-brand-600",
    green: "bg-leaf-700",
    plus: "bg-plus-600",
    secondary: "bg-surface border border-line",
    // The reference's most common secondary action: red text in a red hairline.
    outline: "bg-surface border border-brand-500",
    ghost: "bg-transparent",
    muted: "bg-surface-sunken",
  }[variant];

  const labelTone = {
    primary: "text-white",
    green: "text-white",
    plus: "text-white",
    secondary: "text-ink",
    outline: "text-brand-600",
    ghost: "text-brand-600",
    muted: "text-ink-faint",
  }[variant];

  const sizes = { sm: "h-9 px-3", md: "h-11 px-4", lg: "h-14 px-5" }[size];

  const solid = variant === "primary" || variant === "green" || variant === "plus";
  const iconColor = solid
    ? "#ffffff"
    : variant === "secondary"
      ? colors.ink.default
      : variant === "muted"
        ? colors.ink.faint
        : colors.brand[600];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`flex-row items-center justify-center gap-2 rounded-tile ${variants} ${sizes} ${
        disabled || loading ? "opacity-60" : "active:opacity-80"
      } ${className}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        icon && <Ionicons name={icon} size={size === "lg" ? 19 : 16} color={iconColor} />
      )}
      <Text
        className={`${labelTone} font-bold ${
          size === "lg" ? "text-[17px]" : size === "sm" ? "text-[13px]" : "text-[15px]"
        }`}
      >
        {label}
      </Text>
      {iconRight && !loading && (
        <Ionicons name={iconRight} size={size === "lg" ? 19 : 16} color={iconColor} />
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-9 flex-row items-center gap-1.5 rounded-pill border px-3 ${
        active ? "border-brand-500 bg-brand-50" : "border-line bg-surface"
      }`}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={14}
          color={active ? colors.brand[700] : colors.ink.muted}
        />
      )}
      <Text
        className={`text-sm font-medium ${active ? "text-brand-700" : "text-ink-soft"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Underline tab strip. The reference uses it on Orders, Payment and Offers —
 * red label with a red rule under the active one, grey elsewhere.
 */
export function TabStrip<T extends string>({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: readonly T[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <View className={`border-b border-line ${className}`}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4"
      >
        {tabs.map((tab) => {
          const active = tab === value;
          return (
            <Pressable
              key={tab}
              onPress={() => onChange(tab)}
              className="px-4 pb-2.5 pt-1 active:opacity-70"
            >
              <Text
                className={`text-[15px] ${
                  active ? "font-bold text-brand-600" : "font-medium text-ink-muted"
                }`}
              >
                {tab}
              </Text>
              <View
                className={`mt-2 h-[3px] rounded-full ${
                  active ? "bg-brand-600" : "bg-transparent"
                }`}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function Badge({
  label,
  tone = "neutral",
  icon,
  className = "",
}: {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  className?: string;
}) {
  const style = toneStyles[tone];
  return (
    <View
      style={{ backgroundColor: style.bg }}
      className={`flex-row items-center gap-1 self-start rounded-md px-2 py-1 ${className}`}
    >
      {icon && <Ionicons name={icon} size={11} color={style.fg} />}
      <Text style={{ color: style.fg }} className="text-[11px] font-semibold">
        {label}
      </Text>
    </View>
  );
}

/** Hairline-outlined pill — "Default", "Active", "Verified" in the reference. */
export function OutlineBadge({
  label,
  tone = "brand",
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const style = toneStyles[tone];
  return (
    <View
      style={{ borderColor: style.fg }}
      className="flex-row items-center gap-1 self-start rounded-md border px-1.5 py-0.5"
    >
      {icon && <Ionicons name={icon} size={10} color={style.fg} />}
      <Text style={{ color: style.fg }} className="text-[11px] font-semibold">
        {label}
      </Text>
    </View>
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
      <View
        style={{ width: size / 2.4, height: size / 2.4, backgroundColor: tint }}
        className="rounded-full"
      />
    </View>
  );
}

/** Green star + figure. The reference never uses amber for ratings. */
export function Rating({
  value,
  count,
  size = "sm",
  boxed,
}: {
  value: number;
  count?: string | number;
  size?: "sm" | "md";
  /** Pale green chip behind the figure — used on the dish screen. */
  boxed?: boolean;
}) {
  const star = size === "md" ? 13 : 11;
  const body = (
    <View className="flex-row items-center gap-1">
      <Ionicons name="star" size={star} color={colors.leaf[600]} />
      <Text
        className={`font-bold text-leaf-600 ${size === "md" ? "text-sm" : "text-xs"}`}
      >
        {value.toFixed(1)}
      </Text>
    </View>
  );

  return (
    <View className="flex-row items-center gap-1.5">
      {boxed ? (
        <View className="rounded-md bg-leaf-50 px-2 py-1">{body}</View>
      ) : (
        body
      )}
      {count !== undefined && (
        <Text className="text-xs text-ink-muted">({count})</Text>
      )}
    </View>
  );
}

/** Green +/− control — the reference's quantity stepper. */
export function Stepper({
  quantity,
  onChange,
  compact,
}: {
  quantity: number;
  onChange: (next: number) => void;
  compact?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center rounded-lg border border-leaf-100 bg-surface ${
        compact ? "h-8" : "h-10"
      }`}
    >
      <Pressable
        onPress={() => onChange(quantity - 1)}
        hitSlop={6}
        className={`h-full items-center justify-center ${compact ? "w-8" : "w-10"}`}
        accessibilityLabel="Decrease quantity"
      >
        <Ionicons name="remove" size={16} color={colors.leaf[600]} />
      </Pressable>
      <View className="h-5 w-px bg-leaf-100" />
      <Text
        className={`text-center font-bold text-ink ${compact ? "w-7 text-sm" : "w-9 text-base"}`}
      >
        {quantity}
      </Text>
      <View className="h-5 w-px bg-leaf-100" />
      <Pressable
        onPress={() => onChange(quantity + 1)}
        hitSlop={6}
        className={`h-full items-center justify-center ${compact ? "w-8" : "w-10"}`}
        accessibilityLabel="Increase quantity"
      >
        <Ionicons name="add" size={16} color={colors.leaf[600]} />
      </Pressable>
    </View>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <View className={`h-px bg-line ${className}`} />;
}

/** The reference's dashed rule, used above every bill total. */
export function DashedRule({ className = "" }: { className?: string }) {
  return (
    <View
      className={`h-px border-t border-dashed border-line-strong ${className}`}
    />
  );
}

/* ── Reference building blocks ──────────────────────────────────────────── */

/** Pale circle with a saturated glyph — the reference's universal icon tile. */
export function IconTile({
  icon,
  tint,
  size = 44,
  square,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: { bg: string; fg: string };
  size?: number;
  square?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: tint.bg,
        borderRadius: square ? size * 0.28 : size / 2,
      }}
      className="items-center justify-center"
    >
      <Ionicons name={icon} size={size * 0.46} color={tint.fg} />
    </View>
  );
}

/** Icon tile + label + optional detail + chevron. Used on Account and Wallet. */
export function ListRow({
  icon,
  tint,
  label,
  detail,
  right,
  onPress,
  square = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: { bg: string; fg: string };
  label: string;
  detail?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  square?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-70"
    >
      <IconTile icon={icon} tint={tint} size={34} square={square} />
      <View className="min-w-0 flex-1">
        <Txt weight="semibold">{label}</Txt>
        {detail && (
          <Txt size="tiny" tone="muted" numberOfLines={1}>
            {detail}
          </Txt>
        )}
      </View>
      {right ?? (
        <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
      )}
    </Pressable>
  );
}

/**
 * A row of cells split by vertical hairlines. The reference uses it for
 * account stats, refund counts, savings figures and the trust strip.
 */
export function StatStrip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const cells = React.Children.toArray(children);
  return (
    <View className={`flex-row ${className}`}>
      {cells.map((cell, index) => (
        <View
          key={index}
          className={`flex-1 px-2 ${index > 0 ? "border-l border-line" : ""}`}
        >
          {cell}
        </View>
      ))}
    </View>
  );
}

/**
 * Pale tinted strip with an icon, a line or two of copy and an optional link.
 * It appears on nearly every reference screen — privacy notes, refund
 * explainers, "Please note", savings banners.
 */
export function Note({
  icon,
  tone = "info",
  title,
  detail,
  action,
  onAction,
  filled = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
  filled?: boolean;
}) {
  const style = toneStyles[tone];
  return (
    <View
      style={{ backgroundColor: filled ? style.bg : "transparent" }}
      className={`flex-row items-center gap-3 rounded-card px-3 py-3 ${
        filled ? "" : "border border-line"
      }`}
    >
      <View
        style={{ backgroundColor: filled ? "#ffffff" : style.bg }}
        className="h-9 w-9 items-center justify-center rounded-full"
      >
        <Ionicons name={icon} size={18} color={style.fg} />
      </View>

      <View className="min-w-0 flex-1">
        <Txt size="sm" weight="bold" style={{ color: style.fg }}>
          {title}
        </Txt>
        {detail && (
          <Txt size="tiny" tone="soft" className="mt-0.5">
            {detail}
          </Txt>
        )}
      </View>

      {action && (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          className="flex-row items-center gap-0.5 active:opacity-60"
        >
          <Txt size="tiny" weight="bold" style={{ color: style.fg }}>
            {action}
          </Txt>
          <Ionicons name="chevron-forward" size={13} color={style.fg} />
        </Pressable>
      )}
    </View>
  );
}

/** "Need Help? … Contact Support" — the reference closes six screens with it. */
export function HelpFooter({
  title = "Need Help?",
  detail = "Our support team is here to help you.",
  action = "Contact Support",
  onPress,
  className = "",
}: {
  title?: string;
  detail?: string;
  action?: string;
  onPress?: () => void;
  className?: string;
}) {
  return (
    <View
      className={`flex-row items-center gap-3 rounded-card bg-surface-sunken px-4 py-4 ${className}`}
    >
      <View className="min-w-0 flex-1">
        <Txt weight="bold">{title}</Txt>
        <Txt size="tiny" tone="muted" className="mt-0.5">
          {detail}
        </Txt>
      </View>
      <Button label={action} variant="outline" icon="headset-outline" onPress={onPress} />
    </View>
  );
}

/**
 * Horizontal four-stop tracker. Filled circles behind the current stage,
 * a solid rule between reached stops and a dashed one beyond — exactly the
 * treatment the reference's tracking screens use.
 */
export function StageTrack({
  stages,
  currentIndex,
}: {
  stages: { label: string; time?: string; icon: keyof typeof Ionicons.glyphMap }[];
  currentIndex: number;
}) {
  return (
    <View className="flex-row">
      {stages.map((stage, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        const reached = done || current;
        return (
          <View key={stage.label} className="flex-1 items-center">
            {/* Rail — drawn behind the marker so the line meets the circle. */}
            <View className="h-9 w-full flex-row items-center">
              <View
                className={`h-0.5 flex-1 ${
                  index === 0 ? "bg-transparent" : done || current ? "bg-leaf-600" : "bg-line"
                }`}
              />
              <View
                className={`h-9 w-9 items-center justify-center rounded-full ${
                  done
                    ? "bg-leaf-600"
                    : current
                      ? "border-2 border-leaf-600 bg-surface"
                      : "bg-surface-sunken"
                }`}
              >
                <Ionicons
                  name={done ? "checkmark" : stage.icon}
                  size={16}
                  color={
                    done ? "#ffffff" : current ? colors.leaf[600] : colors.ink.faint
                  }
                />
              </View>
              <View
                className={`h-0.5 flex-1 ${
                  index === stages.length - 1
                    ? "bg-transparent"
                    : done
                      ? "bg-leaf-600"
                      : "bg-line"
                }`}
              />
            </View>

            <Txt
              size="tiny"
              weight="semibold"
              tone={reached ? "default" : "faint"}
              numberOfLines={2}
              className="mt-2 text-center"
            >
              {stage.label}
            </Txt>
            {stage.time && (
              <Txt
                size="micro"
                tone={current ? "ok" : "muted"}
                weight={current ? "semibold" : "regular"}
                className="text-center"
              >
                {stage.time}
              </Txt>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function EmptyState({
  icon = "cube-outline",
  title,
  detail,
  action,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View className="items-center px-8 py-16">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-50">
        <Ionicons name={icon} size={28} color={colors.brand[500]} />
      </View>
      <Txt size="lg" weight="bold" className="mt-4 text-center">
        {title}
      </Txt>
      {detail && (
        <Txt tone="muted" size="sm" className="mt-1 text-center">
          {detail}
        </Txt>
      )}
      {action && (
        <Button label={action} onPress={onAction} className="mt-5 px-6" />
      )}
    </View>
  );
}

/** Tinted plate with an initial — a fallback where photography is missing. */
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

export { colors };
