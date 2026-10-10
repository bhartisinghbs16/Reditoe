import React from "react";
import { Linking, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Button,
  DetailRow,
  Divider,
  Field,
  NoteBar,
  Panel,
  Screen,
  SelectField,
  Txt,
} from "@/components/ui";
import { api } from "@/lib/api";
import { ScreenHeader } from "@/components/screen-header";
import { useStore } from "@/lib/store";

/**
 * The one person Reditoe calls if something happens to the rider mid-shift.
 *
 * Its own screen. Emergency Contact on the profile menu pointed at Personal
 * Information, which showed the whole account with the emergency details as
 * one card among several - so the rider could not go straight to the thing
 * they came for, and there was no way to see it on its own.
 */
/** The same list the signup form offers, so the two agree. */
const RELATIONSHIPS = [
  "Father",
  "Mother",
  "Wife",
  "Brother",
  "Friend",
  "Relative",
  "Other",
] as const;

export default function EmergencyContact() {
  const { rider, refresh } = useStore();
  const { emergency } = rider;
  const has = Boolean(emergency.name?.trim() || emergency.phone?.trim());

  /*
   * The screen could only ever show this contact, never set one.
   *
   * A rider who had not given one - which is every rider who signed up before
   * the form asked - saw "no emergency contact is on file" and had no way to
   * put one there. Which is the one detail the whole screen exists for.
   */
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({
    name: emergency.name ?? "",
    phone: emergency.phone ?? "",
    relation: emergency.relation ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!form.name.trim()) return setError("Enter their name.");
    if (form.phone.replace(/[^0-9]/g, "").length < 10)
      return setError("Enter a ten-digit mobile number.");
    setSaving(true);
    try {
      await api.updateProfile({
        emergencyContactName: form.name.trim(),
        emergencyContactPhone: form.phone.replace(/[^0-9]/g, "").slice(-10),
        emergencyRelationship: form.relation.trim(),
      });
      await refresh();
      setEditing(false);
    } catch (reason: any) {
      setError(reason?.message ?? "Could not save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Emergency Contact" trailing="none" />

      <View className="gap-3.5 px-4 pt-3.5">
        <Panel title="Who we call">
          {has ? (
            <View className="pb-2">
              <DetailRow
                icon="person-outline"
                tint="orange"
                label="Contact Name"
                value={emergency.name?.trim() || "Not provided"}
              />
              <Divider className="ml-16" />
              <DetailRow
                icon="call-outline"
                tint="orange"
                label="Mobile Number"
                value={emergency.phone?.trim() || "Not provided"}
              />
              <Divider className="ml-16" />
              <DetailRow
                icon="people-outline"
                tint="orange"
                label="Relationship"
                value={emergency.relation?.trim() || "Not provided"}
              />
            </View>
          ) : (
            <View className="pb-3">
              <Txt size="sm" tone="muted">
                No emergency contact is on file. Add one so somebody can be
                reached if you need help during a delivery.
              </Txt>
            </View>
          )}

          {editing ? (
            <View className="gap-3 pb-3">
              <Field
                label="Name"
                placeholder="Who should we call"
                value={form.name}
                onChangeText={(next) => setForm((f) => ({ ...f, name: next }))}
              />
              <Field
                label="Mobile number"
                placeholder="9123456789"
                keyboardType="number-pad"
                value={form.phone}
                onChangeText={(next) => setForm((f) => ({ ...f, phone: next }))}
              />
              <SelectField
                label="Relationship"
                placeholder="Select relationship"
                value={form.relation}
                options={RELATIONSHIPS}
                onSelect={(next) => setForm((f) => ({ ...f, relation: next }))}
              />
              {error && (
                <NoteBar tone="red" icon="alert-circle" detail={error} />
              )}
              <View className="flex-row gap-2">
                <Button
                  label="Cancel"
                  variant="outline"
                  accent="brand"
                  className="flex-1"
                  onPress={() => {
                    setEditing(false);
                    setError(null);
                  }}
                />
                <Button
                  label={saving ? "Saving…" : "Save"}
                  accent="green"
                  className="flex-1"
                  loading={saving}
                  onPress={() => void save()}
                />
              </View>
            </View>
          ) : (
            <View className="pb-3">
              <Button
                label={has ? "Change contact" : "Add emergency contact"}
                variant="outline"
                accent="brand"
                icon={has ? "create-outline" : "add"}
                onPress={() => {
                  setForm({
                    name: emergency.name ?? "",
                    phone: emergency.phone ?? "",
                    relation: emergency.relation ?? "",
                  });
                  setEditing(true);
                }}
              />
            </View>
          )}
        </Panel>

        {/* Calling them is the whole point of holding the number. */}
        {emergency.phone?.trim() ? (
          <Pressable
            onPress={() => Linking.openURL(`tel:${emergency.phone}`)}
            className="flex-row items-center justify-center gap-2 rounded-2xl bg-green-600 py-3.5 active:opacity-90"
          >
            <Ionicons name="call" size={16} color="#ffffff" />
            <Txt weight="bold" className="text-white">
              Call {emergency.name?.trim() || "emergency contact"}
            </Txt>
          </Pressable>
        ) : null}

        <NoteBar
          tone="amber"
          icon="information-circle"
          title="Only used in an emergency."
          detail="Reditoe contacts this person if you are unreachable during a delivery. They are never shown to customers or restaurants."
        />
      </View>
    </Screen>
  );
}
