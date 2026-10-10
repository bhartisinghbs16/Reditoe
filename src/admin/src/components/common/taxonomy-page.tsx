"use client";

import * as React from "react";
import { Plus, Tags } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import type { PaginatedResult } from "@/lib/api";
import type { ListState } from "@/lib/use-list-state";
import { date as formatDate, number as formatNumber } from "@/lib/format";
import type { Crumb } from "@/components/common/page-header";
import type { Taxonomy } from "@/lib/types";

/**
 * Categories and cuisines are the same screen with different nouns, so they
 * share one implementation rather than two near-identical files.
 */
export function TaxonomyPage({
  title,
  description,
  breadcrumbs,
  noun,
  usageLabel,
  query,
  list,
  onAdd,
}: {
  title: string;
  description: string;
  breadcrumbs: Crumb[];
  /** Singular, lowercase — used in the create button and empty state. */
  noun: string;
  /** Header for the "how many things use this" column. */
  usageLabel: string;
  query: UseQueryResult<PaginatedResult<Taxonomy>>;
  list: ListState;
  /**
   * What "Add <noun>" does. Both buttons had no handler at all; a page whose
   * only job is to manage a list could not add to it. Left out where the API
   * has no way to create that kind of thing, and then the button is not drawn
   * rather than drawn dead.
   */
  onAdd?: () => void;
}) {
  const rows = query.data?.items ?? [];

  const usage = (item: Taxonomy) =>
    item.count ?? item.restaurantCount ?? item.itemCount ?? 0;

  const columns: Column<Taxonomy>[] = [
    {
      id: "name",
      header: "Name",
      cell: (item) => (
        <IdentityCell
          square
          name={item.name ?? "Unnamed"}
          secondary={item.description}
          image={item.image ?? item.icon}
        />
      ),
    },
    {
      id: "slug",
      header: "Slug",
      hideBelow: "lg",
      cell: (item) =>
        item.slug ? (
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
            {item.slug}
          </code>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "usage",
      header: usageLabel,
      align: "right",
      cell: (item) => <span className="tabular-nums">{formatNumber(usage(item))}</span>,
    },
    {
      id: "order",
      header: "Order",
      align: "right",
      hideBelow: "xl",
      cell: (item) =>
        item.sortOrder !== undefined ? (
          <span className="tabular-nums">{item.sortOrder}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => (
        <StatusBadge status={item.isActive === false ? "inactive" : "active"} />
      ),
    },
    {
      id: "created",
      header: "Created",
      hideBelow: "xl",
      cell: (item) => formatDate(item.createdAt),
    },
  ];

  return (
    <ResourceListPage
      title={title}
      description={description}
      breadcrumbs={breadcrumbs}
      actions={
        onAdd ? (
          <Button size="lg" onClick={onAdd}>
            <Plus className="size-4" />
            Add {noun}
          </Button>
        ) : undefined
      }
      stats={
        <StatGrid columns={3}>
          <StatCard
            label={`Total ${noun}s`}
            value={formatNumber(query.data?.total)}
            icon={Tags}
            tone="indigo"
            loading={query.isPending}
          />
          <StatCard
            label="Active (page)"
            value={formatNumber(rows.filter((item) => item.isActive !== false).length)}
            icon={Tags}
            tone="emerald"
            loading={query.isPending}
          />
          <StatCard
            label={`${usageLabel} (page)`}
            value={formatNumber(rows.reduce((sum, item) => sum + usage(item), 0))}
            icon={Tags}
            tone="violet"
            loading={query.isPending}
          />
        </StatGrid>
      }
      filters={
        <SearchField
          value={list.search}
          onChange={list.setSearch}
          placeholder={`Search ${noun}s…`}
        />
      }
      columns={columns}
      query={query}
      list={list}
      rowKey={(item) => item._id}
      emptyTitle={`No ${noun}s yet`}
      emptyDescription={`Create a ${noun} to organise the catalogue.`}
      emptyAction={
        onAdd ? (
          <Button size="sm" onClick={onAdd}>
            <Plus className="size-3.5" />
            Add {noun}
          </Button>
        ) : undefined
      }
    />
  );
}
