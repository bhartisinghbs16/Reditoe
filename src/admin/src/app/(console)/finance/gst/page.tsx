"use client";

import * as React from "react";
import { CheckCircle2, FileText, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { MiniMetricCard } from "@/components/dashboard/metric-card";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import {
  useStateGst,
  useSaveStateGst,
  useDeleteStateGst,
  type StateGst,
} from "@/lib/queries";

/**
 * The platform's GST registrations, one per state.
 *
 * These are what an invoice carries. A business registers separately in every
 * state it delivers in, and the invoice for an order has to show the
 * registration for the state that order went to - so this is a register of
 * business facts rather than a settings screen, and it is kept beside the
 * other finance records.
 */

/** The states this platform is most likely to register in first. */
const STATES: { name: string; code: string }[] = [
  { name: "Andhra Pradesh", code: "37" },
  { name: "Telangana", code: "36" },
  { name: "Karnataka", code: "29" },
  { name: "Tamil Nadu", code: "33" },
  { name: "Kerala", code: "32" },
  { name: "Maharashtra", code: "27" },
  { name: "Gujarat", code: "24" },
  { name: "Rajasthan", code: "08" },
  { name: "West Bengal", code: "19" },
  { name: "Delhi", code: "07" },
  { name: "Uttar Pradesh", code: "09" },
  { name: "Madhya Pradesh", code: "23" },
];

const EMPTY = {
  stateName: "",
  stateCode: "",
  gstin: "",
  gstType: "Regular",
  effectiveFrom: "",
  address: "",
  isActive: true,
};

export default function GstPage() {
  const { data } = useStateGst();
  const save = useSaveStateGst();
  const remove = useDeleteStateGst();

  const rows = data?.gst ?? [];
  const summary = data?.summary;

  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);

  /** Selecting a state fills its code in, since the two must agree. */
  const pickState = (name: string) => {
    const known = STATES.find((s) => s.name === name);
    setForm((f) => ({ ...f, stateName: name, stateCode: known?.code ?? f.stateCode }));
  };

  const edit = (row: StateGst) =>
    setForm({
      stateName: row.stateName,
      stateCode: row.stateCode,
      gstin: row.gstin,
      gstType: row.gstType ?? "Regular",
      effectiveFrom: row.effectiveFrom ? row.effectiveFrom.slice(0, 10) : "",
      address: row.address ?? "",
      isActive: row.isActive,
    });

  /**
   * The first two digits of a GSTIN are the state's own code. Checked here so
   * the mistake is visible while typing; the server checks it again, because
   * a screen is not where correctness is decided.
   */
  const codeMismatch =
    form.gstin.length >= 2 &&
    form.stateCode.length === 2 &&
    form.gstin.slice(0, 2) !== form.stateCode;

  const ready =
    form.stateName.trim() !== "" &&
    /^\d{2}$/.test(form.stateCode) &&
    /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z\d]$/.test(form.gstin) &&
    !codeMismatch;

  const submit = () =>
    toast.promise(
      save.mutateAsync(form).then(() => setForm(EMPTY)),
      {
        loading: "Saving…",
        success: `GST details saved for ${form.stateName}`,
        error: (reason) =>
          reason instanceof Error ? reason.message : "Could not save",
      }
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="GST Management"
        description="One GST registration per state. Invoices carry the registration for the state the order was delivered in."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniMetricCard label="States registered" value={String(summary?.total ?? 0)} icon={FileText} />
        <MiniMetricCard label="Active" value={String(summary?.active ?? 0)} icon={CheckCircle2} tone="green" />
        <MiniMetricCard label="Inactive" value={String(summary?.inactive ?? 0)} icon={XCircle} tone="amber" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="State-wise GST list">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No GST registrations yet. Add the first one on the right.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">State</th>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 font-medium">GSTIN</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Effective</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row._id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 font-medium">{row.stateName}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.stateCode}</td>
                      <td className="py-2 pr-3 font-mono text-[0.8125rem]">{row.gstin}</td>
                      <td className="py-2 pr-3">
                        <StatusBadge
                          tone={row.isActive ? "success" : "danger"}
                          label={row.isActive ? "Active" : "Inactive"}
                        />
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {row.effectiveFrom ? row.effectiveFrom.slice(0, 10) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => edit(row)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              toast.promise(remove.mutateAsync({ id: row._id }), {
                                loading: "Removing…",
                                success: `Removed ${row.stateName}`,
                                error: "Could not remove",
                              })
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={form.stateName ? `GST details — ${form.stateName}` : "Add GST registration"}>
          <div className="space-y-3">
            <label className="block text-[0.8125rem]">
              <span className="mb-1 block text-muted-foreground">State</span>
              <select
                value={form.stateName}
                onChange={(event) => pickState(event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">Select a state…</option>
                {STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[0.8125rem]">
                <span className="mb-1 block text-muted-foreground">State code</span>
                <input
                  value={form.stateCode}
                  onChange={(event) =>
                    setForm((f) => ({
                      ...f,
                      stateCode: event.target.value.replace(/\D/g, "").slice(0, 2),
                    }))
                  }
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm tabular-nums"
                />
              </label>

              <label className="block text-[0.8125rem]">
                <span className="mb-1 block text-muted-foreground">GST type</span>
                <select
                  value={form.gstType}
                  onChange={(event) => setForm((f) => ({ ...f, gstType: event.target.value }))}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  {["Regular", "Composition", "Casual", "Non-Resident"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-[0.8125rem]">
              <span className="mb-1 block text-muted-foreground">GSTIN</span>
              <input
                value={form.gstin}
                onChange={(event) =>
                  setForm((f) => ({ ...f, gstin: event.target.value.toUpperCase().slice(0, 15) }))
                }
                placeholder="37AABCR1234A1Z5"
                className="h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-sm"
              />
              {codeMismatch && (
                <span className="mt-1 block text-[0.75rem] text-destructive">
                  A GSTIN for this state must begin with {form.stateCode}.
                </span>
              )}
            </label>

            <label className="block text-[0.8125rem]">
              <span className="mb-1 block text-muted-foreground">Effective from</span>
              <input
                type="date"
                value={form.effectiveFrom}
                onChange={(event) => setForm((f) => ({ ...f, effectiveFrom: event.target.value }))}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              />
            </label>

            <label className="block text-[0.8125rem]">
              <span className="mb-1 block text-muted-foreground">Address as per GST</span>
              <textarea
                value={form.address}
                onChange={(event) => setForm((f) => ({ ...f, address: event.target.value }))}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>

            <label className="flex items-center gap-2 text-[0.8125rem]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((f) => ({ ...f, isActive: event.target.checked }))}
              />
              <span>Registration is active</span>
            </label>

            <div className="flex gap-2 pt-1">
              <Button onClick={submit} disabled={!ready || save.isPending}>
                Save GST details
              </Button>
              <Button variant="outline" onClick={() => setForm(EMPTY)}>
                Clear
              </Button>
            </div>

            <p className="pt-1 text-[0.75rem] text-muted-foreground">
              Each state has one GSTIN — saving a state again replaces it. The
              number is checked for shape and against the state it is filed
              under; whether it is genuine is the GST portal&apos;s business.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
