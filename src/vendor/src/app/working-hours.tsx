import React from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Divider, Toggle, Txt, colors } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

/**
 * When this kitchen is open.
 *
 * A restaurant is not open for one unbroken stretch: breakfast, lunch and
 * dinner are separate services with the shutters down in between. So a day is
 * a list of slots rather than one pair of times, and a day with no slots is
 * closed.
 *
 * This screen did not exist. "Working Hours" on the More menu opened
 * Restaurant Information, which is why the app showed restaurant details
 * where the hours controls should have been.
 */

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
] as const;

interface Slot {
  opensAt: string;
  closesAt: string;
  label?: string;
}
interface DayHours {
  day: string;
  closed: boolean;
  slots: Slot[];
}

/** A sensible first slot, so adding one does not start from a blank field. */
const NEW_SLOT: Slot = { opensAt: "09:00", closesAt: "22:00" };

/** Digits only, with the colon typed in, so "930" becomes "09:30". */
function formatTime(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Written the way a vendor reads it, rather than in 24-hour form. */
function pretty(time: string): string {
  if (!isTime(time)) return time;
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** One end of a slot: the field, and the same time written back in words. */
function TimeBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View className="flex-1">
      <TextInput
        value={value}
        onChangeText={(next) => onChange(formatTime(next))}
        placeholder="HH:MM"
        keyboardType="number-pad"
        placeholderTextColor={colors.ink.faint}
        className={`rounded-xl border px-3 py-2.5 text-center ${
          isTime(value) ? "border-line" : "border-red-400"
        }`}
      />
      <Txt size="micro" tone="muted" className="mt-0.5 text-center">
        {isTime(value) ? pretty(value) : "24-hour"}
      </Txt>
    </View>
  );
}

export default function WorkingHours() {
  const { vendor, refresh } = useStore();
  const [saving, setSaving] = React.useState(false);

  /** Every day present, so the list is not missing the ones never filled in. */
  const [week, setWeek] = React.useState<DayHours[]>(() =>
    DAYS.map(({ key }) => {
      const stored = vendor.workingHours?.find((entry) => entry.day === key);
      return {
        day: key,
        closed: stored?.closed ?? !stored,
        slots: stored?.slots?.length ? stored.slots.map((s) => ({ ...s })) : [],
      };
    })
  );

  const editDay = (day: string, change: (current: DayHours) => DayHours) =>
    setWeek((current) =>
      current.map((entry) => (entry.day === day ? change(entry) : entry))
    );

  const addSlot = (day: string) =>
    editDay(day, (entry) => ({
      ...entry,
      closed: false,
      slots: [...entry.slots, { ...NEW_SLOT }],
    }));

  const removeSlot = (day: string, index: number) =>
    editDay(day, (entry) => ({
      ...entry,
      slots: entry.slots.filter((_, i) => i !== index),
    }));

  const setSlot = (day: string, index: number, patch: Partial<Slot>) =>
    editDay(day, (entry) => ({
      ...entry,
      slots: entry.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    }));

  /**
   * What is wrong with the week, or null.
   *
   * Checked here as well as on the server so the vendor is told before the
   * round trip, not after it.
   */
  const problem = (() => {
    for (const entry of week) {
      if (entry.closed) continue;
      const label = DAYS.find((d) => d.key === entry.day)?.label ?? entry.day;
      if (entry.slots.length === 0) {
        return `${label} is open but has no hours. Add a slot, or mark it closed.`;
      }
      for (const slot of entry.slots) {
        if (!isTime(slot.opensAt) || !isTime(slot.closesAt)) {
          return `${label}: write times as HH:MM in 24-hour form.`;
        }
        if (slot.closesAt <= slot.opensAt) {
          return `${label}: a slot cannot close at or before it opens.`;
        }
      }
      const sorted = [...entry.slots].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].opensAt < sorted[i - 1].closesAt) {
          return `${label}: two slots overlap.`;
        }
      }
    }
    return null;
  })();

  const save = async () => {
    if (problem) {
      Alert.alert("Check the hours", problem);
      return;
    }
    setSaving(true);
    try {
      await api.patch("/vendor/restaurant", {
        workingHours: week.map((entry) => ({
          day: entry.day,
          closed: entry.closed,
          slots: entry.closed ? [] : entry.slots,
        })),
      });
      await refresh();
      Alert.alert("Saved", "Your working hours have been updated.");
    } catch (error) {
      Alert.alert(
        "Could not save",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Working Hours" />

      <ScrollView contentContainerClassName="pb-28">
        <Txt size="tiny" tone="muted" className="px-4 pb-1 pt-3">
          Add a slot for each service. A day with no slots is closed.
        </Txt>

        {week.map((entry) => {
          const label = DAYS.find((d) => d.key === entry.day)?.label ?? entry.day;
          return (
            <Card key={entry.day} className="mx-4 mt-3 overflow-hidden">
              <View className="flex-row items-center justify-between px-3 py-3">
                <Txt weight="bold">{label}</Txt>
                <View className="flex-row items-center gap-2">
                  <Txt size="tiny" tone="muted">
                    {entry.closed ? "Closed" : "Open"}
                  </Txt>
                  <Toggle
                    value={!entry.closed}
                    onValueChange={(open) =>
                      editDay(entry.day, (current) => ({
                        ...current,
                        closed: !open,
                        // Opening a day that has never been filled in starts
                        // it off with one slot rather than an empty list.
                        slots:
                          open && current.slots.length === 0
                            ? [{ ...NEW_SLOT }]
                            : current.slots,
                      }))
                    }
                  />
                </View>
              </View>

              {!entry.closed && (
                <>
                  <Divider />
                  {entry.slots.map((slot, index) => (
                    <View key={index} className="px-3 py-2.5">
                      <View className="flex-row items-end gap-2">
                        <TimeBox
                          value={slot.opensAt}
                          onChange={(next) => setSlot(entry.day, index, { opensAt: next })}
                        />
                        <Txt tone="muted" className="pb-6">
                          to
                        </Txt>
                        <TimeBox
                          value={slot.closesAt}
                          onChange={(next) => setSlot(entry.day, index, { closesAt: next })}
                        />
                        <Pressable
                          onPress={() => removeSlot(entry.day, index)}
                          hitSlop={8}
                          className="pb-6 pl-1 active:opacity-70"
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.nonveg} />
                        </Pressable>
                      </View>
                    </View>
                  ))}

                  <Pressable
                    onPress={() => addSlot(entry.day)}
                    className="flex-row items-center gap-1.5 px-3 pb-3 pt-1 active:opacity-70"
                  >
                    <Ionicons name="add" size={16} color={colors.brand[600]} />
                    <Txt size="sm" weight="bold" tone="brand">
                      Add slot
                    </Txt>
                  </Pressable>
                </>
              )}
            </Card>
          );
        })}

        {problem && (
          <Txt size="tiny" className="mx-4 mt-3 text-red-600">
            {problem}
          </Txt>
        )}
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-4 pb-6 pt-3">
        <Button label={saving ? "Saving…" : "Save working hours"} onPress={save} disabled={saving} />
      </View>
    </SafeAreaView>
  );
}
