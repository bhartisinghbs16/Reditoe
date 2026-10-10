"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, LogOut, PencilLine, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { fetchApplication, resubmitApplication } from "@/lib/vendor-api";

/**
 * What a vendor sees before they are approved.
 *
 * Signing in and being approved are separate questions, so a vendor whose
 * application is still with us reaches the console and is told where it stands
 * rather than being turned away at the door or dropped into a dashboard for a
 * restaurant that is not live yet.
 *
 * `access` comes from the server rather than being derived from the status
 * here, so the two cannot drift apart.
 */

function Frame({
  icon,
  tone,
  headline,
  children,
}: {
  icon: React.ReactNode;
  tone: "wait" | "warn";
  headline: string;
  children: React.ReactNode;
}) {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center text-2xl font-extrabold tracking-tight text-primary">
          Reditoe
        </div>

        <div className="surface p-6">
          <div
            className={`flex size-11 items-center justify-center rounded-full ${
              tone === "wait"
                ? "bg-warning-muted text-warning-foreground"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {icon}
          </div>

          <h1 className="mt-4 text-xl font-semibold tracking-tight">{headline}</h1>
          {children}

          <div className="mt-6 border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ApplicationGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [note, setNote] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["vendor-application"],
    queryFn: fetchApplication,
    // The vendor is waiting on somebody else, so look again periodically
    // rather than making them reload to find out they were approved.
    refetchInterval: 60_000,
  });

  async function resubmit() {
    setSending(true);
    try {
      await resubmitApplication(note.trim() || undefined);
      toast.success("Application resubmitted");
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["vendor-application"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resubmit");
    } finally {
      setSending(false);
    }
  }

  // Nothing decisive yet — showing the dashboard and snatching it back is
  // worse than a moment of nothing.
  if (isLoading) return null;

  // No answer at all (the endpoint is unreachable) is not a refusal. Let the
  // console through and let its own screens report the outage.
  if (!data) return <>{children}</>;

  if (data.access === "dashboard" || data.access === "none") return <>{children}</>;

  const rejected = data.access === "rejected";

  return (
    <Frame
      icon={rejected ? <TriangleAlert className="size-5" /> : <Clock className="size-5" />}
      tone={rejected ? "warn" : "wait"}
      headline={data.headline}
    >
      <p className="mt-2 text-sm/relaxed text-muted-foreground">{data.body}</p>

      {data.restaurantName && (
        <p className="mt-3 text-[0.8125rem]">
          <span className="text-muted-foreground">Application for </span>
          <span className="font-medium">{data.restaurantName}</span>
        </p>
      )}

      {/* The reason is the whole point of the screen when there is one. */}
      {data.reason && (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-[0.75rem] font-medium text-muted-foreground">
            {rejected ? "Reason for rejection" : "What needs changing"}
          </p>
          <p className="mt-1 text-[0.875rem]">{data.reason}</p>
        </div>
      )}

      {data.canResubmit ? (
        <div className="mt-5 space-y-2">
          <Label htmlFor="note">Anything to tell the reviewer? (optional)</Label>
          <Textarea
            id="note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. I have uploaded a clearer copy of the FSSAI certificate."
          />
          <p className="text-[0.75rem] text-muted-foreground">
            Correct the details on your application first, then send it back for review.
          </p>
          <Button className="w-full" disabled={sending} onClick={resubmit}>
            <PencilLine className="size-4" />
            {sending ? "Sending…" : "Submit for review again"}
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="mt-5" onClick={() => void refetch()}>
          <RefreshCw className="size-4" />
          Check again
        </Button>
      )}
    </Frame>
  );
}
