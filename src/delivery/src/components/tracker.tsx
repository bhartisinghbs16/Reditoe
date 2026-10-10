import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Txt, colors } from "@/components/ui";

/**
 * The two horizontal trackers the reference uses.
 *
 * `StepTrack` numbers its stops and is the KYC header — Aadhaar → PAN Card →
 * Driving License → Bank Details. `ProgressTrack` uses icons and a timestamp
 * under each stop, and carries the order lifecycle on the Dashboard and the
 * payout lifecycle on Payout to Bank.
 *
 * Both draw the rule as a row of absolutely-positioned segments behind the
 * circles, so the line meets each circle's edge whatever the label wraps to.
 */

const RAIL_TOP = 15;

function Rail({
  count,
  toneAt,
}: {
  count: number;
  /** Colour of the segment leading into stop `index`. */
  toneAt: (index: number) => string;
}) {
  return (
    <View
      pointerEvents="none"
      style={{ top: RAIL_TOP }}
      className="absolute left-0 right-0 flex-row"
    >
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} className="flex-1 flex-row items-center">
          <View
            style={{ backgroundColor: index === 0 ? "transparent" : toneAt(index) }}
            className="h-0.5 flex-1"
          />
          <View style={{ width: 32 }} />
          <View
            style={{
              backgroundColor: index === count - 1 ? "transparent" : toneAt(index + 1),
            }}
            className="h-0.5 flex-1"
          />
        </View>
      ))}
    </View>
  );
}

export interface Step {
  label: string;
  /** Timestamp printed under the label on the progress tracker. */
  at?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/** Aadhaar → PAN Card → Driving License → Bank Details. */
export function StepTrack({
  steps,
  current,
  className = "",
}: {
  steps: Step[];
  /** Zero-based. Everything before it is done, everything after is pending. */
  current: number;
  className?: string;
}) {
  const railTone = (index: number) =>
    index <= current ? colors.green[500] : colors.line.strong;

  return (
    <View className={className}>
      <View className="relative">
        <Rail count={steps.length} toneAt={railTone} />

        <View className="flex-row">
          {steps.map((step, index) => {
            const done = index < current;
            const active = index === current;
            const ring = done
              ? colors.green[500]
              : active
                ? colors.brand[500]
                : colors.line.strong;
            const label = done
              ? colors.ink.soft
              : active
                ? colors.brand[500]
                : colors.ink.muted;

            return (
              <View key={step.label} className="flex-1 items-center">
                <View
                  style={{ borderColor: ring, backgroundColor: "#ffffff" }}
                  className="h-8 w-8 items-center justify-center rounded-full border-2"
                >
                  {done ? (
                    <Ionicons name="checkmark" size={16} color={colors.green[500]} />
                  ) : (
                    <Txt
                      size="tiny"
                      weight="bold"
                      style={{ color: active ? colors.brand[500] : colors.ink.muted }}
                    >
                      {index + 1}
                    </Txt>
                  )}
                </View>
                <Txt
                  size="tiny"
                  weight={active ? "bold" : "medium"}
                  className="mt-1.5 text-center"
                  style={{ color: label }}
                  numberOfLines={2}
                >
                  {step.label}
                </Txt>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/**
 * Order Accepted → Picked Up → On the Way → Delivered, and the payout's
 * Initiated → Processing → Sent to Bank → Credited. Stops that have happened
 * are green; the rest sit grey with "--:--" for a time.
 */
export function ProgressTrack({
  steps,
  current,
  className = "",
}: {
  steps: Step[];
  /** Zero-based index of the most recently completed stop. */
  current: number;
  className?: string;
}) {
  const railTone = (index: number) =>
    index <= current ? colors.green[500] : colors.line.strong;

  return (
    <View className={className}>
      <View className="relative">
        <Rail count={steps.length} toneAt={railTone} />

        <View className="flex-row">
          {steps.map((step, index) => {
            const done = index <= current;
            return (
              <View key={step.label} className="flex-1 items-center">
                <View
                  style={{
                    borderColor: done ? colors.green[500] : "transparent",
                    backgroundColor: done ? "#ffffff" : colors.surface.sunken,
                  }}
                  className="h-8 w-8 items-center justify-center rounded-full border-2"
                >
                  <Ionicons
                    name={step.icon ?? "ellipse"}
                    size={16}
                    color={done ? colors.green[600] : colors.ink.faint}
                  />
                </View>
                <Txt
                  size="micro"
                  weight="semibold"
                  tone={done ? "default" : "muted"}
                  className="mt-1.5 text-center"
                  numberOfLines={2}
                >
                  {step.label}
                </Txt>
                <Txt size="micro" tone={done ? "muted" : "faint"} className="mt-0.5">
                  {done ? (step.at ?? "—") : "--:--"}
                </Txt>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** The thin red rule with "1/4" beside it on the compact KYC screens. */
export function StepRule({
  current,
  total,
  className = "",
}: {
  current: number;
  total: number;
  className?: string;
}) {
  return (
    <View className={`h-1 flex-row overflow-hidden rounded-full bg-line ${className}`}>
      <View
        style={{
          width: `${(current / total) * 100}%`,
          backgroundColor: colors.brand[500],
        }}
        className="h-full rounded-full"
      />
    </View>
  );
}
