"use client";

import * as React from "react";
import { CircleCheck, Clock, Gift, UsersRound } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { useReferrals } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, date as formatDate, number as formatNumber } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, ReferralRecord } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "expired", label: "Expired" },
];

export default function ReferralsPage() {
  const list = useListState({ status: "" });
  const referrals = useReferrals(list.params);

  const columns: Column<ReferralRecord>[] = [
    {
      id: "referrer",
      header: "Referrer",
      cell: (referral) => {
        const referrer = refDoc<Customer>(referral.referrer);
        return (
          <IdentityCell
            name={referrer?.name ?? "—"}
            secondary={referrer?.email}
            image={referrer?.avatar ?? referrer?.profilePhoto}
          />
        );
      },
    },
    {
      id: "referee",
      header: "Invited",
      hideBelow: "md",
      cell: (referral) => {
        const referee = refDoc<Customer>(referral.referee);
        if (!referee)
          return <span className="text-muted-foreground">Not signed up yet</span>;
        return <IdentityCell name={referee.name} secondary={referee.email} />;
      },
    },
    {
      id: "code",
      header: "Code",
      hideBelow: "lg",
      cell: (referral) =>
        referral.code ? (
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
            {referral.code}
          </code>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "reward",
      header: "Reward",
      align: "right",
      cell: (referral) => (
        <span className="tabular-nums">{currency(referral.rewardAmount ?? 0)}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (referral) => <StatusBadge status={referral.status} />,
    },
    {
      id: "completed",
      header: "Completed",
      hideBelow: "xl",
      cell: (referral) => formatDate(referral.completedAt ?? referral.createdAt),
    },
  ];

  const rows = referrals.data?.items ?? [];
  const statusIs = (referral: ReferralRecord, status: string) =>
    (referral.status ?? "").toLowerCase() === status;

  return (
    <ResourceListPage
      title="Referrals"
      description="Who is inviting whom, and what the programme is paying out."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Marketing" },
        { label: "Referrals" },
      ]}
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Referrals"
            value={formatNumber(referrals.data?.total)}
            icon={Gift}
            tone="indigo"
            loading={referrals.isPending}
          />
          <StatCard
            label="Completed (page)"
            value={formatNumber(
              rows.filter((referral) => statusIs(referral, "completed")).length
            )}
            icon={CircleCheck}
            tone="emerald"
            loading={referrals.isPending}
          />
          <StatCard
            label="Pending (page)"
            value={formatNumber(
              rows.filter((referral) => statusIs(referral, "pending")).length
            )}
            icon={Clock}
            tone="amber"
            loading={referrals.isPending}
          />
          <StatCard
            label="Rewards paid (page)"
            value={currency(
              rows
                .filter((referral) => statusIs(referral, "completed"))
                .reduce((sum, referral) => sum + (referral.rewardAmount ?? 0), 0)
            )}
            icon={UsersRound}
            tone="violet"
            loading={referrals.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search referrer or code…"
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
      query={referrals}
      list={list}
      rowKey={(referral) => referral._id}
      emptyTitle="No referrals yet"
      emptyDescription="Referrals appear here once customers start inviting friends."
    />
  );
}
