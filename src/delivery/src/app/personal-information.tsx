import React from "react";
import { Alert, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Badge,
  Button,
  DetailRow,
  Divider,
  Field,
  NoteBar,
  Panel,
  Screen,
  colors,
} from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { PartnerCard } from "@/components/partner-card";
import type { TintName } from "@/lib/theme";
import { request } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * Personal Information, reproduced from the reference: three titled cards —
 * Basic, Emergency Contact and Account — each opening with an Edit link and
 * closing on the reassurance note.
 */

/** The fields for whichever panel is open, plus the save. */
function Editor({
  fields,
  draft,
  setDraft,
  onSave,
  saving,
}: {
  fields: { key: string; label: string; keyboard?: "default" | "number-pad" }[];
  draft: Record<string, string>;
  setDraft: (next: Record<string, string>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <View className="gap-2 pb-3">
      {fields.map((field) => (
        <Field
          key={field.key}
          label={field.label}
          placeholder={field.label}
          value={draft[field.key] ?? ""}
          keyboardType={field.keyboard}
          onChangeText={(next) => setDraft({ ...draft, [field.key]: next })}
        />
      ))}
      <Button
        label={saving ? "Saving…" : "Save changes"}
        onPress={onSave}
        disabled={saving}
        className="mt-1"
      />
    </View>
  );
}

function Rows({
  rows,
  tint,
}: {
  rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; node?: React.ReactNode }[];
  tint: TintName;
}) {
  return (
    <View className="pb-2">
      {rows.map((row, index) => (
        <View key={row.label}>
          {index > 0 && <Divider className="ml-16" />}
          <DetailRow
            icon={row.icon}
            tint={tint}
            label={row.label}
            // A field the rider has not supplied reads as missing. It used to
            // fall back to a fixture, so blanks were filled with a stranger's
            // details — an em-dash is the honest answer.
            value={row.value?.trim() ? row.value : row.node ? undefined : "Not provided"}
            valueNode={row.node}
          />
        </View>
      ))}
    </View>
  );
}

export default function PersonalInformation() {
  const { rider, refresh } = useStore();
  const { personal, emergency, account } = rider;

  const [editing, setEditing] = React.useState<null | "basic" | "emergency">(null);
  const [draft, setDraft] = React.useState({
    name: "",
    bloodGroup: "",
    address: "",
    city: "",
    state: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyRelationship: "",
  });
  const [saving, setSaving] = React.useState(false);

  /* Filled from the account each time a panel is opened, so an abandoned
   * edit is not still sitting there the next time. */
  React.useEffect(() => {
    if (!editing) return;
    setDraft({
      name: rider.name ?? "",
      bloodGroup: personal.bloodGroup ?? "",
      address: personal.address ?? "",
      city: personal.city ?? "",
      state: personal.state ?? "",
      emergencyContactName: emergency.name ?? "",
      emergencyContactPhone: emergency.phone ?? "",
      emergencyRelationship: emergency.relation ?? "",
    });
  }, [editing, rider.name, personal, emergency]);

  const save = async () => {
    setSaving(true);
    try {
      await request("/rider/profile", {
        method: "PUT",
        body:
          editing === "basic"
            ? {
                name: draft.name.trim(),
                bloodGroup: draft.bloodGroup.trim(),
                address: draft.address.trim(),
                city: draft.city.trim(),
                state: draft.state.trim(),
              }
            : {
                // The endpoint requires a name on every write.
                name: rider.name,
                emergencyContactName: draft.emergencyContactName.trim(),
                emergencyContactPhone: draft.emergencyContactPhone.trim(),
                emergencyRelationship: draft.emergencyRelationship.trim(),
              },
      });
      await refresh();
      setEditing(null);
      Alert.alert("Saved", "Your details have been updated.");
    } catch (error: any) {
      Alert.alert("Could not save", error?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Personal Information" />

      <View className="gap-3.5 px-4 pt-3.5">
        <PartnerCard />

        <Panel
          title="Basic Information"
          action={editing === "basic" ? "Cancel" : "Edit"}
          onAction={() => setEditing(editing === "basic" ? null : "basic")}
          accent="green"
          actionIcon="none"
          right={<Ionicons name="create-outline" size={15} color={colors.green[600]} />}
        >
          {editing === "basic" ? (
            <Editor
              saving={saving}
              onSave={save}
              draft={draft}
              setDraft={(next) => setDraft(next as typeof draft)}
              fields={[
                { key: "name", label: "Full name" },
                { key: "bloodGroup", label: "Blood group" },
                { key: "address", label: "Address" },
                { key: "city", label: "City" },
                { key: "state", label: "State" },
              ]}
            />
          ) : (
          <Rows
            tint="green"
            rows={[
              { icon: "person-outline", label: "Full Name", value: rider.name },
              { icon: "calendar-outline", label: "Date of Birth", value: personal.dob },
              { icon: "male-female-outline", label: "Gender", value: personal.gender },
              { icon: "call-outline", label: "Mobile Number", value: personal.phone },
              { icon: "mail-outline", label: "Email Address", value: personal.email },
              { icon: "home-outline", label: "Address", value: personal.address },
              { icon: "location-outline", label: "Current City", value: personal.city },
              { icon: "globe-outline", label: "State", value: personal.state },
              { icon: "shield-outline", label: "Nationality", value: personal.nationality },
              { icon: "water-outline", label: "Blood Group", value: personal.bloodGroup },
            ]}
          />
          )}
        </Panel>

        <Panel
          title="Emergency Contact"
          action={editing === "emergency" ? "Cancel" : "Edit"}
          onAction={() => setEditing(editing === "emergency" ? null : "emergency")}
          accent="green"
          actionIcon="none"
          right={<Ionicons name="create-outline" size={15} color={colors.green[600]} />}
        >
          {editing === "emergency" ? (
            <Editor
              saving={saving}
              onSave={save}
              draft={draft}
              setDraft={(next) => setDraft(next as typeof draft)}
              fields={[
                { key: "emergencyContactName", label: "Contact name" },
                {
                  key: "emergencyContactPhone",
                  label: "Mobile number",
                  keyboard: "number-pad" as const,
                },
                { key: "emergencyRelationship", label: "Relationship" },
              ]}
            />
          ) : (
          <Rows
            tint="orange"
            rows={[
              { icon: "call-outline", label: "Contact Name", value: emergency.name },
              { icon: "call-outline", label: "Mobile Number", value: emergency.phone },
              { icon: "people-outline", label: "Relationship", value: emergency.relation },
            ]}
          />
          )}
        </Panel>

        <Panel
          title="Account Information"
        >
          <Rows
            tint="violet"
            rows={[
              { icon: "calendar-outline", label: "Date of Joining", value: account.joined },
              {
                icon: "id-card-outline",
                label: "Account Status",
                node: <Badge label={account.status} tone="ok" />,
              },
            ]}
          />
        </Panel>

        <NoteBar
          tone="green"
          icon="shield-checkmark"
          title="Your information is safe and secure with us."
          detail="We never share your personal details with anyone."
        />
      </View>
    </Screen>
  );
}
