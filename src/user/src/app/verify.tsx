import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, IconTile, Note, Txt, colors } from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { QrCode } from "@/components/qr";
import { accents } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

/**
 * "Secure Delivery Verification", copied from the reference.
 *
 * The mockups draw this flow from both sides; this is the customer's half —
 * the explainer, then the code the rider scans and the OTP the customer reads
 * out, with the reasons and the OTP warning underneath.
 */

const HOW_IT_WORKS = [
  {
    icon: "bag-handle" as const,
    accent: "red" as const,
    title: "1. Order Delivered",
    detail: "Delivery partner reaches your location with your order.",
  },
  {
    icon: "qr-code" as const,
    accent: "purple" as const,
    title: "2. Verify Delivery",
    detail: "Scan QR code or enter OTP to verify.",
  },
  {
    icon: "checkmark-circle" as const,
    accent: "green" as const,
    title: "3. Delivery Complete",
    detail: "Once verified, the order will be marked as successfully delivered.",
  },
];

const REASONS = [
  "Ensures order is delivered to the right customer",
  "Prevents fraud and wrong deliveries",
  "Keeps your food delivery safe and secure",
];

const HERO_POINTS = [
  { icon: "shield-checkmark" as const, label: "Secure\nDelivery" },
  { icon: "person-circle" as const, label: "Right Person\nVerification" },
  { icon: "checkmark-circle" as const, label: "Complete with\nConfidence" },
];

export default function VerifyScreen() {
  const router = useRouter();
  const { orders, customer } = useStore();
  const [mode, setMode] = React.useState<"qr" | "otp">("qr");

  // The live order is the one a rider will turn up with.
  const order =
    orders.find(
      (o) =>
        o.status !== "Delivered" && o.status !== "Cancelled" && o.status !== "Refunded"
    ) ?? orders[0];

  /**
   * The real handover code, from the server.
   *
   * This used to be sliced out of the order id — a number the backend had
   * never heard of, so a rider entering it faithfully would always be told it
   * was wrong. The code is minted with the order; the rider verifies against
   * that, so it can only be fetched, never computed.
   */
  const [handover, setHandover] = React.useState<{
    code: string | null;
    qr: string | null;
    verified: boolean;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!order) return;
    api
      .deliveryCode(order.id)
      .then((data) => {
        if (!cancelled) setHandover(data);
      })
      .catch(() => {
        if (!cancelled) setHandover(null);
      });
    return () => {
      cancelled = true;
    };
  }, [order?.id]);

  const otp = handover?.code ?? "----";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Secure Delivery Verification"
        subtitle="For your safety, delivery is completed only after verification."
        right={<HeaderAction icon="help-circle-outline" label="Help" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        {/* Hero */}
        <View className="mx-4 mt-1 rounded-card bg-brand-50 p-4">
          <View className="self-start rounded-md bg-brand-600 px-2 py-1">
            <Txt size="micro" weight="bold" tone="white">
              NEW FEATURE
            </Txt>
          </View>

          <Txt size="2xl" weight="bold" className="mt-3">
            Safe. Secure.
          </Txt>
          <Txt size="2xl" weight="bold" tone="brand">
            Successful Delivery.
          </Txt>
          <Txt size="sm" tone="soft" className="mt-2">
            Delivery partner must verify using QR code scan or OTP shared by you.
          </Txt>

          <View className="mt-4 flex-row">
            {HERO_POINTS.map((point) => (
              <View key={point.label} className="flex-1 items-center gap-1.5">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-white">
                  <Ionicons name={point.icon} size={21} color={colors.brand[600]} />
                </View>
                <Txt size="micro" weight="semibold" className="text-center">
                  {point.label}
                </Txt>
              </View>
            ))}
          </View>
        </View>

        {/* Your code */}
        <Card className="mx-4 mt-4 p-4">
          <Txt size="lg" weight="bold">
            Your verification code
          </Txt>
          <Txt size="tiny" tone="muted" className="mt-0.5">
            Show this to your delivery partner when your order arrives.
          </Txt>

          {/* Mode switch */}
          <View className="mt-3 flex-row rounded-tile bg-surface-sunken p-1">
            {(
              [
                { id: "qr", label: "QR Code", icon: "qr-code-outline" as const },
                { id: "otp", label: "OTP", icon: "keypad-outline" as const },
              ] as const
            ).map((option) => {
              const active = mode === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setMode(option.id)}
                  className={`h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg ${
                    active ? "bg-surface" : ""
                  }`}
                >
                  <Ionicons
                    name={option.icon}
                    size={15}
                    color={active ? colors.brand[600] : colors.ink.muted}
                  />
                  <Txt size="sm" weight="bold" tone={active ? "brand" : "muted"}>
                    {option.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>

          {mode === "qr" ? (
            <View className="mt-4 items-center rounded-card border border-line py-5">
              <Txt size="lg" weight="bold" tone="brand">
                Reditoe
              </Txt>
              <Txt size="tiny" weight="semibold" className="mb-3">
                Delivery Verification
              </Txt>

              <View className="rounded-lg border border-brand-200 p-2.5">
                <QrCode value={handover?.qr ?? ""} size={172} />
              </View>

              <Txt size="tiny" tone="muted" className="mt-3">
                Order ID:{" "}
                <Txt size="tiny" weight="bold" tone="brand">
                  {order?.code ?? "—"}
                </Txt>
              </Txt>
              <Txt size="tiny" tone="muted" className="mt-1 text-center">
                Show this QR code to your delivery partner
              </Txt>
            </View>
          ) : (
            <View className="mt-4 items-center rounded-card border border-line py-6">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-leaf-50">
                <Ionicons name="lock-closed" size={30} color={colors.leaf[600]} />
              </View>

              <Txt size="xl" weight="bold" className="mt-3">
                Your 4 digit OTP
              </Txt>
              <Txt size="tiny" tone="muted" className="mt-1">
                Sent to{" "}
                <Txt size="tiny" weight="bold" tone="ok">
                  {customer.phone}
                </Txt>
              </Txt>

              <View className="mt-4 flex-row gap-3">
                {otp.split("").map((digit, index) => (
                  <View
                    key={index}
                    className="h-14 w-14 items-center justify-center rounded-tile border border-leaf-500"
                  >
                    <Txt size="2xl" weight="bold">
                      {digit}
                    </Txt>
                  </View>
                ))}
              </View>

              <Txt size="tiny" tone="muted" className="mt-4">
                Read this out only to your delivery partner
              </Txt>
            </View>
          )}
        </Card>

        {/* How it works */}
        <Card className="mx-4 mt-4 p-4">
          <Txt size="lg" weight="bold" className="text-center">
            How it works?
          </Txt>
          <View className="mt-4 flex-row">
            {HOW_IT_WORKS.map((step, index) => (
              <React.Fragment key={step.title}>
                {index > 0 && (
                  <View className="w-5 items-center pt-6">
                    <View className="h-px w-full border-t border-dashed border-line-strong" />
                  </View>
                )}
                <View className="flex-1 items-center gap-1.5">
                  <IconTile icon={step.icon} tint={accents[step.accent]} size={52} />
                  {/* w-full matters: under items-center these size to their
                      own content, so a clamped label renders on one line and
                      ellipsises instead of wrapping into the column. */}
                  <Txt
                    size="tiny"
                    weight="bold"
                    numberOfLines={2}
                    className="w-full text-center"
                  >
                    {step.title}
                  </Txt>
                  <Txt
                    size="micro"
                    tone="muted"
                    numberOfLines={6}
                    className="w-full text-center"
                  >
                    {step.detail}
                  </Txt>
                </View>
              </React.Fragment>
            ))}
          </View>
        </Card>

        {/* Why */}
        <Card className="mx-4 mt-4 flex-row items-center gap-3 p-4">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name="shield-checkmark" size={40} color={colors.brand[600]} />
          </View>
          <View className="min-w-0 flex-1">
            <Txt size="lg" weight="bold">
              Why we do this?
            </Txt>
            <View className="mt-2 gap-1.5">
              {REASONS.map((reason) => (
                <View key={reason} className="flex-row items-start gap-2">
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={colors.leaf[600]}
                    style={{ marginTop: 1 }}
                  />
                  <Txt size="tiny" tone="soft" className="flex-1">
                    {reason}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        </Card>

        <View className="mx-4 mt-4">
          <Note
            icon="bulb"
            tone="warn"
            title="Please Note"
            detail="Share the OTP only with the delivery partner. Do not share it with anyone else."
          />
        </View>

        <Pressable
          onPress={() =>
            order ? router.push(`/track/${order.id}` as never) : router.back()
          }
          className="mx-4 mt-5 h-14 items-center justify-center rounded-tile bg-brand-600 active:opacity-90"
        >
          <Txt size="lg" weight="bold" tone="white">
            Continue
          </Txt>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
