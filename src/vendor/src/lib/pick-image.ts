import * as DocumentPicker from "expo-document-picker";
import { mediaUrl, uploadMenuImage } from "@/lib/api";

/**
 * Lets the vendor choose a photo from the phone and uploads it.
 *
 * Resolves to the stored image's address, or null if they backed out. Uses the
 * document picker (already in the app) filtered to images, so it works without
 * a new native module.
 */
export async function pickAndUploadMenuImage(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["image/jpeg", "image/png", "image/webp"],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;

  const file = picked.assets[0];
  if (file.size && file.size > 5 * 1024 * 1024) {
    throw new Error("That photo is larger than 5 MB. Choose a smaller one.");
  }

  const body = new FormData();
  const name = file.name ?? "dish.jpg";
  if (file.file) {
    body.append("image", file.file, name);
  } else {
    body.append("image", {
      uri: file.uri,
      name,
      type: file.mimeType ?? "image/jpeg",
    } as any);
  }

  const url = await uploadMenuImage(body);
  return mediaUrl(url) ?? url;
}
