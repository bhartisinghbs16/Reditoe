import React from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Note, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { formatDateInput, isoFromDDMMYYYY } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ProfilePhoto } from "@/lib/api";

/**
 * Finishing signing up.
 *
 * Reached from the sign-in screen when the mobile number that has just been
 * verified does not belong to anybody yet. The number is not asked for again:
 * it is shown, ticked, and cannot be edited, because it is what the server was
 * shown proof of and what the account is created on.
 *
 * What is collected is what the brief asks for - a profile photo, full name,
 * email address and date of birth - and nothing is created until all of it is
 * in hand.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard = "default",
  autoCapitalize = "none",
  maxLength,
  problem,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  keyboard?: "default" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "words" | "characters";
  maxLength?: number;
  /** Shown under the field once there is something to say about it. */
  problem?: string | null;
}) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View className="mt-3">
      <Txt size="tiny" tone="muted" className="mb-1.5">
        {label}
      </Txt>
      <View
        className={`h-12 justify-center rounded-tile border px-3 ${
          problem ? "border-bad" : focused ? "border-brand-500" : "border-line"
        }`}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.ink.faint}
          keyboardType={keyboard}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          className="p-0 text-[15px] text-ink"
        />
      </View>
      {problem && (
        <Txt size="micro" tone="bad" className="mt-1">
          {problem}
        </Txt>
      )}
    </View>
  );
}

export default function SignUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();
  const { pendingSignup, completeSignUp, cancelSignUp, signedIn, signingIn, authError } =
    useStore();

  const [photo, setPhoto] = React.useState<ProfilePhoto | null>(null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [referral, setReferral] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof params.ref === "string" && params.ref.trim()) {
      setReferral(params.ref.trim().toUpperCase());
    }
  }, [params.ref]);

  // Nothing to sign up: the app was restarted since the number was verified, or
  // this was opened without going through the sign-in screen. Start over.
  React.useEffect(() => {
    if (!pendingSignup && !signedIn) router.replace("/signin");
  }, [pendingSignup, signedIn, router]);

  const dobIso = isoFromDDMMYYYY(dob);

  const ready = Boolean(
    photo && name.trim().length >= 2 && EMAIL.test(email.trim()) && dobIso && agreed
  );

  /** Gives the customer a way back to the number rather than a dead end. */
  const back = () => {
    cancelSignUp();
    router.replace("/signin");
  };

  const take = async (source: "camera" | "library") => {
    setPhotoError(null);
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPhotoError("Allow camera access in your phone's settings, or choose a photo instead.");
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        // The server accepts up to 8 MB; a profile picture does not need
        // anywhere near that, and a smaller file is a faster sign-up on mobile data.
        quality: 0.7,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              ...options,
              cameraType: ImagePicker.CameraType.front,
            })
          : await ImagePicker.launchImageLibraryAsync(options);

      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      setPhoto({ uri: asset.uri, name: asset.fileName, mimeType: asset.mimeType });
    } catch {
      setPhotoError("We couldn't open your photos. Please try again.");
    }
  };

  const choosePhoto = () => {
    // A browser has no camera to offer: Alert.alert does nothing there, so it
    // goes straight to the file picker.
    if (Platform.OS === "web") {
      void take("library");
      return;
    }
    Alert.alert("Profile photo", "Where would you like to get it from?", [
      { text: "Take a photo", onPress: () => void take("camera") },
      { text: "Choose from gallery", onPress: () => void take("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const submit = async () => {
    if (!photo || !dobIso) return;
    const created = await completeSignUp({
      name: name.trim(),
      email: email.trim(),
      dateOfBirth: dobIso,
      photo,
      referralCode: referral.trim() || undefined,
    });
    if (created) router.replace("/(tabs)");
  };

  if (!pendingSignup) return null;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Create your account"
        subtitle="Just a few details and you're in"
        onBack={back}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="pb-10"
        >
          <Card className="mx-4 mt-1 p-4">
            {/* The photo first: it is the part of this form people put off. */}
            <View className="items-center">
              <Pressable
                onPress={choosePhoto}
                accessibilityLabel={photo ? "Change profile photo" : "Add a profile photo"}
                className="active:opacity-80"
              >
                <View
                  className={`h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 ${
                    photoError ? "border-bad" : photo ? "border-brand-500" : "border-line"
                  } bg-surface-sunken`}
                >
                  {photo ? (
                    <Image
                      source={{ uri: photo.uri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                      accessibilityLabel="Your profile photo"
                    />
                  ) : (
                    <Ionicons name="person" size={46} color={colors.ink.faint} />
                  )}
                </View>
                <View className="absolute bottom-0 right-0 h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand-600">
                  <Ionicons name="camera" size={17} color="#ffffff" />
                </View>
              </Pressable>
              <Txt size="tiny" tone={photoError ? "bad" : "muted"} className="mt-2 text-center">
                {photoError ?? (photo ? "Tap to change" : "Add a profile photo")}
              </Txt>
            </View>

            {/* The number, as verified. Not editable: it is what the account is for. */}
            <View className="mt-4">
              <Txt size="tiny" tone="muted" className="mb-1.5">
                Mobile number
              </Txt>
              <View className="h-12 flex-row items-center gap-2 rounded-tile border border-line bg-surface-sunken px-3">
                <Txt weight="semibold" className="flex-1">
                  {pendingSignup.phone.replace(/^\+91/, "+91 ")}
                </Txt>
                <Ionicons name="checkmark-circle" size={18} color={colors.leaf[600]} />
                <Txt size="tiny" weight="semibold" tone="ok">
                  Verified
                </Txt>
              </View>
            </View>

            <Field
              label="Full name"
              value={name}
              onChange={setName}
              placeholder="Mohan Kumar"
              autoCapitalize="words"
            />

            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              keyboard="email-address"
              problem={email.trim() && !EMAIL.test(email.trim()) ? "That email does not look right." : null}
            />

            <Field
              label="Date of birth"
              value={dob}
              onChange={(next) => setDob(formatDateInput(next))}
              placeholder="DD/MM/YYYY"
              keyboard="number-pad"
              maxLength={10}
              problem={dob.length === 10 && !dobIso ? "Enter a real date, as DD/MM/YYYY." : null}
            />

            <Field
              label="Referral code (optional)"
              value={referral}
              onChange={(next) => setReferral(next.toUpperCase())}
              placeholder="Have one? Enter it here"
              autoCapitalize="characters"
            />

            {/* Consent is required to create an account, and only then. */}
            <Pressable
              onPress={() => setAgreed((on) => !on)}
              className="mt-4 flex-row items-start gap-2.5 active:opacity-70"
            >
              <Ionicons
                name={agreed ? "checkbox" : "square-outline"}
                size={20}
                color={agreed ? colors.brand[600] : colors.ink.faint}
              />
              <Txt size="sm" tone="muted" className="flex-1">
                I agree to the{" "}
                <Txt size="sm" weight="bold" tone="brand">
                  Terms &amp; Conditions
                </Txt>{" "}
                and{" "}
                <Txt size="sm" weight="bold" tone="brand">
                  Privacy Policy
                </Txt>
              </Txt>
            </Pressable>

            {authError && (
              <View className="mt-3">
                <Note icon="alert-circle" tone="bad" title={authError} />
              </View>
            )}

            <Pressable
              onPress={submit}
              disabled={!ready || signingIn}
              className={`mt-5 h-13 items-center justify-center rounded-tile py-4 ${
                ready && !signingIn ? "bg-brand-600 active:opacity-90" : "bg-surface-sunken"
              }`}
            >
              <Txt size="lg" weight="bold" tone={ready && !signingIn ? "white" : "faint"}>
                {signingIn ? "Creating your account…" : "Create account"}
              </Txt>
            </Pressable>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
