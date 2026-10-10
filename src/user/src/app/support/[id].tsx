import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { api, type SupportTicket } from "@/lib/api";

/**
 * One support conversation.
 *
 * Laid out as a chat because that is what it is: what the customer wrote,
 * what support wrote back, oldest first. New replies arrive on a poll while
 * this screen is open - support answers from the console, not from a socket,
 * and a reply that lands a minute late is not worth holding a connection for.
 */

const POLL_MS = 15_000;

const STATUS_TONE = {
  open: { label: "Open", tone: "warn" as const },
  "in-progress": { label: "Being looked at", tone: "info" as const },
  resolved: { label: "Resolved", tone: "ok" as const },
  closed: { label: "Closed", tone: "neutral" as const },
};

export default function SupportThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [ticket, setTicket] = React.useState<SupportTicket | null>(null);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scroller = React.useRef<ScrollView | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    try {
      setTicket(await api.supportTicket(id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this request.");
    }
  }, [id]);

  React.useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !id) return;
    setSending(true);
    setError(null);
    // Cleared straight away: leaving the sent text in the box invites the
    // same message being sent twice while the request is in flight.
    setDraft("");
    try {
      setTicket(await api.replyToSupportTicket(id, text));
    } catch (reason) {
      setDraft(text);
      setError(reason instanceof Error ? reason.message : "That did not send.");
    } finally {
      setSending(false);
    }
  };

  const thread = ticket?.conversation?.length
    ? ticket.conversation
    : ticket
      ? [{ message: ticket.message, sender: "user" as const, timestamp: ticket.createdAt }]
      : [];

  const badge = ticket ? (STATUS_TONE[ticket.status] ?? STATUS_TONE.open) : null;
  const closed = ticket?.status === "closed";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScreenHeader
        title={ticket?.subject ?? "Support"}
        onBack={() => router.back()}
        right={badge ? <Badge tone={badge.tone} label={badge.label} /> : undefined}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        className="flex-1"
      >
        {!ticket ? (
          <ActivityIndicator className="mt-12" color={colors.brand[600]} />
        ) : (
          <ScrollView
            ref={scroller}
            contentContainerClassName="px-4 py-4 gap-2"
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
          >
            {thread.map((entry, index) => {
              const mine = entry.sender === "user";
              return (
                <View
                  key={`${entry.timestamp ?? index}-${index}`}
                  className={`max-w-[82%] rounded-card px-3 py-2.5 ${
                    mine ? "self-end bg-brand-600" : "self-start bg-surface border border-line"
                  }`}
                >
                  {!mine && (
                    <Txt size="micro" weight="bold" tone="brand" className="mb-0.5">
                      Reditoe Support
                    </Txt>
                  )}
                  <Txt size="sm" tone={mine ? "white" : "default"}>
                    {entry.message}
                  </Txt>
                </View>
              );
            })}

            {thread.length === 1 && (
              <Txt size="tiny" tone="muted" className="mt-2 self-center text-center">
                Sent. Our team will reply here.
              </Txt>
            )}
          </ScrollView>
        )}

        {error && (
          <View className="mx-4 mb-2 flex-row items-start gap-2 rounded-tile bg-bad-soft px-3 py-2.5">
            <Ionicons name="alert-circle" size={15} color={colors.bad.default} />
            <Txt size="tiny" className="flex-1 text-bad-ink">
              {error}
            </Txt>
          </View>
        )}

        {closed ? (
          <View className="border-t border-line bg-surface px-4 py-3">
            <Txt size="tiny" tone="muted" className="text-center">
              This request is closed. Raise a new one if you still need help.
            </Txt>
          </View>
        ) : (
          <View className="flex-row items-end gap-2 border-t border-line bg-surface px-3 py-2.5">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type your message…"
              placeholderTextColor={colors.ink.faint}
              multiline
              className="max-h-28 min-h-11 flex-1 rounded-card border border-line px-3 py-2.5 text-ink"
            />
            <Pressable
              onPress={send}
              disabled={!draft.trim() || sending}
              className={`h-11 w-11 items-center justify-center rounded-full ${
                draft.trim() && !sending ? "bg-brand-600" : "bg-line"
              }`}
            >
              <Ionicons name="send" size={17} color="#fff" />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
