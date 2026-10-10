import React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Txt, colors } from "@/components/ui";
import { TextField } from "@/components/form";
import { API_BASE, NGROK_HEADERS } from "@/lib/api";

/**
 * A contact detail the vendor has to prove they hold.
 *
 * Asks the server for a code and takes it back. The proof it reports upward
 * comes from the server, and registration refuses the contact without one -
 * so a tick drawn in the app on its own gets nowhere.
 */
async function call(path: string, body: unknown) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...NGROK_HEADERS,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message ?? `Request failed (${response.status})`);
  return payload;
}

export function VerifiedField({
  channel,
  label,
  placeholder,
  icon,
  value,
  onChangeText,
  keyboardType,
  proof,
  onVerified,
  className = "",
}: {
  channel: "email" | "phone";
  label: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (next: string) => void;
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad";
  proof: string | null;
  onVerified: (proof: string | null) => void;
  className?: string;
}) {
  const [sending, setSending] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [note, setNote] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  /* Changing the address undoes the tick, so it cannot be carried across. */
  const lastVerified = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (proof && lastVerified.current && lastVerified.current !== value) {
      onVerified(null);
      setSent(false);
      setCode("");
      setNote(null);
    }
  }, [value, proof, onVerified]);

  const send = async () => {
    setSending(true);
    setNote(null);
    setFailed(false);
    try {
      await call("/signup-verification/send", { channel, value, role: "vendor" });
      setSent(true);
      setNote(`Code sent to your ${channel === "email" ? "email" : "mobile"}.`);
    } catch (error: any) {
      setFailed(true);
      setNote(error?.message ?? "Could not send the code.");
    } finally {
      setSending(false);
    }
  };

  const confirm = async () => {
    setChecking(true);
    setNote(null);
    setFailed(false);
    try {
      const response: any = await call("/signup-verification/confirm", { channel, value, code });
      const issued = response?.data?.proof ?? response?.proof;
      if (!issued) throw new Error("The server did not confirm that code.");
      lastVerified.current = value;
      onVerified(issued);
      setNote(null);
    } catch (error: any) {
      setFailed(true);
      setNote(error?.message ?? "That code was not accepted.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <View className={className}>
      <TextField
        label={label}
        placeholder={placeholder}
        icon={icon}
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChangeText}
      />

      {proof ? (
        <View className="mt-1 flex-row items-center gap-1.5">
          <Ionicons name="checkmark-circle" size={15} color={colors.ok.default} />
          <Txt size="micro" weight="bold" className="text-emerald-600">
            Verified
          </Txt>
        </View>
      ) : (
        <>
          {sent && (
            <View className="mt-2 flex-row items-end gap-2">
              <View className="flex-1">
                <TextField
                  label="Enter the code"
                  placeholder="6 digits"
                  icon="keypad-outline"
                  keyboardType="numeric"
                  value={code}
                  onChangeText={(next) => setCode(next.replace(/\D/g, "").slice(0, 6))}
                />
              </View>
              <Pressable
                onPress={confirm}
                disabled={code.length !== 6 || checking}
                className={`mb-1 h-11 w-12 items-center justify-center rounded-xl ${
                  code.length === 6 && !checking ? "bg-emerald-600" : "bg-slate-200"
                }`}
              >
                {checking ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Ionicons name="checkmark" size={18} color="#ffffff" />
                )}
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={send}
            disabled={sending || value.trim().length < 5}
            className="mt-1 flex-row items-center gap-1.5 active:opacity-70"
          >
            {sending ? (
              <ActivityIndicator size="small" />
            ) : (
              <Ionicons name="send-outline" size={13} color={colors.brand[600]} />
            )}
            <Txt size="micro" weight="bold" tone="brand">
              {sent ? "Send a new code" : `Verify this ${channel === "email" ? "email" : "number"}`}
            </Txt>
          </Pressable>
        </>
      )}

      {note && (
        <Txt size="micro" className={`mt-1 ${failed ? "text-red-600" : "text-slate-500"}`}>
          {note}
        </Txt>
      )}
    </View>
  );
}
