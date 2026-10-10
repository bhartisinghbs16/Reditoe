"use client";

import * as React from "react";
import { MessageSquareOff } from "lucide-react";
import { api } from "@/lib/api";

/**
 * What the customer and their delivery partner said to each other.
 *
 * Exists to settle the arguments that follow a bad delivery - "the rider
 * never called", "nobody was at the address" - so it shows who said what and
 * whether the other side had seen it. Read-only: an admin typing into the
 * middle of somebody else's conversation would make the record worth less,
 * not more.
 */

interface Conversation {
  orderNumber?: string | null;
  customer?: { name?: string; phone?: string } | null;
  rider?: { name?: string; phone?: string } | null;
  messages: {
    sender: "customer" | "rider";
    message: string;
    sentAt?: string;
    readAt?: string | null;
  }[];
}

const clock = (value?: string) =>
  value
    ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

export function OrderConversation({ orderId }: { orderId: string }) {
  const [chat, setChat] = React.useState<Conversation | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<Conversation>(`/admin/orders/${orderId}/chat`)
      .then((data) => !cancelled && setChat(data))
      .catch(() => !cancelled && setError("Could not load this conversation."));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }

  if (!chat) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (chat.messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
        <MessageSquareOff className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nothing was said between the customer and the delivery partner on this
          order.
        </p>
      </div>
    );
  }

  const customer = chat.customer?.name ?? "Customer";
  const rider = chat.rider?.name ?? "Delivery partner";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-muted-foreground/40" />
          {customer}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-primary" />
          {rider}
        </span>
      </div>

      <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3">
        {chat.messages.map((entry, index) => {
          const fromRider = entry.sender === "rider";
          return (
            <div
              key={`${entry.sentAt ?? index}-${index}`}
              className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                fromRider
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto border border-border bg-card"
              }`}
            >
              <div
                className={`mb-0.5 text-[0.6875rem] font-semibold ${
                  fromRider ? "text-primary-foreground/75" : "text-muted-foreground"
                }`}
              >
                {fromRider ? rider : customer}
                {entry.sentAt ? ` · ${clock(entry.sentAt)}` : ""}
              </div>
              <p className="whitespace-pre-wrap">{entry.message}</p>
              {/*
                Seen or not is the whole point when somebody says they were
                never told something.
              */}
              <div
                className={`mt-0.5 text-[0.625rem] ${
                  fromRider ? "text-primary-foreground/70" : "text-muted-foreground"
                }`}
              >
                {entry.readAt ? `Seen ${clock(entry.readAt)}` : "Not seen"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
