"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FormState {
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  description: string;
  foodType: string;
  categories: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  commissionPercent: string;
  deliveryTime: string;
  isApproved: boolean;
}

const EMPTY: FormState = {
  name: "",
  ownerName: "",
  email: "",
  phone: "",
  description: "",
  foodType: "both",
  categories: "",
  street: "",
  city: "",
  state: "",
  zipCode: "",
  commissionPercent: "15",
  deliveryTime: "",
  isApproved: false,
};

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * What happened to the vendor's set-password invitation.
 *
 * `devSetupLink` is present only when no mail provider is configured, and
 * never in production — it is what lets the flow be completed on a server that
 * cannot send email.
 */
interface VendorInvite {
  email?: string;
  sent?: boolean;
  expiresAt?: string;
  devSetupLink?: string;
}

export default function NewRestaurantPage() {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [invite, setInvite] = React.useState<VendorInvite | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "Give the restaurant a name.";
    if (!form.ownerName.trim()) next.ownerName = "Who owns this restaurant?";
    if (!form.email.trim()) next.email = "An email is required for the vendor login.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "That email looks wrong.";
    if (!form.phone.trim()) next.phone = "A contact number is required.";
    if (!form.city.trim()) next.city = "City is required for delivery zoning.";

    const commission = Number(form.commissionPercent);
    if (Number.isNaN(commission) || commission < 0 || commission > 100)
      next.commissionPercent = "Commission must be between 0 and 100.";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) {
      toast.error("Fix the highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.post<{ invite?: VendorInvite }>("/admin/restaurants", {
        name: form.name.trim(),
        ownerName: form.ownerName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        description: form.description.trim() || undefined,
        foodType: form.foodType,
        categories: form.categories
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        address: {
          street: form.street.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zipCode: form.zipCode.trim(),
        },
        commissionPercent: Number(form.commissionPercent),
        deliveryTime: form.deliveryTime.trim() || undefined,
        isApproved: form.isApproved,
      });

      /**
       * The vendor sets their own password from an emailed link, so whether
       * that link went out is the difference between an account they can use
       * and one they cannot. Leaving for the list without saying loses it.
       *
       * When no mail provider is configured the API returns the link instead
       * of sending it; showing it here is what makes the flow completable on a
       * server that cannot send email at all.
       */
      const invite = created?.invite;
      if (invite && !invite.sent) {
        setInvite(invite);
        toast.warning("Vendor created, but the set-password email could not be sent.");
        return;
      }

      toast.success(`${form.name} added — set-password link emailed to ${form.email.trim()}`);
      router.push("/restaurants");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not create the restaurant"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <PageHeader
        title="Add restaurant"
        description="Onboard a vendor. They can complete KYC and build their menu afterwards."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Restaurants", href: "/restaurants" },
          { label: "Add restaurant" },
        ]}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => router.push("/restaurants")}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Create restaurant
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Business details">
          <div className="space-y-4">
            <Field label="Restaurant name" htmlFor="name" required error={errors.name}>
              <Input
                id="name"
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Corner Kitchen"
              />
            </Field>
            <Field
              label="Description"
              htmlFor="description"
              hint="Shown on the restaurant's page in the customer app."
            >
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Food type" htmlFor="foodType">
                <Select
                  value={form.foodType}
                  onValueChange={(value) => set("foodType", value)}
                >
                  <SelectTrigger id="foodType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="veg">Vegetarian only</SelectItem>
                    <SelectItem value="nonveg">Non-vegetarian only</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Categories"
                htmlFor="categories"
                hint="Comma-separated, e.g. Indian, Chinese"
              >
                <Input
                  id="categories"
                  value={form.categories}
                  onChange={(event) => set("categories", event.target.value)}
                  placeholder="Indian, Chinese"
                />
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title="Owner & contact">
          <div className="space-y-4">
            <Field
              label="Owner name"
              htmlFor="ownerName"
              required
              error={errors.ownerName}
            >
              <Input
                id="ownerName"
                value={form.ownerName}
                onChange={(event) => set("ownerName", event.target.value)}
              />
            </Field>
            <Field
              label="Email"
              htmlFor="email"
              required
              error={errors.email}
              hint="Used as the vendor app login."
            >
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="phone" required error={errors.phone}>
              <Input
                id="phone"
                value={form.phone}
                onChange={(event) => set("phone", event.target.value)}
                placeholder="+91 00000 00000"
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Address">
          <div className="space-y-4">
            <Field label="Street" htmlFor="street">
              <Input
                id="street"
                value={form.street}
                onChange={(event) => set("street", event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" htmlFor="city" required error={errors.city}>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(event) => set("city", event.target.value)}
                />
              </Field>
              <Field label="State" htmlFor="state">
                <Input
                  id="state"
                  value={form.state}
                  onChange={(event) => set("state", event.target.value)}
                />
              </Field>
            </div>
            <Field label="PIN code" htmlFor="zipCode" className="sm:max-w-[12rem]">
              <Input
                id="zipCode"
                value={form.zipCode}
                onChange={(event) => set("zipCode", event.target.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Commercials">
          <div className="space-y-4">
            <Field
              label="Commission (%)"
              htmlFor="commissionPercent"
              required
              error={errors.commissionPercent}
              hint="Platform's share of the item subtotal."
            >
              <Input
                id="commissionPercent"
                type="number"
                min={0}
                max={100}
                value={form.commissionPercent}
                onChange={(event) => set("commissionPercent", event.target.value)}
              />
            </Field>
            {/*
              No per-restaurant delivery fee. Delivery is charged on the
              distance between the restaurant and the customer - 30 up to 3km,
              then 10 for each further km - which is set once for the platform
              under Settings. A fee stored per restaurant was never applied to
              what customers actually paid, so it only misled whoever read it.
            */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Delivery time"
                htmlFor="deliveryTime"
                hint="e.g. 30–40 mins"
              >
                <Input
                  id="deliveryTime"
                  value={form.deliveryTime}
                  onChange={(event) => set("deliveryTime", event.target.value)}
                />
              </Field>
            </div>

            <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium">Approve immediately</p>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  Skip the verification queue and list the restaurant right away.
                  KYC can still be completed later.
                </p>
              </div>
              <Switch
                checked={form.isApproved}
                onCheckedChange={(checked) => set("isApproved", checked)}
              />
            </div>
          </div>
        </Panel>
      </div>

      <InviteDialog
        invite={invite}
        onClose={() => router.push("/restaurants")}
      />
    </form>
  );
}

/**
 * Shown when the invitation could not be emailed.
 *
 * The account exists and is waiting on a password, so the admin needs the link
 * to pass on by hand. Non-dismissable by clicking away: there is no route back
 * to it, and losing it means the vendor cannot get in until a new one is sent.
 */
function InviteDialog({
  invite,
  onClose,
}: {
  invite: VendorInvite | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  if (!invite) return null;

  const link = invite.devSetupLink;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy — select the link and copy it by hand.");
    }
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Vendor created — send them this link</DialogTitle>
          <DialogDescription>
            The set-password email to{" "}
            <span className="font-medium">{invite.email}</span> could not be sent,
            because this server has no mail provider configured. Pass the link on
            and they can choose their password.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-mono text-[0.75rem] break-all">
            {link}
          </p>
        ) : (
          <p className="text-[0.8125rem] text-muted-foreground">
            No link was returned. Open the vendor and use Resend invite.
          </p>
        )}

        <p className="text-[0.75rem] text-muted-foreground">
          It works once and expires. If it lapses, resend from the vendor&apos;s page.
        </p>

        <DialogFooter>
          {link && (
            <Button variant="outline" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
