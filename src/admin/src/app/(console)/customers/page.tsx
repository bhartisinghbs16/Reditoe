"use client";

import * as React from "react";
import { api, ApiError } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Download,
  Upload,
  Eye,
  MoreHorizontal,
  ShieldCheck,
  ShoppingBag,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { ResourceListPage } from "@/components/common/resource-page";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterSelect, SearchField } from "@/components/common/filter-bar";
import type { Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCustomers,
  useSetCustomerBlocked,
  useBulkCreditWallets,
} from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { LocationFilters } from "@/components/common/location-filters";
import { ExportButton } from "@/components/common/export-button";
import type { ExportColumn } from "@/lib/export";

/** What a customer export contains, in the order it reads. */
const CUSTOMER_COLUMNS: ExportColumn<Customer>[] = [
  { header: "Name", value: (c) => c.name },
  { header: "Email", value: (c) => c.email },
  { header: "Phone", value: (c) => c.phone },
  // A customer has no city of their own - they have addresses. The first one
  // is the one they order to, so it is the one worth exporting.
  { header: "City", value: (c) => c.savedAddresses?.[0]?.city },
  { header: "State", value: (c) => c.savedAddresses?.[0]?.state },
  { header: "Orders", value: (c) => c.totalOrders },
  { header: "Lifetime value", value: (c) => c.totalSpent },
  { header: "Wallet balance", value: (c) => c.walletBalance },
  { header: "Status", value: (c) => (c.isBlocked ? "Blocked" : "Active") },
  { header: "Joined", value: (c) => c.createdAt?.slice(0, 10) },
];
import {
  currency,
  date as formatDate,
  number as formatNumber,
  phone as formatPhone,
} from "@/lib/format";
import type { Customer } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
];

export default function CustomersPage() {
  const router = useRouter();
  const list = useListState({ status: "", state: "", city: "" });
  const customers = useCustomers(list.params);
  const bulkCredit = useBulkCreditWallets();
  const creditFileRef = React.useRef<HTMLInputElement>(null);
  const setBlocked = useSetCustomerBlocked();
  const [downloadingTemplate, setDownloadingTemplate] = React.useState(false);

  async function toggleBlock(customer: Customer) {
    const next = !customer.isBlocked;
    try {
      await setBlocked.mutateAsync({ id: customer._id, isBlocked: next });
      toast.success(next ? "Customer blocked" : "Customer unblocked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update customer");
    }
  }

  const columns: Column<Customer>[] = [
    {
      id: "customer",
      header: "Customer",
      cell: (customer) => (
        <IdentityCell
          name={customer.name ?? "Unnamed"}
          secondary={customer.email}
          image={customer.avatar ?? customer.profilePhoto}
        />
      ),
    },
    {
      id: "phone",
      header: "Phone",
      hideBelow: "md",
      cell: (customer) => formatPhone(customer.phone),
    },
    {
      id: "orders",
      header: "Orders",
      align: "right",
      hideBelow: "lg",
      cell: (customer) => (
        <span className="tabular-nums">{formatNumber(customer.totalOrders ?? 0)}</span>
      ),
    },
    {
      id: "spent",
      header: "Lifetime value",
      align: "right",
      hideBelow: "lg",
      cell: (customer) => (
        <span className="tabular-nums">{currency(customer.totalSpent ?? 0)}</span>
      ),
    },
    {
      id: "wallet",
      header: "Wallet",
      align: "right",
      hideBelow: "xl",
      cell: (customer) => (
        <span className="tabular-nums">{currency(customer.walletBalance ?? 0)}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (customer) => (
        <StatusBadge status={customer.isBlocked ? "blocked" : "active"} />
      ),
    },
    {
      id: "joined",
      header: "Joined",
      hideBelow: "xl",
      cell: (customer) => (
        <StackedCell
          primary={formatDate(customer.createdAt)}
          secondary={customer.isProfileComplete ? "Profile complete" : "Incomplete"}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (customer) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Customer actions"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuItem asChild>
              <Link href={`/customers/${customer._id}`}>
                <Eye className="size-4" />
                View profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant={customer.isBlocked ? "default" : "destructive"}
              onSelect={() => toggleBlock(customer)}
            >
              {customer.isBlocked ? (
                <>
                  <UserRoundCheck className="size-4" />
                  Unblock
                </>
              ) : (
                <>
                  <Ban className="size-4" />
                  Block
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const total = customers.data?.total ?? 0;
  const items = customers.data?.items ?? [];
  const blocked = items.filter((customer) => customer.isBlocked).length;

  return (
    <ResourceListPage
      title="Customers"
      description="Everyone who has ordered on the marketplace, with lifetime value and account state."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Customers" }]}
      actions={
        <>
          {/*
            A spreadsheet of wallet credits. Every row is checked before any
            money moves, so a file with one bad row credits nobody - a
            half-applied upload cannot be told from a complete one without
            reading the ledger row by row.
          */}
          <input
            ref={creditFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared straight away so choosing the same file twice still
              // fires a change and re-runs the upload.
              event.target.value = "";
              if (!file) return;
              bulkCredit.mutate(
                { file },
                {
                  onSuccess: (result) => {
                    const failures = result?.data?.failures ?? [];
                    if (failures.length > 0) {
                      toast.warning(result?.message ?? "Some rows failed", {
                        description: failures.slice(0, 3).join(" · "),
                      });
                    } else {
                      toast.success(result?.message ?? "Wallets credited");
                    }
                  },
                  onError: (error) => {
                    /*
                     * The server says which rows are wrong and why. This
                     * looked for them on `error.data`, where they have never
                     * been - ApiError keeps the body on `payload` - so all
                     * anyone saw was "2 row(s) need fixing" with no way to
                     * tell which two.
                     */
                    const problems =
                      error instanceof ApiError
                        ? (error.payload as { data?: { problems?: string[] } })
                            ?.data?.problems
                        : undefined;
                    toast.error(
                      error instanceof Error ? error.message : "Upload failed",
                      problems?.length
                        ? {
                            description: problems.join("\n"),
                            duration: 12000,
                          }
                        : undefined
                    );
                  },
                }
              );
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={downloadingTemplate}
            onClick={async () => {
              /*
               * Fetched, not linked. A link navigates without the admin
               * token, so this used to download the API's "Admin access
               * requires login" reply in place of the spreadsheet.
               */
              setDownloadingTemplate(true);
              try {
                await api.download(
                  "/admin/users/wallet/credit-template",
                  "wallet-credits.xlsx"
                );
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not download the template"
                );
              } finally {
                setDownloadingTemplate(false);
              }
            }}
          >
            <Download className="size-3.5" />
            {downloadingTemplate ? "Preparing..." : "Credit template"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={bulkCredit.isPending}
            onClick={() => creditFileRef.current?.click()}
          >
            <Upload className="size-3.5" />
            {bulkCredit.isPending ? "Crediting…" : "Bulk wallet credit"}
          </Button>
          <ExportButton<Customer>
          path="/admin/users"
          listKey="users"
          filename="reditoe-customers"
          query={list.params}
          columns={CUSTOMER_COLUMNS}
          />
        </>
      }
      stats={
        <StatGrid columns={4}>
          <StatCard
            label="Total customers"
            value={formatNumber(total)}
            icon={UsersRound}
            tone="indigo"
            loading={customers.isPending}
          />
          <StatCard
            label="On this page"
            value={formatNumber(items.length)}
            icon={ShoppingBag}
            tone="violet"
            loading={customers.isPending}
            hint="Matching current filters"
          />
          <StatCard
            label="Blocked (page)"
            value={formatNumber(blocked)}
            icon={Ban}
            tone="rose"
            loading={customers.isPending}
          />
          <StatCard
            label="Profile complete (page)"
            value={formatNumber(
              items.filter((customer) => customer.isProfileComplete).length
            )}
            icon={ShieldCheck}
            tone="emerald"
            loading={customers.isPending}
          />
        </StatGrid>
      }
      filters={
        <>
          <SearchField
            value={list.search}
            onChange={list.setSearch}
            placeholder="Search name, email or phone…"
          />
          <FilterSelect
            value={list.filters.status ?? ""}
            onChange={(value) => list.setFilter("status", value)}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
            allLabel="All statuses"
          />
          <LocationFilters
            state={list.filters.state ?? ""}
            city={list.filters.city ?? ""}
            onState={(value) => list.setFilter("state", value)}
            onCity={(value) => list.setFilter("city", value)}
          />
        </>
      }
      columns={columns}
      query={customers}
      list={list}
      rowKey={(customer) => customer._id}
      onRowClick={(customer) => router.push(`/customers/${customer._id}`)}
      emptyTitle="No customers match these filters"
      emptyDescription="Try a different search term or clear the status filter."
    />
  );
}
