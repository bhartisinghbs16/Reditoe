import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Txt, colors } from "@/components/ui";
import { api } from "@/lib/api";

type Target = "user" | "vendor" | "delivery_partner";
const targets: Array<{ key: Target; label: string; icon: keyof typeof Ionicons.glyphMap; detail: string }> = [
  { key: "user", label: "User", icon: "person-outline", detail: "Reditoe customer app" },
  { key: "vendor", label: "Vendor", icon: "storefront-outline", detail: "Reditoe Vendor app" },
  { key: "delivery_partner", label: "Delivery", icon: "bicycle-outline", detail: "Delivery Partner app" },
];

type Invite = { code: string; targetType: string; rewardAmount: number; link: string; status: string };

export default function ReferralsScreen() {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Target>("user");
  const [data, setData] = React.useState<any>(null);
  const [invites, setInvites] = React.useState<Partial<Record<Target, Invite>>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const result = await api.referralStatus();
      setData(result);
      const latest: Partial<Record<Target, Invite>> = {};
      for (const row of result.invites ?? []) {
        if (!latest[row.targetType as Target]) latest[row.targetType as Target] = {
          code: row.code, targetType: row.targetType, rewardAmount: row.rewardAmount,
          link: row.link || "", status: row.status,
        };
      }
      setInvites((current) => ({ ...latest, ...current }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load referral status";
      setError(message);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const ensureInvite = React.useCallback(async (target: Target) => {
    if (invites[target]?.code && invites[target]?.link) return invites[target] as Invite;
    setBusy(true);
    setError(null);
    try {
      const invite = await api.createReferralInvite(target);
      setInvites((current) => ({ ...current, [target]: invite }));
      return invite;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Referral service is unavailable";
      setError(message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [invites]);

  // The selected target creates its link automatically. The user only needs
  // to press Share after choosing the target.
  React.useEffect(() => {
    void ensureInvite(selected);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  async function shareSelected() {
    const invite = await ensureInvite(selected);
    if (!invite) return;
    try {
      await Share.share({
        title: `Refer Reditoe ${targets.find(t => t.key === selected)?.label ?? "User"}`,
        message: `Join Reditoe as a ${targets.find(t => t.key === selected)?.label ?? "User"}. Use my referral code ${invite.code}. Reward: ₹${invite.rewardAmount}.\n\n${invite.link}`,
      });
    } catch (e) {
      Alert.alert("Share failed", e instanceof Error ? e.message : "Please try again.");
    }
  }

  const current = invites[selected];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <View className="flex-row items-center border-b border-line px-4 py-3">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-surface-sunken">
          <Ionicons name="arrow-back" size={22} color={colors.ink[900]} />
        </Pressable>
        <View>
          <Txt size="xl" weight="bold">Refer &amp; Earn</Txt>
          <Txt size="tiny" tone="muted">Choose who you want to refer</Txt>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="flex-row justify-between gap-2">
          {targets.map((item) => {
            const active = selected === item.key;
            const amount = data?.amounts?.[item.key] ?? invites[item.key]?.rewardAmount ?? 0;
            return (
              <Pressable key={item.key} onPress={() => setSelected(item.key)} className={`flex-1 items-center rounded-2xl border px-2 py-4 ${active ? "border-brand-600 bg-brand-50" : "border-line bg-surface"}`}>
                <View className={`h-14 w-14 items-center justify-center rounded-full border-2 ${active ? "border-brand-600" : "border-line"}`}>
                  <View className={`h-8 w-8 items-center justify-center rounded-full ${active ? "bg-brand-600" : "bg-transparent"}`}>
                    <Ionicons name={item.icon} size={19} color={active ? "#fff" : colors.ink.soft} />
                  </View>
                </View>
                <Txt size="tiny" weight="bold" className="mt-2 text-center">{item.label}</Txt>
                <Txt size="micro" tone="muted" className="mt-0.5 text-center">₹{amount}</Txt>
              </Pressable>
            );
          })}
        </View>

        <Card className="mt-5 p-4">
          <Txt size="tiny" tone="muted">Your referral link</Txt>
          {busy ? (
            <View className="mt-3 flex-row items-center gap-2"><ActivityIndicator /><Txt size="sm" tone="muted">Generating referral link…</Txt></View>
          ) : current?.link ? (
            <Txt size="sm" weight="semibold" className="mt-2" selectable>{current.link}</Txt>
          ) : (
            <Txt size="sm" tone="muted" className="mt-2">Select an option to generate your link.</Txt>
          )}
          {error ? <Txt size="tiny" className="mt-2 text-red-600">{error}</Txt> : null}
          <Pressable onPress={shareSelected} disabled={busy || !current?.link} className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4 active:opacity-80 disabled:opacity-50">
            <Ionicons name="share-social-outline" size={19} color="#fff" />
            <Txt weight="bold" tone="white">Share via WhatsApp / More</Txt>
          </Pressable>
        </Card>

        <Card className="mt-6 p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Txt size="lg" weight="bold">Referral Status</Txt>
            <Txt size="tiny" tone="muted">{data?.totals?.total ?? 0} total</Txt>
          </View>
          {(data?.invites ?? []).length === 0 ? (
            <Txt size="sm" tone="muted">No referrals yet. Select an option above to generate a referral link.</Txt>
          ) : (data.invites as any[]).map((row) => (
            <View key={row._id} className="flex-row items-center border-t border-line py-3">
              <View className="flex-1">
                <Txt weight="bold">{row.targetType === "delivery_partner" ? "Delivery Partner" : row.targetType[0].toUpperCase() + row.targetType.slice(1)}</Txt>
                <Txt size="tiny" tone="muted">{row.code} · ₹{row.rewardAmount}</Txt>
              </View>
              <View className="rounded-full bg-surface-sunken px-3 py-1">
                <Txt size="micro" weight="bold">{String(row.status).replace(/_/g, " ")}</Txt>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
