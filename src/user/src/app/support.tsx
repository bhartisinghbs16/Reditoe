import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Button, Card, Divider, EmptyState, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { api, ApiError, type SupportTicket } from "@/lib/api";

/**
 * Help & Support.
 *
 * The account menu had a "Help & Support" row with nothing behind it and the
 * screen it promised did not exist, so every route to support was a dead end.
 *
 * Conversations rather than a live chat socket: a support desk is not always
 * at a screen, and a message that waits is better than one lost because
 * nobody was online to catch it. Each conversation is answered from the admin
 * console, and the reply appears here.
 */

const STATUS_TONE = {
  open: { label: "Open", tone: "warn" as const },
  "in-progress": { label: "Being looked at", tone: "info" as const },
  resolved: { label: "Resolved", tone: "ok" as const },
  closed: { label: "Closed", tone: "neutral" as const },
};

const TOPICS = [
  { label: "Order issue", category: "order" },
  { label: "Payment or refund", category: "billing" },
  { label: "My account", category: "account" },
  { label: "Something else", category: "general" },
];

export default function SupportScreen() {
  const router = useRouter();

  const [tickets, setTickets] = React.useState<SupportTicket[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const [composing, setComposing] = React.useState(false);
  const [topic, setTopic] = React.useState(TOPICS[0]);
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setTickets(await api.supportTickets());
      setError(null);
    } catch (reason) {
      // Signed out is not a failure worth an error box; it is a reason to
      // sign in, and the empty state below says so.
      setError(
        reason instanceof ApiError && reason.status === 401
          ? "signed-out"
          : reason instanceof Error
            ? reason.message
            : "Could not load your requests."
      );
      setTickets([]);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    try {
      const ticket = await api.openSupportTicket({
        subject: subject.trim(),
        message: message.trim(),
        category: topic.category,
      });
      setComposing(false);
      setSubject("");
      setMessage("");
      await load();
      router.push(`/support/${ticket._id}` as never);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send that.");
    } finally {
      setSending(false);
    }
  };

  if (error === "signed-out") {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
        <ScreenHeader title="Help & Support" onBack={() => router.back()} />
        <EmptyState
          icon="headset-outline"
          title="Sign in to contact support"
          action="Sign in"
          onAction={() => router.push("/signin")}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Help & Support"
        subtitle="We usually reply the same day"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="px-4 pb-10 pt-2"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          {composing ? (
            <Card className="p-4">
              <Txt weight="bold" size="lg">
                What do you need help with?
              </Txt>

              <View className="mt-3 flex-row flex-wrap gap-2">
                {TOPICS.map((item) => {
                  const on = item.category === topic.category;
                  return (
                    <Pressable
                      key={item.category}
                      onPress={() => setTopic(item)}
                      className={`rounded-pill border px-3 py-2 ${
                        on ? "border-brand-600 bg-brand-50" : "border-line bg-surface"
                      }`}
                    >
                      <Txt size="tiny" weight="bold" tone={on ? "brand" : "muted"}>
                        {item.label}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>

              <Txt size="tiny" tone="muted" className="mt-4">
                Subject
              </Txt>
              <TextInput
                value={subject}
                onChangeText={setSubject}
                placeholder="Order RI-2609-150001 not delivered"
                placeholderTextColor={colors.ink.faint}
                className="mt-1 rounded-tile border border-line px-3 py-3 text-ink"
              />

              <Txt size="tiny" tone="muted" className="mt-3">
                Tell us what happened
              </Txt>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Describe the problem in a few lines…"
                placeholderTextColor={colors.ink.faint}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                className="mt-1 min-h-28 rounded-tile border border-line px-3 py-3 text-ink"
              />

              <View className="mt-4 flex-row gap-2">
                <Button
                  label="Cancel"
                  variant="outline"
                  className="flex-1"
                  onPress={() => setComposing(false)}
                />
                <Button
                  label={sending ? "Sending…" : "Send"}
                  loading={sending}
                  disabled={!subject.trim() || !message.trim() || sending}
                  className="flex-1"
                  onPress={send}
                />
              </View>
            </Card>
          ) : (
            <Button
              label="New request"
              icon="add"
              onPress={() => setComposing(true)}
            />
          )}

          {error && error !== "signed-out" && (
            <View className="mt-3 flex-row items-start gap-2 rounded-tile bg-bad-soft px-3 py-2.5">
              <Ionicons name="alert-circle" size={15} color={colors.bad.default} />
              <Txt size="tiny" className="flex-1 text-bad-ink">
                {error}
              </Txt>
            </View>
          )}

          {tickets === null ? (
            <ActivityIndicator className="mt-10" color={colors.brand[600]} />
          ) : tickets.length === 0 ? (
            <View className="mt-6">
              <EmptyState
                icon="chatbubbles-outline"
                title="No requests yet"
                detail="Raise one and our team will reply here."
              />
            </View>
          ) : (
            <Card className="mt-4 overflow-hidden">
              {tickets.map((ticket, index) => {
                const badge = STATUS_TONE[ticket.status] ?? STATUS_TONE.open;
                const last =
                  ticket.conversation?.[ticket.conversation.length - 1]?.message ??
                  ticket.message;
                return (
                  <View key={ticket._id}>
                    {index > 0 && <Divider />}
                    <Pressable
                      onPress={() => router.push(`/support/${ticket._id}` as never)}
                      className="flex-row items-center gap-3 px-3 py-3.5 active:opacity-70"
                    >
                      <View className="min-w-0 flex-1">
                        <Txt weight="bold" numberOfLines={1}>
                          {ticket.subject}
                        </Txt>
                        <Txt size="tiny" tone="muted" numberOfLines={1} className="mt-0.5">
                          {last}
                        </Txt>
                      </View>
                      <Badge tone={badge.tone} label={badge.label} />
                      <Ionicons name="chevron-forward" size={16} color={colors.ink.faint} />
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
