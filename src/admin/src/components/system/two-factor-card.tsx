"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Copy, ShieldCheck, ShieldOff, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/common/status-badge";
import {
  useDisableTwoFactor,
  useEnableTwoFactor,
  useStartTwoFactorSetup,
  useTwoFactorStatus,
} from "@/lib/queries";

/**
 * Turning two-step sign-in on and off.
 *
 * Enrolment is deliberately three steps rather than one switch: scan, prove a
 * code can be read back, then save the recovery codes. Nothing is switched on
 * until the middle step passes, so a QR that did not scan properly cannot
 * lock somebody out of the console they administer.
 */

export function TwoFactorCard() {
  const { data, isPending } = useTwoFactorStatus();
  const start = useStartTwoFactorSetup();
  const enable = useEnableTwoFactor();
  const disable = useDisableTwoFactor();

  const [qr, setQr] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const on = Boolean(data?.enabled);

  async function begin() {
    try {
      const result = await start.mutateAsync();
      setQr(result.qr);
      setSecret(result.secret);
      setCode("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start setup");
    }
  }

  async function confirm() {
    try {
      const result = await enable.mutateAsync({ token: code.trim() });
      setCodes(result.recoveryCodes);
      setQr(null);
      setSecret(null);
      setCode("");
      setSaved(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That code was not accepted");
    }
  }

  async function turnOff() {
    try {
      await disable.mutateAsync({ password });
      setPassword("");
      toast.success("Two-step sign-in is off");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch it off");
    }
  }

  const copyCodes = async () => {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some browsers; the codes are on screen anyway.
      toast.message("Select the codes and copy them manually.");
    }
  };

  return (
    <Panel
      title="Two-step sign-in"
      description="Ask for a code from your phone as well as your password."
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : codes ? (
        /* Shown once, immediately after switching on, and never again. */
        <div className="space-y-3">
          <Alert>
            <TriangleAlert className="size-4" />
            <AlertDescription>
              <strong>Save these recovery codes now.</strong> They are shown only
              this once. If you lose your phone, these are the only way back into
              the console — nobody can recover them for you.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm sm:grid-cols-2">
            {codes.map((entry) => (
              <span key={entry}>{entry}</span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyCodes}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy all"}
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saved}
                onChange={(event) => setSaved(event.target.checked)}
              />
              I have saved these somewhere safe
            </label>
            <Button
              size="sm"
              className="ml-auto"
              disabled={!saved}
              onClick={() => setCodes(null)}
            >
              Done
            </Button>
          </div>
        </div>
      ) : qr ? (
        <div className="space-y-4">
          <ol className="ml-4 list-decimal space-y-1 text-sm text-muted-foreground">
            <li>Open Microsoft Authenticator (or Google Authenticator / Authy).</li>
            <li>Add an account → Other → scan this code.</li>
            <li>Type the 6-digit code it shows below.</li>
          </ol>

          <div className="flex flex-wrap items-start gap-4">
            <Image
              src={qr}
              alt="Scan this with your authenticator app"
              width={200}
              height={200}
              unoptimized
              className="rounded-lg border border-border bg-white p-2"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <Label className="text-[0.8125rem]">Cannot scan?</Label>
                <p className="mt-1 font-mono text-[0.8125rem] break-all">{secret}</p>
                <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                  Type this key into the app instead.
                </p>
              </div>

              <div className="space-y-1.5 pt-1">
                <Label htmlFor="totp">Code from the app</Label>
                <Input
                  id="totp"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  className="h-10 max-w-40 text-center tracking-[0.3em]"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  disabled={code.trim().length < 6 || enable.isPending}
                  onClick={confirm}
                >
                  {enable.isPending ? "Checking…" : "Turn on"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setQr(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : on ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="active" label="On" />
            <span className="text-sm text-muted-foreground">
              {data?.recoveryCodesRemaining ?? 0} recovery code
              {(data?.recoveryCodesRemaining ?? 0) === 1 ? "" : "s"} left
            </span>
          </div>

          {(data?.recoveryCodesRemaining ?? 0) <= 2 && (
            <Alert>
              <TriangleAlert className="size-4" />
              <AlertDescription>
                You are running low on recovery codes. Switch two-step sign-in off
                and on again to be issued a fresh set.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="off-password" className="text-[0.8125rem]">
                Your password, to switch it off
              </Label>
              <Input
                id="off-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-9 w-56"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!password || disable.isPending}
              onClick={turnOff}
            >
              <ShieldOff className="size-3.5" />
              Switch off
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your password alone opens the console today. With this on, somebody
            who learns your password still cannot sign in without your phone.
          </p>
          <Button onClick={begin} disabled={start.isPending}>
            <ShieldCheck className="size-4" />
            {start.isPending ? "Preparing…" : "Set up two-step sign-in"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
