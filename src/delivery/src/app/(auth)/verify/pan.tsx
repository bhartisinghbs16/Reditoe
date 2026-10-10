import React from "react";
import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Button,
  CheckBox,
  Field,
  FootNote,
  Screen,
  Txt,
  UploadBox,
} from "@/components/ui";
import { Hint, KycHeader, StepCard, WhyBar } from "@/components/kyc";
import { api } from "@/lib/api";

/**
 * PAN Card Verification — step two of four, reproduced from the reference: the
 * "why we need it" strip, the number with its Fetch action, the auto-filled
 * detail block with its confirmation tick, and the upload.
 */

/** A PAN is five letters, four digits and a letter. */
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export default function PanVerification() {
  const router = useRouter();
  const [pan, setPan] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [verified, setVerified] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  /*
   * "Fetch PAN Details" had no handler, and the details under it were four
   * hard-coded lines — a name and a number belonging to nobody. So a partner
   * could type their PAN, watch somebody else's details appear, and press
   * "Verify PAN", which only moved to the next screen. Nothing was ever
   * checked with the Income Tax API the screen names.
   */
  const fetched = [
    { label: "PAN Number", value: pan.toUpperCase() },
    { label: "Status", value: verified ? "Verified" : "Not verified yet" },
  ];

  const check = async () => {
    const value = pan.trim().toUpperCase();
    if (!PAN_PATTERN.test(value)) {
      Alert.alert("Check the number", "A PAN looks like ABCDE1234F.");
      return;
    }
    setChecking(true);
    try {
      const result = await api.verifyPan(value);
      const ok = result?.data?.verified !== false;
      setVerified(ok);
      if (!ok) {
        Alert.alert("Not verified", result?.message ?? "That PAN could not be verified.");
      }
    } catch (error) {
      setVerified(false);
      Alert.alert(
        "Couldn't verify",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <Screen>
      <KycHeader
        step={1}
        title="PAN Card Verification"
        detail="We will fetch your PAN details using the Income Tax API."
        secure={false}
        titleInBar
      />

      <View className="mt-4 gap-3.5 px-4">
        <WhyBar
          title="Why we need your PAN?"
          detail="PAN is used to verify your identity and help us comply with government regulations."
          poweredBy="Income Tax API"
        />

        <StepCard
          number={1}
          title="Enter PAN Number"
          detail="Enter your 10 digit PAN number"
        >
          <Field
            placeholder="Enter PAN number (e.g. ABCDE1234F)"
            icon="card-outline"
            value={pan}
            onChangeText={(next) => {
              setPan(next.toUpperCase());
              setVerified(false);
              setConfirmed(false);
            }}
          />
          <Hint text="Make sure your PAN is active" />
          <Button
            label={checking ? "Checking…" : "Fetch PAN Details"}
            accent="brand"
            size="lg"
            className="mt-3.5"
            disabled={checking}
            onPress={check}
          />
        </StepCard>

        <StepCard
          number={2}
          title="PAN Details"
          detail="Details will be auto fetched and verified"
        >
          <View
            style={{ backgroundColor: "#f4f2fb" }}
            className="gap-2.5 rounded-tile p-3.5"
          >
            {fetched.map((row) => (
              <View key={row.label} className="flex-row items-center gap-3">
                <Txt size="tiny" tone="muted" className="w-[104px]">
                  {row.label}
                </Txt>
                <Txt size="sm" weight="semibold" className="flex-1">
                  {row.value}
                </Txt>
              </View>
            ))}
          </View>

          <View className="mt-3.5 flex-row items-center gap-2.5">
            <CheckBox
              checked={confirmed}
              onChange={setConfirmed}
              accessibilityLabel="Confirm the fetched PAN details"
            />
            <Txt size="sm" tone="soft" className="flex-1">
              I confirm that the above details are correct
            </Txt>
          </View>
        </StepCard>

        <StepCard
          number={3}
          title="Upload PAN Card"
          detail="Upload clear front side of your PAN card"
        >
          <UploadBox />
          <Hint text="Make sure document is clear and all details are visible" tone="red" />
        </StepCard>

        <Button
          label="Verify PAN"
          accent="brand"
          size="lg"
          iconRight="arrow-forward"
          disabled={!confirmed || !verified}
          onPress={() => router.push("/verify/licence")}
        />

        <FootNote text="Your documents are safe with us and will never be shared." />
      </View>
    </Screen>
  );
}
