"use client";

import * as React from "react";
import { BellRing, Eye, Plus, Send } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { useCreateNotification, useNotifications } from "@/lib/queries";
import { CreateDialog } from "@/components/common/create-dialog";
import { useListState } from "@/lib/use-list-state";
import {
  dateTime,
  number as formatNumber,
  percent,
  relativeTime,
  titleCase,
} from "@/lib/format";
import type { NotificationRecord } from "@/lib/types";

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "customers", label: "Customers" },
  { value: "vendors", label: "Vendors" },
  { value: "riders", label: "Delivery partners" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
];

export default function PushNotificationsPage() {
  const list = useListState({ audience: "", status: "" });
  const notifications = useNotifications(list.params);
  const createNotification = useCreateNotification();
  const [composing, setComposing] = React.useState(false);

  const columns: Column<NotificationRecord>[] = [
    {
      id: "notification",
      header: "Notification",
      className: "max-w-md",
      cell: (notification) => (
        <StackedCell
          primary={notification.title ?? "Untitled"}
          secondary={notification.message}
        />
      ),
    },
    {
      id: "audience",
      header: "Audience",
      hideBelow: "md",
      cell: (notification) => titleCase(notification.audience ?? "all"),
    },
    {
      id: "type",
      header: "Type",
      hideBelow: "xl",
      cell: (notification) => titleCase(notification.type),
    },
    {
      id: "sent",
      header: "Delivered",
      align: "right",
      hideBelow: "lg",
      cell: (notification) => (
        <span className="tabular-nums">
          {formatNumber(notification.sentCount ?? 0)}
        </span>
      ),
    },
    {
      id: "open",
      header: "Open rate",
      align: "right",
      hideBelow: "xl",
      cell: (notification) => {
        const sent = notification.sentCount ?? 0;
        const read = notification.readCount ?? 0;
        return (
          <span className="tabular-nums">
            {sent > 0 ? percent((read / sent) * 100) : "—"}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: (notification) => <StatusBadge status={notification.status} />,
    },
    {
      id: "when",
      header: "Sent",
      hideBelow: "lg",
      cell: (notification) => (
        <StackedCell
          primary={relativeTime(notification.sentAt ?? notification.createdAt)}
          secondary={dateTime(notification.sentAt ?? notification.createdAt)}
        />
      ),
    },
  ];

  const rows = notifications.data?.items ?? [];
  const totalSent = rows.reduce((sum, item) => sum + (item.sentCount ?? 0), 0);
  const totalRead = rows.reduce((sum, item) => sum + (item.readCount ?? 0), 0);

  return (
    <>
    <ResourceListPage
      title="Push notifications"
      description="Messages sent to the apps, who received them and how many opened."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Marketing" },
        { label: "Push notifications" },
      ]}
      actions={
        <Button size="lg" onClick={() => setComposing(true)}>
          <Plus className="size-4" />
          New notification
        </Button>
      }
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Notifications"
            value={formatNumber(notifications.data?.total)}
            icon={BellRing}
            tone="indigo"
            loading={notifications.isPending}
          />
          <StatCard
            label="Delivered (page)"
            value={formatNumber(totalSent)}
            icon={Send}
            tone="violet"
            loading={notifications.isPending}
          />
          <StatCard
            label="Opened (page)"
            value={formatNumber(totalRead)}
            icon={Eye}
            tone="emerald"
            loading={notifications.isPending}
          />
          <StatCard
            label="Open rate (page)"
            value={totalSent > 0 ? percent((totalRead / totalSent) * 100) : "—"}
            icon={Eye}
            tone="amber"
            loading={notifications.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search title or message…"
          />
          <FilterSelect
            value={list.filters.audience ?? ""}
            onChange={(value) => list.setFilter("audience", value)}
            options={AUDIENCE_OPTIONS}
            placeholder="All audiences"
            allLabel="All audiences"
          />
          <FilterSelect
            value={list.filters.status ?? ""}
            onChange={(value) => list.setFilter("status", value)}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
            allLabel="All statuses"
          />
        </>
      }
      columns={columns}
      query={notifications}
      list={list}
      rowKey={(notification) => notification._id}
      emptyTitle="No notifications sent yet"
    />

    <CreateDialog
      open={composing}
      onOpenChange={setComposing}
      title="New notification"
      description="Sent to everyone in the audience you choose."
      submitLabel="Send"
      initial={{ type: "PROMOTIONAL", recipient: "ALL" }}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "Flat 20% off today" },
        {
          name: "message",
          label: "Message",
          type: "textarea",
          required: true,
          placeholder: "Order before 9pm and save on every restaurant near you.",
        },
        {
          name: "type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "PROMOTIONAL", label: "Promotional" },
            { value: "ORDER_STATUS", label: "Order status" },
            { value: "SYSTEM", label: "System" },
            { value: "ALERT", label: "Alert" },
          ],
        },
        {
          name: "recipient",
          label: "Audience",
          type: "select",
          required: true,
          options: [
            { value: "ALL", label: "Everyone" },
            { value: "CUSTOMERS", label: "Customers" },
            { value: "VENDORS", label: "Vendors" },
            { value: "RIDERS", label: "Delivery partners" },
          ],
        },
      ]}
      /* The API takes the audience as `recipient` or `audience`; the draft
         type names it audience, so the select's value is passed as that. */
      onSubmit={({ title, message, type, recipient }) =>
        createNotification.mutateAsync({ title, message, type, audience: recipient })
      }
    />
    </>
  );
}
