"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Plug,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_BASE_URL } from "@/lib/api";
import { useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Add Integration.
 *
 * The reference draws this as a form with API Key ID, API Key Secret and
 * Webhook Secret fields that save from the browser. There is nowhere safe to
 * put those: the only writable configuration store is the settings document,
 * which the console fetches over the network and holds in browser memory.
 * Writing a live payment secret into it would hand every admin session a copy
 * of the key.
 *
 * So this screen does the job the form was for — telling you exactly what to
 * set, and giving you the webhook URL to paste into the provider — without
 * ever accepting a secret. The env var names and the webhook path are real and
 * copyable; the connection itself is made on the API.
 */

interface Provider {
  value: string;
  label: string;
  category: string;
  /** Environment variables the API reads for this provider. */
  env: string[];
  /** Path the provider should call back on, appended to the API base. */
  webhook?: string;
  /** The settings flag that switches the feature on once keys are in place. */
  settingKey?: string;
  docs: string;
}

const PROVIDERS: Provider[] = [
  {
    value: "razorpay",
    label: "Razorpay",
    category: "Payment gateway",
    env: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
    webhook: "/webhooks/razorpay",
    settingKey: "onlinePaymentsEnabled",
    docs: "https://razorpay.com/docs/webhooks/",
  },
  {
    value: "maps",
    label: "Google Maps",
    category: "Maps & location",
    env: ["NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"],
    docs: "https://developers.google.com/maps/documentation",
  },
  {
    value: "sms",
    label: "SMS gateway",
    category: "Messaging",
    env: ["SMS_PROVIDER_KEY", "SMS_SENDER_ID"],
    settingKey: "smsEnabled",
    docs: "",
  },
  {
    value: "email",
    label: "Transactional email",
    category: "Messaging",
    env: ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"],
    settingKey: "emailEnabled",
    docs: "",
  },
  {
    value: "push",
    label: "Push notifications",
    category: "Messaging",
    env: ["FCM_SERVER_KEY"],
    settingKey: "pushEnabled",
    docs: "https://firebase.google.com/docs/cloud-messaging",
  },
];

const CATEGORIES = [...new Set(PROVIDERS.map((entry) => entry.category))];

const STEPS = [
  {
    title: "Select the integration",
    hint: "Pick the service and see exactly what it needs.",
  },
  {
    title: "Set the environment variables",
    hint: "On the API, not here. Secrets never enter the browser.",
  },
  {
    title: "Point the provider at the webhook",
    hint: "Copy the URL below into the provider's dashboard.",
  },
  {
    title: "Switch the feature on",
    hint: "Restart the API, then enable it on the Integrations tab.",
  },
];

function CopyRow({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-[0.75rem]">{value}</code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
          } catch {
            toast.error("Couldn't copy to the clipboard");
          }
        }}
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

export default function AddIntegrationPage() {
  const settings = useSettings<Record<string, unknown>>();
  const [category, setCategory] = React.useState(CATEGORIES[0]);
  const [providerValue, setProviderValue] = React.useState(PROVIDERS[0].value);
  const [environment, setEnvironment] = React.useState("test");

  const inCategory = PROVIDERS.filter((entry) => entry.category === category);
  const provider =
    inCategory.find((entry) => entry.value === providerValue) ?? inCategory[0];

  // The webhook the provider calls is the API's origin, not the console's.
  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
  const webhookUrl = provider?.webhook ? `${apiOrigin}${provider.webhook}` : null;

  const enabled = provider?.settingKey
    ? Boolean(settings.data?.[provider.settingKey])
    : null;

  return (
    <>
      <PageHeader
        title="Add Integration"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/system/settings" },
          { label: "Integrations", href: "/system/settings" },
          { label: "Add Integration" },
        ]}
        actions={
          <Button asChild variant="outline" size="lg">
            <Link href="/system/settings">
              <ArrowLeft className="size-4" />
              Back to Settings
            </Link>
          </Button>
        }
      />

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 rounded-xl bg-warning-muted px-3.5 py-3 text-[0.8125rem] text-warning-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="block font-semibold">
                This screen never asks for a secret
              </span>
              The reference has API key and secret fields that save from the browser.
              The only writable store here is the settings document, which the console
              fetches over the network — a payment secret written into it would be
              handed to every admin session. Keys go in the API&apos;s environment
              instead, and this page tells you exactly which ones.
            </span>
          </p>

          <Panel
            title="1. Select Integration"
            description="Choose the service you want to connect."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="category">Integration category</Label>
                <Select
                  value={category}
                  onValueChange={(next) => {
                    setCategory(next);
                    const first = PROVIDERS.find((entry) => entry.category === next);
                    if (first) setProviderValue(first.value);
                  }}
                >
                  <SelectTrigger id="category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((entry) => (
                      <SelectItem key={entry} value={entry}>
                        {entry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="provider">Select integration</Label>
                <Select value={provider?.value} onValueChange={setProviderValue}>
                  <SelectTrigger id="provider" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inCategory.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {enabled !== null && (
              <p className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[0.8125rem]">
                <span className="text-muted-foreground">Current state:</span>
                <StatusBadge
                  status={enabled ? "active" : "inactive"}
                  label={enabled ? "Switched on" : "Switched off"}
                />
                <span className="text-[0.75rem] text-muted-foreground">
                  Toggled on the Integrations tab once the keys are in place.
                </span>
              </p>
            )}
          </Panel>

          <Panel
            title="2. Connection Details"
            description="What to set, and where."
          >
            <div className="space-y-1.5">
              <Label>Environment</Label>
              <RadioGroup
                value={environment}
                onValueChange={setEnvironment}
                className="flex flex-wrap gap-4 pt-1"
              >
                {[
                  { value: "test", label: "Test (sandbox)" },
                  { value: "live", label: "Live (production)" },
                ].map((option) => (
                  <div key={option.value} className="flex items-center gap-2">
                    <RadioGroupItem value={option.value} id={`env-${option.value}`} />
                    <Label htmlFor={`env-${option.value}`} className="font-normal">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <p className="text-[0.75rem] text-muted-foreground">
                Most providers issue a separate key pair per environment. Use the
                sandbox pair until the flow is proven end to end.
              </p>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="text-[0.8125rem] font-medium">
                Environment variables the API reads
              </p>
              <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                Set these on the API host, then restart it.
              </p>
              <div className="mt-2 space-y-2">
                {provider?.env.map((name) => (
                  <CopyRow key={name} value={name} label={name} />
                ))}
              </div>
            </div>

            {webhookUrl && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-[0.8125rem] font-medium">Webhook URL</p>
                <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                  Paste this into {provider.label}&apos;s dashboard. It points at the
                  API, not this console.
                </p>
                <div className="mt-2">
                  <CopyRow value={webhookUrl} label="Webhook URL" />
                </div>
              </div>
            )}

            {!webhookUrl && (
              <p className="mt-4 border-t border-border pt-3 text-[0.75rem] text-muted-foreground">
                {provider?.label} doesn&apos;t call back — there is no webhook to
                configure.
              </p>
            )}
          </Panel>

          <Panel title="3. Once the keys are in place">
            <ol className="space-y-2.5">
              {[
                "Restart the API so it reads the new environment variables.",
                "Reload this console.",
                "Switch the feature on from the Integrations tab and save.",
              ].map((step, index) => (
                <li key={step} className="flex items-start gap-2.5 text-[0.8125rem]">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[0.625rem] font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              <Button asChild variant="outline" size="sm">
                <Link href="/system/settings">
                  <Plug className="size-3.5" />
                  Open the Integrations tab
                </Link>
              </Button>
              {provider?.docs && (
                <Button asChild variant="outline" size="sm">
                  <a href={provider.docs} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" />
                    {provider.label} documentation
                  </a>
                </Button>
              )}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-3">
          <Panel title="About Integrations">
            <ol className="space-y-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold",
                      "bg-muted text-muted-foreground"
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.8125rem] font-medium">
                      {step.title}
                    </span>
                    <span className="block text-[0.6875rem] text-muted-foreground">
                      {step.hint}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Supported Services">
            <ul className="space-y-2">
              {PROVIDERS.map((entry) => (
                <li key={entry.value} className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Plug className="size-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-medium">
                      {entry.label}
                    </span>
                    <span className="block text-[0.6875rem] text-muted-foreground">
                      {entry.category}
                    </span>
                  </span>
                  {entry.settingKey && settings.data?.[entry.settingKey] ? (
                    <Check className="size-3.5 shrink-0 text-emerald-600" />
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-border pt-2.5 text-[0.75rem] text-muted-foreground">
              A tick means the feature is switched on in settings — not that the keys
              behind it are valid. Only the API can confirm that.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
