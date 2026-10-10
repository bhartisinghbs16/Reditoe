"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  FileText,
  Info,
  Lightbulb,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateNotification } from "@/lib/queries";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Create Notification, built to the client's reference screens: a four-step
 * composer — content, audience, preview & schedule, review & send — with the
 * live phone preview and a running summary down the right.
 *
 * The notification record the API stores is title, message, type, audience,
 * status and send time. Delivery settings and targeting are collected, shown
 * back on Review, and flagged there as not yet persisted.
 */

const STEPS = [
  { key: "content", label: "Notification Details" },
  { key: "audience", label: "Audience & Targeting" },
  { key: "schedule", label: "Preview & Schedule" },
  { key: "review", label: "Review & Send" },
];

const TITLE_LIMIT = 60;
const MESSAGE_LIMIT = 160;
const ACTION_LIMIT = 20;

const TYPES = ["Promotional", "Transactional", "Announcement", "Reminder"];
const PRIORITIES = ["High", "Normal", "Low"];
const SOUNDS = ["Default", "Chime", "Silent"];
const AUDIENCES = [
  "All users",
  "New users",
  "Existing users",
  "Delivery partners",
  "Restaurants",
];
const PLATFORMS = ["Android", "iOS", "Web"];

const TIPS: Record<string, string[]> = {
  content: [
    "Keep the title short and attractive.",
    "Emojis increase visibility.",
    "Add an action button to improve engagement.",
    "High-priority notifications are shown instantly.",
  ],
  audience: [
    "Narrow the audience and the open rate usually rises.",
    "Platform targeting avoids sending an iOS deep link to Android.",
    "Exclude people who just received one.",
  ],
  schedule: [
    "Check the preview on both platforms before sending.",
    "Avoid quiet hours unless the message is transactional.",
    "Scheduled sends can still be cancelled before they fire.",
  ],
  review: [
    "A send cannot be recalled once it has gone out.",
    "Save as draft if you want someone else to check it.",
    "The summary is exactly what the device will show.",
  ],
};

interface FormState {
  title: string;
  message: string;
  deepLink: string;
  actionButton: string;
  type: string;
  priority: string;
  sound: string;
  badgeCount: string;
  showInCentre: boolean;
  sendToInbox: boolean;
  silent: boolean;
  audience: string;
  platforms: string[];
  locations: string;
  excludeRecent: boolean;
  excludeUnsubscribed: boolean;
  scheduleMode: string;
  sendAt: string;
  timezone: string;
}

const EMPTY: FormState = {
  title: "",
  message: "",
  deepLink: "",
  actionButton: "",
  type: "Promotional",
  priority: "High",
  sound: "Default",
  badgeCount: "1",
  showInCentre: true,
  sendToInbox: true,
  silent: false,
  audience: "",
  platforms: [...PLATFORMS],
  locations: "",
  excludeRecent: false,
  excludeUnsubscribed: true,
  scheduleMode: "now",
  sendAt: "",
  timezone: "Asia/Kolkata (IST)",
};

function Stepper({ current }: { current: number }) {
  return (
    <ol className="surface mb-3 flex flex-wrap items-center gap-y-3 p-4">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.key} className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-semibold",
                done && "bg-success text-white",
                active && "bg-primary text-primary-foreground",
                !done && !active && "bg-muted text-muted-foreground"
              )}
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate text-[0.8125rem]",
                active ? "font-semibold text-primary" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "ml-1 hidden h-px flex-1 sm:block",
                  done ? "bg-success" : "bg-border"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  htmlFor,
  required,
  optional,
  error,
  hint,
  counter,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  counter?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-primary"> *</span>}
        {optional && (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        )}
      </Label>
      {children}
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "min-w-0 flex-1 text-[0.75rem]",
            error ? "text-danger-foreground" : "text-muted-foreground"
          )}
        >
          {error ?? hint ?? ""}
        </p>
        {counter && (
          <p className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
            {counter}
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-[0.8125rem] not-last:border-b not-last:border-border/70">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-words">{value || "—"}</span>
    </div>
  );
}

/** The reference's phone mock, so the copy is checked at its real width. */
function PhonePreview({
  platform,
  title,
  message,
  action,
}: {
  platform: string;
  title: string;
  message: string;
  action: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-900 p-4 text-white">
      <div className="flex items-center justify-between text-[0.625rem] text-white/70">
        <span>9:41</span>
        <span>{platform}</span>
      </div>
      <p className="mt-4 text-center text-3xl font-light">9:41</p>
      <p className="text-center text-[0.6875rem] text-white/70">Monday, 20 May</p>

      <div className="mt-4 rounded-xl bg-white/95 p-2.5 text-slate-900">
        <div className="flex items-center gap-1.5">
          <span className="flex size-4 items-center justify-center rounded bg-primary text-[0.5rem] font-bold text-primary-foreground">
            R
          </span>
          <span className="text-[0.6875rem] font-semibold">Reditoe</span>
          <span className="ml-auto text-[0.625rem] text-slate-500">now</span>
        </div>
        <p className="mt-1 text-[0.75rem] font-semibold break-words">
          {title || "Your title appears here"}
        </p>
        <p className="mt-0.5 text-[0.6875rem] break-words text-slate-700">
          {message || "And the message body beneath it"}
        </p>
        {action && (
          <p className="mt-1.5 text-[0.6875rem] font-semibold text-primary">{action}</p>
        )}
      </div>
    </div>
  );
}

export default function CreateNotificationPage() {
  const router = useRouter();
  const create = useCreateNotification();
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [platform, setPlatform] = React.useState("Android");
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>(
    {}
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function togglePlatform(value: string) {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.includes(value)
        ? current.platforms.filter((entry) => entry !== value)
        : [...current.platforms, value],
    }));
  }

  function validateStep(index: number) {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (index === 0) {
      if (!form.title.trim()) next.title = "A title is required.";
      if (!form.message.trim()) next.message = "A message is required.";
    }
    if (index === 1) {
      if (!form.audience) next.audience = "Pick an audience.";
      if (form.platforms.length === 0)
        next.platforms = "Pick at least one platform.";
    }
    if (index === 2) {
      if (form.scheduleMode === "later" && !form.sendAt)
        next.sendAt = "Pick when it should go out.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) {
      toast.error("Fix the highlighted fields.");
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function submit(asDraft: boolean) {
    for (const index of [0, 1, 2]) {
      if (!validateStep(index)) {
        setStep(index);
        toast.error("Fix the highlighted fields.");
        return;
      }
    }

    try {
      await create.mutateAsync({
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.type,
        audience: form.audience,
        status: asDraft ? "draft" : form.scheduleMode === "later" ? "scheduled" : "sent",
        sentAt:
          !asDraft && form.scheduleMode === "later" ? form.sendAt : undefined,
      });
      toast.success(
        asDraft
          ? "Saved as a draft"
          : form.scheduleMode === "later"
            ? "Notification scheduled — delivery settings aren't stored yet."
            : "Notification sent — delivery settings aren't stored yet."
      );
      router.push("/marketing/notifications");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the notification"
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Push Notifications"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Push Notifications", href: "/marketing/notifications" },
          { label: "Create Notification" },
        ]}
      />

      <Stepper current={step} />

      <div className="grid items-start gap-3 xl:grid-cols-[1.7fr_1fr]">
        <div className="flex flex-col gap-3">
          {step === 0 && (
            <>
              <Panel title="1. Notification Content">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field
                    label="Title"
                    htmlFor="title"
                    required
                    error={errors.title}
                    counter={`${form.title.length}/${TITLE_LIMIT}`}
                  >
                    <Input
                      id="title"
                      value={form.title}
                      maxLength={TITLE_LIMIT}
                      placeholder="Flat ₹100 OFF on your first order!"
                      onChange={(event) => set("title", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Message"
                    htmlFor="message"
                    required
                    error={errors.message}
                    counter={`${form.message.length}/${MESSAGE_LIMIT}`}
                  >
                    <Textarea
                      id="message"
                      rows={3}
                      value={form.message}
                      maxLength={MESSAGE_LIMIT}
                      placeholder="Use code FIRST100 and get flat ₹100 OFF on your first order."
                      onChange={(event) => set("message", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Deep Link"
                    htmlFor="deepLink"
                    optional
                    hint="Where tapping the notification takes the user."
                  >
                    <Input
                      id="deepLink"
                      value={form.deepLink}
                      placeholder="reditoe://offer/FIRST100"
                      onChange={(event) => set("deepLink", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Action Button"
                    htmlFor="action"
                    optional
                    counter={`${form.actionButton.length}/${ACTION_LIMIT}`}
                  >
                    <Input
                      id="action"
                      value={form.actionButton}
                      maxLength={ACTION_LIMIT}
                      placeholder="Order Now"
                      onChange={(event) => set("actionButton", event.target.value)}
                    />
                  </Field>
                </div>

                <div className="mt-2 rounded-xl border border-dashed border-border p-3 text-center">
                  <p className="text-[0.8125rem] font-medium">Image</p>
                  <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                    There is no upload endpoint yet, so the preview shows the text
                    notification the devices will actually render.
                  </p>
                </div>
              </Panel>

              <Panel title="2. Notification Settings">
                <div className="grid gap-4 lg:grid-cols-4">
                  <Field label="Notification Type" htmlFor="type">
                    <Select
                      value={form.type}
                      onValueChange={(value) => set("type", value)}
                    >
                      <SelectTrigger id="type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPES.map((entry) => (
                          <SelectItem key={entry} value={entry}>
                            {entry}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label="Priority"
                    htmlFor="priority"
                    hint="High priority shows instantly."
                  >
                    <Select
                      value={form.priority}
                      onValueChange={(value) => set("priority", value)}
                    >
                      <SelectTrigger id="priority" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((entry) => (
                          <SelectItem key={entry} value={entry}>
                            {entry}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Sound" htmlFor="sound">
                    <Select
                      value={form.sound}
                      onValueChange={(value) => set("sound", value)}
                    >
                      <SelectTrigger id="sound" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SOUNDS.map((entry) => (
                          <SelectItem key={entry} value={entry}>
                            {entry}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label="Badge Count"
                    htmlFor="badge"
                    hint="Number shown on the app icon."
                  >
                    <Input
                      id="badge"
                      inputMode="numeric"
                      value={form.badgeCount}
                      onChange={(event) => set("badgeCount", event.target.value)}
                    />
                  </Field>
                </div>

                <div className="mt-4 grid gap-x-6 border-t border-border pt-3 sm:grid-cols-3">
                  {[
                    {
                      key: "showInCentre" as const,
                      label: "Show in notification centre",
                      hint: "Keep it in the tray after it arrives.",
                    },
                    {
                      key: "sendToInbox" as const,
                      label: "Send to in-app inbox",
                      hint: "Save it in the user's inbox.",
                    },
                    {
                      key: "silent" as const,
                      label: "Silent notification",
                      hint: "No sound or vibration.",
                    },
                  ].map((toggle) => (
                    <div
                      key={toggle.key}
                      className="flex items-start justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-[0.8125rem] font-medium">{toggle.label}</p>
                        <p className="text-[0.6875rem] text-muted-foreground">
                          {toggle.hint}
                        </p>
                      </div>
                      <Switch
                        checked={form[toggle.key]}
                        onCheckedChange={(checked) => set(toggle.key, checked)}
                      />
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}

          {step === 1 && (
            <Panel title="Audience & Targeting">
              <div className="grid gap-4 lg:grid-cols-2">
                <Field
                  label="Audience"
                  htmlFor="audience"
                  required
                  error={errors.audience}
                >
                  <Select
                    value={form.audience}
                    onValueChange={(value) => set("audience", value)}
                  >
                    <SelectTrigger id="audience" className="w-full">
                      <SelectValue placeholder="Select an audience" />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCES.map((entry) => (
                        <SelectItem key={entry} value={entry}>
                          {entry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Locations"
                  htmlFor="locations"
                  optional
                  hint="Comma-separated cities. Leave blank for everywhere."
                >
                  <Input
                    id="locations"
                    value={form.locations}
                    placeholder="Tirupati, Chittoor"
                    onChange={(event) => set("locations", event.target.value)}
                  />
                </Field>
                <Field
                  label="Platforms"
                  required
                  error={errors.platforms}
                  className="lg:col-span-2"
                >
                  <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1.5">
                    {PLATFORMS.map((entry) => (
                      <div key={entry} className="flex items-center gap-2">
                        <Checkbox
                          id={`pf-${entry}`}
                          checked={form.platforms.includes(entry)}
                          onCheckedChange={() => togglePlatform(entry)}
                        />
                        <Label htmlFor={`pf-${entry}`} className="font-normal">
                          {entry}
                        </Label>
                      </div>
                    ))}
                  </div>
                </Field>
              </div>

              <div className="mt-4 border-t border-border pt-3">
                {[
                  {
                    key: "excludeRecent" as const,
                    label: "Exclude users notified in the last 24 hours",
                    hint: "Avoids stacking pushes on the same person.",
                  },
                  {
                    key: "excludeUnsubscribed" as const,
                    label: "Exclude users who opted out",
                    hint: "Respects the notification preference in the app.",
                  },
                ].map((toggle) => (
                  <div
                    key={toggle.key}
                    className="flex items-start justify-between gap-4 py-2.5 not-last:border-b not-last:border-border/70"
                  >
                    <div className="min-w-0">
                      <p className="text-[0.8125rem] font-medium">{toggle.label}</p>
                      <p className="text-[0.6875rem] text-muted-foreground">
                        {toggle.hint}
                      </p>
                    </div>
                    <Switch
                      checked={form[toggle.key]}
                      onCheckedChange={(checked) => set(toggle.key, checked)}
                    />
                  </div>
                ))}
              </div>

              <p className="mt-3 flex items-start gap-2 rounded-lg bg-info-muted px-3 py-2.5 text-[0.75rem] text-info-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {form.audience
                  ? `This goes to ${form.audience.toLowerCase()} on ${form.platforms.join(", ") || "no platform"}${form.locations ? ` in ${form.locations}` : ""}.`
                  : "Pick an audience and this line describes who receives it."}
              </p>
            </Panel>
          )}

          {step === 2 && (
            <Panel title="3. Schedule">
              <RadioGroup
                value={form.scheduleMode}
                onValueChange={(value) => set("scheduleMode", value)}
                className="grid gap-3 sm:grid-cols-3"
              >
                {[
                  { value: "now", title: "Send now", hint: "Goes out immediately." },
                  {
                    value: "later",
                    title: "Schedule for later",
                    hint: "Choose a date and time.",
                  },
                  {
                    value: "recurring",
                    title: "Recurring",
                    hint: "Send at multiple times.",
                  },
                ].map((option) => (
                  <label
                    key={option.value}
                    htmlFor={`sched-${option.value}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                      form.scheduleMode === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={`sched-${option.value}`}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.8125rem] font-medium">
                        {option.title}
                      </span>
                      <span className="block text-[0.6875rem] text-muted-foreground">
                        {option.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Send at"
                  htmlFor="sendAt"
                  required={form.scheduleMode === "later"}
                  error={errors.sendAt}
                >
                  <Input
                    id="sendAt"
                    type="datetime-local"
                    disabled={form.scheduleMode === "now"}
                    value={form.sendAt}
                    onChange={(event) => set("sendAt", event.target.value)}
                  />
                </Field>
                <Field label="Timezone" htmlFor="tz">
                  <Select
                    value={form.timezone}
                    onValueChange={(value) => set("timezone", value)}
                  >
                    <SelectTrigger id="tz" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Kolkata (IST)">
                        Asia/Kolkata (IST)
                      </SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {form.scheduleMode === "recurring" && (
                <p className="mt-3 rounded-lg bg-warning-muted px-3 py-2.5 text-[0.75rem] text-warning-foreground">
                  Recurring sends need a scheduler on the API. Choosing this now stores
                  the notification as scheduled and sends it once.
                </p>
              )}
            </Panel>
          )}

          {step === 3 && (
            <>
              <Panel title="Review">
                <SummaryRow label="Title" value={form.title} />
                <SummaryRow label="Message" value={form.message} />
                <SummaryRow label="Type" value={form.type} />
                <SummaryRow label="Audience" value={form.audience} />
                <SummaryRow
                  label="Schedule"
                  value={
                    form.scheduleMode === "now"
                      ? "Send now"
                      : form.sendAt
                        ? `${dateTime(form.sendAt)} (${form.timezone})`
                        : undefined
                  }
                />
              </Panel>

              <Panel
                title="Captured but not stored"
                description="A notification record holds title, message, type, audience, status and send time. These are shown so nothing is lost, but the API has nowhere to put them yet."
              >
                <SummaryRow label="Priority" value={form.priority} />
                <SummaryRow label="Sound" value={form.sound} />
                <SummaryRow label="Badge count" value={form.badgeCount} />
                <SummaryRow label="Deep link" value={form.deepLink} />
                <SummaryRow label="Action button" value={form.actionButton} />
                <SummaryRow label="Platforms" value={form.platforms.join(", ")} />
                <SummaryRow label="Locations" value={form.locations} />
                <SummaryRow
                  label="Delivery"
                  value={[
                    form.showInCentre && "Notification centre",
                    form.sendToInbox && "In-app inbox",
                    form.silent && "Silent",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <SummaryRow
                  label="Exclusions"
                  value={
                    [
                      form.excludeRecent && "Notified in last 24h",
                      form.excludeUnsubscribed && "Opted out",
                    ]
                      .filter(Boolean)
                      .join(", ") || "None"
                  }
                />
              </Panel>
            </>
          )}

          <div className="surface flex flex-wrap items-center justify-between gap-2 p-4">
            {step === 0 ? (
              <Button
                variant="outline"
                onClick={() => router.push("/marketing/notifications")}
              >
                <X className="size-4" />
                Cancel
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={create.isPending}
                onClick={() => submit(true)}
              >
                <FileText className="size-4" />
                Save as draft
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={goNext}>
                  Next: {STEPS[step + 1].label}
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button disabled={create.isPending} onClick={() => submit(false)}>
                  {create.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {form.scheduleMode === "now" ? "Send now" : "Schedule"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Panel
            title="Live Preview"
            action={
              <div className="flex items-center gap-1">
                {["Android", "iOS"].map((entry) => (
                  <Button
                    key={entry}
                    variant={platform === entry ? "outline" : "ghost"}
                    size="sm"
                    aria-pressed={platform === entry}
                    onClick={() => setPlatform(entry)}
                  >
                    {entry}
                  </Button>
                ))}
              </div>
            }
          >
            <PhonePreview
              platform={platform}
              title={form.title}
              message={form.message}
              action={form.actionButton}
            />
          </Panel>

          <Panel title="Notification Summary">
            <SummaryRow label="Type" value={form.type} />
            <SummaryRow label="Audience" value={form.audience} />
            <SummaryRow label="Priority" value={form.priority} />
            <SummaryRow
              label="Schedule"
              value={form.scheduleMode === "now" ? "Send now" : dateTime(form.sendAt)}
            />
            <SummaryRow label="Sound" value={form.sound} />
            <SummaryRow label="Action Button" value={form.actionButton} />
          </Panel>

          <div className="rounded-xl bg-info-muted p-3.5">
            <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-info-foreground">
              <Lightbulb className="size-4" />
              Tips
            </p>
            <ul className="mt-2 space-y-1.5">
              {TIPS[STEPS[step].key].map((tip) => (
                <li
                  key={tip}
                  className="flex items-start gap-2 text-[0.75rem] text-info-foreground"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 size-1 shrink-0 rounded-full bg-current"
                  />
                  <span className="min-w-0 flex-1">{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href="/marketing/notifications">
              <Bell className="size-3.5" />
              Back to notifications
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
