"use client";

import * as React from "react";
import Link from "next/link";
import { MessageSquare, Star, ThumbsUp, TrendingDown } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { useReviews } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { date as formatDate, number as formatNumber } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, Restaurant, Review } from "@/lib/types";
import { cn } from "@/lib/utils";

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((value) => ({
  value: String(value),
  label: `${value} star${value === 1 ? "" : "s"}`,
}));

function Stars({ rating }: { rating?: number }) {
  const value = Math.round(rating ?? 0);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "size-3.5",
            index < value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
          )}
        />
      ))}
      <span className="ml-1 text-xs tabular-nums text-muted-foreground">
        {rating?.toFixed(1) ?? "—"}
      </span>
    </span>
  );
}

export default function ReviewsPage() {
  const list = useListState({ rating: "", target: "" });
  const reviews = useReviews(list.params);

  const columns: Column<Review>[] = [
    {
      id: "customer",
      header: "Customer",
      cell: (review) => {
        const customer = refDoc<Customer>(review.userId);
        return (
          <IdentityCell
            name={customer?.name ?? "Anonymous"}
            secondary={formatDate(review.createdAt)}
            image={customer?.avatar ?? customer?.profilePhoto}
          />
        );
      },
    },
    {
      id: "rating",
      header: "Rating",
      cell: (review) => <Stars rating={review.rating} />,
    },
    {
      id: "comment",
      header: "Review",
      className: "max-w-md",
      cell: (review) => (
        <p className="line-clamp-2 text-sm text-pretty">
          {review.comment || <span className="text-muted-foreground">No comment</span>}
        </p>
      ),
    },
    {
      id: "restaurant",
      header: "Restaurant",
      hideBelow: "lg",
      cell: (review) => {
        const restaurant = refDoc<Restaurant>(review.restaurantId);
        if (!restaurant) return <span className="text-muted-foreground">—</span>;
        return (
          <Link
            href={`/restaurants/${restaurant._id}`}
            className="text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {restaurant.name}
          </Link>
        );
      },
    },
    {
      id: "reply",
      header: "Reply",
      hideBelow: "xl",
      cell: (review) =>
        review.reply ? (
          <StatusBadge tone="success" label="Replied" />
        ) : (
          <StatusBadge tone="neutral" label="Awaiting" />
        ),
    },
    {
      id: "visibility",
      header: "Visibility",
      cell: (review) => (
        <StatusBadge
          status={review.isVisible === false ? "inactive" : "active"}
          label={review.isVisible === false ? "Hidden" : "Public"}
        />
      ),
    },
  ];

  const rows = reviews.data?.items ?? [];
  const average =
    rows.length > 0
      ? rows.reduce((sum, review) => sum + (review.rating ?? 0), 0) / rows.length
      : 0;

  return (
    <ResourceListPage
      title="Reviews & ratings"
      description="What customers say about restaurants and delivery partners."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reviews" }]}
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Total reviews"
            value={formatNumber(reviews.data?.total)}
            icon={MessageSquare}
            tone="indigo"
            loading={reviews.isPending}
          />
          <StatCard
            label="Average rating (page)"
            value={rows.length ? average.toFixed(2) : "—"}
            icon={Star}
            tone="amber"
            loading={reviews.isPending}
          />
          <StatCard
            label="5-star (page)"
            value={formatNumber(rows.filter((review) => review.rating === 5).length)}
            icon={ThumbsUp}
            tone="emerald"
            loading={reviews.isPending}
          />
          <StatCard
            label="1–2 star (page)"
            value={formatNumber(
              rows.filter((review) => (review.rating ?? 0) <= 2 && review.rating).length
            )}
            icon={TrendingDown}
            tone="rose"
            loading={reviews.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search review text…"
          />
          <FilterSelect
            value={list.filters.rating ?? ""}
            onChange={(value) => list.setFilter("rating", value)}
            options={RATING_OPTIONS}
            placeholder="All ratings"
            allLabel="All ratings"
          />
        </>
      }
      columns={columns}
      query={reviews}
      list={list}
      rowKey={(review) => review._id}
      emptyTitle="No reviews yet"
    />
  );
}
