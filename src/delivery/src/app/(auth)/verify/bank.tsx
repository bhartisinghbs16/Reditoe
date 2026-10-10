import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Badge,
  Button,
  CheckBox,
  Field,
  FootNote,
  NoteBar,
  OtpBoxes,
  Screen,
  Txt,
  colors,
} from "@/components/ui";
import { KycHeader, StepCard } from "@/components/kyc";
import { useStore } from "@/lib/store";

/**
 * Bank Details — step four of four, reproduced from the reference: the account
 * number, the bank picker, the OTP, and the fetched holder details with the
 * confirmation tick and the payout warning.
 */

export default function BankVerification() {
  const router = useRouter();
  const { rider } = useStore();
  const [reveal, setReveal] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(true);
  const [secondsLeft, setSecondsLeft] = React.useState(28);

  React.useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const holder = [
    { icon: "person-outline" as const, label: "Account Holder Name", value: rider.bank.holder },
    { icon: "business-outline" as const, label: "Bank Name", value: rider.bank.name },
    { icon: "locate-outline" as const, label: "IFSC Code", value: rider.bank.ifsc },
    { icon: "shield-outline" as const, label: "Account Type", value: rider.bank.type },
  ];

  return (
    <Screen>
      <KycHeader
        step={3}
        title="Bank Details"
        detail="We will fetch your bank details securely using the Account Aggregator API."
        secure={false}
        titleInBar
      />

      <View className="mt-4 gap-3.5 px-4">
        <NoteBar
          tone="green"
          icon="lock-closed"
          title="Your bank details are safe with us"
          detail="We use secure APIs to fetch your bank information."
        >
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
              Powered by Account Aggregator API
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

        <StepCard
          number={1}
          title="Enter Bank Account Number"
          detail="Enter your active bank account number"
        >
          <Field
            placeholder="Enter account number"
            icon="business-outline"
            keyboardType="number-pad"
            secure={!reveal}
            trailing={reveal ? "eye-outline" : "eye-off-outline"}
            onTrailing={() => setReveal((on) => !on)}
          />
          <Txt size="tiny" tone="muted" className="mt-2.5">
            Note: Make sure your account is active and in your name
          </Txt>
        </StepCard>

        <StepCard
          number={2}
          title="Select Your Bank"
          detail="Choose your bank to fetch account details"
        >
          <Field placeholder="Search and select your bank" icon="search" select />
        </StepCard>

        <StepCard
          number={3}
          title="Verify with OTP"
          detail="We will send an OTP to your registered mobile number"
        >
          <OtpBoxes filled={0} boxed />
          <View className="mt-3 flex-row items-center justify-center gap-1">
            <Txt size="sm" tone="muted">
              {secondsLeft > 0 ? "Resend OTP in" : "Didn't get it?"}
            </Txt>
            <Txt size="sm" weight="bold" tone="brand">
              {secondsLeft > 0 ? `00:${String(secondsLeft).padStart(2, "0")}` : "Resend OTP"}
            </Txt>
          </View>
        </StepCard>

        <StepCard
          number={4}
          title="Account Holder Details"
          detail="Details fetched securely from your bank"
        >
          <View
            style={{ backgroundColor: "#f2f5fa" }}
            className="gap-2.5 rounded-tile p-3.5"
          >
            <View className="flex-row justify-end">
              <Badge label="Verified" tone="ok" icon="checkmark-circle" />
            </View>

            {holder.map((row) => (
              <View key={row.label} className="flex-row items-center gap-2.5">
                <Ionicons name={row.icon} size={15} color={colors.ink.muted} />
                <Txt size="tiny" tone="muted" className="w-[126px]">
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
              accessibilityLabel="Confirm the bank account belongs to you"
            />
            <Txt size="sm" tone="soft" className="flex-1">
              I confirm that the above details are correct and belong to me.
            </Txt>
          </View>

          <NoteBar
            tone="amber"
            icon="alert-circle"
            title="Important:"
            detail="The bank account must be in your name. We will use this account for payouts."
            className="mt-3.5"
          />
        </StepCard>

        <Button
          label="Save & Continue"
          accent="brand"
          size="lg"
          iconRight="arrow-forward"
          disabled={!confirmed}
          onPress={() => router.push("/verify/done")}
        />

        <FootNote
          icon="shield-checkmark"
          text="Your information is encrypted and 100% secure."
        />
      </View>
    </Screen>
  );
}
