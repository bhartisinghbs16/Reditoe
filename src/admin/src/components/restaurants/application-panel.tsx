"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, FileText, History, PencilLine, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApproveRestaurant, type ApplicationDecision } from "@/lib/queries";
import type { Restaurant } from "@/lib/types";

/**
 * Deciding a vendor application.
 *
 * The console had no real approval control: one dropdown item, shown only when
 * `isApproved` was false — a field that defaults to true, so in practice it
 * never appeared. An application could not be rejected at all, and there was
 * nowhere to say why.
 *
 * Approving puts the restaurant in front of customers; rejecting and asking for
 * a correction both require a reason, because the vendor is shown it verbatim
 * and it is the only thing they can act on.
 */

const DECISION_COPY: Record<
  Exclude<ApplicationDecision, "pending">,
  { title: string; description: string; cta: string; needsReason: boolean }
> = {
  approved: {
    title: "Approve this application?",
    description:
      "The restaurant becomes visible to customers and the vendor gets their dashboard.",
    cta: "Approve",
    needsReason: false,
  },
  rejected: {
    title: "Reject this application",
    description:
      "The vendor is shown this reason and can correct their details and submit again.",
    cta: "Reject",
    needsReason: true,
  },
  correction_requested: {
    title: "Ask for a correction",
    description:
      "Say what needs changing. The vendor keeps their account and can resubmit.",
    cta: "Request correction",
    needsReason: true,
  },
};

/** The application's state, in words, for the badge. */
function statusTone(status?: string) {
  if (status === "approved") return { tone: "success" as const, label: "Approved" };
  if (status === "rejected") return { tone: "danger" as const, label: "Rejected" };
  if (status === "correction_requested")
    return { tone: "warning" as const, label: "Correction requested" };
  return { tone: "warning" as const, label: "Pending review" };
}

function when(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApplicationPanel({ restaurant }: { restaurant: Restaurant }) {
  const approve = useApproveRestaurant();
  const [pending, setPending] = React.useState<Exclude<
    ApplicationDecision,
    "pending"
  > | null>(null);
  const [reason, setReason] = React.useState("");

  const state = statusTone(restaurant.status);
  const history = restaurant.approvalHistory ?? [];
  const copy = pending ? DECISION_COPY[pending] : null;
  const ready = copy ? !copy.needsReason || reason.trim().length > 0 : false;

  function open(decision: Exclude<ApplicationDecision, "pending">) {
    setReason("");
    setPending(decision);
  }

  async function submit() {
    if (!pending || !copy) return;
    try {
      await approve.mutateAsync({
        id: restaurant._id,
        status: pending,
        reason: reason.trim() || undefined,
      });
      toast.success(
        pending === "approved"
          ? "Application approved"
          : pending === "rejected"
            ? "Application rejected"
            : "Correction requested"
      );
      setPending(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the application");
    }
  }

  return (
    <>
      <Panel
        title="Application"
        description="Approval decides whether this restaurant is visible to customers and whether the vendor can use their dashboard."
        action={<StatusBadge tone={state.tone} label={state.label} />}
      >
        <dl className="grid gap-3 text-[0.8125rem] sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Submitted</dt>
            <dd className="mt-0.5 font-medium">
              {when(restaurant.submittedAt ?? restaurant.createdAt) ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last decision</dt>
            <dd className="mt-0.5 font-medium">{when(restaurant.statusChangedAt) ?? "—"}</dd>
          </div>
        </dl>

        {/* The reason matters most when it is the thing blocking the vendor. */}
        {restaurant.statusReason && (
          <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[0.8125rem]">
            <span className="font-medium">Reason given: </span>
            {restaurant.statusReason}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={approve.isPending || restaurant.status === "approved"}
            onClick={() => open("approved")}
          >
            <CheckCircle2 className="size-4" />
            Approve
          </Button>
          <Button
            variant="outline"
            disabled={approve.isPending || restaurant.status === "correction_requested"}
            onClick={() => open("correction_requested")}
          >
            <PencilLine className="size-4" />
            Request correction
          </Button>
          <Button
            variant="outline"
            disabled={approve.isPending || restaurant.status === "rejected"}
            onClick={() => open("rejected")}
          >
            <XCircle className="size-4" />
            Reject
          </Button>
          <Button asChild variant="outline">
            <Link href={`/restaurants/${restaurant._id}/documents`}>
              <FileText className="size-4" />
              View documents
            </Link>
          </Button>
        </div>
      </Panel>

      <Panel
        title="Approval history"
        description="Every decision on this application, oldest first."
      >
        {history.length === 0 ? (
          <p className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
            <History className="size-4" />
            No decisions yet — the application is waiting for its first review.
          </p>
        ) : (
          <ol className="space-y-3">
            {history.map((entry, index) => (
              <li key={index} className="flex gap-3 text-[0.8125rem]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                <div className="min-w-0">
                  <p className="font-medium capitalize">
                    {(entry.status ?? "").replace("_", " ")}
                    {entry.by && (
                      <span className="font-normal text-muted-foreground"> · {entry.by}</span>
                    )}
                  </p>
                  {entry.reason && (
                    <p className="text-muted-foreground">{entry.reason}</p>
                  )}
                  <p className="text-[0.75rem] text-muted-foreground">{when(entry.at) ?? ""}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Dialog open={pending !== null} onOpenChange={(next) => !next && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy?.title}</DialogTitle>
            <DialogDescription>{copy?.description}</DialogDescription>
          </DialogHeader>

          {copy?.needsReason && (
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. The FSSAI certificate is unreadable — please upload a clearer scan."
                rows={3}
              />
              <p className="text-[0.75rem] text-muted-foreground">
                Shown to the vendor exactly as written.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button disabled={!ready || approve.isPending} onClick={submit}>
              {copy?.cta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
