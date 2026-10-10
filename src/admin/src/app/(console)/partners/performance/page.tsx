"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bike, CircleCheck, Star, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { Panel } from "@/components/common/panel";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { IdentityCell } from "@/components/common/cells";
import { FilterBar, SearchField } from "@/components/common/filter-bar";
import { EmptyState } from "@/components/common/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { DonutChart } from "@/components/charts/charts";
import { useRiders } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { number as formatNumber, percent } from "@/lib/format";
import type { Rider } from "@/lib/types";

/** Buckets partners by rating so the tail is visible at a glance. */
function ratingBuckets(riders: Rider[]) {
  const buckets = { "4.5 – 5.0": 0, "4.0 – 4.5": 0, "3.5 – 4.0": 0, "Below 3.5": 0, Unrated: 0 };
  for (const rider of riders) {
    const rating = rider.currentRating ?? rider.rating;
    if (!rating) buckets.Unrated += 1;
    else if (rating >= 4.5) buckets["4.5 – 5.0"] += 1;
    else if (rating >= 4) buckets["4.0 – 4.5"] += 1;
    else if (rating >= 3.5) buckets["3.5 – 4.0"] += 1;
    else buckets["Below 3.5"] += 1;
  }
  return Object.entries(buckets)
    .filter(([, value]) => value > 0)
    .map(([label, value]) => ({ label, value }));
}

export default function PartnerPerformancePage() {
  const router = useRouter();
  const list = useListState({}, 25);
  const riders = useRiders(list.params);
  const rows = riders.data?.items ?? [];

  const rated = rows.filter((rider) => rider.currentRating ?? rider.rating);
  const averageRating = rated.length
    ? rated.reduce(
        (sum, rider) => sum + (rider.currentRating ?? rider.rating ?? 0),
        0
      ) / rated.length
    : 0;
  const averageSuccess = rows.length
    ? rows.reduce((sum, rider) => sum + (rider.successRate ?? 0), 0) / rows.length
    : 0;
  const underperforming = rows.filter(
    (rider) => (rider.currentRating ?? rider.rating ?? 5) < 4
  ).length;

  const columns: Column<Rider>[] = [
    {
      id: "partner",
      header: "Partner",
      cell: (rider) => (
        <IdentityCell
          name={rider.name ?? "Unnamed"}
          secondary={rider.riderId}
          image={rider.image}
        />
      ),
    },
    {
      id: "rating",
      header: "Rating",
      align: "right",
      cell: (rider) => {
        const rating = rider.currentRating ?? rider.rating;
        return rating ? (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "success",
      header: "Success rate",
      hideBelow: "md",
      cell: (rider) => {
        const rate = rider.successRate ?? 0;
        return (
          <div className="min-w-[7rem]">
            <div className="text-xs tabular-nums">{percent(rate)}</div>
            <Progress value={Math.min(100, rate)} className="mt-1 h-1.5" />
          </div>
        );
      },
    },
    {
      id: "completed",
      header: "Completed",
      align: "right",
      hideBelow: "lg",
      cell: (rider) => (
        <span className="tabular-nums">
          {formatNumber(rider.completedDeliveries ?? 0)}
        </span>
      ),
    },
    {
      id: "cancelled",
      header: "Cancelled",
      align: "right",
      hideBelow: "lg",
      cell: (rider) => (
        <span className="tabular-nums">
          {formatNumber(rider.cancelledDeliveries ?? 0)}
        </span>
      ),
    },
    {
      id: "total",
      header: "Total trips",
      align: "right",
      hideBelow: "xl",
      cell: (rider) => (
        <span className="tabular-nums">{formatNumber(rider.totalDeliveries ?? 0)}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Partner performance"
        description="Ratings, completion rates and where service quality is slipping."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Delivery partners", href: "/partners" },
          { label: "Performance" },
        ]}
      />

      <StatGrid columns={4}>
        <StatCard
          label="Partners"
          value={formatNumber(riders.data?.total)}
          icon={Bike}
          tone="indigo"
          loading={riders.isPending}
        />
        <StatCard
          label="Average rating (page)"
          value={rated.length ? averageRating.toFixed(2) : "—"}
          icon={Star}
          tone="amber"
          loading={riders.isPending}
        />
        <StatCard
          label="Average success rate (page)"
          value={rows.length ? percent(averageSuccess) : "—"}
          icon={CircleCheck}
          tone="emerald"
          loading={riders.isPending}
        />
        <StatCard
          label="Below 4.0 (page)"
          value={formatNumber(underperforming)}
          icon={TrendingDown}
          tone="rose"
          loading={riders.isPending}
          hint="May need coaching"
        />
      </StatGrid>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        <Panel title="Rating distribution" description="Partners on this page.">
          {riders.isPending ? (
            <Skeleton className="h-[16.25rem] w-full" />
          ) : rows.length === 0 ? (
            <EmptyState title="No partners to rank" />
          ) : (
            <DonutChart
              slices={ratingBuckets(rows)}
              centerLabel="Partners"
              centerValue={formatNumber(rows.length)}
              height={260}
            />
          )}
        </Panel>

        <div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(rider) => rider._id}
            loading={riders.isPending}
            error={riders.error}
            onRetry={() => riders.refetch()}
            onRowClick={(rider) => router.push(`/partners/${rider._id}`)}
            emptyTitle="No partners found"
            toolbar={
              <FilterBar onReset={list.reset}>
                <SearchField
                  value={list.search}
                  onChange={list.setSearch}
                  placeholder="Search partners…"
                />
              </FilterBar>
            }
          />
          <div className="surface mt-3">
            <TablePagination
              page={list.page}
              pageSize={list.limit}
              total={riders.data?.total ?? 0}
              onPageChange={list.setPage}
              onPageSizeChange={list.setLimit}
              className="border-t-0"
            />
          </div>
        </div>
      </div>
    </>
  );
}
