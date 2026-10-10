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
import { Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { api, type OrderChat } from "@/lib/api";

/**
 * Messaging the customer about this delivery.
 *
 * A rider could only call, which is no use at a gate with the engine running
 * or when the customer cannot take a call. The same conversation the customer
 * sees, from this side.
 *
 * Polled rather than held on a socket: this is two people arranging a
 * handover over a few minutes, and a message that lands a few seconds late
 * costs nothing next to a connection kept open for every order in the city.
 */

const POLL_MS = 6_000;

export default function OrderChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [chat, setChat] = React.useState<OrderChat | null>(null);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const scroller = React.useRef<ScrollView | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    try {
      setChat(await api.orderChat(id));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open this chat.");
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
    // Cleared first: leaving it in the box invites the same message twice
    // while the request is still going.
    setDraft("");
    try {
      setChat(await api.sendOrderChat(id, text));
    } catch (reason) {
      setDraft(text);
      setError(reason instanceof Error ? reason.message : "That did not send.");
    } finally {
      setSending(false);
    }
  };

  const closed = chat ? !chat.open : false;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface-sunken">
      <ScreenHeader
        title="Customer"
        trailing="none"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        className="flex-1"
      >
        {!chat ? (
          <ActivityIndicator className="mt-12" color={colors.brand[600]} />
        ) : (
          <ScrollView
            ref={scroller}
            contentContainerClassName="px-4 py-4 gap-2"
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
          >
            {chat.messages.length === 0 && (
              <View className="mt-8 items-center px-6">
                <Ionicons name="chatbubbles-outline" size={30} color={colors.ink.faint} />
                <Txt weight="bold" className="mt-2">
                  Say hello
                </Txt>
                <Txt size="tiny" tone="muted" className="mt-0.5 text-center">
                  Let them know you are close, or ask for directions.
                </Txt>
              </View>
            )}

            {chat.messages.map((entry, index) => (
              <View
                key={`${entry.sentAt ?? index}-${index}`}
                className={`max-w-[82%] rounded-card px-3 py-2.5 ${
                  entry.mine
                    ? "self-end bg-brand-600"
                    : "self-start border border-line bg-surface"
                }`}
              >
                <Txt size="sm" tone={entry.mine ? "white" : "default"}>
                  {entry.message}
                </Txt>
              </View>
            ))}
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
              This order is finished, so the chat is closed.
            </Txt>
          </View>
        ) : (
          <View className="flex-row items-end gap-2 border-t border-line bg-surface px-3 py-2.5">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the customer…"
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
