"use client";

import * as React from "react";
import { Activity, Download, Fingerprint, UserRound } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/common/export-button";
import { useActivityLogs } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { dateTime, number as formatNumber, relativeTime, titleCase } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { ActivityLog, Customer } from "@/lib/types";

const MODULE_OPTIONS = [
  "orders",
  "customers",
  "restaurants",
  "riders",
  "finance",
  "marketing",
  "system",
].map((value) => ({ value, label: titleCase(value) }));

const ACTION_OPTIONS = ["create", "update", "delete", "login", "export"].map(
  (value) => ({ value, label: titleCase(value) })
);

export default function ActivityLogPage() {
  const list = useListState({ module: "", action: "" });
  const logs = useActivityLogs(list.params);

  const columns: Column<ActivityLog>[] = [
    {
      id: "actor",
      header: "Actor",
      cell: (log) => {
        const user = refDoc<Customer>(log.userId);
        return (
          <IdentityCell
            name={user?.name ?? "System"}
            secondary={user?.email ?? "Automated"}
          />
        );
      },
    },
    {
      id: "action",
      header: "Action",
      cell: (log) => (
        <StackedCell
          primary={titleCase(log.action)}
          secondary={titleCase(log.module)}
        />
      ),
    },
    {
      id: "description",
      header: "Detail",
      className: "max-w-md",
      cell: (log) => (
        <p className="line-clamp-2 text-sm text-muted-foreground text-pretty">
          {log.description ?? "—"}
        </p>
      ),
    },
    {
      id: "ip",
      header: "IP",
      hideBelow: "xl",
      cell: (log) => (
        <span className="font-mono text-xs text-muted-foreground">
          {log.ipAddress ?? "—"}
        </span>
      ),
    },
    {
      id: "when",
      header: "When",
      hideBelow: "md",
      cell: (log) => (
        <StackedCell
          primary={relativeTime(log.createdAt)}
          secondary={dateTime(log.createdAt)}
        />
      ),
    },
  ];

  const rows = logs.data?.items ?? [];
  const uniqueActors = new Set(
    rows.map((log) => refDoc<Customer>(log.userId)?._id ?? "system")
  ).size;

  return (
    <ResourceListPage
      title="Activity logs"
      description="An append-only record of what changed in the console, by whom, and when."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "System" },
        { label: "Activity logs" },
      ]}
      actions={
        <ExportButton<ActivityLog>
          path="/activity-logs"
          listKey="logs"
          filename="reditoe-activity-log"
          query={list.params}
          columns={[
              { header: "IP", value: (r) => r.ipAddress ?? "" },
              { header: "Action", value: (r) => r.action ?? "" },
              { header: "Module", value: (r) => r.module ?? "" },
              { header: "Details", value: (r) => r.description ?? "" },
            ]}
        />
      }
      stats={
        <StatGrid columns={3}>
          <StatCard
            label="Recorded events"
            value={formatNumber(logs.data?.total)}
            icon={Activity}
            tone="indigo"
            loading={logs.isPending}
          />
          <StatCard
            label="Distinct actors (page)"
            value={formatNumber(uniqueActors)}
            icon={UserRound}
            tone="violet"
            loading={logs.isPending}
          />
          <StatCard
            label="Modules touched (page)"
            value={formatNumber(new Set(rows.map((log) => log.module)).size)}
            icon={Fingerprint}
            tone="emerald"
            loading={logs.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search description or actor…"
          />
          <FilterSelect
            value={list.filters.module ?? ""}
            onChange={(value) => list.setFilter("module", value)}
            options={MODULE_OPTIONS}
            placeholder="All modules"
            allLabel="All modules"
          />
          <FilterSelect
            value={list.filters.action ?? ""}
            onChange={(value) => list.setFilter("action", value)}
            options={ACTION_OPTIONS}
            placeholder="All actions"
            allLabel="All actions"
          />
        </>
      }
      columns={columns}
      query={logs}
      list={list}
      rowKey={(log) => log._id}
      emptyTitle="No activity recorded"
      emptyDescription="Admin actions appear here as they happen."
    />
  );
}
