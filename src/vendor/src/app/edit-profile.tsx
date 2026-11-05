import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Txt } from "@/components/ui";
import { Photo } from "@/components/photo";
import { TextField } from "@/components/form";
import { ScreenHeader } from "@/components/screen-header";
import { api, uploadRestaurantPhoto } from "@/lib/api";
import { img } from "@/lib/images";
import { useStore } from "@/lib/store";

/**
 * Edit Profile: the restaurant's name, contact number, description and photo.
 *
 * The "Edit Profile" link on More had no handler, so tapping it did nothing.
 * Saves go to the same PATCH the rest of the settings screens use, then the
 * store is re-read so More, the dashboard and the customer app agree.
 */
export default function EditProfile() {
  const router = useRouter();
  const { vendor, refresh } = useStore();

  const [name, setName] = React.useState(vendor.name === "—" ? "" : vendor.name);
  const [phone, setPhone] = React.useState(vendor.phone);
  const [description, setDescription] = React.useState(vendor.description);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The profile may still be loading when this opens; fill the form once it lands.
  const seeded = React.useRef(vendor.name !== "—");
  React.useEffect(() => {
    if (seeded.current || vendor.name === "—") return;
    seeded.current = true;
    setName(vendor.name);
    setPhone(vendor.phone);
    setDescription(vendor.description);
  }, [vendor.name, vendor.phone, vendor.description]);

  const problem = !name.trim()
    ? "Enter your restaurant's name."
    : phone.trim() && !/^[0-9+\-\s]{10,15}$/.test(phone.trim())
      ? "Enter a valid phone number."
      : null;

  const changePhoto = async () => {
    if (uploading) return;
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const file = picked.assets[0];
      if (file.size && file.size > 5 * 1024 * 1024) {
        setError("That photo is larger than 5 MB. Choose a smaller one.");
        return;
      }
      setUploading(true);
      const body = new FormData();
      const fileName = file.name ?? "profile.jpg";
      if (file.file) body.append("image", file.file, fileName);
      else
        body.append("image", {
          uri: file.uri,
          name: fileName,
          type: file.mimeType ?? "image/jpeg",
        } as any);
      await uploadRestaurantPhoto(body);
      await refresh();
    } catch (reason: any) {
      setError(reason?.message ?? "Couldn't upload that photo.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch("/vendor/restaurant", {
        name: name.trim(),
        phone: phone.trim(),
        description: description.trim(),
      });
      await refresh();
      Alert.alert("Saved", "Your profile has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (reason: any) {
      setError(reason?.message ?? "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Edit Profile" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-4 pb-32 pt-3">
        <View className="items-center">
          <Pressable onPress={changePhoto} accessibilityLabel="Change profile photo">
            <Photo
              uri={vendor.image || img(vendor.photo, 200)}
              width={96}
              height={96}
              radius={48}
            />
            <View className="absolute -bottom-0.5 -right-0.5 h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-indigo-600">
              {uploading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="camera" size={14} color="#ffffff" />
              )}
            </View>
          </Pressable>
          <Txt size="tiny" tone="muted" className="mt-2">
            Tap to change photo
          </Txt>
        </View>

        <TextField
          label="Restaurant name"
          required
          placeholder="Your restaurant's name"
          icon="storefront-outline"
          value={name}
          onChangeText={setName}
          maxLength={80}
          className="mt-4"
        />
        <TextField
          label="Contact number"
          placeholder="9876543210"
          icon="call-outline"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={15}
          className="mt-3"
        />
        <TextField
          label="Description"
          placeholder="Tell customers about your restaurant"
          value={description}
          onChangeText={setDescription}
          maxLength={300}
          multiline
          className="mt-3"
        />

        {error && (
          <Txt size="sm" className="mt-3 text-bad-ink">
            {error}
          </Txt>
        )}
        <Txt size="tiny" tone="muted" className="mt-3">
          Address, hours and delivery area are changed under Restaurant Information, Working Hours
          and Delivery Area.
        </Txt>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-4 pb-6 pt-3">
        <Button
          label={saving ? "Saving…" : "Save changes"}
          onPress={save}
          disabled={saving || uploading}
        />
      </View>
    </SafeAreaView>
  );
}
