import React from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Card, Divider, IconPlate, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { api } from "@/lib/api";

/**
 * The restaurant's paperwork, and nothing else.
 *
 * Documents on the More menu opened Restaurant Information, which is why the
 * two were tangled together: restaurant details showed up under Documents and
 * there was no screen that listed only the documents.
 *
 * Everything filed against the restaurant appears here, whether the vendor
 * uploaded it or Reditoe did on their behalf - the app used to list only the
 * vendor's own uploads and said "No documents uploaded" about the rest.
 */
interface VendorDocument {
  id: string;
  type: string;
  title: string;
  url?: string;
  number?: string | null;
  expiryDate?: string | null;
  status?: string;
  verifiedBy?: string | null;
  required?: boolean;
  source?: string;
}

const TONE: Record<string, "ok" | "brand" | "neutral"> = {
  verified: "ok",
  approved: "ok",
  rejected: "brand",
  pending: "neutral",
};

const shortDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

export default function Documents() {
  const [documents, setDocuments] = React.useState<VendorDocument[] | null>(null);
  const [missing, setMissing] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<any>("/vendor/documents")
      .then((res) => {
        if (cancelled) return;
        const body = res?.data ?? res;
        setDocuments(body?.documents ?? []);
        setMissing(
          (body?.required ?? [])
            .filter((entry: any) => !entry.uploaded)
            .map((entry: any) => entry.label)
        );
      })
      .catch((reason) => {
        if (!cancelled) setError(reason?.message ?? "Could not load your documents.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Documents" />
      <ScrollView contentContainerClassName="pb-10">
        {missing.length > 0 && (
          <View className="mx-4 mt-3 flex-row gap-2.5 rounded-card bg-brand-50 p-3">
            <Ionicons name="alert-circle" size={18} color={colors.brand[600]} />
            <View className="min-w-0 flex-1">
              <Txt size="sm" weight="bold">
                Still needed
              </Txt>
              <Txt size="tiny" tone="muted" className="mt-0.5">
                {missing.join(", ")}. Contact Reditoe support to have these
                added to your account.
              </Txt>
            </View>
          </View>
        )}

        {error && (
          <Txt size="sm" className="mx-4 mt-4 text-red-600">
            {error}
          </Txt>
        )}

        {documents === null && !error && (
          <Txt size="sm" tone="muted" className="mx-4 mt-4">
            Loading your documents…
          </Txt>
        )}

        {documents?.length === 0 && (
          <View className="items-center px-6 pt-16">
            <Ionicons name="document-outline" size={28} color={colors.ink.faint} />
            <Txt weight="semibold" className="mt-2">
              No documents yet
            </Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5 text-center">
              Documents you or Reditoe upload will be listed here.
            </Txt>
          </View>
        )}

        {documents && documents.length > 0 && (
          <Card className="mx-4 mt-3 overflow-hidden">
            {documents.map((doc, index) => (
              <View key={doc.id}>
                {index > 0 && <Divider className="ml-16" />}
                <View className="flex-row items-center gap-3 px-3 py-3">
                  <IconPlate icon="document-text-outline" tint="red" />
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <Txt weight="semibold" numberOfLines={1} className="min-w-0 flex-shrink">
                        {doc.title}
                      </Txt>
                      {doc.status && (
                        <Badge
                          label={doc.status}
                          tone={TONE[doc.status] ?? "neutral"}
                        />
                      )}
                    </View>
                    <Txt size="tiny" tone="muted" numberOfLines={1}>
                      {[
                        doc.number ? `No. ${doc.number}` : null,
                        shortDate(doc.expiryDate)
                          ? `Expires ${shortDate(doc.expiryDate)}`
                          : null,
                        doc.verifiedBy ? `Verified by ${doc.verifiedBy}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No details recorded"}
                    </Txt>
                  </View>
                  {doc.url ? (
                    <Pressable
                      onPress={() => Linking.openURL(doc.url!)}
                      hitSlop={8}
                      className="active:opacity-70"
                    >
                      <Ionicons name="eye-outline" size={18} color={colors.brand[600]} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
