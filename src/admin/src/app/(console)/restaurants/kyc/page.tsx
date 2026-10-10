"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, FileText, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { useApproveRestaurant, useRestaurants } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { KYC_STATUS_OPTIONS, kycLabel, documentStatus } from "@/lib/domain";
import { date as formatDate, number as formatNumber, phone as formatPhone } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, Restaurant } from "@/lib/types";

export default function RestaurantKycPage() {
  const router = useRouter();
  const list = useListState({ kycStatus: "" });
  const restaurants = useRestaurants(list.params);
  const approve = useApproveRestaurant();

  async function onApprove(restaurant: Restaurant) {
    try {
      await approve.mutateAsync({ id: restaurant._id, isApproved: true });
      toast.success(`${restaurant.name ?? "Restaurant"} approved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve");
    }
  }

  const columns: Column<Restaurant>[] = [
    {
      id: "restaurant",
      header: "Restaurant",
      cell: (restaurant) => (
        <IdentityCell
          square
          name={restaurant.name ?? "Unnamed"}
          secondary={restaurant.address?.city}
          image={restaurant.image}
        />
      ),
    },
    {
      id: "owner",
      header: "Owner",
      hideBelow: "md",
      cell: (restaurant) => {
        const owner = refDoc<Customer>(restaurant.owner);
        return (
          <StackedCell
            primary={owner?.name ?? "—"}
            secondary={formatPhone(restaurant.phone ?? owner?.phone)}
          />
        );
      },
    },
    {
      id: "kyc",
      header: "KYC",
      cell: (restaurant) => <StatusBadge status={restaurant.kycStatus} label={kycLabel(restaurant.kycStatus)} />,
    },
    {
      id: "documents",
      header: "Documents",
      hideBelow: "lg",
      cell: (restaurant) => (
        <StatusBadge
          status={documentStatus(restaurant.documentVerificationStatus).status}
          label={documentStatus(restaurant.documentVerificationStatus).label}
        />
      ),
    },
    {
      id: "approved",
      header: "Listing",
      hideBelow: "lg",
      cell: (restaurant) => (
        <StatusBadge
          status={restaurant.isApproved ? "approved" : "pending"}
          label={restaurant.isApproved ? "Approved" : "Awaiting approval"}
        />
      ),
    },
    {
      id: "applied",
      header: "Applied",
      hideBelow: "xl",
      cell: (restaurant) => formatDate(restaurant.createdAt),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (restaurant) =>
        restaurant.isApproved ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Button
            size="sm"
            disabled={approve.isPending}
            onClick={(event) => {
              event.stopPropagation();
              onApprove(restaurant);
            }}
          >
            <CheckCircle2 className="size-3.5" />
            Approve
          </Button>
        ),
    },
  ];

  const rows = restaurants.data?.items ?? [];
  const countBy = (predicate: (restaurant: Restaurant) => boolean) =>
    formatNumber(rows.filter(predicate).length);

  return (
    <ResourceListPage
      title="KYC & documents"
      description="Vendor verification queue — who is waiting, who is verified, who was rejected."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Restaurants", href: "/restaurants" },
        { label: "KYC & documents" },
      ]}
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="In queue"
            value={formatNumber(restaurants.data?.total)}
            icon={FileText}
            tone="indigo"
            loading={restaurants.isPending}
          />
          <StatCard
            label="Awaiting review (page)"
            value={countBy(
              (restaurant) => (restaurant.kycStatus ?? "pending") === "pending"
            )}
            icon={Clock}
            tone="amber"
            loading={restaurants.isPending}
          />
          <StatCard
            label="Verified (page)"
            value={countBy((restaurant) => restaurant.kycStatus === "approved")}
            icon={ShieldCheck}
            tone="emerald"
            loading={restaurants.isPending}
          />
          <StatCard
            label="Rejected (page)"
            value={countBy((restaurant) => restaurant.kycStatus === "rejected")}
            icon={ShieldX}
            tone="rose"
            loading={restaurants.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search restaurant or owner…"
          />
          <FilterSelect
            value={list.filters.kycStatus ?? ""}
            onChange={(value) => list.setFilter("kycStatus", value)}
            options={KYC_STATUS_OPTIONS}
            placeholder="All KYC states"
            allLabel="All KYC states"
          />
        </>
      }
      columns={columns}
      query={restaurants}
      list={list}
      rowKey={(restaurant) => restaurant._id}
      onRowClick={(restaurant) => router.push(`/restaurants/${restaurant._id}`)}
      emptyTitle="Nothing awaiting verification"
    />
  );
}
