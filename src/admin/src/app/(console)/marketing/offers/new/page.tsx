"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Info, Loader2, Tag, Ticket, X } from "lucide-react";
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
import { useCreateCoupon } from "@/lib/queries";
import { currency, date as formatDate, number as formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Create Offer / Coupon, built to the client's reference screen: four numbered
 * sections down the page with a live ticket preview and a running summary in
 * the rail.
 *
 * A coupon record holds the code, title, discount, thresholds, validity window
 * and audience. The reference's four behaviour toggles and the day picker have
 * nowhere to go on that record, so they are captured, shown in the summary and
 * called out before you save.
 */

const DESCRIPTION_LIMIT = 100;

const AUDIENCES = [
  { value: "all_users", label: "All users" },
  { value: "new", label: "New users" },
  { value: "partners", label: "Delivery partners" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKEND = ["Sat", "Sun"];

const TOGGLES = [
  {
    key: "firstOrderOnly" as const,
    label: "First order only",
    hint: "Valid only on a customer's first order.",
  },
  {
    key: "stackable" as const,
    label: "Stackable with other offers",
    hint: "Allow combining with other offers.",
  },
  {
    key: "showOnBanner" as const,
    label: "Show on banner",
    hint: "Surface this offer on banners and sections.",
  },
  {
    key: "highlight" as const,
    label: "Highlight offer",
    hint: "Mark as special or highlighted.",
  },
];

const NOTES = [
  "Make the code unique and easy to remember.",
  "Check the discount against the minimum order — a flat discount above it gives the order away.",
  "A percentage discount without a maximum has no ceiling.",
];

interface FormState {
  name: string;
  applyMode: string;
  code: string;
  description: string;
  audience: string;
  discountType: string;
  discountValue: string;
  minOrderValue: string;
  maxDiscount: string;
  usageLimit: string;
  startDate: string;
  endDate: string;
  timezone: string;
  days: string[];
  firstOrderOnly: boolean;
  stackable: boolean;
  showOnBanner: boolean;
  highlight: boolean;
}

const EMPTY: FormState = {
  name: "",
  applyMode: "code",
  code: "",
  description: "",
  audience: "all_users",
  discountType: "flat",
  discountValue: "",
  minOrderValue: "",
  maxDiscount: "",
  usageLimit: "",
  startDate: "",
  endDate: "",
  timezone: "Asia/Kolkata (IST)",
  days: [...DAYS],
  firstOrderOnly: false,
  stackable: false,
  showOnBanner: true,
  highlight: false,
};

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

export default function CreateOfferPage() {
  const router = useRouter();
  const create = useCreateCoupon();
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>(
    {}
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function toggleDay(day: string) {
    setForm((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((entry) => entry !== day)
        : [...current.days, day],
    }));
  }

  const isFlat = form.discountType === "flat";
  const discountValue = Number(form.discountValue) || 0;
  const minOrder = Number(form.minOrderValue) || 0;
  const maxDiscount = Number(form.maxDiscount) || 0;

  const benefit = discountValue
    ? isFlat
      ? `${currency(discountValue)} OFF`
      : `${discountValue}% OFF`
    : null;

  function validate() {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "Give the offer a name.";
    if (form.applyMode === "code" && !form.code.trim())
      next.code = "A code is required when the customer applies it.";
    if (!(discountValue > 0)) next.discountValue = "Enter a discount.";
    if (!isFlat && discountValue > 100)
      next.discountValue = "A percentage discount can't exceed 100%.";
    // A flat discount at or above the minimum order gives the order away.
    if (isFlat && minOrder > 0 && discountValue >= minOrder)
      next.discountValue =
        "The flat discount is at or above the minimum order value.";
    if (!form.startDate) next.startDate = "A start date is required.";
    if (!form.endDate) next.endDate = "An end date is required.";
    if (
      form.startDate &&
      form.endDate &&
      new Date(form.endDate).getTime() < new Date(form.startDate).getTime()
    )
      next.endDate = "The end date must be on or after the start date.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) {
      toast.error("Fix the highlighted fields.");
      return;
    }
    try {
      await create.mutateAsync({
        code:
          form.applyMode === "code"
            ? form.code.trim().toUpperCase()
            : `AUTO-${form.name.trim().slice(0, 12).toUpperCase().replace(/\s+/g, "")}`,
        title: form.name.trim(),
        description: form.description.trim() || undefined,
        discountType: isFlat ? "flat" : "percentage",
        discountValue,
        maxDiscount: maxDiscount || undefined,
        minOrderValue: minOrder || undefined,
        usageLimit: Number(form.usageLimit) || undefined,
        validFrom: form.startDate || undefined,
        validTill: form.endDate || undefined,
        applicableFor: form.audience === "all_users" ? "all" : form.audience,
        isActive: true,
      });
      toast.success(`${form.name} created — the behaviour toggles aren't stored yet.`);
      router.push("/marketing/offers");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the offer");
    }
  }

  return (
    <>
      <PageHeader
        title="Create Offer / Coupon"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Offers & Coupons", href: "/marketing/offers" },
          { label: "Create Offer" },
        ]}
      />

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3">
          <Panel title="1. Offer Details">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field
                label="Offer / Coupon Name"
                htmlFor="name"
                required
                error={errors.name}
                hint="This is what customers see."
              >
                <Input
                  id="name"
                  value={form.name}
                  placeholder="Enter offer name"
                  onChange={(event) => set("name", event.target.value)}
                />
              </Field>

              <Field label="Offer Type" required>
                <RadioGroup
                  value={form.applyMode}
                  onValueChange={(value) => set("applyMode", value)}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {[
                    {
                      value: "code",
                      title: "Coupon code",
                      hint: "The customer applies a code.",
                    },
                    {
                      value: "auto",
                      title: "Auto apply",
                      hint: "Applied automatically at checkout.",
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      htmlFor={`mode-${option.value}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                        form.applyMode === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <RadioGroupItem
                        value={option.value}
                        id={`mode-${option.value}`}
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
              </Field>

              <Field
                label="Offer Code"
                htmlFor="code"
                required={form.applyMode === "code"}
                error={errors.code}
                hint={
                  form.applyMode === "code"
                    ? "Customers type this to claim the offer."
                    : "Auto-applied offers still get a code for reporting."
                }
              >
                <Input
                  id="code"
                  value={form.code}
                  placeholder="FIRST250"
                  onChange={(event) => set("code", event.target.value.toUpperCase())}
                />
              </Field>

              <Field
                label="Description"
                htmlFor="description"
                optional
                counter={`${form.description.length}/${DESCRIPTION_LIMIT}`}
              >
                <Textarea
                  id="description"
                  rows={2}
                  maxLength={DESCRIPTION_LIMIT}
                  value={form.description}
                  placeholder="Enter a short description"
                  onChange={(event) => set("description", event.target.value)}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="2. Offer Settings">
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Applicable For" htmlFor="audience" required>
                <Select
                  value={form.audience}
                  onValueChange={(value) => set("audience", value)}
                >
                  <SelectTrigger id="audience" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Discount Type" htmlFor="discountType" required>
                <Select
                  value={form.discountType}
                  onValueChange={(value) => set("discountType", value)}
                >
                  <SelectTrigger id="discountType" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat discount</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label={isFlat ? "Discount Value (₹)" : "Discount Value (%)"}
                htmlFor="discountValue"
                required
                error={errors.discountValue}
              >
                <Input
                  id="discountValue"
                  inputMode="numeric"
                  value={form.discountValue}
                  placeholder={isFlat ? "250" : "20"}
                  onChange={(event) => set("discountValue", event.target.value)}
                />
              </Field>

              <Field
                label="Minimum Order Value (₹)"
                htmlFor="minOrder"
                hint="Cart value needed to apply the offer."
              >
                <Input
                  id="minOrder"
                  inputMode="numeric"
                  value={form.minOrderValue}
                  placeholder="499"
                  onChange={(event) => set("minOrderValue", event.target.value)}
                />
              </Field>

              <Field
                label="Maximum Discount (₹)"
                htmlFor="maxDiscount"
                hint={
                  isFlat
                    ? "Not used by a flat discount."
                    : "Caps the percentage. Without it there is no ceiling."
                }
              >
                <Input
                  id="maxDiscount"
                  inputMode="numeric"
                  disabled={isFlat}
                  value={form.maxDiscount}
                  placeholder="250"
                  onChange={(event) => set("maxDiscount", event.target.value)}
                />
              </Field>

              <Field
                label="Usage Limit"
                htmlFor="usageLimit"
                hint="Leave empty for unlimited."
              >
                <Input
                  id="usageLimit"
                  inputMode="numeric"
                  value={form.usageLimit}
                  placeholder="1"
                  onChange={(event) => set("usageLimit", event.target.value)}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="3. Validity">
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

            <div className="mt-4 border-t border-border pt-3">
              <Label>Valid On</Label>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {[
                  { label: "All days", days: DAYS },
                  { label: "Weekdays", days: WEEKDAYS },
                  { label: "Weekends", days: WEEKEND },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant={
                      form.days.length === preset.days.length &&
                      preset.days.every((day) => form.days.includes(day))
                        ? "outline"
                        : "ghost"
                    }
                    size="sm"
                    onClick={() => set("days", [...preset.days])}
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
                      checked={form.days.includes(day)}
                      onCheckedChange={() => toggleDay(day)}
                    />
                    <Label htmlFor={`day-${day}`} className="font-normal">
                      {day}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="4. Additional Settings">
            <div className="grid gap-x-8 sm:grid-cols-2">
              {TOGGLES.map((toggle) => (
                <div
                  key={toggle.key}
                  className="flex items-start justify-between gap-4 py-2.5"
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
            <p className="mt-3 rounded-lg bg-warning-muted px-3 py-2.5 text-[0.75rem] text-warning-foreground">
              A coupon record has no field for these four, nor for the day picker
              above. They are captured and shown in the summary, but won&apos;t
              persist until the coupon model carries them.
            </p>
          </Panel>

          <div className="surface flex flex-wrap items-center justify-end gap-2 p-4">
            <Button variant="outline" onClick={() => router.push("/marketing/offers")}>
              <X className="size-4" />
              Cancel
            </Button>
            <Button disabled={create.isPending} onClick={submit}>
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Ticket className="size-4" />
              )}
              Create Offer / Coupon
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Panel title="Offer Preview">
            <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
              <span className="inline-flex rounded bg-primary px-2 py-0.5 font-mono text-[0.6875rem] font-bold text-primary-foreground">
                {form.code || "CODE"}
              </span>
              <p className="mt-2 text-2xl leading-tight font-bold text-primary">
                {benefit ?? "Your discount"}
              </p>
              <p className="mt-0.5 text-[0.8125rem]">
                {minOrder > 0
                  ? `On a minimum order of ${currency(minOrder)}`
                  : "No minimum order"}
              </p>
              <p className="mt-2 flex items-center gap-1.5 border-t border-primary/20 pt-2 text-[0.75rem] text-muted-foreground">
                <CalendarDays className="size-3.5" />
                {form.endDate ? `Valid till ${formatDate(form.endDate)}` : "Set an end date"}
              </p>
            </div>
          </Panel>

          <Panel title="Offer Summary">
            <SummaryRow
              label="Offer Type"
              value={form.applyMode === "code" ? "Coupon code" : "Auto apply"}
            />
            <SummaryRow
              label="Discount Type"
              value={isFlat ? "Flat discount" : "Percentage"}
            />
            <SummaryRow label="Discount Value" value={benefit} />
            <SummaryRow
              label="Minimum Order Value"
              value={minOrder > 0 ? currency(minOrder) : "None"}
            />
            <SummaryRow
              label="Maximum Discount"
              value={isFlat ? "n/a" : maxDiscount > 0 ? currency(maxDiscount) : "No cap"}
            />
            <SummaryRow
              label="Applicable For"
              value={AUDIENCES.find((entry) => entry.value === form.audience)?.label}
            />
            <SummaryRow
              label="Validity"
              value={
                form.startDate && form.endDate
                  ? `${formatDate(form.startDate)} to ${formatDate(form.endDate)}`
                  : undefined
              }
            />
            <SummaryRow
              label="Usage Limit"
              value={
                form.usageLimit
                  ? `${formatNumber(Number(form.usageLimit))} per user`
                  : "Unlimited"
              }
            />
            <SummaryRow
              label="Applicable Days"
              value={
                form.days.length === DAYS.length
                  ? "All days"
                  : form.days.length === 0
                    ? "None selected"
                    : form.days.join(", ")
              }
            />
          </Panel>

          <div className="rounded-xl bg-info-muted p-3.5">
            <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-info-foreground">
              <Info className="size-4" />
              Note
            </p>
            <ul className="mt-2 space-y-1.5">
              {NOTES.map((note) => (
                <li
                  key={note}
                  className="flex items-start gap-2 text-[0.75rem] text-info-foreground"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 size-1 shrink-0 rounded-full bg-current"
                  />
                  <span className="min-w-0 flex-1">{note}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link href="/marketing/offers">
              <Tag className="size-3.5" />
              Back to offers
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
