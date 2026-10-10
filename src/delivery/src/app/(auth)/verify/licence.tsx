import React from "react";
import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Badge,
  Button,
  CheckBox,
  Field,
  FootNote,
  Screen,
  Txt,
  UploadBox,
  colors,
} from "@/components/ui";
import { Hint, KycHeader, StepCard, WhyBar } from "@/components/kyc";
import { api } from "@/lib/api";

/**
 * Driving Licence Verification — step three of four, reproduced from the
 * reference: the "why we need it" strip, the licence number with its Fetch
 * action, the fetched details ticked off one by one, and the upload.
 */

export default function LicenceVerification() {
  const router = useRouter();
  const [licence, setLicence] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [verified, setVerified] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  /*
   * "Fetch DL Details" had no handler, and the four lines beneath it were
   * hard-coded — a name, a licence number and an expiry belonging to nobody,
   * each with a green tick and a VALID badge beside it. A partner saw someone
   * else's licence marked valid and could carry straight on. The Parivahan
   * check this screen names is now actually made.
   */
  const fetched = [
    { label: "DL Number", value: licence.trim().toUpperCase() || "—" },
    { label: "Date of Birth", value: dob.trim() || "—" },
  ];

  const check = async () => {
    if (!licence.trim() || !dob.trim()) {
      Alert.alert("Both are needed", "Enter your licence number and date of birth.");
      return;
    }
    setChecking(true);
    try {
      const result = await api.verifyDrivingLicence(licence.trim().toUpperCase(), dob.trim());
      const ok = result?.data?.verified !== false;
      setVerified(ok);
      if (!ok) {
        Alert.alert("Not verified", result?.message ?? "That licence could not be verified.");
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
        step={2}
        title="Driving Licence Verification"
        detail="We will fetch your driving licence details using the Parivahan API."
        secure={false}
        titleInBar
      />

      <View className="mt-4 gap-3.5 px-4">
        <WhyBar
          title="Why we need your Driving Licence?"
          detail="To verify your identity and allow you to deliver on our platform as a delivery partner."
          poweredBy="Parivahan API"
        />

        <StepCard
          number={1}
          title="Enter Driving Licence Number"
          detail="Enter your DL number to fetch details"
        >
          <Field
            placeholder="Enter DL number (e.g. TN02 20200012345)"
            icon="car-sport-outline"
            value={licence}
            onChangeText={(next) => {
              setLicence(next.toUpperCase());
              setVerified(false);
              setConfirmed(false);
            }}
          />
          <Field
            placeholder="Date of birth (YYYY-MM-DD)"
            icon="calendar-outline"
            className="mt-2.5"
            value={dob}
            onChangeText={(next) => {
              setDob(next);
              setVerified(false);
              setConfirmed(false);
            }}
          />
          <Hint text="Make sure your driving licence is valid and not expired" />
          <Button
            label={checking ? "Checking…" : "Fetch DL Details"}
            accent="brand"
            size="lg"
            className="mt-3.5"
            disabled={checking}
            onPress={check}
          />
        </StepCard>

        <StepCard
          number={2}
          title="Driving Licence Details"
          detail="Details will be auto fetched and verified"
        >
          <View
            style={{ backgroundColor: "#fdeeee" }}
            className="gap-2.5 rounded-tile p-3.5"
          >
            {fetched.map((row) => (
              <View key={row.label} className="flex-row items-center gap-2.5">
                <Ionicons
                  name={verified ? "checkmark-circle" : "ellipse-outline"}
                  size={16}
                  color={verified ? colors.green[500] : colors.ink.faint}
                />
                <Txt size="tiny" tone="muted" className="w-[92px]">
                  {row.label}
                </Txt>
                <Txt size="sm" weight="semibold" className="flex-1">
                  {row.value}
                </Txt>
              </View>
            ))}

            <View className="flex-row items-center gap-2.5">
              <Ionicons
                name={verified ? "checkmark-circle" : "ellipse-outline"}
                size={16}
                color={verified ? colors.green[500] : colors.ink.faint}
              />
              <Txt size="tiny" tone="muted" className="w-[92px]">
                Status
              </Txt>
              <Badge label={verified ? "VALID" : "NOT CHECKED"} tone={verified ? "ok" : "neutral"} />
            </View>
          </View>

          <View className="mt-3.5 flex-row items-center gap-2.5">
            <CheckBox
              checked={confirmed}
              onChange={setConfirmed}
              accessibilityLabel="Confirm the fetched licence details"
            />
            <Txt size="sm" tone="soft" className="flex-1">
              I confirm that the above details are correct
            </Txt>
          </View>
        </StepCard>

        <StepCard
          number={3}
          title="Upload Driving Licence"
          detail="Upload clear front side of your driving licence"
        >
          <UploadBox />
          <Hint text="Ensure the document is clear and all details are visible" tone="red" />
        </StepCard>

        <Button
          label="Verify Driving Licence"
          accent="brand"
          size="lg"
          iconRight="arrow-forward"
          disabled={!confirmed || !verified}
          onPress={() => router.push("/verify/bank")}
        />

        <FootNote text="Your documents are safe with us and will never be shared." />
      </View>
    </Screen>
  );
}
