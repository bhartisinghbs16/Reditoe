"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { SegmentedTabs } from "@/components/common/filter-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/lib/queries";
import { dateTime, number as formatNumber, relativeTime, titleCase } from "@/lib/format";
import type { NotificationRecord } from "@/lib/types";

const TABS = [
  { label: "All", value: "" },
  { label: "Orders", value: "order" },
  { label: "Payments", value: "payment" },
  { label: "Vendors", value: "vendor" },
  { label: "System", value: "system" },
];

export default function NotificationsInboxPage() {
  const [type, setType] = React.useState("");
  const notifications = useNotifications({ page: 1, limit: 50, type: type || undefined });
  const rows = notifications.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Alerts raised for the admin team — approvals, failures and escalations."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Notifications" },
        ]}
        /* "Mark all read" stood here with no handler, and this page lists
           the notifications the admin team has *sent* — there is nothing on
           it to mark as read. */
      />

      <StatGrid columns={3}>
        <StatCard
          label="Notifications"
          value={formatNumber(notifications.data?.total)}
          icon={Bell}
          tone="indigo"
          loading={notifications.isPending}
        />
        <StatCard
          label="In this view"
          value={formatNumber(rows.length)}
          icon={Inbox}
          tone="violet"
          loading={notifications.isPending}
        />
        <StatCard
          label="Types (page)"
          value={formatNumber(new Set(rows.map((item) => item.type)).size)}
          icon={Bell}
          tone="emerald"
          loading={notifications.isPending}
        />
      </StatGrid>

      <SegmentedTabs
        value={type}
        onChange={setType}
        options={TABS}
        className="mt-6 mb-4 w-fit max-w-full"
      />

      <Panel flush>
        {notifications.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : notifications.isError ? (
          <ErrorState
            description={notifications.error?.message}
            onRetry={() => notifications.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing to read"
            description="Alerts about approvals, failed payments and escalations land here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((notification: NotificationRecord) => (
              <li
                key={notification._id}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="icon-tile mt-0.5 size-9 bg-accent text-accent-foreground">
                  <Bell className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {notification.title ?? "Notification"}
                    </span>
                    {notification.type && (
                      <StatusBadge
                        tone="neutral"
                        dot={false}
                        label={titleCase(notification.type)}
                      />
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                    {notification.message ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <time dateTime={notification.createdAt}>
                      {relativeTime(notification.sentAt ?? notification.createdAt)}
                    </time>
                    {" · "}
                    {dateTime(notification.sentAt ?? notification.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="mt-4 text-sm text-muted-foreground">
        Looking for messages sent to customers?{" "}
        <Link
          href="/marketing/notifications"
          className="font-medium text-primary hover:underline"
        >
          Open push notifications
        </Link>
        .
      </p>
    </>
  );
}
