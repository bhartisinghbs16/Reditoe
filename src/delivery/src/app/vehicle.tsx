import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  DetailRow,
  Divider,
  NoteBar,
  Panel,
  Screen,
  Badge,
  Txt,
} from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { docTone } from "@/lib/theme";
import { useStore } from "@/lib/store";

/**
 * The rider's vehicle: what it is, and the papers that belong to it.
 *
 * Its own screen. Vehicle Details on the profile menu opened the Documents
 * page - every document the rider holds, including the ones that have nothing
 * to do with the vehicle - so there was nowhere to see the bike itself. The
 * vehicle's own papers are summarised here and the full list is one tap away.
 */

/** The documents that belong to the vehicle rather than to the person. */
const VEHICLE_DOCS = ["rc", "insurance", "vehicle", "permit", "pollution"];

export default function Vehicle() {
  const router = useRouter();
  const { rider, documents } = useStore();
  const { vehicle } = rider;

  const has = Boolean(
    vehicle.type?.trim() || vehicle.model?.trim() || vehicle.number?.trim()
  );

  const vehicleDocs = documents.filter((doc) =>
    VEHICLE_DOCS.some((key) => doc.id.toLowerCase().includes(key) ||
      doc.title.toLowerCase().includes(key))
  );

  return (
    <Screen>
      <ScreenHeader title="Vehicle Details" trailing="none" />

      <View className="gap-3.5 px-4 pt-3.5">
        <Panel title="Vehicle Information">
          {has ? (
            <View className="pb-2">
              <DetailRow
                icon="bicycle-outline"
                tint="green"
                label="Vehicle Type"
                value={vehicle.type?.trim() || "Not provided"}
              />
              <Divider className="ml-16" />
              <DetailRow
                icon="car-sport-outline"
                tint="green"
                label="Model"
                value={vehicle.model?.trim() || "Not provided"}
              />
              <Divider className="ml-16" />
              <DetailRow
                icon="pricetag-outline"
                tint="green"
                label="Number Plate"
                value={vehicle.number?.trim() || "Not provided"}
              />
              <Divider className="ml-16" />
              <DetailRow
                icon="shield-checkmark-outline"
                tint="green"
                label="Insurance Valid Till"
                value={vehicle.insurance?.trim() || "Not provided"}
              />
            </View>
          ) : (
            <View className="pb-3">
              <Txt size="sm" tone="muted">
                No vehicle is recorded on your account yet. Contact support to
                have it added.
              </Txt>
            </View>
          )}
        </Panel>

        {/* Only the vehicle's own papers; the rest live under Documents. */}
        <Panel
          title="Vehicle Documents"
          action="View all"
          onAction={() => router.push("/documents")}
        >
          {vehicleDocs.length === 0 ? (
            <View className="pb-3">
              <Txt size="sm" tone="muted">
                No vehicle documents have been uploaded yet.
              </Txt>
            </View>
          ) : (
            <View className="pb-2">
              {vehicleDocs.map((doc, index) => (
                <View key={doc.id}>
                  {index > 0 && <Divider className="ml-16" />}
                  <DetailRow
                    icon="document-text-outline"
                    tint="blue"
                    label={doc.title}
                    value={doc.number?.trim() || doc.purpose}
                    valueNode={
                      <Badge
                        label={doc.status}
                        tone={docTone[doc.status] ?? "neutral"}
                        icon="checkmark"
                      />
                    }
                  />
                </View>
              ))}
            </View>
          )}
        </Panel>

        <NoteBar
          tone="green"
          icon="shield-checkmark"
          title="Keep your papers current."
          detail="An expired insurance or RC stops new orders being offered to you until it is renewed."
        />
      </View>
    </Screen>
  );
}
