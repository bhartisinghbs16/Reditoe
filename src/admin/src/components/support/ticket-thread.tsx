"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/common/status-badge";
import {
  useReplyToTicket,
  useSetTicketStatus,
  useSupportTicket,
} from "@/lib/queries";
import { relativeTime } from "@/lib/format";

/**
 * Reading and answering one support ticket.
 *
 * The support page listed tickets and stopped there: no way to open one, read
 * what was said, or reply. Customers, vendors and partners could all write in
 * from their apps and nobody could answer them, which is worse than having no
 * support button at all - it takes a complaint and swallows it.
 */

const STATUSES = [
  { value: "in-progress", label: "Being looked at" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Close" },
];

const TONE: Record<string, { label: string }> = {
  open: { label: "Open" },
  "in-progress": { label: "Being looked at" },
  resolved: { label: "Resolved" },
  closed: { label: "Closed" },
};

export function TicketThread({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  const { data, isPending } = useSupportTicket(ticketId);
  const reply = useReplyToTicket();
  const setStatus = useSetTicketStatus();

  const [draft, setDraft] = React.useState("");
  const foot = React.useRef<HTMLDivElement | null>(null);

  const ticket = data?.ticket ?? data;

  // New replies land at the bottom; the newest message is the one being read.
  React.useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" });
  }, [ticket?.conversation?.length]);

  React.useEffect(() => {
    if (!ticketId) setDraft("");
  }, [ticketId]);

  const thread = ticket?.conversation?.length
    ? ticket.conversation
    : ticket
      ? [{ message: ticket.message, sender: "user" as const, timestamp: ticket.createdAt }]
      : [];

  const who =
    typeof ticket?.userId === "object" && ticket?.userId
      ? (ticket.userId.name ?? ticket.userId.email ?? "Customer")
      : "Customer";

  async function send() {
    const text = draft.trim();
    if (!text || !ticketId) return;
    setDraft("");
    try {
      await reply.mutateAsync({ id: ticketId, message: text });
    } catch (error) {
      setDraft(text);
      toast.error(error instanceof Error ? error.message : "Could not send that reply");
    }
  }

  const closed = ticket?.status === "closed";

  return (
    <Dialog open={Boolean(ticketId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate">{ticket?.subject ?? "Ticket"}</span>
            {ticket && (
              <StatusBadge
                status={ticket.status}
                label={TONE[ticket.status]?.label ?? ticket.status}
              />
            )}
          </DialogTitle>
          {ticket && (
            <p className="text-[0.8125rem] text-muted-foreground">
              From {who}
              {ticket.createdAt ? ` · raised ${relativeTime(ticket.createdAt)}` : ""}
            </p>
          )}
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            thread.map((entry, index) => {
              const fromUs = entry.sender === "admin";
              return (
                <div
                  key={`${entry.timestamp ?? index}-${index}`}
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    fromUs
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto border border-border bg-card"
                  }`}
                >
                  {!fromUs && (
                    <div className="mb-0.5 text-[0.6875rem] font-semibold text-muted-foreground">
                      {who}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{entry.message}</p>
                </div>
              );
            })
          )}
          <div ref={foot} />
        </div>

        {closed ? (
          <p className="text-sm text-muted-foreground">
            This ticket is closed. Set another status to reopen it before replying.
          </p>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type your reply — this appears in their app."
              rows={3}
              // Enter sends, shift+Enter for a new line: replies are short, and
              // reaching for the mouse for every one of them wears thin.
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={send} disabled={!draft.trim() || reply.isPending}>
                <Send className="size-3.5" />
                {reply.isPending ? "Sending…" : "Send reply"}
              </Button>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {STATUSES.filter((option) => option.value !== ticket?.status).map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant="outline"
                    disabled={!ticketId || setStatus.isPending}
                    onClick={async () => {
                      try {
                        await setStatus.mutateAsync({
                          id: ticketId!,
                          status: option.value,
                        });
                        toast.success(`Marked ${option.label.toLowerCase()}`);
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Could not update status"
                        );
                      }
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
