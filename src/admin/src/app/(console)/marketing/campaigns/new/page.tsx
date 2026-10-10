"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  Lightbulb,
  Loader2,
  Rocket,
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
import { useCreateCampaign, type CampaignChannel } from "@/lib/queries";
import { currency, dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Create Campaign, built to the client's reference screens: a four-step
 * composer — details, audience & targeting, content & design, review & publish
 * — with the live preview and running summary down the right.
 *
 * The campaign record the API stores is small: name, type, objective, dates,
 * budget and status. Everything the reference collects beyond that — targeting,
 * exclusions, creative — is captured, shown back on Review, and flagged there
 * as not yet persisted, so nobody assumes a targeting rule is live when the
 * backend has nowhere to put it.
 */

const STEPS = [
  { key: "details", label: "Campaign Details" },
  { key: "audience", label: "Audience & Targeting" },
  { key: "content", label: "Content & Design" },
  { key: "review", label: "Review & Publish" },
];

/**
 * The delivery channels the API accepts. It validates `campaignType` against
 * this exact set, so offering anything else here would build a campaign the
 * platform rejects on save.
 */
const TYPES = [
  { value: "PUSH_NOTIFICATION", label: "Push notification" },
  { value: "EMAIL", label: "Email" },
  { value: "BANNER", label: "In-app banner" },
  { value: "MULTI_CHANNEL", label: "Multi-channel" },
];

/** Channels the API requires a headline and body copy for. */
const NEEDS_CONTENT = ["PUSH_NOTIFICATION", "EMAIL"];

const OBJECTIVES = [
  { value: "New users", label: "New users" },
  { value: "Returning users", label: "Returning users" },
  { value: "All users", label: "All users" },
  { value: "Corporate", label: "Corporate" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKEND = ["Sat", "Sun"];

const USER_TYPES = ["All users", "New users", "Existing users"];

const EXCLUSIONS = [
  {
    key: "usedCoupon",
    label: "Exclude users who used this coupon before",
    hint: "Users who already redeemed it won't see this campaign.",
  },
  {
    key: "loyalty",
    label: "Exclude loyalty programme members",
    hint: "Leave existing members out of an acquisition push.",
  },
  {
    key: "inactive",
    label: "Exclude inactive users",
    hint: "Users who haven't opened the app in the last 30 days.",
  },
  {
    key: "overlapping",
    label: "Exclude users in other active campaigns",
    hint: "Prevents overlapping with other running campaigns.",
  },
];

const TIPS: Record<string, string[]> = {
  details: [
    "Choose the right objective to reach your goal.",
    "Use attractive banners and clear offers.",
    "Track performance and optimise regularly.",
  ],
  audience: [
    "Define your audience clearly for better results.",
    "Use location targeting to reach relevant users.",
    "Exclude users who aren't relevant to this campaign.",
  ],
  content: [
    "Lead with the saving, not the brand.",
    "Keep the headline under eight words.",
    "Make the code easy to read and to type.",
  ],
  review: [
    "Check the dates and the budget before publishing.",
    "A scheduled campaign starts itself; a draft doesn't.",
    "Everything here can be edited after publishing.",
  ],
};

interface FormState {
  name: string;
  type: string;
  objective: string;
  description: string;
  startDate: string;
  endDate: string;
  timezone: string;
  runOn: string[];
  budgetType: string;
  budget: string;
  dailyBudget: string;
  bidding: string;
  frequencyCap: string;
  priority: string;
  utmSource: string;
  abTest: boolean;
  trackConversions: boolean;
  targetAudience: string;
  userTypes: string[];
  locations: string;
  radius: string;
  ageGroup: string;
  gender: string;
  language: string;
  deviceType: string;
  orderHistory: string;
  minOrderValue: string;
  exclusions: string[];
  headline: string;
  subheadline: string;
  code: string;
  ctaLabel: string;
  publishAs: string;
}

const EMPTY: FormState = {
  name: "",
  type: "",
  objective: "",
  description: "",
  startDate: "",
  endDate: "",
  timezone: "Asia/Kolkata (IST)",
  runOn: [...DAYS],
  budgetType: "set",
  budget: "",
  dailyBudget: "",
  bidding: "automatic",
  frequencyCap: "",
  priority: "normal",
  utmSource: "",
  abTest: false,
  trackConversions: true,
  targetAudience: "",
  userTypes: ["All users"],
  locations: "",
  radius: "",
  ageGroup: "",
  gender: "",
  language: "",
  deviceType: "",
  orderHistory: "",
  minOrderValue: "",
  exclusions: [],
  headline: "",
  subheadline: "",
  code: "",
  ctaLabel: "Order now",
  publishAs: "scheduled",
};

/** Whole days between the two dates, inclusive of the first. */
function durationDays(start: string, end: string) {
  if (!start || !end) return null;
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

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
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
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
      {error ? (
        <p className="text-[0.75rem] text-danger-foreground">{error}</p>
      ) : hint ? (
        <p className="text-[0.75rem] text-muted-foreground">{hint}</p>
      ) : null}
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

/** A labelled select over a fixed option list. */
function Choice({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function CreateCampaignPage() {
  const router = useRouter();
  const create = useCreateCampaign();
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>(
    {}
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function toggleIn(key: "runOn" | "userTypes" | "exclusions", value: string) {
    setForm((current) => {
      const list = current[key];
      return {
        ...current,
        [key]: list.includes(value)
          ? list.filter((entry) => entry !== value)
          : [...list, value],
      };
    });
  }

  const duration = durationDays(form.startDate, form.endDate);

  function validateStep(index: number) {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (index === 0) {
      if (!form.name.trim()) next.name = "Give the campaign a name.";
      if (!form.type) next.type = "Pick a campaign type.";
      if (!form.objective) next.objective = "Pick an objective.";
      if (!form.startDate) next.startDate = "A start date is required.";
      if (!form.endDate) next.endDate = "An end date is required.";
      if (form.startDate && form.endDate && duration === null)
        next.endDate = "The end date must be on or after the start date.";
      if (form.runOn.length === 0) next.runOn = "Pick at least one day.";
      if (form.budgetType === "set" && !(Number(form.budget) > 0))
        next.budget = "Set a total budget, or choose to run without one.";
    }

    if (index === 1) {
      if (!form.targetAudience) next.targetAudience = "Pick a target audience.";
      if (form.userTypes.length === 0) next.userTypes = "Pick at least one user type.";
      if (!form.locations.trim()) next.locations = "Name at least one location.";
    }

    if (index === 2) {
      if (!form.headline.trim()) next.headline = "A headline is required.";
      // Push and email carry body copy to the recipient, and the API refuses
      // to save either without it.
      if (NEEDS_CONTENT.includes(form.type) && !form.subheadline.trim()) {
        next.subheadline = "Body copy is required for push and email.";
      }
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

  async function publish() {
    for (const index of [0, 1, 2]) {
      if (!validateStep(index)) {
        setStep(index);
        toast.error("Fix the highlighted fields.");
        return;
      }
    }

    // The API rejects a scheduled campaign whose date has already passed, so a
    // start date in the past sends immediately rather than failing the save.
    const startsInFuture =
      Boolean(form.startDate) && new Date(form.startDate).getTime() > Date.now();

    try {
      await create.mutateAsync({
        name: form.name.trim(),
        campaignType: form.type as CampaignChannel,
        // The model has no field for a campaign's objective, so it is folded
        // into the description rather than dropped on the floor.
        description:
          [form.description.trim(), form.objective && `Objective: ${form.objective}`]
            .filter(Boolean)
            .join("\n\n") || undefined,
        content: {
          title: form.headline.trim() || form.name.trim(),
          message: form.subheadline.trim() || form.description.trim(),
          actionText: form.ctaLabel.trim() || undefined,
        },
        targeting: {
          // Admin campaigns address customers; the model's other roles are for
          // operational messaging rather than marketing.
          userRoles: ["CUSTOMER"],
          cities: form.locations
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        },
        schedule: startsInFuture
          ? {
              type: "SCHEDULED",
              scheduledAt: new Date(form.startDate).toISOString(),
              timezone: "Asia/Kolkata",
            }
          : { type: "IMMEDIATE" },
        budget:
          form.budgetType === "set" && form.budget
            ? { total: Number(form.budget) }
            : undefined,
        status:
          form.publishAs === "draft"
            ? "DRAFT"
            : startsInFuture
              ? "SCHEDULED"
              : "ACTIVE",
      });
      toast.success(
        `${form.name} ${form.publishAs === "draft" ? "saved as a draft" : "published"} — audience rules beyond city aren't stored yet.`
      );
      router.push("/marketing/campaigns");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the campaign"
      );
    }
  }

  const preview = (
    <Panel title="Campaign Preview">
      <div className="rounded-xl bg-accent p-4">
        <span className="inline-flex rounded bg-primary px-2 py-0.5 text-[0.625rem] font-bold tracking-wide text-primary-foreground uppercase">
          {form.type || "Campaign"}
        </span>
        <p className="mt-2 text-lg leading-tight font-bold text-accent-foreground">
          {form.headline || "Your headline appears here"}
        </p>
        <p className="mt-1 text-[0.8125rem] text-accent-foreground/80">
          {form.subheadline || "And the supporting line beneath it"}
        </p>
      </div>
      <div className="mt-2 rounded-lg border border-dashed border-border px-3 py-2 text-center text-[0.8125rem]">
        Code:{" "}
        <span className="font-mono font-semibold">{form.code || "—"}</span>
      </div>
    </Panel>
  );

  const summary = (
    <Panel title="Campaign Summary">
      <SummaryRow label="Campaign Name" value={form.name} />
      <SummaryRow
        label="Campaign Type"
        value={TYPES.find((entry) => entry.value === form.type)?.label}
      />
      <SummaryRow label="Objective" value={form.objective} />
      <SummaryRow label="Target Audience" value={form.targetAudience} />
      <SummaryRow
        label="Budget"
        value={
          form.budgetType === "set" && form.budget
            ? `${currency(Number(form.budget))} total`
            : form.budgetType === "none"
              ? "No budget"
              : undefined
        }
      />
      <SummaryRow
        label="Duration"
        value={duration === null ? undefined : `${duration} day${duration === 1 ? "" : "s"}`}
      />
      <SummaryRow label="Start Date" value={dateTime(form.startDate)} />
      <SummaryRow label="End Date" value={dateTime(form.endDate)} />
      <SummaryRow
        label="Run On"
        value={
          form.runOn.length === DAYS.length
            ? "All days"
            : form.runOn.length === 0
              ? undefined
              : form.runOn.join(", ")
        }
      />
      <SummaryRow label="Timezone" value={form.timezone} />
    </Panel>
  );

  return (
    <>
      <PageHeader
        title="Create Campaign"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Campaigns", href: "/marketing/campaigns" },
          { label: "Create Campaign" },
        ]}
      />

      <Stepper current={step} />

      <div className="grid items-start gap-3 xl:grid-cols-[1.7fr_1fr]">
        <div className="flex flex-col gap-3">
          {step === 0 && (
            <>
              <Panel title="1. Campaign Details">
                <div className="grid gap-4 lg:grid-cols-3">
                  <Field
                    label="Campaign Name"
                    htmlFor="name"
                    required
                    error={errors.name}
                    hint="Give the campaign a unique name."
                  >
                    <Input
                      id="name"
                      value={form.name}
                      placeholder="Enter campaign name"
                      onChange={(event) => set("name", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Campaign Type"
                    htmlFor="type"
                    required
                    error={errors.type}
                  >
                    <Select
                      value={form.type}
                      onValueChange={(value) => set("type", value)}
                    >
                      <SelectTrigger id="type" className="w-full">
                        <SelectValue placeholder="Select campaign type" />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPES.map((entry) => (
                          <SelectItem key={entry.value} value={entry.value}>
                            {entry.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label="Objective"
                    htmlFor="objective"
                    required
                    error={errors.objective}
                    hint="What is the main goal of this campaign?"
                  >
                    <Select
                      value={form.objective}
                      onValueChange={(value) => set("objective", value)}
                    >
                      <SelectTrigger id="objective" className="w-full">
                        <SelectValue placeholder="Select objective" />
                      </SelectTrigger>
                      <SelectContent>
                        {OBJECTIVES.map((entry) => (
                          <SelectItem key={entry.value} value={entry.value}>
                            {entry.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label="Description"
                    htmlFor="description"
                    optional
                    className="lg:col-span-3"
                  >
                    <Textarea
                      id="description"
                      rows={2}
                      value={form.description}
                      placeholder="Enter a short description about this campaign"
                      onChange={(event) => set("description", event.target.value)}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel title="2. Schedule">
                <div className="grid gap-4 lg:grid-cols-3">
                  <Field
                    label="Start Date & Time"
                    htmlFor="start"
                    required
                    error={errors.startDate}
                  >
                    <Input
                      id="start"
                      type="datetime-local"
                      value={form.startDate}
                      onChange={(event) => set("startDate", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="End Date & Time"
                    htmlFor="end"
                    required
                    error={errors.endDate}
                  >
                    <Input
                      id="end"
                      type="datetime-local"
                      value={form.endDate}
                      onChange={(event) => set("endDate", event.target.value)}
                    />
                  </Field>
                  <Field label="Timezone" htmlFor="tz">
                    <Choice
                      id="tz"
                      value={form.timezone}
                      onChange={(value) => set("timezone", value)}
                      options={["Asia/Kolkata (IST)", "UTC"]}
                      placeholder="Select timezone"
                    />
                  </Field>
                  <Field label="Campaign Duration">
                    <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-[0.8125rem]">
                      {duration === null
                        ? "Set both dates"
                        : `${duration} day${duration === 1 ? "" : "s"}`}
                    </div>
                  </Field>
                  <Field
                    label="Run Campaign On"
                    required
                    error={errors.runOn}
                    className="lg:col-span-2"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { label: "All days", days: DAYS },
                        { label: "Weekdays", days: WEEKDAYS },
                        { label: "Weekends", days: WEEKEND },
                      ].map((preset) => (
                        <Button
                          key={preset.label}
                          type="button"
                          variant={
                            form.runOn.length === preset.days.length &&
                            preset.days.every((day) => form.runOn.includes(day))
                              ? "outline"
                              : "ghost"
                          }
                          size="sm"
                          onClick={() => set("runOn", [...preset.days])}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                      {DAYS.map((day) => (
                        <div key={day} className="flex items-center gap-2">
                          <Checkbox
                            id={`day-${day}`}
                            checked={form.runOn.includes(day)}
                            onCheckedChange={() => toggleIn("runOn", day)}
                          />
                          <Label htmlFor={`day-${day}`} className="font-normal">
                            {day}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </Field>
                </div>
              </Panel>

              <Panel title="3. Budget & Spending">
                <RadioGroup
                  value={form.budgetType}
                  onValueChange={(value) => set("budgetType", value)}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {[
                    {
                      value: "none",
                      title: "No budget",
                      hint: "Run continuously without a spending limit.",
                    },
                    {
                      value: "set",
                      title: "Set budget",
                      hint: "Set a spending limit for this campaign.",
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      htmlFor={`budget-${option.value}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                        form.budgetType === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <RadioGroupItem
                        value={option.value}
                        id={`budget-${option.value}`}
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

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <Field
                    label="Total Budget (₹)"
                    htmlFor="budget"
                    required={form.budgetType === "set"}
                    error={errors.budget}
                    hint="Total amount you want to spend."
                  >
                    <Input
                      id="budget"
                      inputMode="numeric"
                      disabled={form.budgetType === "none"}
                      value={form.budget}
                      placeholder="5000"
                      onChange={(event) => set("budget", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Daily Budget (₹)"
                    htmlFor="daily"
                    optional
                    hint="Limit spend per day."
                  >
                    <Input
                      id="daily"
                      inputMode="numeric"
                      disabled={form.budgetType === "none"}
                      value={form.dailyBudget}
                      placeholder="500"
                      onChange={(event) => set("dailyBudget", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Frequency Cap"
                    htmlFor="cap"
                    optional
                    hint="How many times a user sees this per day."
                  >
                    <Input
                      id="cap"
                      inputMode="numeric"
                      value={form.frequencyCap}
                      placeholder="2"
                      onChange={(event) => set("frequencyCap", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Bidding Strategy"
                    htmlFor="bidding"
                    hint="Automatic optimises delivery for you."
                  >
                    <Choice
                      id="bidding"
                      value={form.bidding}
                      onChange={(value) => set("bidding", value)}
                      options={["automatic", "manual"]}
                      placeholder="Select a strategy"
                    />
                  </Field>
                </div>
              </Panel>

              <Panel title="4. Additional Settings">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field
                    label="Priority"
                    htmlFor="priority"
                    hint="High-priority campaigns are delivered first."
                  >
                    <Choice
                      id="priority"
                      value={form.priority}
                      onChange={(value) => set("priority", value)}
                      options={["low", "normal", "high"]}
                      placeholder="Select a priority"
                    />
                  </Field>
                  <Field
                    label="UTM Source"
                    htmlFor="utm"
                    optional
                    hint="For performance tracking."
                  >
                    <Input
                      id="utm"
                      value={form.utmSource}
                      placeholder="reditoe_app_campaign"
                      onChange={(event) => set("utmSource", event.target.value)}
                    />
                  </Field>
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  {[
                    {
                      key: "abTest" as const,
                      label: "Enable A/B test",
                      hint: "Test different variations of this campaign.",
                    },
                    {
                      key: "trackConversions" as const,
                      label: "Track conversions",
                      hint: "Measure conversions for this campaign.",
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
              </Panel>
            </>
          )}

          {step === 1 && (
            <>
              <Panel title="1. Audience">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field
                    label="Target Audience"
                    htmlFor="audience"
                    required
                    error={errors.targetAudience}
                  >
                    <Choice
                      id="audience"
                      value={form.targetAudience}
                      onChange={(value) => set("targetAudience", value)}
                      options={OBJECTIVES.map((entry) => entry.label)}
                      placeholder="Select target audience"
                    />
                  </Field>
                  <Field label="User Type" required error={errors.userTypes}>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1.5">
                      {USER_TYPES.map((type) => (
                        <div key={type} className="flex items-center gap-2">
                          <Checkbox
                            id={`ut-${type}`}
                            checked={form.userTypes.includes(type)}
                            onCheckedChange={() => toggleIn("userTypes", type)}
                          />
                          <Label htmlFor={`ut-${type}`} className="font-normal">
                            {type}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </Field>
                  <Field
                    label="Location"
                    htmlFor="locations"
                    required
                    error={errors.locations}
                    hint="Comma-separated cities or zones."
                  >
                    <Input
                      id="locations"
                      value={form.locations}
                      placeholder="Tirupati, Chittoor"
                      onChange={(event) => set("locations", event.target.value)}
                    />
                  </Field>
                  <Field label="Radius" htmlFor="radius" optional>
                    <Choice
                      id="radius"
                      value={form.radius}
                      onChange={(value) => set("radius", value)}
                      options={["All areas", "2 km", "5 km", "10 km"]}
                      placeholder="All areas"
                    />
                  </Field>
                </div>

                <p className="mt-3 flex items-start gap-2 rounded-lg bg-info-muted px-3 py-2.5 text-[0.75rem] text-info-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  {form.targetAudience
                    ? `This campaign will target ${form.targetAudience.toLowerCase()}${form.locations ? ` in ${form.locations}` : ""}.`
                    : "Pick a target audience and this line describes who the campaign reaches."}
                </p>
              </Panel>

              <Panel title="2. Targeting" description="Every field here is optional.">
                <div className="grid gap-4 lg:grid-cols-4">
                  <Field label="Age Group" htmlFor="age">
                    <Choice
                      id="age"
                      value={form.ageGroup}
                      onChange={(value) => set("ageGroup", value)}
                      options={["All ages", "18–24", "25–34", "35–44", "45+"]}
                      placeholder="All ages"
                    />
                  </Field>
                  <Field label="Gender" htmlFor="gender">
                    <Choice
                      id="gender"
                      value={form.gender}
                      onChange={(value) => set("gender", value)}
                      options={["All", "Male", "Female", "Other"]}
                      placeholder="All"
                    />
                  </Field>
                  <Field label="Language" htmlFor="language">
                    <Choice
                      id="language"
                      value={form.language}
                      onChange={(value) => set("language", value)}
                      options={["All languages", "English", "Hindi", "Telugu", "Tamil"]}
                      placeholder="All languages"
                    />
                  </Field>
                  <Field label="Device Type" htmlFor="device">
                    <Choice
                      id="device"
                      value={form.deviceType}
                      onChange={(value) => set("deviceType", value)}
                      options={["All devices", "Android", "iOS", "Web"]}
                      placeholder="All devices"
                    />
                  </Field>
                  <Field label="Order History" htmlFor="history">
                    <Choice
                      id="history"
                      value={form.orderHistory}
                      onChange={(value) => set("orderHistory", value)}
                      options={[
                        "Any",
                        "No orders yet",
                        "1–5 orders",
                        "6–20 orders",
                        "20+ orders",
                      ]}
                      placeholder="Any"
                    />
                  </Field>
                  <Field
                    label="Min. Order Value (₹)"
                    htmlFor="minOrder"
                    hint="Target users above a spend."
                  >
                    <Input
                      id="minOrder"
                      inputMode="numeric"
                      value={form.minOrderValue}
                      placeholder="Enter amount"
                      onChange={(event) => set("minOrderValue", event.target.value)}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel title="3. Exclusions" description="Every exclusion here is optional.">
                <div className="grid gap-x-6 sm:grid-cols-2">
                  {EXCLUSIONS.map((exclusion) => (
                    <div
                      key={exclusion.key}
                      className="flex items-start justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[0.8125rem] font-medium">{exclusion.label}</p>
                        <p className="text-[0.6875rem] text-muted-foreground">
                          {exclusion.hint}
                        </p>
                      </div>
                      <Switch
                        aria-label={exclusion.label}
                        checked={form.exclusions.includes(exclusion.key)}
                        onCheckedChange={() => toggleIn("exclusions", exclusion.key)}
                      />
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}

          {step === 2 && (
            <Panel title="Content & Design" description="What the customer sees.">
              <div className="grid gap-4 lg:grid-cols-2">
                <Field
                  label="Headline"
                  htmlFor="headline"
                  required
                  error={errors.headline}
                  hint="Lead with the saving."
                >
                  <Input
                    id="headline"
                    value={form.headline}
                    placeholder="Flat ₹100 OFF"
                    onChange={(event) => set("headline", event.target.value)}
                  />
                </Field>
                <Field label="Sub-headline" htmlFor="subheadline" optional>
                  <Input
                    id="subheadline"
                    value={form.subheadline}
                    placeholder="On your first order"
                    onChange={(event) => set("subheadline", event.target.value)}
                  />
                </Field>
                <Field
                  label="Coupon Code"
                  htmlFor="code"
                  optional
                  hint="Shown on the banner and typed at checkout."
                >
                  <Input
                    id="code"
                    value={form.code}
                    placeholder="FIRST100"
                    onChange={(event) => set("code", event.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="Call to Action" htmlFor="cta">
                  <Input
                    id="cta"
                    value={form.ctaLabel}
                    onChange={(event) => set("ctaLabel", event.target.value)}
                  />
                </Field>
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-center">
                <p className="text-[0.8125rem] font-medium">Banner artwork</p>
                <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                  There is no upload endpoint yet, so the preview is built from the
                  headline, sub-headline and code rather than an image.
                </p>
              </div>
            </Panel>
          )}

          {step === 3 && (
            <>
              <Panel title="Review">
                <SummaryRow label="Campaign Name" value={form.name} />
                <SummaryRow
                  label="Type"
                  value={TYPES.find((entry) => entry.value === form.type)?.label}
                />
                <SummaryRow label="Objective" value={form.objective} />
                <SummaryRow label="Description" value={form.description} />
                <SummaryRow label="Starts" value={dateTime(form.startDate)} />
                <SummaryRow label="Ends" value={dateTime(form.endDate)} />
                <SummaryRow
                  label="Budget"
                  value={
                    form.budgetType === "set" && form.budget
                      ? currency(Number(form.budget))
                      : "No budget"
                  }
                />
              </Panel>

              <Panel
                title="Captured but not stored"
                description="The campaign record holds name, type, objective, dates, budget and status. These are shown so nothing is lost, but the API has nowhere to put them yet."
              >
                <SummaryRow label="Target Audience" value={form.targetAudience} />
                <SummaryRow label="User Types" value={form.userTypes.join(", ")} />
                <SummaryRow label="Locations" value={form.locations} />
                <SummaryRow
                  label="Targeting"
                  value={
                    [
                      form.ageGroup,
                      form.gender,
                      form.language,
                      form.deviceType,
                      form.orderHistory,
                      form.minOrderValue && `Min ${currency(Number(form.minOrderValue))}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                />
                <SummaryRow
                  label="Exclusions"
                  value={
                    form.exclusions
                      .map(
                        (key) => EXCLUSIONS.find((entry) => entry.key === key)?.label
                      )
                      .filter(Boolean)
                      .join(", ") || "None"
                  }
                />
                <SummaryRow
                  label="Creative"
                  value={[form.headline, form.subheadline, form.code]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <SummaryRow
                  label="Run on"
                  value={
                    form.runOn.length === DAYS.length ? "All days" : form.runOn.join(", ")
                  }
                />
              </Panel>

              <Panel title="Publish">
                <RadioGroup
                  value={form.publishAs}
                  onValueChange={(value) => set("publishAs", value)}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {[
                    {
                      value: "scheduled",
                      title: "Schedule it",
                      hint: "Starts itself at the start date.",
                    },
                    {
                      value: "draft",
                      title: "Save as draft",
                      hint: "Nothing goes out until you publish.",
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      htmlFor={`publish-${option.value}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                        form.publishAs === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <RadioGroupItem
                        value={option.value}
                        id={`publish-${option.value}`}
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
              </Panel>
            </>
          )}

          <div className="surface flex flex-wrap items-center justify-between gap-2 p-4">
            {step === 0 ? (
              <Button
                variant="outline"
                onClick={() => router.push("/marketing/campaigns")}
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

            {step < STEPS.length - 1 ? (
              <Button onClick={goNext}>
                Next: {STEPS[step + 1].label}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button disabled={create.isPending} onClick={publish}>
                {create.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Rocket className="size-4" />
                )}
                {form.publishAs === "draft" ? "Save draft" : "Publish campaign"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {preview}
          {summary}
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
            <Link href="/marketing/campaigns">Back to campaigns</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
