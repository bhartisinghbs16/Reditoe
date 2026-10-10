"use client";

import * as React from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { PageHeader, type Crumb } from "@/components/common/page-header";
import {
  DataTable,
  TablePagination,
  type Column,
} from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import type { PaginatedResult } from "@/lib/api";
import type { ListState } from "@/lib/use-list-state";

/**
 * The shape every list screen shares: header, optional stat row, a filtered
 * table and a pager. Individual screens supply columns and filters only.
 */
export function ResourceListPage<T>({
  title,
  description,
  breadcrumbs,
  actions,
  stats,
  filters,
  columns,
  query,
  list,
  rowKey,
  onRowClick,
  emptyTitle,
  emptyDescription,
  emptyAction,
  selectable,
  selected,
  onSelectedChange,
  children,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  stats?: React.ReactNode;
  /** Rendered inside the table toolbar, wrapped in a FilterBar. */
  filters?: React.ReactNode;
  columns: Column<T>[];
  query: UseQueryResult<PaginatedResult<T>>;
  list: ListState;
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Extra content between the stats and the table. */
  children?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        actions={actions}
      />

      {stats}
      {children}

      <div className={stats || children ? "mt-3" : undefined}>
        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={rowKey}
          loading={query.isPending}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={onRowClick}
          selectable={selectable}
          selected={selected}
          onSelectedChange={onSelectedChange}
          emptyTitle={emptyTitle ?? "Nothing here yet"}
          emptyDescription={emptyDescription}
          emptyAction={emptyAction}
          toolbar={filters ? <FilterBar onReset={list.reset}>{filters}</FilterBar> : undefined}
        />

        <div className="surface mt-3">
          <TablePagination
            page={list.page}
            pageSize={list.limit}
            total={query.data?.total ?? 0}
            onPageChange={list.setPage}
            onPageSizeChange={list.setLimit}
            className="border-t-0"
          />
        </div>
      </div>
    </>
  );
}
