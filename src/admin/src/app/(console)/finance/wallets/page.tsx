"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Landmark, Wallet } from "lucide-react";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { useWallets } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { currency, date as formatDate, number as formatNumber, titleCase } from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, Restaurant, Rider, WalletRecord } from "@/lib/types";

const OWNER_OPTIONS = [
  { value: "customer", label: "Customers" },
  { value: "vendor", label: "Vendors" },
  { value: "rider", label: "Delivery partners" },
];

/** Wallets belong to one of three party types; resolve whichever is populated. */
function walletOwner(wallet: WalletRecord) {
  const customer = refDoc<Customer>(wallet.userId);
  const restaurant = refDoc<Restaurant>(wallet.restaurantId);
  const rider = refDoc<Rider>(wallet.riderId);

  if (restaurant)
    return { name: restaurant.name, secondary: "Vendor", image: restaurant.image, square: true };
  if (rider)
    return { name: rider.name, secondary: "Delivery partner", image: rider.image, square: false };
  return {
    name: customer?.name,
    secondary: customer?.email ?? titleCase(wallet.ownerType),
    image: customer?.avatar ?? customer?.profilePhoto,
    square: false,
  };
}

export default function WalletsPage() {
  const list = useListState({ ownerType: "" });
  const wallets = useWallets(list.params);

  const columns: Column<WalletRecord>[] = [
    {
      id: "owner",
      header: "Wallet holder",
      cell: (wallet) => {
        const owner = walletOwner(wallet);
        return (
          <IdentityCell
            square={owner.square}
            name={owner.name ?? "—"}
            secondary={owner.secondary}
            image={owner.image}
          />
        );
      },
    },
    {
      id: "type",
      header: "Type",
      hideBelow: "md",
      cell: (wallet) => titleCase(wallet.ownerType ?? "customer"),
    },
    {
      id: "credited",
      header: "Credited",
      align: "right",
      hideBelow: "lg",
      cell: (wallet) => (
        <span className="tabular-nums">{currency(wallet.totalCredited ?? 0)}</span>
      ),
    },
    {
      id: "debited",
      header: "Debited",
      align: "right",
      hideBelow: "lg",
      cell: (wallet) => (
        <span className="tabular-nums">{currency(wallet.totalDebited ?? 0)}</span>
      ),
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      cell: (wallet) => (
        <span className="font-medium tabular-nums">{currency(wallet.balance ?? 0)}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (wallet) => (
        <StatusBadge status={wallet.isActive === false ? "inactive" : "active"} />
      ),
    },
    {
      id: "updated",
      header: "Updated",
      hideBelow: "xl",
      cell: (wallet) => formatDate(wallet.updatedAt ?? wallet.createdAt),
    },
  ];

  const rows = wallets.data?.items ?? [];
  const sum = (key: keyof WalletRecord) =>
    currency(rows.reduce((total, wallet) => total + (Number(wallet[key]) || 0), 0));

  return (
    <ResourceListPage
      title="Wallets"
      description="Balances held by customers, vendors and delivery partners."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Finance", href: "/finance" },
        { label: "Wallets" },
      ]}
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Wallets"
            value={formatNumber(wallets.data?.total)}
            icon={Wallet}
            tone="indigo"
            loading={wallets.isPending}
          />
          <StatCard
            label="Held balance (page)"
            value={sum("balance")}
            icon={Landmark}
            tone="violet"
            loading={wallets.isPending}
            hint="Platform liability"
          />
          <StatCard
            label="Credited (page)"
            value={sum("totalCredited")}
            icon={ArrowDownLeft}
            tone="emerald"
            loading={wallets.isPending}
          />
          <StatCard
            label="Debited (page)"
            value={sum("totalDebited")}
            icon={ArrowUpRight}
            tone="amber"
            loading={wallets.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search wallet holder…"
          />
          <FilterSelect
            value={list.filters.ownerType ?? ""}
            onChange={(value) => list.setFilter("ownerType", value)}
            options={OWNER_OPTIONS}
            placeholder="All holders"
            allLabel="All holders"
          />
        </>
      }
      columns={columns}
      query={wallets}
      list={list}
      rowKey={(wallet) => wallet._id}
      emptyTitle="No wallets found"
    />
  );
}
