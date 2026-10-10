import React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Field, Txt, colors } from "@/components/ui";
import { request } from "@/lib/api";

/**
 * A contact detail the partner has to prove they hold.
 *
 * Asks the server for a code, takes it back, and reports the proof upward.
 * Nothing here decides that a contact is verified: the proof comes from the
 * server and registration will not accept the contact without it, so an app
 * that simply set a tick would get nowhere.
 *
 * The same shape serves email and mobile, which is what both partner apps
 * were asked for.
 */
export function VerifiedField({
  channel,
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  prefix,
  role,
  counterpart,
  proof,
  onVerified,
}: {
  channel: "email" | "phone";
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (next: string) => void;
  keyboardType?: "default" | "number-pad" | "email-address" | "phone-pad";
  prefix?: string;
  role: string;
  /**
   * The other contact detail being registered on the same form.
   *
   * Sent with the code so the two verification records a signup leaves behind
   * can be recognised as one person; without it an abandoned signup shows up
   * in the console twice.
   */
  counterpart?: string;
  /** Set once the server has confirmed this contact; clears if it changes. */
  proof: string | null;
  onVerified: (proof: string | null) => void;
}) {
  const [sending, setSending] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [note, setNote] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  /*
   * Changing the address undoes the verification.
   *
   * Otherwise a partner could verify one number, change it to another, and
   * carry the tick across to a number nobody proved they hold.
   */
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
      await request("/signup-verification/send", {
        method: "POST",
        anonymous: true,
        // The other detail on the same form: it lets the console recognise a
        // half-finished signup as one person rather than two.
        body: { channel, value, role, counterpart },
      });
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
      const response: any = await request("/signup-verification/confirm", {
        method: "POST",
        anonymous: true,
        body: { channel, value, code },
      });
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

  const verified = Boolean(proof);

  return (
    <View>
      <Field
        label={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        prefix={prefix}
      />

      {verified ? (
        <View className="mt-1 flex-row items-center gap-1.5">
          <Ionicons name="checkmark-circle" size={15} color={colors.green[600]} />
          <Txt size="tiny" weight="semibold" className="text-green-600">
            Verified
          </Txt>
        </View>
      ) : (
        <>
          {sent && (
            <View className="mt-2 flex-row items-end gap-2">
              <View className="flex-1">
                <Field
                  label="Enter the code"
                  placeholder="6 digits"
                  value={code}
                  onChangeText={(next) => setCode(next.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                />
              </View>
              <Pressable
                onPress={confirm}
                disabled={code.length !== 6 || checking}
                className={`mb-1 h-11 w-12 items-center justify-center rounded-xl ${
                  code.length === 6 && !checking ? "bg-green-600" : "bg-slate-200"
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
            <Txt size="tiny" weight="semibold" tone="brand">
              {sent ? "Send a new code" : `Verify this ${channel === "email" ? "email" : "number"}`}
            </Txt>
          </Pressable>
        </>
      )}

      {note && (
        <Txt size="tiny" className={`mt-1 ${failed ? "text-red-600" : "text-slate-500"}`}>
          {note}
        </Txt>
      )}
    </View>
  );
}
