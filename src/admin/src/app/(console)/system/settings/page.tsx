"use client";

import * as React from "react";
import {
  Boxes,
  DatabaseBackup,
  Eraser,
  HelpCircle,
  Loader2,
  Palette,
  Plug,
  Save,
  ScrollText,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIntegrationStatus, type IntegrationStatus } from "@/lib/queries";
import { API_BASE_URL } from "@/lib/api";
import { useSaveSettings, useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** One labelled control with an optional helper line. */
function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground text-pretty">{hint}</p>}
    </div>
  );
}

/** A switch row — label and description on the left, control on the right. */
function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 not-last:border-b not-last:border-border">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            {description}
          </p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

type SettingsShape = Record<string, unknown>;

/**
 * Services the platform talks to. Credentials live in the API's environment,
 * never in this settings document — so each row reports whether the feature is
 * switched on and nothing more.
 */
const INTEGRATIONS: Array<{
  key: keyof IntegrationStatus;
  label: string;
  hint: string;
  /**
   * Read from the API's own answer, not from the settings document. A
   * tick-box records what somebody switched on; this reports what the server
   * can actually do, and the two had drifted far enough apart that live
   * Razorpay keys were being shown as "Not configured".
   */
  detail?: (status: IntegrationStatus) => string | null;
}> = [
  {
    key: "razorpay",
    label: "Razorpay",
    hint: "Online card, UPI and netbanking payments",
    detail: (s) =>
      s.razorpay.configured
        ? `${s.razorpay.mode === "live" ? "LIVE keys" : "Test keys"} · ending ${s.razorpay.keyEnding}`
        : null,
  },
  {
    key: "wallet",
    label: "Platform wallet",
    hint: "Store credit and refunds to wallet",
  },
  {
    key: "push",
    label: "Push notifications",
    hint: "Order and marketing pushes to the apps",
    detail: (s) => s.push.provider,
  },
  {
    key: "email",
    label: "Transactional email",
    hint: "Receipts, verification and alerts",
    detail: (s) => (s.email.configured ? `${s.email.provider} · from ${s.email.from}` : null),
  },
  {
    key: "sms",
    label: "SMS gateway",
    hint: "OTP login and delivery updates",
    detail: (s) => s.sms.provider,
  },
  {
    key: "maps",
    label: "Google Maps",
    hint: "Live tracking and address lookup",
  },
];


const ADD_INTEGRATION_STEPS = [
  "Add the provider's key and secret to the API environment.",
  "Restart the API so it picks the new values up.",
  "Switch the matching option on here and save.",
];

const BRAND_ASSETS = [
  { label: "Platform logo", hint: "PNG or JPG, up to 2MB" },
  { label: "Favicon", hint: "ICO or PNG, up to 1MB" },
];

const SYSTEM_OPERATIONS: Array<{
  icon: typeof Eraser;
  label: string;
  hint: string;
  href: string | null;
}> = [
  { icon: Eraser, label: "Clear cache", hint: "Clear the system cache", href: null },
  {
    icon: ScrollText,
    label: "Activity logs",
    hint: "View system activity logs",
    href: "/system/activity",
  },
  {
    icon: DatabaseBackup,
    label: "Backup & restore",
    hint: "Manage backups",
    href: null,
  },
  {
    icon: Boxes,
    label: "Alerts inbox",
    hint: "Admin-facing alert feed",
    href: "/notifications",
  },
];

export default function SettingsPage() {
  const integrations = useIntegrationStatus();

  /**
   * Maps is the one the API cannot answer for: its key belongs to the console
   * and is never sent to the server, so the console checks its own build.
   */
  const isConfigured = (key: keyof IntegrationStatus) => {
    if (key === "maps") return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
    return Boolean(integrations.data?.[key]?.configured);
  };

  const settings = useSettings<SettingsShape>();
  const save = useSaveSettings();

  // Local draft so a half-finished edit is never pushed to the API. Seeded from
  // the fetched settings during render — an effect would show one frame of an
  // empty form after the data lands.
  const [draft, setDraft] = React.useState<SettingsShape>({});
  const [dirty, setDirty] = React.useState(false);
  const [seededFrom, setSeededFrom] = React.useState<SettingsShape | null>(null);

  if (settings.data && settings.data !== seededFrom) {
    setSeededFrom(settings.data);
    setDraft(settings.data);
    setDirty(false);
  }

  function set(key: string, value: unknown) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function value(key: string, fallback = "") {
    const raw = draft[key];
    return raw === undefined || raw === null ? fallback : String(raw);
  }

  function flag(key: string, fallback = false) {
    const raw = draft[key];
    return raw === undefined || raw === null ? fallback : Boolean(raw);
  }

  const referralDraft = (draft.referralSettings && typeof draft.referralSettings === "object" ? draft.referralSettings : {}) as Record<string, unknown>;
  function referralValue(key: string, fallback = 0) {
    const raw = referralDraft[key];
    return raw === undefined || raw === null ? fallback : Number(raw);
  }
  function referralFlag(key: string, fallback = true) {
    const raw = referralDraft[key];
    return raw === undefined || raw === null ? fallback : Boolean(raw);
  }
  function setReferral(key: string, value: unknown) {
    set("referralSettings", { ...referralDraft, [key]: value });
  }

  async function onSave() {
    try {
      await save.mutateAsync(draft);
      setDirty(false);
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Platform-wide configuration: business rules, payments, notifications and security."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "System" },
          { label: "Settings" },
        ]}
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href="/support">
                <HelpCircle className="size-4" />
                Need Help?
              </Link>
            </Button>
            <Button size="lg" disabled={!dirty || save.isPending} onClick={onSave}>
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save changes
            </Button>
          </>
        }
      />

      {settings.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-[3fr_1fr]">
        <Tabs defaultValue="general">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="business">Business</TabsTrigger>
            <TabsTrigger value="payments">Payment &amp; Payout</TabsTrigger>
            <TabsTrigger value="referral">Referral</TabsTrigger>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="roles">Roles &amp; Permissions</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Identity" description="How the marketplace presents itself.">
                <div className="space-y-4">
                  <Field label="Platform name" htmlFor="platformName">
                    <Input
                      id="platformName"
                      value={value("platformName")}
                      onChange={(event) => set("platformName", event.target.value)}
                      placeholder="Marketplace"
                    />
                  </Field>
                  <Field label="Support email" htmlFor="supportEmail">
                    <Input
                      id="supportEmail"
                      type="email"
                      value={value("supportEmail")}
                      onChange={(event) => set("supportEmail", event.target.value)}
                      placeholder="support@example.com"
                    />
                  </Field>
                  <Field label="Support phone" htmlFor="supportPhone">
                    <Input
                      id="supportPhone"
                      value={value("supportPhone")}
                      onChange={(event) => set("supportPhone", event.target.value)}
                      placeholder="+91 00000 00000"
                    />
                  </Field>
                  <Field
                    label="Announcement"
                    htmlFor="announcement"
                    hint="Shown at the top of the customer app when set."
                  >
                    <Textarea
                      id="announcement"
                      rows={3}
                      value={value("announcement")}
                      onChange={(event) => set("announcement", event.target.value)}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel title="Availability" description="Global switches for the marketplace.">
                <ToggleRow
                  label="Accept new orders"
                  description="Turn off to pause ordering across every restaurant."
                  checked={flag("ordersEnabled", true)}
                  onCheckedChange={(checked) => set("ordersEnabled", checked)}
                />
                <ToggleRow
                  label="Vendor self-registration"
                  description="Let restaurants sign up without an invitation."
                  checked={flag("vendorSelfSignup")}
                  onCheckedChange={(checked) => set("vendorSelfSignup", checked)}
                />
                <ToggleRow
                  label="Rider self-registration"
                  description="Let delivery partners apply directly from the app."
                  checked={flag("riderSelfSignup")}
                  onCheckedChange={(checked) => set("riderSelfSignup", checked)}
                />
                <ToggleRow
                  label="Maintenance mode"
                  description="Customer apps show a maintenance notice instead of the menu."
                  checked={flag("maintenanceMode")}
                  onCheckedChange={(checked) => set("maintenanceMode", checked)}
                />
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="business">
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Commission & fees">
                <div className="space-y-4">
                  <Field
                    label="Default commission (%)"
                    htmlFor="commission"
                    hint="Applied to new restaurants unless overridden on their profile."
                  >
                    <Input
                      id="commission"
                      type="number"
                      min={0}
                      max={100}
                      value={value("platformCommissionPercent")}
                      onChange={(event) =>
                        set("platformCommissionPercent", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Platform fee (₹)" htmlFor="platformFee">
                    <Input
                      id="platformFee"
                      type="number"
                      min={0}
                      value={value("platformFee")}
                      onChange={(event) => set("platformFee", event.target.value)}
                    />
                  </Field>
                  <Field label="GST on items (%)" htmlFor="gstItems">
                    <Input
                      id="gstItems"
                      type="number"
                      min={0}
                      value={value("gstOnItems")}
                      onChange={(event) => set("gstOnItems", event.target.value)}
                    />
                  </Field>
                  <Field label="GST on fees (%)" htmlFor="gstFees">
                    <Input
                      id="gstFees"
                      type="number"
                      min={0}
                      value={value("gstOnFees")}
                      onChange={(event) => set("gstOnFees", event.target.value)}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel title="Order rules">
                <div className="space-y-4">
                  <Field label="Minimum order value (₹)" htmlFor="minOrder">
                    <Input
                      id="minOrder"
                      type="number"
                      min={0}
                      value={value("minimumOrderValue")}
                      onChange={(event) => set("minimumOrderValue", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Free-delivery threshold (₹)"
                    htmlFor="freeDelivery"
                    hint="Set to 0 to disable free delivery."
                  >
                    <Input
                      id="freeDelivery"
                      type="number"
                      min={0}
                      value={value("freeDeliveryThreshold")}
                      onChange={(event) =>
                        set("freeDeliveryThreshold", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Cancellation window (minutes)" htmlFor="cancelWindow">
                    <Input
                      id="cancelWindow"
                      type="number"
                      min={0}
                      value={value("cancellationWindowMinutes")}
                      onChange={(event) =>
                        set("cancellationWindowMinutes", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Currency" htmlFor="currency">
                    <Select
                      value={value("currency", "INR")}
                      onValueChange={(next) => set("currency", next)}
                    >
                      <SelectTrigger id="currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">INR — Indian Rupee</SelectItem>
                        <SelectItem value="USD">USD — US Dollar</SelectItem>
                        <SelectItem value="AED">AED — UAE Dirham</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="payments">
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Accepted methods">
                <ToggleRow
                  label="Online payments"
                  description="Cards, UPI and net banking through the payment gateway."
                  checked={flag("onlinePaymentsEnabled", true)}
                  onCheckedChange={(checked) => set("onlinePaymentsEnabled", checked)}
                />
                <ToggleRow
                  label="Cash on delivery"
                  checked={flag("codEnabled", true)}
                  onCheckedChange={(checked) => set("codEnabled", checked)}
                />
                <ToggleRow
                  label="Wallet"
                  description="Let customers pay from their platform wallet balance."
                  checked={flag("walletEnabled", true)}
                  onCheckedChange={(checked) => set("walletEnabled", checked)}
                />
                <ToggleRow
                  label="Auto-capture payments"
                  description="Capture immediately on authorisation instead of on delivery."
                  checked={flag("autoCapture", true)}
                  onCheckedChange={(checked) => set("autoCapture", checked)}
                />
              </Panel>

              <Panel
                title="Payouts"
                description="How and when money reaches vendors and riders."
              >
                <div className="space-y-4">
                  <Field label="Payout cycle" htmlFor="payoutCycle">
                    <Select
                      value={value("payoutCycle", "weekly")}
                      onValueChange={(next) => set("payoutCycle", next)}
                    >
                      <SelectTrigger id="payoutCycle">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="fortnightly">Fortnightly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Minimum payout amount (₹)" htmlFor="minPayout">
                    <Input
                      id="minPayout"
                      type="number"
                      min={0}
                      value={value("minimumPayoutAmount")}
                      onChange={(event) =>
                        set("minimumPayoutAmount", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="TDS rate (%)"
                    htmlFor="tds"
                    hint="Deducted at source from partner earnings."
                  >
                    <Input
                      id="tds"
                      type="number"
                      min={0}
                      value={value("tdsPercent")}
                      onChange={(event) => set("tdsPercent", event.target.value)}
                    />
                  </Field>
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="delivery">
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Delivery pricing">
                <div className="space-y-4">
                  <Field label="Base delivery fee (₹)" htmlFor="baseFee">
                    <Input
                      id="baseFee"
                      type="number"
                      min={0}
                      value={value("baseDeliveryFee")}
                      onChange={(event) => set("baseDeliveryFee", event.target.value)}
                    />
                  </Field>
                  <Field label="Per-km charge (₹)" htmlFor="perKm">
                    <Input
                      id="perKm"
                      type="number"
                      min={0}
                      value={value("perKmCharge")}
                      onChange={(event) => set("perKmCharge", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Maximum delivery radius (km)"
                    htmlFor="radius"
                    hint="Restaurants beyond this distance are hidden from the customer."
                  >
                    <Input
                      id="radius"
                      type="number"
                      min={0}
                      value={value("maxDeliveryRadiusKm")}
                      onChange={(event) =>
                        set("maxDeliveryRadiusKm", event.target.value)
                      }
                    />
                  </Field>
                </div>
              </Panel>

              <Panel title="Dispatch">
                <div className="space-y-4">
                  <Field label="Assignment window (seconds)" htmlFor="dispatchWindow">
                    <Input
                      id="dispatchWindow"
                      type="number"
                      min={0}
                      value={value("dispatchWindowSeconds")}
                      onChange={(event) =>
                        set("dispatchWindowSeconds", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Search radius (km)" htmlFor="dispatchRadius">
                    <Input
                      id="dispatchRadius"
                      type="number"
                      min={0}
                      value={value("dispatchRadiusKm")}
                      onChange={(event) => set("dispatchRadiusKm", event.target.value)}
                    />
                  </Field>
                  <ToggleRow
                    label="Auto-assign riders"
                    description="Assign the nearest available partner without manual dispatch."
                    checked={flag("autoAssignRiders", true)}
                    onCheckedChange={(checked) => set("autoAssignRiders", checked)}
                  />
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="notifications">
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Channels" description="How the platform reaches people.">
                <ToggleRow
                  label="Push notifications"
                  checked={flag("pushEnabled", true)}
                  onCheckedChange={(checked) => set("pushEnabled", checked)}
                />
                <ToggleRow
                  label="Email"
                  checked={flag("emailEnabled", true)}
                  onCheckedChange={(checked) => set("emailEnabled", checked)}
                />
                <ToggleRow
                  label="SMS"
                  description="Charged per message by the SMS provider."
                  checked={flag("smsEnabled")}
                  onCheckedChange={(checked) => set("smsEnabled", checked)}
                />
                <ToggleRow
                  label="In-app inbox"
                  checked={flag("inAppEnabled", true)}
                  onCheckedChange={(checked) => set("inAppEnabled", checked)}
                />
              </Panel>

              <Panel
                title="Quiet hours"
                description="Promotional messages are held back during this window."
              >
                <div className="space-y-4">
                  <ToggleRow
                    label="Enable quiet hours"
                    checked={flag("quietHoursEnabled")}
                    onCheckedChange={(checked) => set("quietHoursEnabled", checked)}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Start" htmlFor="quietStart">
                      <Input
                        id="quietStart"
                        type="time"
                        value={value("quietHoursStart", "22:00")}
                        onChange={(event) => set("quietHoursStart", event.target.value)}
                      />
                    </Field>
                    <Field label="End" htmlFor="quietEnd">
                      <Input
                        id="quietEnd"
                        type="time"
                        value={value("quietHoursEnd", "07:00")}
                        onChange={(event) => set("quietHoursEnd", event.target.value)}
                      />
                    </Field>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Transactional messages — order updates, payment receipts — are always
                    delivered.
                  </p>
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="security">
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Access">
                <ToggleRow
                  label="Require two-factor for admins"
                  description="Admins must confirm a one-time code at sign-in."
                  checked={flag("adminTwoFactor")}
                  onCheckedChange={(checked) => set("adminTwoFactor", checked)}
                />
                <ToggleRow
                  label="Force password rotation"
                  description="Admin passwords expire every 90 days."
                  checked={flag("passwordRotation")}
                  onCheckedChange={(checked) => set("passwordRotation", checked)}
                />
                <ToggleRow
                  label="Log every admin action"
                  description="Writes to the activity log. Strongly recommended."
                  checked={flag("auditLogging", true)}
                  onCheckedChange={(checked) => set("auditLogging", checked)}
                />
              </Panel>

              <Panel title="Sessions & limits">
                <div className="space-y-4">
                  <Field label="Session lifetime (days)" htmlFor="sessionDays">
                    <Input
                      id="sessionDays"
                      type="number"
                      min={1}
                      value={value("sessionLifetimeDays", "7")}
                      onChange={(event) =>
                        set("sessionLifetimeDays", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="API rate limit (requests / 15 min)"
                    htmlFor="rateLimit"
                    hint="Applies per IP address."
                  >
                    <Input
                      id="rateLimit"
                      type="number"
                      min={1}
                      value={value("rateLimitMax", "200")}
                      onChange={(event) => set("rateLimitMax", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Allowed origins"
                    htmlFor="origins"
                    hint="Comma-separated. Used for CORS on the API."
                  >
                    <Textarea
                      id="origins"
                      rows={2}
                      value={value("allowedOrigins")}
                      onChange={(event) => set("allowedOrigins", event.target.value)}
                      placeholder="https://admin.example.com, https://example.com"
                    />
                  </Field>
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="roles">
            <Panel
              title="Roles & Permissions"
              description="Who can do what in the console."
            >
              <p className="text-[0.8125rem] text-muted-foreground">
                Roles and the full permission catalogue live on their own screen, so
                the two cannot drift apart.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/system/roles">
                  <ShieldCheck className="size-3.5" />
                  Open Users &amp; Roles
                </Link>
              </Button>
            </Panel>
          </TabsContent>

          <TabsContent value="referral">
            <Panel title="Referral programme" description="Set separate rewards for customer, vendor and delivery-partner referrals. These values are controlled by Admin and are used by the User app immediately after saving.">
              <div className="space-y-4">
                <ToggleRow label="Referral programme enabled" description="Allow users to create referral invitations." checked={referralFlag("enabled", true)} onCheckedChange={(checked) => setReferral("enabled", checked)} />
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="User referral reward (₹)" htmlFor="userReferralAmount" hint="Paid to the referring user after the referred customer completes the referral condition.">
                    <Input id="userReferralAmount" type="number" min={0} value={referralValue("userReferralAmount")} onChange={(e) => setReferral("userReferralAmount", Number(e.target.value))} />
                  </Field>
                  <Field label="Vendor referral reward (₹)" htmlFor="vendorReferralAmount" hint="Paid after the referred vendor is approved by Admin.">
                    <Input id="vendorReferralAmount" type="number" min={0} value={referralValue("vendorReferralAmount")} onChange={(e) => setReferral("vendorReferralAmount", Number(e.target.value))} />
                  </Field>
                  <Field label="Delivery partner reward (₹)" htmlFor="deliveryReferralAmount" hint="Paid after the referred delivery partner KYC is approved.">
                    <Input id="deliveryReferralAmount" type="number" min={0} value={referralValue("deliveryReferralAmount")} onChange={(e) => setReferral("deliveryReferralAmount", Number(e.target.value))} />
                  </Field>
                </div>
                <ToggleRow label="Credit user referral after first delivered order" description="Keeps the existing customer-to-customer referral safety rule." checked={referralFlag("creditAfterDelivery", true)} onCheckedChange={(checked) => setReferral("creditAfterDelivery", checked)} />
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="integrations">
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                title="Integrations"
                description="Third-party services this platform talks to."
              >
                <ul className="space-y-2.5">
                  {INTEGRATIONS.map((integration) => (
                    <li
                      key={integration.key}
                      className="flex items-start gap-2.5 rounded-xl border border-border p-3"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Plug className="size-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium">
                          {integration.label}
                          <StatusBadge
                            status={isConfigured(integration.key) ? "active" : "inactive"}
                            label={
                              integrations.isPending
                                ? "Checking…"
                                : isConfigured(integration.key)
                                  ? "Configured"
                                  : "Not configured"
                            }
                          />
                        </p>
                        <p className="text-[0.6875rem] text-muted-foreground">
                          {(integrations.data && integration.detail?.(integrations.data)) ??
                            integration.hint}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.75rem] text-muted-foreground">
                  Keys and secrets are held as environment variables on the API, not in
                  this settings document — the console reports whether each service is
                  switched on, and never shows a credential.
                </p>
              </Panel>

              <Panel title="Add Integration" description="What connecting one involves.">
                <ol className="space-y-2.5 text-[0.8125rem]">
                  {ADD_INTEGRATION_STEPS.map((step, index) => (
                    <li key={step} className="flex items-start gap-2.5">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[0.625rem] font-semibold tabular-nums">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 rounded-lg bg-info-muted px-3 py-2.5 text-[0.75rem] text-info-foreground">
                  There is no endpoint for registering an integration from the console,
                  so this describes the real path rather than offering a form that
                  would not do anything.
                </p>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="appearance">
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Branding" description="How the marketplace presents itself.">
                <div className="space-y-4">
                  <Field label="Platform name" htmlFor="appearanceName">
                    <Input
                      id="appearanceName"
                      value={value("platformName")}
                      onChange={(event) => set("platformName", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Platform tagline"
                    htmlFor="tagline"
                    hint="Sits under the name on the login screen and in the apps."
                  >
                    <Input
                      id="tagline"
                      value={value("platformTagline")}
                      onChange={(event) => set("platformTagline", event.target.value)}
                      placeholder="Ready to Eat"
                    />
                  </Field>
                </div>
                <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                  {BRAND_ASSETS.map((asset) => (
                    <div
                      key={asset.label}
                      className="rounded-xl border border-dashed border-border p-3 text-center"
                    >
                      <Palette className="mx-auto size-5 text-muted-foreground" />
                      <p className="mt-1.5 text-[0.8125rem] font-medium">
                        {asset.label}
                      </p>
                      <p className="text-[0.6875rem] text-muted-foreground">
                        {asset.hint}
                      </p>
                      <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                        Upload is not wired to the API yet.
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Theme" description="Both modes are hand-tuned, not inverted.">
                <p className="text-[0.8125rem] text-muted-foreground">
                  Light and dark are chosen per person from the toggle in the top bar and
                  remembered in that browser. There is no platform-wide default to set —
                  one admin&apos;s preference should not change another&apos;s screen.
                </p>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="system">
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Maintenance" description="Take the platform offline safely.">
                <ToggleRow
                  label="Maintenance mode"
                  description="Temporarily disable the platform for maintenance."
                  checked={flag("maintenanceMode")}
                  onCheckedChange={(checked) => set("maintenanceMode", checked)}
                />
                <ToggleRow
                  label="Maintenance alerts"
                  description="Tell users before the platform goes down."
                  checked={flag("maintenanceAlerts", true)}
                  onCheckedChange={(checked) => set("maintenanceAlerts", checked)}
                />
              </Panel>

              <Panel title="Operations" bodyClassName="p-0">
                <ul>
                  {SYSTEM_OPERATIONS.map(({ icon: Icon, label, hint, href }) => {
                    const body = (
                      <>
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8125rem] font-medium">
                            {label}
                          </span>
                          <span className="block text-[0.6875rem] text-muted-foreground">
                            {hint}
                          </span>
                        </span>
                      </>
                    );
                    return (
                      <li key={label}>
                        {href ? (
                          <Link
                            href={href}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 transition-colors not-last:border-b not-last:border-border/70 hover:bg-muted/60"
                          >
                            {body}
                          </Link>
                        ) : (
                          <span
                            title="Needs an API endpoint"
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 opacity-60 not-last:border-b not-last:border-border/70"
                          >
                            {body}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="border-t border-border px-4 py-2.5 text-[0.75rem] text-muted-foreground">
                  Cache and backup actions need endpoints the API does not expose; they
                  are shown dimmed rather than as buttons that would do nothing.
                </p>
              </Panel>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-3">
          <Panel
            title="Platform Status"
            action={
              <StatusBadge
                status={flag("maintenanceMode") ? "suspended" : "active"}
                label={flag("maintenanceMode") ? "Maintenance" : "Active"}
              />
            }
          >
            <div className="flex items-start justify-between gap-3 py-1.5 text-[0.8125rem] not-last:border-b not-last:border-border/70">
              <span className="shrink-0 text-muted-foreground">API</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-mono text-[0.6875rem]">
                  {API_BASE_URL}
                </span>
                <StatusBadge
                  status={settings.isError ? "failed" : "active"}
                  label={settings.isError ? "Unreachable" : "Reachable"}
                />
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 py-1.5 text-[0.8125rem] not-last:border-b not-last:border-border/70">
              <span className="shrink-0 text-muted-foreground">New orders</span>
              <StatusBadge
                status={flag("ordersEnabled", true) ? "active" : "inactive"}
                label={flag("ordersEnabled", true) ? "Accepting" : "Paused"}
              />
            </div>
            <div className="flex items-start justify-between gap-3 py-1.5 text-[0.8125rem]">
              <span className="shrink-0 text-muted-foreground">Cash on delivery</span>
              <StatusBadge
                status={flag("codEnabled", true) ? "active" : "inactive"}
                label={flag("codEnabled", true) ? "Enabled" : "Disabled"}
              />
            </div>
            {/*
              The reference lists a version and Live badge per app. Nothing
              reports app build numbers to the console, so rather than print a
              version that would go stale the moment a build shipped, this says
              where they do come from.
            */}
            <p className="mt-3 border-t border-border pt-2.5 text-[0.75rem] text-muted-foreground">
              App build numbers aren&apos;t reported to the console — they come from the
              store listings.
            </p>
          </Panel>

          <Panel title="Maintenance Mode">
            <div className="flex items-start justify-between gap-4">
              <p className="min-w-0 text-[0.8125rem] text-muted-foreground">
                Temporarily disable the platform for maintenance.
              </p>
              <Switch
                aria-label="Maintenance mode"
                checked={flag("maintenanceMode")}
                onCheckedChange={(checked) => set("maintenanceMode", checked)}
              />
            </div>
            {dirty && (
              <p className="mt-2 text-[0.75rem] text-warning-foreground">
                Unsaved — use Save changes above.
              </p>
            )}
          </Panel>

          <Panel title="Quick Links" bodyClassName="p-0">
            <ul>
              {SYSTEM_OPERATIONS.map(({ icon: Icon, label, hint, href }) => {
                const body = (
                  <>
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.8125rem] font-medium">{label}</span>
                      <span className="block text-[0.6875rem] text-muted-foreground">
                        {hint}
                      </span>
                    </span>
                    {href && (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </>
                );
                return (
                  <li key={label}>
                    {href ? (
                      <Link
                        href={href}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 transition-colors not-last:border-b not-last:border-border/70 hover:bg-muted/60"
                      >
                        {body}
                      </Link>
                    ) : (
                      <span
                        title="Needs an API endpoint"
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 opacity-60 not-last:border-b not-last:border-border/70"
                      >
                        {body}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
        </div>
      )}
    </>
  );
}
