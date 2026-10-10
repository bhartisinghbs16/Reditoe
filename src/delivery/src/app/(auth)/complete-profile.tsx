import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Button,
  Card,
  Field,
  IconPlate,
  Screen,
  Txt,
  colors,
} from "@/components/ui";
import { AppBar } from "@/components/screen-header";
import type { TintName } from "@/lib/theme";

/**
 * Complete Your Profile, reproduced from the reference: the step counter in
 * the bar, the profile-photo prompt, the personal and vehicle field sets, and
 * the document rows that can be filled in later.
 */

const DOCS: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: TintName;
  title: string;
  detail: string;
}[] = [
  {
    icon: "id-card-outline",
    tint: "red",
    title: "Driving License",
    detail: "Upload front side",
  },
  {
    icon: "document-text-outline",
    tint: "red",
    title: "RC Book / Registration",
    detail: "Upload vehicle RC",
  },
  {
    icon: "shield-checkmark-outline",
    tint: "red",
    title: "Insurance",
    detail: "Upload insurance document",
  },
  {
    icon: "card-outline",
    tint: "red",
    title: "PAN Card (Optional)",
    detail: "Upload PAN card",
  },
];

function GroupTitle({ title, note }: { title: string; note?: string }) {
  return (
    <View className="flex-row items-end gap-1.5">
      <Txt size="lg" weight="bold">
        {title}
      </Txt>
      {note && (
        <Txt size="tiny" tone="muted" className="pb-0.5">
          {note}
        </Txt>
      )}
    </View>
  );
}

export default function CompleteProfile() {
  const router = useRouter();

  return (
    <Screen>
      <AppBar
        title=""
        leading="back"
        right={
          <Txt size="sm" weight="bold" tone="brand" numberOfLines={1}>
            Step 1 of 3
          </Txt>
        }
      />

      <View className="px-4">
        <Txt size="2xl" weight="bold">
          Complete Your Profile
        </Txt>
        <Txt size="sm" tone="muted" className="mt-0.5">
          Please provide your details to continue
        </Txt>
      </View>

      <View className="mt-5 gap-3 px-4">
        <GroupTitle title="Personal Information" />

        <View className="flex-row items-center gap-3">
          {/* Both of these had no handler. Uploading is done on the Documents
              screen, which already picks a file and posts it. */}
          <Pressable
            onPress={() => router.push("/documents")}
            className="h-[74px] w-[74px] items-center justify-center rounded-full bg-brand-50 active:opacity-80"
            accessibilityLabel="Upload profile photo"
          >
            <Ionicons name="camera" size={26} color={colors.brand[500]} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/documents")}
            accessibilityLabel="Upload profile photo"
            style={{ backgroundColor: "#fdeeee" }}
            className="min-w-0 flex-1 rounded-tile p-4 active:opacity-80"
          >
            <Txt weight="bold">Upload Profile Photo</Txt>
            <Txt size="sm" tone="muted" className="mt-0.5">
              JPG, PNG (Max 2 MB)
            </Txt>
          </Pressable>
        </View>

        <View className="flex-row gap-3">
          <Field label="Full Name" placeholder="Enter your full name" className="flex-1" />
          <Field
            label="Date of Birth"
            placeholder="DD / MM / YYYY"
            trailing="calendar-outline"
            className="flex-1"
          />
        </View>

        <Field label="Gender" placeholder="Select Gender" select />
        <Field
          label="Email (Optional)"
          placeholder="Enter email address"
          keyboardType="email-address"
        />
        <Field
          placeholder="Enter Mobile number"
          icon="call"
          prefix="+91"
          keyboardType="phone-pad"
        />
        <Field
          label="Emergency Contact"
          placeholder="Enter emergency number"
          icon="call"
          prefix="+91"
          keyboardType="phone-pad"
        />

        <GroupTitle title="Vehicle Information" />

        <Field label="Vehicle Type" placeholder="Select vehicle type" select />
        <Field label="Vehicle Number" placeholder="Enter vehicle number" />
        <Field label="Vehicle Model (Optional)" placeholder="Enter vehicle model" />

        <GroupTitle title="Documents" note="(You can upload later)" />

        <Card className="overflow-hidden">
          {DOCS.map((doc, index) => (
            <Pressable
              key={doc.title}
              onPress={() => router.push("/documents")}
              accessibilityLabel={`Upload ${doc.title}`}
              className={`flex-row items-center gap-3 px-4 py-3.5 active:opacity-80 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <IconPlate icon={doc.icon} tint={doc.tint} size={38} />
              <View className="min-w-0 flex-1">
                <Txt weight="bold" numberOfLines={1}>
                  {doc.title}
                </Txt>
                <Txt size="tiny" tone="muted" numberOfLines={1}>
                  {doc.detail}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.ink.faint} />
            </Pressable>
          ))}
        </Card>

        <Button
          label="Save & Continue"
          accent="brand"
          size="lg"
          iconRight="arrow-forward"
          className="mt-2"
          onPress={() => router.push("/verify/aadhaar")}
        />
      </View>
    </Screen>
  );
}
