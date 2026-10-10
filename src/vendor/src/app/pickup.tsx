import React from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { IndigoHeader } from "@/components/screen-header";
import { Badge, Button, Card, Divider, IconPlate, Txt, colors } from "@/components/ui";
import { friendlyDateTime, money, time } from "@/lib/format";
import { orderTotals, useStore } from "@/lib/store";
import { usePickupCode } from "@/lib/pickup";

/**
 * Pickup Verification — a copy of the reference handover screen.
 *
 * The vendor shows a QR (or reads out the six-digit fallback) and the delivery
 * partner scans it. The QR encodes the order id and the current code, so it is
 * a real scannable code rather than a decorative matrix — that is the whole
 * point of the screen.
 */

type Tab = "qr" | "code";

function HowItWorks() {
  const steps = [
    {
      icon: "qr-code-outline" as const,
      title: "Show QR Code",
      detail: "Show this QR code to the delivery partner",
    },
    {
      icon: "scan-outline" as const,
      title: "Partner Scans",
      detail: "Delivery partner scans or enters the code in their app",
    },
    {
      icon: "checkmark-circle-outline" as const,
      title: "Verify & Pickup",
      detail: "Once verified, the partner can pick up the order",
    },
  ];

  return (
    <Card className="mx-4 mt-3 p-4">
      <Txt size="lg" weight="bold" tone="indigo">
        How it works?
      </Txt>
      <View className="mt-3 gap-3">
        {steps.map((step, index) => (
          <View key={step.title} className="flex-row items-start gap-3">
            <View>
              <IconPlate
                icon={step.icon}
                tint={index === 2 ? "green" : "violet"}
                size={40}
                shape="square"
              />
              <View
                style={{ backgroundColor: index === 2 ? colors.ok.default : colors.indigo[600] }}
                className="absolute -bottom-1 -right-1 h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white"
              >
                <Txt size="micro" weight="bold" tone="white">
                  {index + 1}
                </Txt>
              </View>
            </View>
            <View className="min-w-0 flex-1">
              <Txt size="sm" weight="bold">
                {step.title}
              </Txt>
              <Txt size="tiny" tone="muted">
                {step.detail}
              </Txt>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * Handovers that have already happened, taken from the orders themselves.
 *
 * The reference lists the delivery partner who collected each one. The API
 * does not populate a rider on the vendor's order feed, so this shows the
 * order and its customer — true, where a list of invented partner names
 * would not be.
 */
function useRecentHandovers() {
  const { orders } = useStore();
  return React.useMemo(
    () =>
      orders
        .filter((order) => order.stage === "picked" || order.stage === "delivered")
        .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
        .slice(0, 5),
    [orders]
  );
}

export default function PickupVerification() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orders } = useStore();
  const [tab, setTab] = React.useState<Tab>("qr");
  const recent = useRecentHandovers();

  /*
   * The order the vendor asked about.
   *
   * Every way in used to land on whichever order happened to be ready first,
   * so "Verify Pickup" on one order card could show the code for another —
   * and with two orders on the counter the rider would be handed the wrong
   * one. The dashboard shortcut still arrives without an id, and for that the
   * first ready order is the right guess.
   */
  const ready = orders.filter((order) => order.stage === "ready");
  const order =
    (id ? orders.find((entry) => entry.id === id) : undefined) ??
    ready[0] ??
    orders.find((entry) => entry.stage === "preparing") ??
    orders[0];

  // Declared after `order`, since it is the order's code that is fetched.
  const { code, qr, verified, error: codeError, loading, refresh } = usePickupCode(order?.id);

  // A restaurant with no orders is an ordinary morning, not an error — but
  // everything below dereferences `order`, so it cannot render without one.
  if (!order) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-indigo-900">
        <StatusBar style="light" />
        <ScrollView className="flex-1 bg-surface-sunken" showsVerticalScrollIndicator={false}>
          <IndigoHeader
            title="Pickup Verification"
            subtitle="Verify delivery partner to handover order"
            leading="back"
            overlap={24}
          />
          <Card className="mx-4 -mt-7 items-center p-6" raised>
            <IconPlate icon="bag-handle-outline" tint="violet" size={52} />
            <Txt size="lg" weight="bold" className="mt-3">
              Nothing to hand over
            </Txt>
            <Txt size="tiny" tone="muted" className="mt-1 text-center">
              Once an order is marked ready, its pickup code appears here.
            </Txt>
            <Button
              label="Go to Orders"
              accent="indigo"
              className="mt-4 px-5"
              onPress={() => router.push("/orders")}
            />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const totals = orderTotals(order);
  // The server's own payload — it names the order and stage, so a code
  // photographed from one order cannot be used against another.
  const payload = qr ?? "";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-indigo-900">
      <StatusBar style="light" />
      <ScrollView
        className="flex-1 bg-surface-sunken"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-6"
      >
        <IndigoHeader
          title="Pickup Verification"
          subtitle="Verify delivery partner to handover order"
          leading="back"
          right={
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="shield-checkmark" size={16} color="#4ade80" />
              <Txt size="tiny" weight="semibold" style={{ color: "#4ade80" }}>
                Secure
              </Txt>
            </View>
          }
          overlap={24}
        />

        <Card className="mx-4 -mt-7 overflow-hidden" raised>
          <View className="flex-row border-b border-line">
            {(
              [
                { id: "qr", label: "QR Code" },
                { id: "code", label: "Enter Code" },
              ] as { id: Tab; label: string }[]
            ).map((entry) => {
              const active = entry.id === tab;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => setTab(entry.id)}
                  style={{ borderBottomColor: active ? colors.indigo[600] : "transparent" }}
                  className="flex-1 items-center border-b-2 pb-2.5 pt-3 active:opacity-70"
                >
                  <Txt
                    size="sm"
                    weight={active ? "bold" : "medium"}
                    tone={active ? "indigo" : "muted"}
                  >
                    {entry.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row items-center gap-2.5 border-b border-line px-3.5 py-3">
            <IconPlate icon="bag-handle-outline" tint="green" size={36} />
            <View className="min-w-0 flex-1">
              <Txt size="sm" weight="bold">
                Active Orders for Pickup
              </Txt>
              <Txt size="tiny" tone="muted">
                Orders ready to be picked up
              </Txt>
            </View>
            <Txt size="2xl" weight="bold">
              {ready.length}
            </Txt>
          </View>

          <View className="p-3.5">
            <View className="flex-row items-center justify-between">
              <Txt weight="bold">Current Order</Txt>
              <Badge
                label={order.stage === "ready" ? "Ready for Pickup" : "Being prepared"}
                tone={order.stage === "ready" ? "ok" : "warn"}
              />
            </View>

            <View className="mt-3 flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Txt size="tiny" tone="muted">
                  Order ID
                </Txt>
                <View className="flex-row items-center gap-1.5">
                  <Txt size="xl" weight="bold">
                    #{order.reference}
                  </Txt>
                  <Ionicons name="copy-outline" size={14} color={colors.ink.faint} />
                </View>
              </View>
              <View className="flex-row items-center gap-1">
                <Ionicons name="cube-outline" size={13} color={colors.ink.muted} />
                <Txt size="tiny" tone="muted">
                  {order.lines.reduce((sum, line) => sum + line.quantity, 0)} Items
                </Txt>
              </View>
            </View>

            <View className="mt-2.5 flex-row justify-between">
              <View>
                <Txt size="tiny" tone="muted">
                  Customer
                </Txt>
                <Txt size="sm" weight="semibold">
                  {order.customer}
                </Txt>
              </View>
              <View className="items-end">
                <Txt size="tiny" tone="muted">
                  Payment
                </Txt>
                <Txt size="sm" weight="semibold">
                  {order.payment === "COD" ? "COD" : "Online"}
                </Txt>
              </View>
            </View>

            <View className="mt-2.5 flex-row justify-between">
              <View>
                <Txt size="tiny" tone="muted">
                  Order Amount
                </Txt>
                <Txt size="sm" weight="bold">
                  {money(totals.total)}
                </Txt>
              </View>
              <View className="items-end">
                <Txt size="tiny" tone="muted">
                  Order Time
                </Txt>
                <Txt size="sm" weight="semibold">
                  {time(order.placedAt)}, 18 May 2024
                </Txt>
              </View>
            </View>

            <Pressable
              onPress={() => router.push(`/order/${order.id}`)}
              className="mt-3 flex-row items-center gap-1 active:opacity-70"
            >
              <Txt size="tiny" weight="bold" tone="indigo">
                View Order Details
              </Txt>
              <Ionicons name="chevron-forward" size={13} color={colors.indigo[600]} />
            </Pressable>
          </View>
        </Card>

        {tab === "qr" ? (
          <Card className="mx-4 mt-3 items-center p-4">
            <Txt weight="bold">Show this QR Code to Delivery Partner</Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              Ask the delivery partner to scan this QR code
            </Txt>

            {/*
              Only drawn once the server has sent a payload.
              
              `payload` falls back to an empty string while the code is still
              being fetched, and react-native-qrcode-svg throws on an empty
              value rather than drawing nothing - which took the whole app
              down the moment this tab was opened. A spinner stands in until
              there is something real to encode.
            */}
            <View className="mt-4">
              <View className="rounded-tile border-2 border-indigo-300 p-3">
                {payload ? (
                  <QRCode
                    value={payload}
                    size={188}
                    color={colors.ink.default}
                    backgroundColor="#ffffff"
                  />
                ) : (
                  <View
                    style={{ width: 188, height: 188 }}
                    className="items-center justify-center gap-2"
                  >
                    <ActivityIndicator color={colors.indigo[600]} />
                    <Txt size="tiny" tone="muted">
                      Preparing the code…
                    </Txt>
                  </View>
                )}
              </View>
            </View>

            <View className="mt-4 w-full flex-row items-center gap-3">
              <Divider className="flex-1" />
              <Txt size="tiny" tone="faint">
                OR
              </Txt>
              <Divider className="flex-1" />
            </View>

            <Txt weight="bold" className="mt-3">
              Pickup Code
            </Txt>
            <Txt size="tiny" tone="muted">
              Share this code if the QR scan is not working
            </Txt>

            <View className="mt-2.5 flex-row gap-2">
              {(code ?? "----").split("").map((digit, index) => (
                <View
                  key={index}
                  className="h-11 w-10 items-center justify-center rounded-tile border border-line bg-surface"
                >
                  <Txt size="xl" weight="bold" tone="indigo">
                    {digit}
                  </Txt>
                </View>
              ))}
            </View>

            <Pressable
              onPress={refresh}
              className="mt-3 flex-row items-center gap-1.5 active:opacity-70"
            >
              <Ionicons name="refresh" size={14} color={colors.indigo[600]} />
              <Txt size="tiny" weight="bold" tone="indigo">
                {loading ? "Loading…" : "Reload code"}
              </Txt>
            </Pressable>

            {/* The code lasts as long as the order does — there is no clock to
                run down, and nothing the vendor has to do to keep it alive. */}
            <View className="mt-2 flex-row items-center gap-1.5">
              <Ionicons
                name={verified ? "checkmark-circle" : "time-outline"}
                size={13}
                color={verified ? colors.ok.default : colors.ink.muted}
              />
              <Txt size="tiny" tone={verified ? "ok" : "muted"}>
                {verified
                  ? "Already collected by the rider"
                  : "Valid until the rider collects the order"}
              </Txt>
            </View>

            {codeError && (
              <Txt size="tiny" tone="bad" className="mt-2 text-center">
                {codeError}
              </Txt>
            )}
          </Card>
        ) : (
          <Card className="mx-4 mt-3 items-center p-4">
            <IconPlate icon="keypad-outline" tint="violet" size={48} />
            <Txt weight="bold" className="mt-2.5">
              Enter Partner Code
            </Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5 text-center">
              Ask the delivery partner for the 6-digit code shown in their app.
            </Txt>
            <View className="mt-3 flex-row gap-2">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <View
                  key={index}
                  className="h-11 w-10 items-center justify-center rounded-tile border border-line bg-surface-sunken"
                >
                  <Txt size="xl" weight="bold" tone="faint">
                    –
                  </Txt>
                </View>
              ))}
            </View>
            {/* The partner is verified by scanning, not by the restaurant
                pressing a button. This re-reads the order so the status above
                updates the moment they have. */}
            <Button
              label={loading ? "Checking…" : "Check verification"}
              accent="indigo"
              className="mt-4 w-full"
              onPress={refresh}
              disabled={loading}
            />
          </Card>
        )}

        <View
          style={{ backgroundColor: "#f1ecfe" }}
          className="mx-4 mt-3 flex-row items-start gap-2.5 rounded-card p-3.5"
        >
          <Ionicons name="shield-checkmark" size={18} color={colors.violet.default} />
          <View className="min-w-0 flex-1">
            <Txt size="sm" weight="bold" tone="indigo">
              Important
            </Txt>
            <Txt size="tiny" tone="soft">
              Do not share this code with anyone. Verify the delivery partner before handing over
              the order.
            </Txt>
          </View>
        </View>

        <HowItWorks />

        <Card className="mx-4 mt-3 overflow-hidden">
          <View className="flex-row items-center justify-between px-3.5 pb-2.5 pt-3.5">
            <Txt size="lg" weight="bold">
              Recent Verifications
            </Txt>
            <Txt size="tiny" weight="bold" tone="indigo">
              View All
            </Txt>
          </View>
          {recent.length === 0 ? (
            <Txt size="tiny" tone="muted" className="border-t border-line px-3.5 py-5 text-center">
              No handovers yet. Orders appear here once a partner collects them.
            </Txt>
          ) : (
            recent.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => router.push(`/order/${entry.id}`)}
                className="flex-row items-center gap-3 border-t border-line px-3.5 py-2.5 active:opacity-70"
              >
                <IconPlate icon="bag-check-outline" tint="violet" size={34} />
                <View className="min-w-0 flex-1">
                  <Txt size="sm" weight="semibold" numberOfLines={1}>
                    #{entry.reference}
                  </Txt>
                  <Txt size="micro" tone="muted" numberOfLines={1}>
                    {entry.customer} · {friendlyDateTime(entry.placedAt)}
                  </Txt>
                </View>
                <Badge
                  label={entry.stage === "delivered" ? "Delivered" : "Picked Up"}
                  tone="ok"
                />
                <Ionicons name="checkmark-circle" size={18} color={colors.ok.default} />
              </Pressable>
            ))
          )}
        </Card>

        <View className="mx-4 mt-3 flex-row gap-2.5">
          {/*
            "Mark as Picked Up" used to sit here with no handler, and it is
            right that it did nothing: a pickup is confirmed by the delivery
            partner scanning the code above, which is the whole point of the
            handover. A restaurant marking it itself would let an order go out
            with no rider having taken it.
          */}
          <Button
            label="Call Support"
            icon="call-outline"
            variant="plain"
            className="flex-1"
            onPress={() => router.push("/support")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
