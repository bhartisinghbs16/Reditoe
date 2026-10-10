import React from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, Txt, colors } from "@/components/ui";

/**
 * The handover check, at both ends of the trip.
 *
 * At the restaurant the vendor reads out a four-digit code; at the door the
 * customer does. Either can be scanned instead, and the scanner lives here
 * rather than on the Scan tab: the tab has no order in hand, so a code read
 * there would have nothing to verify against. Scanning from inside the sheet
 * means the payload goes straight to the order it was opened for.
 *
 * The code belongs to the person handing over, never to the rider — showing it
 * here would defeat the point of asking. Nothing on this sheet displays it.
 */

export type VerifyStage = "pickup" | "delivery";

const COPY: Record<VerifyStage, { title: string; ask: string; cta: string }> = {
  pickup: {
    title: "Collect the order",
    ask: "Ask the restaurant for their 4-digit pickup code, or scan the QR on their screen.",
    cta: "Verify pickup",
  },
  delivery: {
    title: "Complete the delivery",
    ask: "Ask the customer for their 4-digit code, or scan the QR in their app.",
    cta: "Verify delivery",
  },
};

export function VerifySheet({
  stage,
  visible,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  stage: VerifyStage;
  visible: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  /** Takes the typed digits or the scanned payload — the server reads both. */
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const copy = COPY[stage];

  // Each opening starts clean, so a previous order's digits are never sitting
  // in the box ready to be submitted against this one.
  React.useEffect(() => {
    if (visible) {
      setCode("");
      setScanning(false);
    }
  }, [visible, stage]);

  const ready = code.trim().length === 4 && !busy;

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setScanning(true);
  };

  /**
   * A camera fires this many times a second once a code is in frame. The guard
   * stops one QR becoming a dozen verify calls, each spending an attempt.
   */
  const handledRef = React.useRef(false);
  React.useEffect(() => {
    if (scanning) handledRef.current = false;
  }, [scanning]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 justify-end bg-black/45" onPress={onCancel}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <View className="rounded-t-3xl bg-surface px-5 pb-8 pt-4">
            <View className="mb-4 h-1 w-10 self-center rounded-full bg-line" />

            <Txt size="xl" weight="bold">
              {copy.title}
            </Txt>
            <Txt size="sm" tone="muted" className="mt-1">
              {copy.ask}
            </Txt>

            {scanning ? (
              <View className="mt-4">
                <View className="h-64 overflow-hidden rounded-card bg-black">
                  <CameraView
                    style={{ flex: 1 }}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={({ data }) => {
                      if (handledRef.current) return;
                      handledRef.current = true;
                      setScanning(false);
                      onSubmit(data);
                    }}
                  />
                </View>
                <Pressable
                  onPress={() => setScanning(false)}
                  className="mt-3 items-center py-2 active:opacity-70"
                >
                  <Txt size="sm" weight="bold" tone="brand">
                    Enter the code instead
                  </Txt>
                </Pressable>
              </View>
            ) : (
              <>
                <View className="mt-5">
                  <Txt size="tiny" tone="muted" className="mb-1.5">
                    4-digit code
                  </Txt>
                  <TextInput
                    value={code}
                    onChangeText={(next) => setCode(next.replace(/\D/g, "").slice(0, 4))}
                    placeholder="0000"
                    placeholderTextColor={colors.ink.faint}
                    keyboardType="number-pad"
                    maxLength={4}
                    autoFocus
                    className="h-14 rounded-tile border border-line px-4 text-center text-[26px] tracking-[10px] text-ink"
                  />
                </View>

                {error && (
                  <View className="mt-3 flex-row items-start gap-2 rounded-tile bg-red-50 p-3">
                    <Ionicons
                      name="alert-circle"
                      size={16}
                      color={colors.brand[600]}
                      style={{ marginTop: 1 }}
                    />
                    <Txt size="tiny" className="flex-1 text-red-700">
                      {error}
                    </Txt>
                  </View>
                )}

                {/* Permission refused for good — say what to do about it, since
                    the button alone would simply keep doing nothing. */}
                {permission && !permission.granted && !permission.canAskAgain && (
                  <Txt size="tiny" tone="muted" className="mt-3">
                    Camera access is off for this app. Turn it on in Settings to scan,
                    or type the code above.
                  </Txt>
                )}

                <View className="mt-5 flex-row gap-3">
                  <Button
                    label="Scan QR"
                    variant="outline"
                    accent="brand"
                    icon="scan-outline"
                    className="flex-1"
                    onPress={() => void openScanner()}
                  />
                  <Button
                    label={busy ? "Checking…" : copy.cta}
                    className="flex-[1.6]"
                    disabled={!ready}
                    onPress={() => onSubmit(code.trim())}
                  />
                </View>
              </>
            )}

            <Pressable onPress={onCancel} className="mt-3 items-center py-2 active:opacity-70">
              <Txt size="sm" tone="muted">
                Not yet
              </Txt>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
