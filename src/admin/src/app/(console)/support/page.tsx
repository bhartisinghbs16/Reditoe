"use client";

import * as React from "react";
import { CircleCheck, Clock, Headset, Plus, TriangleAlert } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { useSupportTickets } from "@/lib/queries";
import { TicketThread } from "@/components/support/ticket-thread";
import { useListState } from "@/lib/use-list-state";
import { PRIORITY_OPTIONS, TICKET_STATUS_OPTIONS } from "@/lib/domain";
import { number as formatNumber, relativeTime, titleCase } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, SupportTicket } from "@/lib/types";

/** Priority is a severity scale, so it wears status tones rather than series colours. */
function priorityTone(priority?: string) {
  switch ((priority ?? "").toLowerCase()) {
    case "urgent":
      return "danger" as const;
    case "high":
      return "warning" as const;
    case "medium":
      return "info" as const;
    default:
      return "neutral" as const;
  }
}

export default function SupportPage() {
  const list = useListState({ status: "", priority: "" });
  const tickets = useSupportTickets(list.params);
  /** The ticket whose thread is open, if any. */
  const [reading, setReading] = React.useState<string | null>(null);

  const columns: Column<SupportTicket>[] = [
    {
      id: "ticket",
      header: "Ticket",
      cell: (ticket) => (
        <StackedCell
          primary={ticket.subject ?? "Untitled"}
          /* The reference the person on the other end can quote, ahead of
             the database id nobody reads out. */
          secondary={
            ticket.ticketNumber ?? ticket.ticketId ?? ticket._id.slice(-8).toUpperCase()
          }
        />
      ),
    },
    {
      id: "requester",
      header: "Raised by",
      hideBelow: "md",
      cell: (ticket) => {
        const customer = refDoc<Customer>(ticket.userId);
        return (
          <IdentityCell
            name={customer?.name ?? titleCase(ticket.raisedBy) ?? "—"}
            secondary={customer?.email}
          />
        );
      },
    },
    {
      id: "category",
      header: "Category",
      hideBelow: "lg",
      cell: (ticket) => titleCase(ticket.category),
    },
    {
      id: "priority",
      header: "Priority",
      cell: (ticket) => (
        <StatusBadge
          tone={priorityTone(ticket.priority)}
          label={titleCase(ticket.priority)}
        />
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (ticket) => <StatusBadge status={ticket.status} />,
    },
    {
      id: "updated",
      header: "Updated",
      hideBelow: "lg",
      cell: (ticket) => relativeTime(ticket.updatedAt ?? ticket.createdAt),
    },
  ];

  const rows = tickets.data?.items ?? [];
  const countBy = (predicate: (ticket: SupportTicket) => boolean) =>
    formatNumber(rows.filter(predicate).length);

  return (
    <>
    <ResourceListPage
      title="Support tickets"
      description="Customer and vendor issues, ordered by how urgently they need a reply."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Support" }]}
      /* "New ticket" had no handler and no endpoint behind it: a ticket is
         opened by a customer or a vendor from their own app, and the console
         replies to it. */
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Total tickets"
            value={formatNumber(tickets.data?.total)}
            icon={Headset}
            tone="indigo"
            loading={tickets.isPending}
          />
          <StatCard
            label="Open (page)"
            value={countBy((ticket) => ticket.status === "open")}
            icon={Clock}
            tone="amber"
            loading={tickets.isPending}
          />
          <StatCard
            label="Urgent (page)"
            value={countBy((ticket) => ticket.priority === "urgent")}
            icon={TriangleAlert}
            tone="rose"
            loading={tickets.isPending}
          />
          <StatCard
            label="Resolved (page)"
            value={countBy(
              (ticket) => ticket.status === "resolved" || ticket.status === "closed"
            )}
            icon={CircleCheck}
            tone="emerald"
            loading={tickets.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search subject or ticket ID…"
          />
          <FilterSelect
            value={list.filters.status ?? ""}
            onChange={(value) => list.setFilter("status", value)}
            options={TICKET_STATUS_OPTIONS}
            placeholder="All statuses"
            allLabel="All statuses"
          />
          <FilterSelect
            value={list.filters.priority ?? ""}
            onChange={(value) => list.setFilter("priority", value)}
            options={PRIORITY_OPTIONS}
            placeholder="All priorities"
            allLabel="All priorities"
          />
        </>
      }
      columns={columns}
      query={tickets}
      list={list}
      rowKey={(ticket) => ticket._id}
      emptyTitle="No tickets match these filters"
      emptyDescription="Nothing needs attention right now."
      onRowClick={(ticket) => setReading(ticket._id)}
    />
    <TicketThread ticketId={reading} onClose={() => setReading(null)} />
    </>
  );
}
