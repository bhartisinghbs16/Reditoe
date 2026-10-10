import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActionLink,
  Badge,
  Button,
  Card,
  IconPlate,
  NoteBar,
  OtpInput,
  Panel,
  SegmentSwitch,
  StatCell,
  Txt,
  colors,
} from "@/components/ui";
import { AppBar } from "@/components/screen-header";
import { PartnerCard } from "@/components/partner-card";
import { noteStyle } from "@/lib/theme";
import { legFor, scanSummary, useStore } from "@/lib/store";
import { api } from "@/lib/api";

/**
 * Scan, reproduced from the reference: the viewfinder with its red corner
 * brackets and sweep line, the Scan QR / Enter Code switch, the how-to note,
 * the day's scan log and its four-figure summary.
 *
 * The camera itself is not wired — this is the screen the reference draws, and
 * the viewfinder stands in for the live preview until the scanner module is
 * added.
 */

/** One of the four red brackets that frame the viewfinder. */
function Corner({ x, y }: { x: "left" | "right"; y: "top" | "bottom" }) {
  return (
    <View
      style={{
        position: "absolute",
        [x]: 14,
        [y]: 14,
        width: 30,
        height: 30,
        borderColor: colors.brand[500],
        borderTopWidth: y === "top" ? 3 : 0,
        borderBottomWidth: y === "bottom" ? 3 : 0,
        borderLeftWidth: x === "left" ? 3 : 0,
        borderRightWidth: x === "right" ? 3 : 0,
        borderTopLeftRadius: y === "top" && x === "left" ? 8 : 0,
        borderTopRightRadius: y === "top" && x === "right" ? 8 : 0,
        borderBottomLeftRadius: y === "bottom" && x === "left" ? 8 : 0,
        borderBottomRightRadius: y === "bottom" && x === "right" ? 8 : 0,
      }}
    />
  );
}

/**
 * The camera, with the reference's frame drawn over it.
 *
 * This was a dark box with a QR glyph in the middle and a line sweeping
 * across it - a picture of a scanner. It never opened the camera, so no code
 * was ever read and nothing could be confirmed by scanning.
 *
 * Permission is asked for on first use rather than at launch: a rider who has
 * not reached a handover has no reason to be asked for their camera.
 */
function Viewfinder({
  torch,
  onTorch,
  onCode,
  paused,
}: {
  torch: boolean;
  onTorch: () => void;
  onCode: (value: string) => void;
  paused: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return (
      <View className="h-[228px] items-center justify-center rounded-tile bg-[#0b0f16]" />
    );
  }

  if (!permission.granted) {
    return (
      <View className="h-[228px] items-center justify-center gap-3 rounded-tile bg-[#0b0f16] px-6">
        <Ionicons name="camera-outline" size={40} color="rgba(255,255,255,0.85)" />
        <Txt size="tiny" className="text-center text-white">
          Reditoe needs your camera to read the code on the customer&apos;s screen.
        </Txt>
        <Button label="Allow camera" accent="brand" size="sm" onPress={() => void requestPermission()} />
      </View>
    );
  }

  return (
    <View className="h-[228px] justify-center overflow-hidden rounded-tile bg-[#0b0f16]">
      <CameraView
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        // Ignored while a code is being checked, so one presentation of a QR
        // does not fire the same verification a dozen times.
        onBarcodeScanned={paused ? undefined : ({ data }) => onCode(data)}
      />
      <ViewfinderFrame torch={torch} onTorch={onTorch} />
    </View>
  );
}

/**
 * What a scan or a keystroke actually means.
 *
 * The QR encodes a JSON payload, and the raw string was being sent to the
 * server as if it were the code — so it never matched and scanning could not
 * work at all, leaving the four digits as the only way through. Typed input
 * arrives as the digits themselves and passes straight back.
 */
function readCode(value: string): { code: string; orderId?: string; order?: string } {
  const raw = value.trim();
  if (!raw.startsWith("{")) return { code: raw };
  try {
    const payload = JSON.parse(raw) as {
      code?: unknown;
      orderId?: unknown;
      order?: unknown;
    };
    return {
      code: String(payload.code ?? "").trim(),
      orderId: payload.orderId ? String(payload.orderId) : undefined,
      order: payload.order ? String(payload.order) : undefined,
    };
  } catch {
    // Somebody else's QR — a parcel label, a payment code. Not ours.
    return { code: "" };
  }
}

function ViewfinderFrame({ torch, onTorch }: { torch: boolean; onTorch: () => void }) {
  return (
    <View className="h-[228px] justify-center overflow-hidden rounded-tile">
      <Corner x="left" y="top" />
      <Corner x="right" y="top" />
      <Corner x="left" y="bottom" />
      <Corner x="right" y="bottom" />

      {/* The sweep line the reference draws across the frame. */}
      <View
        style={{ backgroundColor: colors.brand[500] }}
        className="absolute left-0 right-0 top-1/2 h-0.5"
      />

      <Pressable
        onPress={onTorch}
        className="absolute inset-x-0 bottom-6 flex-row items-center justify-center gap-2 active:opacity-70"
      >
        <Ionicons
          name={torch ? "flashlight" : "flashlight-outline"}
          size={16}
          color={torch ? colors.warn.default : "#ffffff"}
        />
        <Txt size="sm" tone="white">
          {torch ? "Flashlight is on" : "Tap to turn on flashlight"}
        </Txt>
      </Pressable>
    </View>
  );
}

export default function Scan() {
  const router = useRouter();
  const { recentScans, unread, orders, refresh } = useStore();
  const [mode, setMode] = React.useState<"qr" | "code">("qr");
  const [torch, setTorch] = React.useState(false);

  /*
   * Which handover this scan is for.
   *
   * A code only means something against an order: the same four digits
   * confirm a pickup at the restaurant and a delivery at the door, and which
   * one it is depends on where the rider has got to. The screen took a code
   * and did nothing with it at all before.
   */
  const active = orders.find(
    (order) => order.stage !== "delivered" && order.stage !== "cancelled"
  );
  const leg = active ? legFor(active.stage) : "done";

  const [code, setCode] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState<
    { ok: boolean; message: string } | null
  >(null);

  const submit = async (value: string) => {
    const scanned = readCode(value);
    if (!scanned.code || checking) return;
    if (!active) {
      setResult({ ok: false, message: "You have no order to confirm right now." });
      return;
    }
    /*
     * A QR carries the order it belongs to, so a code photographed from
     * another order can be turned away here rather than spent as one of the
     * five attempts against this one.
     */
    if (scanned.orderId && scanned.orderId !== active.id) {
      setResult({
        ok: false,
        message: `That code is for order ${scanned.order ?? "another order"}, not this one.`,
      });
      return;
    }
    const entered = scanned.code;
    setChecking(true);
    setResult(null);
    try {
      // Pickup at the restaurant, delivery at the door - the same code entry.
      if (leg === "pickup") await api.verifyPickup(active.id, entered);
      else await api.verifyDelivery(active.id, entered);
      await refresh();
      setCode("");
      setResult({
        ok: true,
        message: leg === "pickup" ? "Pickup confirmed." : "Delivery confirmed.",
      });
    } catch (reason: any) {
      setResult({ ok: false, message: reason?.message ?? "That code was not accepted." });
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8">
        <AppBar title="Scan" trailing="bell"
          notifications={unread}
          onTrailing={() => router.push("/notifications")}
        />

        <View className="gap-3.5 px-4 pt-3.5">
          <PartnerCard />

          <Card className="p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Txt size="lg" weight="bold">
                  Scan QR Code
                </Txt>
                <Txt size="sm" tone="muted" className="mt-0.5">
                  Scan the QR code from the restaurant / customer to confirm pickup, order,
                  or delivery.
                </Txt>
              </View>
              <Ionicons name="help-circle-outline" size={22} color={colors.ink.faint} />
            </View>

            {mode === "qr" ? (
              <View className="mt-3.5">
                <Viewfinder
                  torch={torch}
                  onTorch={() => setTorch((on) => !on)}
                  onCode={(value) => void submit(value)}
                  paused={checking}
                />
              </View>
            ) : (
              /* Typed in when the code will not scan - a cracked screen, a
                 dark doorway, a customer reading it out. */
              <View className="mt-3.5 gap-3">
                <OtpInput value={code} onChangeText={setCode} length={4} />
                <Button
                  label={checking ? "Checking…" : "Confirm"}
                  accent="brand"
                  size="lg"
                  loading={checking}
                  disabled={code.trim().length < 4}
                  onPress={() => void submit(code)}
                />
              </View>
            )}

            {result && (
              <View className="mt-3">
                <NoteBar
                  tone={result.ok ? "green" : "red"}
                  icon={result.ok ? "checkmark-circle" : "alert-circle"}
                  detail={result.message}
                />
              </View>
            )}

            {!active && (
              <View className="mt-3">
                <NoteBar
                  tone="amber"
                  icon="information-circle"
                  detail="You have no active order. A code can only be confirmed against a delivery you are on."
                />
              </View>
            )}

            <View className="mt-3">
              <SegmentSwitch
                value={mode}
                onChange={setMode}
                options={[
                  { id: "qr", label: "Scan QR", icon: "qr-code-outline" },
                  { id: "code", label: "Enter Code", icon: "keypad-outline" },
                ]}
              />
            </View>

            <View
              style={{ backgroundColor: noteStyle.red.bg }}
              className="mt-3 flex-row items-start gap-2.5 rounded-tile p-3.5"
            >
              <Ionicons name="bulb" size={19} color={colors.brand[500]} />
              <View className="min-w-0 flex-1">
                <Txt weight="bold" tone="brand">
                  How to use?
                </Txt>
                <Txt size="tiny" tone="soft" className="mt-0.5">
                  Ask the restaurant or customer to show their QR code and scan it to
                  continue.
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.brand[500]} />
            </View>
          </Card>

          {/* The scans are drawn from completed deliveries, so "all" of them
              is the order history. The label had nothing behind it. */}
          <Panel
            title="Recent Scans"
            action="View All"
            accent="brand"
            onAction={() => router.push("/orders")}
            bodyClassName="pb-1"
          >
            {recentScans.map((scan, index) => (
              <Pressable
                key={scan.id}
                onPress={() => router.push(`/order/${scan.orderId}`)}
                accessibilityLabel={`Open ${scan.order}`}
                className={`flex-row items-center gap-3 px-4 py-3 active:opacity-80 ${
                  index > 0 ? "border-t border-line" : ""
                }`}
              >
                <IconPlate icon={scan.icon} tint={scan.tint} size={40} shape="circle" />

                <View className="min-w-0 flex-1">
                  <Txt weight="bold" numberOfLines={1}>
                    {scan.title}
                  </Txt>
                  <Txt size="tiny" tone="muted" numberOfLines={1}>
                    {scan.who}
                  </Txt>
                  <Txt size="tiny" tone="faint" numberOfLines={1}>
                    {scan.at}
                  </Txt>
                </View>

                <Badge label={scan.kind} tone={scan.tone} />

                <View className="items-end">
                  <Txt size="micro" tone="muted">
                    Order ID
                  </Txt>
                  <Txt size="tiny" weight="semibold">
                    {scan.order}
                  </Txt>
                </View>

                <Ionicons name="chevron-forward" size={16} color={colors.ink.faint} />
              </Pressable>
            ))}
          </Panel>

          <Panel
            title="Today's Scan Summary"
            right={
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="calendar-outline" size={14} color={colors.ink.muted} />
                <Txt size="tiny" tone="muted">
                  {scanSummary.date}
                </Txt>
              </View>
            }
            bodyClassName="flex-row px-2 pb-4"
          >
            {scanSummary.cells.map((cell, index) => (
              <StatCell
                key={cell.label}
                icon={cell.icon}
                tint={cell.tint}
                value={cell.value}
                label={cell.label}
                order="value-first"
                divided={index > 0}
              />
            ))}
          </Panel>

          <View
            style={{ backgroundColor: noteStyle.red.bg, borderColor: noteStyle.red.border }}
            className="flex-row items-center gap-3 rounded-card border p-4"
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-white">
              <Ionicons name="phone-portrait-outline" size={22} color={colors.brand[500]} />
            </View>
            <View className="min-w-0 flex-1">
              <Txt weight="bold">Save Time, Deliver Faster!</Txt>
              <Txt size="tiny" tone="muted" className="mt-0.5">
                Use QR scan to speed up order updates and provide great customer
                experience.
              </Txt>
            </View>
            <View className="rounded-tile border border-brand-500 px-3 py-2">
              <ActionLink label="Learn More" accent="brand" icon="none" />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
