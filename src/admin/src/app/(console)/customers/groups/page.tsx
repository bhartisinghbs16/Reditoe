"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Download,
  GitMerge,
  Info,
  Plus,
  Send,
  Tag,
  Upload,
  UserRound,
  UsersRound,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatTile } from "@/components/dashboard/metric-card";
import { Panel, PanelLink } from "@/components/common/panel";
import { DonutChart } from "@/components/charts/charts";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { SearchField, SegmentedTabs } from "@/components/common/filter-bar";
import { Button } from "@/components/ui/button";
import { useCustomerGroups, useCustomers } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import {
  date as formatDate,
  number as formatNumber,
  percent,
  time as formatTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CustomerGroup } from "@/lib/types";

/**
 * Customer Groups, built to the client's reference screen: four figure tiles,
 * the group table with a status tab strip, and a right rail carrying the share
 * donut, a ranking and the group-level actions.
 */

const TABS = [
  { label: "All Groups", value: "" },
  { label: "Active Groups", value: "active" },
  { label: "Inactive Groups", value: "inactive" },
];

/**
 * Where a group can actually lead.
 *
 * This was four entries — message, offer, export, merge — none of which had a
 * handler or an endpoint. What the console can genuinely do with a group is
 * send its members a campaign and put an offer in front of them, both of which
 * are their own screens.
 */
const QUICK_ACTIONS = [
  { icon: Send, label: "Send a campaign", href: "/marketing/campaigns" },
  { icon: Tag, label: "Create an offer", href: "/marketing/offers" },
];

/** Rotates the tinted square through the reference's group colours. */
const GROUP_TINTS = [
  "bg-amber-50 text-amber-600",
  "bg-sky-50 text-sky-600",
  "bg-teal-50 text-teal-600",
  "bg-violet-50 text-violet-600",
  "bg-rose-50 text-rose-600",
  "bg-orange-50 text-orange-600",
  "bg-emerald-50 text-emerald-600",
];

export default function CustomerGroupsPage() {
  const list = useListState({ status: "" }, 25);
  const groups = useCustomerGroups(list.params);
  // One row is enough — this is only here for the platform-wide customer count
  // the coverage tile divides by.
  const allCustomers = useCustomers({ limit: 1 });

  const rows = React.useMemo(() => groups.data?.items ?? [], [groups.data]);

  const grouped = rows.reduce((sum, group) => sum + (group.customerCount ?? 0), 0);
  const platformTotal = allCustomers.data?.total ?? 0;
  // Groups overlap, so the membership sum can legitimately exceed the customer
  // count — but then it isn't a coverage figure any more. Rather than print
  // something like 45,650%, say we don't know.
  const coverage =
    platformTotal > 0 && grouped <= platformTotal
      ? (grouped / platformTotal) * 100
      : null;

  const visible = React.useMemo(() => {
    const status = list.filters.status ?? "";
    if (!status) return rows;
    const wantActive = status === "active";
    return rows.filter((group) => (group.isActive !== false) === wantActive);
  }, [rows, list.filters.status]);

  const shares = React.useMemo(
    () =>
      rows
        .map((group) => ({
          label: group.name ?? "Unnamed",
          value: group.customerCount ?? 0,
        }))
        .filter((slice) => slice.value > 0)
        .sort((a, b) => b.value - a.value),
    [rows]
  );

  const columns: Column<CustomerGroup>[] = [
    {
      id: "group",
      header: "Group Name",
      cell: (group, index) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              GROUP_TINTS[index % GROUP_TINTS.length]
            )}
          >
            <UsersRound className="size-4" />
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{group.name ?? "Unnamed"}</span>
            {group.isDefault && (
              <StatusBadge tone="accent" dot={false} label="Default" />
            )}
          </span>
        </div>
      ),
    },
    {
      id: "description",
      header: "Description",
      hideBelow: "lg",
      cell: (group) => (
        <span className="text-muted-foreground">
          {group.description ?? group.criteria ?? "Manual"}
        </span>
      ),
    },
    {
      id: "customers",
      header: "Customers",
      align: "right",
      cell: (group) => (
        <span className="tabular-nums">{formatNumber(group.customerCount ?? 0)}</span>
      ),
    },
    {
      id: "share",
      header: "% of Total",
      align: "right",
      hideBelow: "md",
      cell: (group) => (
        <span className="tabular-nums text-muted-foreground">
          {grouped > 0 ? percent(((group.customerCount ?? 0) / grouped) * 100, 2) : "—"}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created On",
      hideBelow: "xl",
      cell: (group) => (
        <StackedCell
          primary={formatDate(group.createdAt)}
          secondary={formatTime(group.createdAt)}
        />
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (group) => (
        <StatusBadge status={group.isActive === false ? "inactive" : "active"} />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customer Groups"
        description="Organize customers into groups for better targeting, offers and communication."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Customers", href: "/customers" },
          { label: "Customer Groups" },
        ]}
        actions={
          <>
            {/*
              Both had no handler, and the groups API only reads: a group is
              worked out from how customers behave rather than assembled by
              hand, so there is nothing to create or import into.
            */}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={UsersRound}
          tone="blue"
          value={formatNumber(groups.data?.total ?? rows.length)}
          label="Total Groups"
          hint="Active customer groups"
          loading={groups.isPending}
        />
        <StatTile
          icon={UserRound}
          tone="green"
          value={formatNumber(grouped)}
          label="Total Customers"
          hint="Across loaded groups"
          loading={groups.isPending}
        />
        <StatTile
          icon={Info}
          tone="purple"
          value={coverage === null ? "—" : percent(coverage, 2)}
          label="Group Coverage"
          hint="% of all customers"
          loading={groups.isPending || allCustomers.isPending}
        />
        <StatTile
          icon={Crown}
          tone="amber"
          value={rows.length ? formatNumber(Math.round(grouped / rows.length)) : "—"}
          label="Avg. Customers/Group"
          hint="Per group on average"
          loading={groups.isPending}
        />
      </div>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[3fr_1fr]">
        <div>
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(group) => group._id}
            loading={groups.isPending}
            error={groups.error}
            onRetry={() => groups.refetch()}
            emptyTitle="No customer groups yet"
            emptyDescription="Group customers by behaviour so campaigns can target them."
            toolbar={
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <SegmentedTabs
                  value={list.filters.status ?? ""}
                  onChange={(value) => list.setFilter("status", value)}
                  options={TABS}
                  className="w-fit max-w-full border-b-0"
                />
                <SearchField
                  value={list.search}
                  onChange={list.setSearch}
                  placeholder="Search groups…"
                  className="sm:max-w-[16rem]"
                />
              </div>
            }
          />

          <div className="surface mt-3">
            <TablePagination
              page={list.page}
              pageSize={list.limit}
              total={groups.data?.total ?? 0}
              onPageChange={list.setPage}
              onPageSizeChange={list.setLimit}
              className="border-t-0"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Panel title="Group Summary">
            <DonutChart
              slices={shares}
              centerLabel="Customers"
              centerValue={formatNumber(grouped)}
              height={200}
            />
          </Panel>

          {/*
            The reference ranks these by revenue. A customer group carries a
            member count and nothing financial, so this ranks by size — the
            same shape, from a number we actually have.
          */}
          <Panel
            title="Top Groups by Size"
            action={<PanelLink href="/customers/analytics">View Report</PanelLink>}
          >
            <ol className="space-y-2.5">
              {shares.slice(0, 5).map((group, index) => (
                <li
                  key={group.label}
                  className="flex items-center justify-between gap-3 text-[0.8125rem]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-3 shrink-0 text-muted-foreground tabular-nums">
                      {index + 1}.
                    </span>
                    <span className="truncate">{group.label}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatNumber(group.value)}
                  </span>
                </li>
              ))}
              {shares.length === 0 && (
                <li className="text-[0.8125rem] text-muted-foreground">
                  No groups with members yet.
                </li>
              )}
            </ol>
          </Panel>

          <Panel title="Quick Actions" bodyClassName="p-0">
            <ul>
              {QUICK_ACTIONS.map(({ icon: Icon, label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[0.8125rem] transition-colors not-last:border-b not-last:border-border/70 hover:bg-muted/60"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="rounded-xl bg-info-muted p-3.5">
            <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-info-foreground">
              <Info className="size-4" />
              About Customer Groups
            </p>
            <p className="mt-1.5 text-[0.75rem] text-info-foreground/80">
              Create groups based on customer behaviour, order history, location and
              preferences to run targeted campaigns and personalised offers.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
