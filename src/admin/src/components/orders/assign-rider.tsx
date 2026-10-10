"use client";

import * as React from "react";
import { Bike, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { useAssignRider, useRiders } from "@/lib/queries";
import type { Rider } from "@/lib/types";

/**
 * Putting an order on a rider by hand.
 *
 * Dispatch offers an order round the riders nearby and gives up when nobody
 * takes it. Until now that was the end of the road: an order nobody accepted
 * sat there saying "No delivery partner assigned yet" with nothing on the
 * screen to do about it, and the only way out was the database. This is the
 * way out.
 *
 * Free riders are listed before busy ones because that is the order a
 * dispatcher wants them in, but a busy rider is still listed - somebody
 * finishing a drop two streets away is often the right answer, and the
 * console should not decide that for the person watching the map.
 */

const eligible = (rider: Rider) =>
  !rider.isBlocked && (rider.status ?? "active") === "active" && rider.kycStatus !== "rejected";

/** Free first, then online, then everyone else; alphabetical within each. */
function rank(rider: Rider): number {
  if (rider.isOnline && !rider.currentOrderId) return 0;
  if (rider.isOnline) return 1;
  return 2;
}

export function AssignRiderButton({
  orderId,
  assigned,
  disabled,
}: {
  orderId: string;
  /** Whether this order already has a rider — changes the wording, not the action. */
  assigned?: boolean;
  /** A delivered or cancelled order has nobody left to assign. */
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [chosen, setChosen] = React.useState<string | null>(null);

  const { data, isLoading } = useRiders({ limit: 200 });
  const assign = useAssignRider();

  const riders = React.useMemo(() => {
    const all = (data?.items ?? []).filter(eligible);
    const needle = term.trim().toLowerCase();
    const matched = needle
      ? all.filter((rider) =>
          [rider.name, rider.phone, rider.riderId, rider.vehicleNumber]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(needle))
        )
      : all;
    return [...matched].sort(
      (a, b) => rank(a) - rank(b) || (a.name ?? "").localeCompare(b.name ?? "")
    );
  }, [data, term]);

  async function submit() {
    if (!chosen) return;
    try {
      await assign.mutateAsync({ id: orderId, riderId: chosen });
      toast.success("Order assigned");
      setOpen(false);
      setChosen(null);
      setTerm("");
    } catch (error) {
      // The server refuses a blocked, inactive or KYC-rejected rider, and says
      // which — that message is more use than anything invented here.
      toast.error(error instanceof Error ? error.message : "Could not assign this rider");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={assigned ? "outline" : "default"} size="sm" disabled={disabled}>
          <Bike className="size-3.5" />
          {assigned ? "Reassign partner" : "Assign a partner"}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {assigned ? "Move this order to another partner" : "Assign a delivery partner"}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by name, phone or vehicle number"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading partners…</p>
          ) : riders.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {term
                ? "No partner matches that."
                : "There are no active partners to assign. Approve or unblock a partner first."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {riders.map((rider) => {
                const busy = Boolean(rider.currentOrderId);
                const picked = chosen === rider._id;
                return (
                  <li key={rider._id}>
                    <button
                      type="button"
                      onClick={() => setChosen(rider._id)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 ${
                        picked ? "bg-muted" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {rider.name ?? "Partner"}
                        </div>
                        <div className="truncate text-[0.75rem] text-muted-foreground">
                          {[rider.phone, rider.vehicleNumber].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      <StatusBadge
                        status={busy ? "pending" : rider.isOnline ? "online" : "offline"}
                        label={busy ? "On a delivery" : rider.isOnline ? "Free" : "Offline"}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!chosen || assign.isPending} onClick={submit}>
            {assign.isPending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
