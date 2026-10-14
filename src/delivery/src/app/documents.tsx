import React from "react";
import { Alert, Pressable, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Badge,
  Card,
  EmptyState,
  IconPlate,
  NoteBar,
  Panel,
  Screen,
  Txt,
  UnderlineTabs,
  UploadBox,
  colors,
} from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { PartnerCard } from "@/components/partner-card";
import { docTone, type TintName } from "@/lib/theme";
import { uploadForm } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * Documents, reproduced from the reference: the three-way tab strip, the
 * standing reminder, the document list with its verification chips and expiry
 * dates, the upload plate and the explanatory note.
 */

type Tab = "mine" | "status" | "expired";

/** The documents a rider can send in themselves, named as the server names them. */
const UPLOADABLE = [
  { type: "aadhaar", label: "Aadhaar" },
  { type: "pan", label: "PAN" },
  { type: "drivingLicense", label: "Driving licence" },
  { type: "vehicleRC", label: "Vehicle RC" },
  { type: "vehiclePhoto", label: "Vehicle photo" },
  { type: "passbookCancelledCheque", label: "Passbook" },
];

export default function Documents() {
  const router = useRouter();
  const { documents, refresh } = useStore();
  const [tab, setTab] = React.useState<Tab>("mine");
  const [kind, setKind] = React.useState(UPLOADABLE[0].type);
  const [busy, setBusy] = React.useState(false);

  /**
   * Pick a file and send it.
   *
   * Both platforms are handled: the web picker returns a real File and no
   * usable uri, and appending {uri, name, type} there makes the browser
   * serialise an object rather than send the file.
   */
  const pickAndUpload = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const file = picked.assets[0];
      setBusy(true);

      const body = new FormData();
      if (file.file) {
        body.append("document", file.file, file.name ?? kind);
      } else {
        body.append("document", {
          uri: file.uri,
          name: file.name ?? `${kind}.jpg`,
          type: file.mimeType ?? "image/jpeg",
        } as any);
      }
      body.append("documentType", kind);

      await uploadForm("/rider/documents/upload", body);

      await refresh();
      Alert.alert("Uploaded", "Your document has been sent for verification.");
    } catch (reason: any) {
      Alert.alert("Could not upload", reason?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const expired = documents.filter((doc) => doc.status === "Expired");
  const list = tab === "expired" ? expired : documents;

  return (
    <Screen>
      <ScreenHeader title="Documents" />

      <View className="gap-3.5 px-4 pt-3.5">
        <PartnerCard />

        <Card className="overflow-hidden">
          <UnderlineTabs
            value={tab}
            onChange={setTab}
            className="border-b-0"
            tabs={[
              { id: "mine", label: "My Documents" },
              { id: "status", label: "Verification Status" },
              { id: "expired", label: "Expired Documents" },
            ]}
          />
        </Card>

        <NoteBar
          tone="green"
          icon="document-text"
          detail="Keep your documents updated to continue delivering without interruption."
        />

        <Card className="overflow-hidden">
          {tab === "expired" && expired.length === 0 ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="Nothing has expired"
              detail="Every document on file is current. We will warn you a month before one runs out."
            />
          ) : (
            list.map((doc, index) => (
              <Pressable
                key={doc.id}
                onPress={() => router.push(`/document/${doc.id}` as never)}
                className={`flex-row items-center gap-3 px-4 py-3.5 active:opacity-80 ${
                  index > 0 ? "border-t border-line" : ""
                }`}
              >
                <IconPlate
                  icon={doc.icon as keyof typeof Ionicons.glyphMap}
                  tint={doc.tint as TintName}
                  size={42}
                />

                <View className="min-w-0 flex-1">
                  <Txt weight="bold" numberOfLines={2}>
                    {doc.title}
                  </Txt>
                  <Txt size="tiny" tone="muted" numberOfLines={2}>
                    {tab === "status" ? `Verified on ${doc.verifiedOn}` : doc.purpose}
                  </Txt>
                </View>

                <View className="items-end gap-1">
                  <Badge label={doc.status} tone={docTone[doc.status] ?? "neutral"} icon="checkmark" />
                  <Txt size="micro" tone="muted">
                    {doc.expiry.startsWith("Updated") ? doc.expiry : `Expiry: ${doc.expiry}`}
                  </Txt>
                </View>

                <Ionicons name="chevron-forward" size={16} color={colors.ink.faint} />
              </Pressable>
            ))
          )}
        </Card>

        {/*
          This box looked like an upload control and was one only in
          appearance: no handler, so tapping it did nothing. The endpoint has
          existed all along.
        */}
        <Panel title="Upload New Document" bodyClassName="px-4 pb-4">
          <Txt size="tiny" tone="muted" className="mb-2">
            Choose what you are uploading, then pick the file.
          </Txt>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {UPLOADABLE.map((doc) => (
              <Pressable
                key={doc.type}
                onPress={() => setKind(doc.type)}
                className={`rounded-full border px-3 py-1.5 active:opacity-70 ${
                  kind === doc.type ? "border-green-600 bg-green-50" : "border-line"
                }`}
              >
                <Txt size="tiny" weight={kind === doc.type ? "bold" : "regular"}>
                  {doc.label}
                </Txt>
              </Pressable>
            ))}
          </View>
          <UploadBox
            title={busy ? "Uploading…" : "Tap to upload"}
            detail="PDF, JPG, PNG (Max size 5MB)"
            accent="green"
            dashed={false}
            action="Choose File"
            onPress={pickAndUpload}
          />
        </Panel>

        <NoteBar
          tone="blue"
          icon="information-circle"
          title="Why do we need these documents?"
          detail="These documents are required to verify your identity and ensure a safe experience for our customers."
        />
      </View>
    </Screen>
  );
}
