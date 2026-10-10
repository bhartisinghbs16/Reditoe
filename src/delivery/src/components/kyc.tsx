import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, NoteBar, Txt, colors } from "@/components/ui";
import { KycBar } from "@/components/screen-header";
import { StepTrack } from "@/components/tracker";

/**
 * The parts the four KYC screens share.
 *
 * The reference gives Aadhaar, PAN, Driving Licence and Bank the same frame: a
 * back bar with a red Help link, the four-stop tracker, a heading, and a run of
 * numbered cards. Keeping the frame in one place is what makes the four screens
 * read as one flow rather than four near-misses.
 */

export const KYC_STEPS = [
  { label: "Aadhaar" },
  { label: "PAN Card" },
  { label: "Driving License" },
  { label: "Bank Details" },
];

export function KycHeader({
  step,
  title,
  detail,
  secure = true,
  titleInBar,
}: {
  /** Zero-based index into KYC_STEPS. */
  step: number;
  title: string;
  detail: string;
  secure?: boolean;
  /**
   * The reference names PAN, Driving Licence and Bank in the bar and drops
   * straight into their cards; only Aadhaar carries a large heading.
   */
  titleInBar?: boolean;
}) {
  return (
    <>
      <KycBar title={titleInBar ? title : undefined} />

      <View className="bg-surface px-4 pb-4 pt-1">
        <StepTrack steps={KYC_STEPS} current={step} />
      </View>

      <View className="px-4 pt-4">
        {!titleInBar && (
          <Txt size="2xl" weight="bold">
            {title}
          </Txt>
        )}
        <Txt size="sm" tone="muted" className={titleInBar ? "" : "mt-1"}>
          {detail}
        </Txt>

        {secure && (
          <View className="mt-2 flex-row items-center gap-1.5">
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.ink.muted} />
            <Txt size="sm" tone="muted">
              Your data is{" "}
              <Txt size="sm" weight="bold" tone="ok">
                100% secure
              </Txt>{" "}
              and encrypted
            </Txt>
          </View>
        )}
      </View>
    </>
  );
}

/** "① Enter Aadhaar Number" — the numbered card every KYC step is built from. */
export function StepCard({
  number,
  title,
  detail,
  children,
  accent = "brand",
  className = "",
}: {
  number: number;
  title: string;
  detail?: string;
  children: React.ReactNode;
  accent?: "brand" | "green";
  className?: string;
}) {
  const tint = accent === "green" ? colors.green[600] : colors.brand[500];

  return (
    <Card className={`p-4 ${className}`}>
      <View className="flex-row items-start gap-2.5">
        <View
          style={{ backgroundColor: tint }}
          className="h-6 w-6 items-center justify-center rounded-full"
        >
          <Txt size="tiny" weight="bold" tone="white">
            {number}
          </Txt>
        </View>

        <View className="min-w-0 flex-1">
          <Txt size="lg" weight="bold">
            {title}
          </Txt>
          {detail && (
            <Txt size="sm" tone="muted" className="mt-0.5">
              {detail}
            </Txt>
          )}
        </View>
      </View>

      <View className="mt-3.5">{children}</View>
    </Card>
  );
}

/** The red "Why we need your …?" strip that opens PAN and Driving Licence. */
export function WhyBar({
  title,
  detail,
  poweredBy,
}: {
  title: string;
  detail: string;
  poweredBy: string;
}) {
  return (
    <NoteBar tone="red" icon="shield-checkmark" title={title} titleTone="ink" detail={detail}>
      <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="lock-closed" size={12} color={colors.ink.muted} />
          <Txt size="tiny" tone="muted">
            Secured by Reditoe
          </Txt>
        </View>
        <Txt size="tiny" tone="faint">
          |
        </Txt>
        <Txt size="tiny" tone="muted">
          Powered by {poweredBy}
        </Txt>
        <View className="flex-1" />
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="shield-checkmark" size={13} color={colors.green[600]} />
          <Txt size="tiny" weight="bold" tone="ok">
            100% Secure
          </Txt>
        </View>
      </View>
    </NoteBar>
  );
}

/** The one-line green or red hint that sits under a KYC input. */
export function Hint({
  text,
  tone = "green",
}: {
  text: string;
  tone?: "green" | "red";
}) {
  return (
    <View
      style={{ backgroundColor: tone === "green" ? "#edf9f1" : "#fef2f2" }}
      className="mt-3 flex-row items-center gap-2 rounded-chip px-3 py-2.5"
    >
      <Ionicons
        name="information-circle-outline"
        size={15}
        color={tone === "green" ? colors.green[600] : colors.brand[500]}
      />
      <Txt size="tiny" tone="soft" className="flex-1">
        {text}
      </Txt>
    </View>
  );
}
