import React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Card, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { Photo } from "@/components/photo";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * Everything the platform holds about this restaurant.
 *
 * The More menu offered "Restaurant Information", "Working Hours" and
 * "Documents" as three rows that led nowhere. They are one screen: a vendor
 * checking their own record wants to see all of it at once, and splitting it
 * across three taps would be three screens each too thin to be worth opening.
 *
 * Read-only for now, deliberately. Changing the name or address of an
 * approved restaurant is an application to change it, not a text edit, and
 * pretending otherwise would let a vendor quietly become a different business
 * than the one that was approved.
 */

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View className="flex-row items-start justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <Txt size="tiny" tone="muted">
        {label}
      </Txt>
      <Txt size="sm" weight="semibold" className="max-w-[62%] text-right">
        {value || "—"}
      </Txt>
    </View>
  );
}

interface VendorDocument {
  documentType?: string;
  status?: string;
  fileName?: string;
  uploadedAt?: string;
}

export default function RestaurantInfoScreen() {
  const { vendor } = useStore();

  const [documents, setDocuments] = React.useState<VendorDocument[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<any>("/vendor/documents")
      .then((res) => {
        if (cancelled) return;
        const rows = res?.documents ?? res?.data?.documents ?? [];
        setDocuments(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        // A vendor who has uploaded nothing gets an empty list, not an error.
        if (!cancelled) setDocuments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScreenHeader title="Restaurant Information" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        <View className="px-4 pt-3">
          <Card className="items-center p-4">
            <Photo uri={vendor.image ?? ""} width={72} height={72} radius={36} />
            <Txt size="lg" weight="bold" className="mt-2">
              {vendor.name}
            </Txt>
            <Txt size="tiny" tone="muted">
              Outlet ID {vendor.outletId}
            </Txt>
            <View
              className={`mt-2 rounded-pill px-3 py-1 ${
                vendor.verified ? "bg-ok-soft" : "bg-warn-soft"
              }`}
            >
              <Txt size="micro" weight="bold" tone={vendor.verified ? "ok" : "warn"}>
                {vendor.verified ? "Approved" : "Approval pending"}
              </Txt>
            </View>
          </Card>
        </View>

        <View className="px-4 pt-3">
          <Card className="p-4">
            <Txt weight="bold" className="mb-1">
              Details
            </Txt>
            <Row label="Restaurant" value={vendor.name} />
            <Row label="Email" value={vendor.email} />
            <Row label="Address" value={vendor.address} />
            <Row label="Cuisines" value={vendor.cuisines} />
            <Row label="Rating" value={vendor.rating ? `${vendor.rating} / 5` : "Not rated yet"} />
          </Card>
        </View>

        <View className="px-4 pt-3">
          <Card className="p-4">
            <Txt weight="bold" className="mb-1">
              Working hours
            </Txt>
            <Row label="Opening hours" value={vendor.hours} />
            <Row
              label="Currently"
              value={vendor.isOpen ? "Open — taking orders" : "Closed"}
            />
            <Txt size="tiny" tone="muted" className="mt-2">
              Use the switch on the home screen to open or close the kitchen.
            </Txt>
          </Card>
        </View>

        <View className="px-4 pt-3">
          <Card className="p-4">
            <Txt weight="bold" className="mb-1">
              Delivery area
            </Txt>
            <Row
              label="Delivery radius"
              value={vendor.deliveryRadiusKm ? `${vendor.deliveryRadiusKm} km` : "Not set"}
            />
            <Row
              label="Restaurant location"
              value={
                vendor.latitude && vendor.longitude
                  ? `${vendor.latitude.toFixed(5)}, ${vendor.longitude.toFixed(5)}`
                  : "Not set — customers cannot order"
              }
            />
          </Card>
        </View>

        <View className="px-4 pt-3">
          <Card className="p-4">
            <Txt weight="bold" className="mb-2">
              Documents
            </Txt>

            {loading ? (
              <View className="items-center py-4">
                <ActivityIndicator size="small" color={colors.ok.default} />
              </View>
            ) : documents && documents.length > 0 ? (
              documents.map((doc, index) => (
                <View
                  key={`${doc.documentType}-${index}`}
                  className="flex-row items-center gap-2.5 border-b border-line py-2.5 last:border-0"
                >
                  <Ionicons name="document-text-outline" size={17} color={colors.ink.muted} />
                  <View className="min-w-0 flex-1">
                    <Txt size="sm" weight="semibold" numberOfLines={1}>
                      {doc.documentType ?? "Document"}
                    </Txt>
                    {!!doc.fileName && (
                      <Txt size="micro" tone="muted" numberOfLines={1}>
                        {doc.fileName}
                      </Txt>
                    )}
                  </View>
                  <Txt
                    size="micro"
                    weight="bold"
                    tone={doc.status === "approved" ? "ok" : "warn"}
                  >
                    {doc.status ?? "pending"}
                  </Txt>
                </View>
              ))
            ) : (
              <Txt size="tiny" tone="muted">
                No documents uploaded yet.
              </Txt>
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
