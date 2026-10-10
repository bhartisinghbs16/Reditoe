"use client";

import * as React from "react";
import { IndianRupee, Percent } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useRestaurantCharges,
  useUpdateRestaurantCharges,
  type ScaledCharge,
  type VendorCharges,
} from "@/lib/queries";

/**
 * What this vendor is charged.
 *
 * Every vendor is negotiated with separately, so each charge carries its own
 * switch, its own figure and its own GST rate, and saving here touches this
 * restaurant alone.
 *
 * Commission and the convenience fee can each be a percentage of the food or
 * a flat amount, because both are agreed both ways in practice. Packing is
 * only ever flat: it is what the customer was charged, not a share of the
 * order.
 *
 * GST is always shown as its own line rather than folded into the figure
 * beside it - which is how the vendor will read it on a statement they are
 * checking, and how the client asked for it.
 */

type ScaledKey = "commission" | "convenience";

const SCALED: { key: ScaledKey; label: string; hint: string }[] = [
  {
    key: "commission",
    label: "Reditoe commission",
    hint: "The platform's share of each order.",
  },
  {
    key: "convenience",
    label: "Convenience fee",
    hint: "Platform fee, borne by this vendor.",
  },
];

function ChargeRow({
  label,
  hint,
  charge,
  onChange,
}: {
  label: string;
  hint: string;
  charge: ScaledCharge;
  onChange: (patch: Partial<ScaledCharge>) => void;
}) {
  const percent = charge.mode === "percentage";
  return (
    <div className="space-y-2.5 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <Label className="text-[0.8125rem]">{label}</Label>
          <p className="mt-0.5 text-[0.75rem] text-muted-foreground">{hint}</p>
        </div>
        <Switch
          checked={charge.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
          aria-label={`Charge ${label}`}
        />
      </div>

      {charge.enabled && (
        <div className="flex flex-wrap items-end gap-3 pl-0.5">
          {/* Percentage or a flat amount — the same decision, two prices. */}
          <div className="flex rounded-md border border-border p-0.5">
            {(["percentage", "fixed"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ mode })}
                className={`rounded px-2.5 py-1 text-[0.75rem] font-medium ${
                  charge.mode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {mode === "percentage" ? "Percentage" : "Fixed ₹"}
              </button>
            ))}
          </div>

          <div className="relative w-28">
            <Input
              type="number"
              min={0}
              max={percent ? 100 : 100000}
              value={String(percent ? charge.percentage : charge.amount)}
              onChange={(event) =>
                onChange(
                  percent
                    ? { percentage: Number(event.target.value) }
                    : { amount: Number(event.target.value) }
                )
              }
            />
            {percent ? (
              <Percent className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            ) : (
              <IndianRupee className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            )}
          </div>

          <div className="flex items-end gap-2">
            <div>
              <Label className="text-[0.75rem] text-muted-foreground">GST on this</Label>
              <div className="relative mt-1 w-24">
                <Input
                  type="number"
                  min={0}
                  max={30}
                  disabled={!charge.gstEnabled}
                  value={String(charge.gstPercentage)}
                  onChange={(event) =>
                    onChange({ gstPercentage: Number(event.target.value) })
                  }
                />
                <Percent className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <Switch
              className="mb-2"
              checked={charge.gstEnabled}
              onCheckedChange={(gstEnabled) => onChange({ gstEnabled })}
              aria-label={`GST on ${label}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function ChargesPanel({ restaurantId }: { restaurantId: string }) {
  const { data, isLoading } = useRestaurantCharges(restaurantId);
  const save = useUpdateRestaurantCharges(restaurantId);

  const [draft, setDraft] = React.useState<VendorCharges | null>(null);

  React.useEffect(() => {
    if (data?.charges) setDraft(data.charges);
  }, [data]);

  if (isLoading || !draft) {
    return (
      <Panel title="Charges">
        <p className="text-[0.8125rem] text-muted-foreground">Loading terms…</p>
      </Panel>
    );
  }

  /**
   * `configured` is a boolean on the same object as the charge groups, so a
   * generic key over the whole shape includes something that cannot be
   * spread. Narrowed to the groups, which are the only things ever patched.
   */
  type ChargeKey = Exclude<keyof VendorCharges, "configured">;

  const patch = <K extends ChargeKey>(key: K, value: Partial<VendorCharges[K]>) =>
    setDraft((current) =>
      current ? { ...current, [key]: { ...current[key], ...value } } : current
    );

  async function submit() {
    if (!draft) return;
    try {
      await save.mutateAsync({
        commission: draft.commission,
        convenience: draft.convenience,
        packing: draft.packing,
        gst: draft.gst,
      });
      toast.success("Charges updated for this vendor");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save charges");
    }
  }

  /**
   * A worked example beats a paragraph. The figures move as they are typed,
   * on a round number an admin can check in their head.
   */
  const sample = 1000;
  const scaled = (charge: ScaledCharge) =>
    !charge.enabled
      ? { value: 0, gst: 0 }
      : (() => {
          const value =
            charge.mode === "fixed" ? charge.amount : (sample * charge.percentage) / 100;
          return { value, gst: charge.gstEnabled ? (value * charge.gstPercentage) / 100 : 0 };
        })();

  const commission = scaled(draft.commission);
  const convenience = scaled(draft.convenience);
  const foodGst = draft.gst.enabled ? (sample * draft.gst.percentage) / 100 : 0;
  const packing = draft.packing.enabled ? draft.packing.amount : 0;
  const packingGst =
    packing && draft.packing.gstEnabled ? (packing * draft.packing.gstPercentage) / 100 : 0;

  const payout = Math.max(
    0,
    sample + packing - commission.value - commission.gst - convenience.value -
      convenience.gst - foodGst - packingGst
  );

  return (
    <Panel
      title="Charges"
      description="What this vendor is charged. These terms apply to this restaurant only."
    >
      {!draft.configured && (
        <p className="mb-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[0.75rem] text-muted-foreground">
          No terms have been set for this vendor yet, so they are settled on the
          platform-wide figures shown below. Saving gives them their own terms.
        </p>
      )}

      <div className="flex flex-col divide-y divide-border">
        {SCALED.map((row) => (
          <ChargeRow
            key={row.key}
            label={row.label}
            hint={row.hint}
            charge={draft[row.key]}
            onChange={(value) => patch(row.key, value)}
          />
        ))}

        {/* Packing is flat by nature — it is what the customer was charged. */}
        <div className="space-y-2.5 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <Label className="text-[0.8125rem]">Packing charge</Label>
              <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                Added to the customer&apos;s bill and paid back to this vendor.
              </p>
            </div>
            <Switch
              checked={draft.packing.enabled}
              onCheckedChange={(enabled) => patch("packing", { enabled })}
              aria-label="Charge packing"
            />
          </div>

          {draft.packing.enabled && (
            <div className="flex flex-wrap items-end gap-3 pl-0.5">
              <div className="relative w-28">
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  value={String(draft.packing.amount)}
                  onChange={(event) =>
                    patch("packing", { amount: Number(event.target.value) })
                  }
                />
                <IndianRupee className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <div className="flex items-end gap-2">
                <div>
                  <Label className="text-[0.75rem] text-muted-foreground">GST on this</Label>
                  <div className="relative mt-1 w-24">
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      disabled={!draft.packing.gstEnabled}
                      value={String(draft.packing.gstPercentage)}
                      onChange={(event) =>
                        patch("packing", { gstPercentage: Number(event.target.value) })
                      }
                    />
                    <Percent className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
                <Switch
                  className="mb-2"
                  checked={draft.packing.gstEnabled}
                  onCheckedChange={(gstEnabled) => patch("packing", { gstEnabled })}
                  aria-label="GST on packing"
                />
              </div>
            </div>
          )}
        </div>

        {/* GST on the food itself, which is a tax rather than a fee. */}
        <div className="flex flex-wrap items-center gap-3 py-3.5">
          <div className="min-w-0 flex-1">
            <Label className="text-[0.8125rem]">GST on food</Label>
            <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
              Collected on the vendor&apos;s behalf and paid to the authority.
            </p>
          </div>
          <div className="relative w-24">
            <Input
              type="number"
              min={0}
              max={30}
              disabled={!draft.gst.enabled}
              value={String(draft.gst.percentage)}
              onChange={(event) => patch("gst", { percentage: Number(event.target.value) })}
            />
            <Percent className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Switch
            checked={draft.gst.enabled}
            onCheckedChange={(enabled) => patch("gst", { enabled })}
            aria-label="Charge GST on food"
          />
        </div>
      </div>

      <div className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-[0.8125rem]">
        <span className="text-muted-foreground">On a ₹1,000 order this vendor is paid </span>
        <span className="font-semibold">₹{payout.toFixed(2)}</span>
      </div>

      <Button size="sm" className="mt-4" disabled={save.isPending} onClick={submit}>
        {save.isPending ? "Saving…" : "Save charges"}
      </Button>
    </Panel>
  );
}
