import React from "react";
import { Alert, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Field, FootNote, OtpBoxes, Screen, Txt, UploadBox } from "@/components/ui";
import { Hint, KycHeader, StepCard } from "@/components/kyc";
import { api } from "@/lib/api";

/**
 * Aadhaar Verification — step one of four, reproduced from the reference: the
 * number and its Send OTP, the six-box verification, and the document upload,
 * each as its own numbered card.
 */

export default function AadhaarVerification() {
  const router = useRouter();
  const [reveal, setReveal] = React.useState(false);
  const [aadhaar, setAadhaar] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [requestId, setRequestId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(0);

  /*
   * "Send OTP" had no handler and the six boxes below took no input, so the
   * screen asked for an Aadhaar number, showed a countdown to a code that was
   * never sent, and let "Verify Aadhaar" carry on to the next step regardless.
   * Nothing was verified.
   *
   * The countdown now starts when a code has actually gone out.
   */
  React.useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft > 0]);

  const sendOtp = async () => {
    const digits = aadhaar.replace(/\D/g, "");
    if (digits.length !== 12) {
      Alert.alert("Check the number", "An Aadhaar number is 12 digits.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.initiateAadhaar(digits);
      if (result?.data?.verified) {
        Alert.alert("Already verified", "Your Aadhaar is verified.");
        router.push("/verify/pan");
        return;
      }
      const reference = result?.data?.requestId ?? null;
      if (!reference) {
        Alert.alert("Couldn't send", result?.message ?? "No code was sent. Please try again.");
        return;
      }
      setRequestId(reference);
      setSecondsLeft(30);
      Alert.alert("Code sent", "Enter the OTP sent to your Aadhaar-registered mobile number.");
    } catch (error) {
      Alert.alert(
        "Couldn't send",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!requestId) {
      Alert.alert("Send a code first", "Press Send OTP before verifying.");
      return;
    }
    if (otp.replace(/\D/g, "").length < 4) {
      Alert.alert("Enter the code", "Type the OTP you were sent.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.verifyAadhaar(requestId, otp.replace(/\D/g, ""));
      if (result?.data?.verified === false) {
        Alert.alert("Not verified", result?.message ?? "That code was not accepted.");
        return;
      }
      router.push("/verify/pan");
    } catch (error) {
      Alert.alert(
        "Couldn't verify",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KycHeader
        step={0}
        title="Aadhaar Verification"
        detail="We will verify your Aadhaar using OTP."
      />

      <View className="mt-4 gap-3.5 px-4">
        <StepCard
          number={1}
          title="Enter Aadhaar Number"
          detail="Enter your 12 digit Aadhaar number"
        >
          <Field
            placeholder="Enter 12 digit Aadhaar number"
            icon="id-card-outline"
            keyboardType="number-pad"
            secure={!reveal}
            value={aadhaar}
            onChangeText={(next) => setAadhaar(next.replace(/\D/g, "").slice(0, 12))}
            trailing={reveal ? "eye-outline" : "eye-off-outline"}
            onTrailing={() => setReveal((on) => !on)}
          />
          <Button
            label={busy ? "Sending…" : requestId ? "Send again" : "Send OTP"}
            accent="brand"
            size="lg"
            className="mt-3.5"
            disabled={busy || secondsLeft > 0}
            onPress={sendOtp}
          />
        </StepCard>

        <StepCard
          number={2}
          title="Verify OTP"
          detail="Enter the OTP sent to your Aadhaar registered mobile number"
        >
          <OtpBoxes filled={otp.length} boxed />
          <Field
            placeholder="Enter the OTP"
            icon="keypad-outline"
            keyboardType="number-pad"
            className="mt-3"
            value={otp}
            onChangeText={(next) => setOtp(next.replace(/\D/g, "").slice(0, 6))}
          />
          <View className="mt-3 flex-row items-center justify-center gap-1">
            <Txt size="sm" tone="muted">
              {secondsLeft > 0 ? "Resend OTP in" : "Didn't get it?"}
            </Txt>
            {secondsLeft > 0 ? (
              <Txt size="sm" weight="bold" tone="brand">
                {`00:${String(secondsLeft).padStart(2, "0")}`}
              </Txt>
            ) : (
              <Pressable onPress={sendOtp} disabled={busy} accessibilityLabel="Resend OTP">
                <Txt size="sm" weight="bold" tone="brand">
                  Resend OTP
                </Txt>
              </Pressable>
            )}
          </View>
        </StepCard>

        <StepCard
          number={3}
          title="Upload Aadhaar Document"
          detail="Upload clear front side of your Aadhaar card"
        >
          <UploadBox dashed={false} />
          <Hint text="Make sure document is clear and all details are visible" tone="red" />
        </StepCard>

        <Button
          label="Verify Aadhaar"
          accent="brand"
          size="lg"
          iconRight="arrow-forward"
          disabled={busy || !requestId}
          onPress={verify}
        />

        <FootNote text="Your documents are safe with us and will never be shared." />
      </View>
    </Screen>
  );
}
