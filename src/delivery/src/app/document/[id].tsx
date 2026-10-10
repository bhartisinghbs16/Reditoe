import React from "react";
import { Alert, Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Badge,
  Button,
  DetailRow,
  Divider,
  EmptyState,
  IconPlate,
  NoteBar,
  Panel,
  Screen,
  Txt,
  colors,
} from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { PartnerCard } from "@/components/partner-card";
import { docTone, type TintName } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

/**
 * A single document, reproduced from the reference's Aadhaar Card screen: the
 * attribute list, the paged image with its download / replace / delete row,
 * and the verification note.
 *
 * The image plate stands in for the scan itself — the app holds no document
 * imagery, and a labelled plate reads as deliberate where a grey box would
 * read as broken.
 */

function DocumentPlate({
  title,
  number,
  icon,
  tint,
}: {
  title: string;
  number: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: TintName;
}) {
  return (
    <View className="h-[186px] items-center justify-center rounded-tile border border-line bg-surface-sunken">
      <IconPlate icon={icon} tint={tint} size={56} shape="circle" />
      <Txt weight="bold" className="mt-3">
        {title}
      </Txt>
      <Txt size="sm" tone="muted" className="mt-0.5">
        {number}
      </Txt>
      <Txt size="micro" tone="faint" className="mt-2">
        Uploaded scan — shown to you only
      </Txt>
    </View>
  );
}

export default function DocumentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { rider, documents, refresh } = useStore();
  const [page, setPage] = React.useState(0);
  const pages = 2;

  const doc = documents.find((d) => d.id === id);
  const [removing, setRemoving] = React.useState(false);

  const remove = () => {
    Alert.alert(
      "Delete this document?",
      "You will need to upload it again before you can be verified.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setRemoving(true);
            try {
              await api.deleteDocument(String(id));
              await refresh();
              router.back();
            } catch (error) {
              Alert.alert(
                "Couldn't delete",
                error instanceof Error ? error.message : "Please try again."
              );
            } finally {
              setRemoving(false);
            }
          },
        },
      ]
    );
  };

  if (!doc) {
    return (
      <Screen>
        <ScreenHeader title="Document" trailing="none" />
        <EmptyState
          icon="document-outline"
          title="Document not found"
          detail="It may have been replaced. Open Documents to see what is on file."
        />
      </Screen>
    );
  }

  const rows = [
    { icon: "person-outline" as const, label: "Document Type", value: doc.title },
    { icon: "id-card-outline" as const, label: "Purpose", value: doc.purpose },
    {
      icon: "checkmark-circle-outline" as const,
      label: "Status",
      node: <Badge label={doc.status} tone={docTone[doc.status] ?? "neutral"} icon="checkmark" />,
    },
    { icon: "shield-checkmark-outline" as const, label: "Verification Date", value: doc.verifiedOn },
    { icon: "calendar-outline" as const, label: "Expiry Date", value: doc.expiry },
    { icon: "keypad-outline" as const, label: "Document Number", value: doc.number },
    { icon: "call-outline" as const, label: "Linked Mobile", value: rider.personal.phone },
  ];

  return (
    <Screen>
      <ScreenHeader title={doc.title} trailing="more" />

      <View className="gap-3.5 px-4 pt-3.5">
        <PartnerCard />

        <Panel bodyClassName="pb-2">
          {rows.map((row, index) => (
            <View key={row.label}>
              {index > 0 && <Divider className="ml-14" />}
              <DetailRow
                icon={row.icon}
                tint="green"
                label={row.label}
                value={row.value}
                valueNode={row.node}
              />
            </View>
          ))}
        </Panel>

        <Panel
          title="Document Image"
          right={
            <Txt size="tiny" tone="muted">
              {page + 1} of {pages}
            </Txt>
          }
          bodyClassName="px-4 pb-4"
        >
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={`h-8 w-8 items-center justify-center rounded-full border border-line bg-surface ${
                page === 0 ? "opacity-40" : "active:opacity-70"
              }`}
              accessibilityLabel="Previous page"
            >
              <Ionicons name="chevron-back" size={16} color={colors.ink.soft} />
            </Pressable>

            <View className="min-w-0 flex-1">
              <DocumentPlate
                title={`${doc.title} — ${page === 0 ? "Front" : "Back"}`}
                number={doc.number}
                icon={doc.icon as keyof typeof Ionicons.glyphMap}
                tint={doc.tint as TintName}
              />
            </View>

            <Pressable
              onPress={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page === pages - 1}
              className={`h-8 w-8 items-center justify-center rounded-full border border-line bg-surface ${
                page === pages - 1 ? "opacity-40" : "active:opacity-70"
              }`}
              accessibilityLabel="Next page"
            >
              <Ionicons name="chevron-forward" size={16} color={colors.ink.soft} />
            </Pressable>
          </View>

          <View className="mt-3 flex-row justify-center gap-1.5">
            {Array.from({ length: pages }).map((_, index) => (
              <View
                key={index}
                style={{
                  backgroundColor: index === page ? colors.green[600] : colors.line.strong,
                  width: index === page ? 16 : 8,
                }}
                className="h-1.5 rounded-full"
              />
            ))}
          </View>

          {/*
            All three had no handler. "Download" is gone: the API does not hand
            the app a file to save. The other two now do what they say —
            replacing is an upload, and deleting asks first, because a partner
            who removes their licence stops being able to work.
          */}
          <View className="mt-3.5 flex-row gap-2">
            <Button
              label="Replace"
              variant="outline"
              accent="info"
              size="sm"
              icon="sync-outline"
              className="flex-1"
              onPress={() => router.push("/documents")}
            />
            <Button
              label={removing ? "Deleting…" : "Delete"}
              variant="outline"
              accent="brand"
              size="sm"
              icon="trash-outline"
              className="flex-1"
              disabled={removing}
              onPress={remove}
            />
          </View>
        </Panel>

        <NoteBar
          tone="green"
          icon="shield-checkmark"
          title="Your document is verified and secure."
          detail="Thank you for keeping your documents up to date."
          right={
            <View className="rounded-tile border border-green-500 px-3 py-2">
              <Txt size="tiny" weight="semibold" tone="green">
                Learn More
              </Txt>
            </View>
          }
        />
      </View>
    </Screen>
  );
}
