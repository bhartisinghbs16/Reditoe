"use client";

import * as React from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Generates the partner's earnings & payout statement for a billing period.
 * Defaults to the last seven days; the PDF is built on request and nothing is
 * saved or paid by asking for it.
 */
export function PayoutStatementButton({ riderId }: { riderId: string }) {
  const [to, setTo] = React.useState(() => isoDay(new Date()));
  const [from, setFrom] = React.useState(() =>
    isoDay(new Date(Date.now() - 6 * 86400000))
  );
  const [busy, setBusy] = React.useState(false);

  async function generate() {
    setBusy(true);
    try {
      await api.download(
        `/admin/riders/${riderId}/payout-statement`,
        `payout-statement-${from}_${to}.pdf`,
        { query: { from, to } }
      );
      toast.success("Payout statement generated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not generate the statement"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        aria-label="Billing period from"
        value={from}
        max={to}
        onChange={(e) => setFrom(e.target.value)}
        className="h-10 w-[9.5rem]"
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="Billing period to"
        value={to}
        min={from}
        onChange={(e) => setTo(e.target.value)}
        className="h-10 w-[9.5rem]"
      />
      <Button variant="outline" size="lg" disabled={busy || !from || !to} onClick={generate}>
        <FileText className="size-4" />
        {busy ? "Generating…" : "Generate payout"}
      </Button>
    </div>
  );
}
