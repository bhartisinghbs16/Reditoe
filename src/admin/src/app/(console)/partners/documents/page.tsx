"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock, FileText, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { useRiders, useUpdateRiderKyc } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { KYC_STATUS_OPTIONS, kycLabel } from "@/lib/domain";
import { date as formatDate, number as formatNumber, phone as formatPhone } from "@/lib/format";
import type { Rider } from "@/lib/types";

export default function PartnerDocumentsPage() {
  const router = useRouter();
  const list = useListState({ kycStatus: "" });
  const riders = useRiders(list.params);
  const updateKyc = useUpdateRiderKyc();

  async function setKyc(rider: Rider, kycStatus: string) {
    try {
      await updateKyc.mutateAsync({ id: rider._id, kycStatus });
      toast.success(`KYC marked ${kycStatus}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update KYC");
    }
  }

  const columns: Column<Rider>[] = [
    {
      id: "partner",
      header: "Partner",
      cell: (rider) => (
        <IdentityCell
          name={rider.name ?? "Unnamed"}
          secondary={rider.riderId ?? formatPhone(rider.phone)}
          image={rider.image}
        />
      ),
    },
    {
      id: "vehicle",
      header: "Vehicle",
      hideBelow: "md",
      cell: (rider) => (
        <StackedCell
          primary={rider.vehicleName ?? rider.vehicleType ?? "—"}
          secondary={rider.vehicleNumber}
        />
      ),
    },
    {
      id: "kyc",
      header: "KYC",
      cell: (rider) => <StatusBadge status={rider.kycStatus} label={kycLabel(rider.kycStatus)} />,
    },
    {
      id: "applied",
      header: "Applied",
      hideBelow: "lg",
      cell: (rider) => formatDate(rider.createdAt),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (rider) =>
        rider.kycStatus === "approved" ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div
            className="flex justify-end gap-1.5"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              variant="outline"
              size="sm"
              disabled={updateKyc.isPending}
              onClick={() => setKyc(rider, "rejected")}
            >
              Reject
            </Button>
            <Button
              size="sm"
              disabled={updateKyc.isPending}
              onClick={() => setKyc(rider, "approved")}
            >
              Verify
            </Button>
          </div>
        ),
    },
  ];

  const rows = riders.data?.items ?? [];
  const countBy = (predicate: (rider: Rider) => boolean) =>
    formatNumber(rows.filter(predicate).length);

  return (
    <ResourceListPage
      title="Partner documents"
      description="Identity, licence and vehicle paperwork awaiting verification."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Delivery partners", href: "/partners" },
        { label: "Documents" },
      ]}
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="In queue"
            value={formatNumber(riders.data?.total)}
            icon={FileText}
            tone="indigo"
            loading={riders.isPending}
          />
          <StatCard
            label="Awaiting review (page)"
            value={countBy((rider) => (rider.kycStatus ?? "pending") === "pending")}
            icon={Clock}
            tone="amber"
            loading={riders.isPending}
          />
          <StatCard
            label="Verified (page)"
            value={countBy((rider) => rider.kycStatus === "approved")}
            icon={ShieldCheck}
            tone="emerald"
            loading={riders.isPending}
          />
          <StatCard
            label="Rejected (page)"
            value={countBy((rider) => rider.kycStatus === "rejected")}
            icon={ShieldX}
            tone="rose"
            loading={riders.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search partner name or ID…"
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
      query={riders}
      list={list}
      rowKey={(rider) => rider._id}
      onRowClick={(rider) => router.push(`/partners/${rider._id}`)}
      emptyTitle="Nothing awaiting verification"
    />
  );
}
