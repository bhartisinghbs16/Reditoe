import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, OtpBoxes, Screen, Txt, colors } from "@/components/ui";
import { AppBar } from "@/components/screen-header";
import { OrRule } from "@/components/brand";

/**
 * OTP Verification, reproduced from the reference: the number the code went
 * to, the pink artwork panel, the six boxes with their resend timer, the red
 * primary and the phone-call fallback, closing on the safety note.
 */

function OtpArt() {
  return (
    <View
      style={{ backgroundColor: "#fdeeee" }}
      className="h-[190px] items-center justify-center overflow-hidden rounded-card"
    >
      <View className="absolute bottom-0 left-0 right-0 h-1/2 flex-row items-end gap-1.5 px-6 opacity-60">
        {[0.4, 0.75, 0.5, 0.9, 0.55, 0.7].map((h, index) => (
          <View
            key={index}
            style={{ height: `${h * 100}%`, backgroundColor: "#fbd9d9" }}
            className="flex-1 rounded-t-md"
          />
        ))}
      </View>

      <View className="flex-row items-center gap-4">
        {/* The handset carrying the code. */}
        <View
          style={{ borderColor: colors.brand[500] }}
          className="h-[104px] w-[62px] items-center justify-center rounded-xl border-2 bg-white"
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name="lock-closed" size={20} color={colors.brand[500]} />
          </View>
          <Txt size="micro" weight="bold" tone="brand" className="mt-1.5">
            OTP
          </Txt>
        </View>

        {/* The message it arrived in. */}
        <View className="h-14 w-[76px] items-center justify-center rounded-lg bg-brand-100">
          <Ionicons name="mail" size={26} color={colors.brand[500]} />
        </View>
      </View>
    </View>
  );
}

export default function Otp() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = React.useState(28);

  React.useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const clock = `00:${String(secondsLeft).padStart(2, "0")}`;

  return (
    <Screen>
      <AppBar title="" leading="back" />

      <View className="px-4">
        <Txt size="2xl" weight="bold">
          OTP Verification
        </Txt>
        <Txt size="sm" tone="muted" className="mt-1">
          We have sent a 6 digit OTP to
        </Txt>
        <Txt size="lg" weight="bold" className="mt-0.5">
          +91 98765 43210
        </Txt>
      </View>

      <View className="mt-4 px-4">
        <OtpArt />
      </View>

      <View className="mt-6 px-4">
        <Txt weight="semibold">Enter 6 digit OTP</Txt>
        <View className="mt-3">
          <OtpBoxes filled={0} boxed />
        </View>

        <View className="mt-6 flex-row items-center justify-center gap-1">
          <Txt size="sm" tone="muted">
            {secondsLeft > 0 ? "Resend OTP in" : "Didn't get it?"}
          </Txt>
          <Txt size="sm" weight="bold" tone="brand">
            {secondsLeft > 0 ? clock : "Resend OTP"}
          </Txt>
        </View>

        <Button
          label="Verify OTP"
          accent="brand"
          size="lg"
          className="mt-4"
          onPress={() => router.push("/complete-profile")}
        />

        <OrRule className="my-4" />

        <Button
          label="Verify with Phone Call"
          variant="plain"
          size="lg"
          icon="call"
          iconAccent="brand"
          onPress={() => router.push("/complete-profile")}
        />
      </View>

      <View className="mt-10 items-center px-8">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-50">
          <Ionicons name="shield-checkmark" size={22} color={colors.brand[500]} />
        </View>
        <Txt weight="bold" className="mt-2.5">
          Your number is safe with us
        </Txt>
        <Txt size="sm" tone="muted" className="mt-0.5 text-center">
          We never share your information with anyone.
        </Txt>
      </View>
    </Screen>
  );
}
