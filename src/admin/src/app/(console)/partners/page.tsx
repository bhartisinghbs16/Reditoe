"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Bike,
  CircleCheck,
  Download,
  Eye,
  IndianRupee,
  MoreVertical,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { MiniMetricCard } from "@/components/dashboard/metric-card";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { IdentityCell, StackedCell } from "@/components/common/cells";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterBar, FilterSelect, SearchField } from "@/components/common/filter-bar";
import { Button } from "@/components/ui/button";
import { downloadCsv, stampedName, toCsv } from "@/lib/export";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRiders, useSetRiderBlocked, useUpdateRiderKyc } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { ExportButton } from "@/components/common/export-button";
import type { ExportColumn } from "@/lib/export";

/** What a delivery partner export contains, in the order it reads. */
const PARTNER_COLUMNS: ExportColumn<Rider>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Partner ID", value: (r) => r.riderId },
  { header: "Phone", value: (r) => r.phone },
  { header: "Email", value: (r) => r.email },
  { header: "City", value: (r) => r.city },
  { header: "State", value: (r) => r.state },
  { header: "Vehicle", value: (r) => r.vehicleNumber },
  { header: "Deliveries", value: (r) => r.totalDeliveries },
  { header: "Earnings", value: (r) => r.totalEarnings },
  { header: "Rating", value: (r) => r.currentRating ?? r.rating },
  { header: "KYC", value: (r) => r.kycStatus },
  { header: "Status", value: (r) => (r.isBlocked ? "Blocked" : r.status) },
  { header: "Joined", value: (r) => r.createdAt?.slice(0, 10) },
];
import {
  KYC_STATUS_OPTIONS,
  ONBOARDING_STATUS_OPTIONS,
  RIDER_STATUS_OPTIONS,
  VEHICLE_TYPE_OPTIONS,
} from "@/lib/domain";
import {
  currency,
  currencyCompact,
  date as formatDate,
  number as formatNumber,
  phone as formatPhone,
  shortId,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Rider } from "@/lib/types";

/**
 * Delivery Partners, built to the client's reference screen: five headline
 * figures, a six-control filter row, and the reference's columns with the
 * duty state read out beneath each name.
 */

const DUTY_OPTIONS = [
  { value: "on", label: "On duty" },
  { value: "off", label: "Off duty" },
];

const RATING_OPTIONS = [
  { value: "4.5", label: "4.5 and above" },
  { value: "4", label: "4.0 and above" },
  { value: "3", label: "3.0 and above" },
];

/** The reference reads duty state as a coloured dot under the partner's name. */
function DutyLine({ rider }: { rider: Rider }) {
  const blocked = rider.isBlocked === true || rider.status === "blocked";
  const state = blocked
    ? { label: "Blocked", tint: "bg-danger" }
    : rider.status === "busy"
      ? { label: "Busy", tint: "bg-warning" }
      : rider.isOnline
        ? { label: "On Duty", tint: "bg-success" }
        : { label: "Offline", tint: "bg-muted-foreground" };
  return (
    <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", state.tint)} />
      {state.label}
    </span>
  );
}

export default function PartnersPage() {
  const router = useRouter();
  const list = useListState({
    status: "",
    onboardingStatus: "",
    kycStatus: "",
    vehicleType: "",
    duty: "",
    rating: "",
  });
  const riders = useRiders(list.params);
  const setBlocked = useSetRiderBlocked();
  const updateKyc = useUpdateRiderKyc();
  const [selected, setSelected] = React.useState<string[]>([]);

  const rows = React.useMemo(() => riders.data?.items ?? [], [riders.data]);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }

  // Duty and rating aren't query params the API supports, so they narrow the
  // loaded page rather than pretending to filter the whole result set.
  const visible = React.useMemo(() => {
    const duty = list.filters.duty ?? "";
    const rating = Number(list.filters.rating ?? "") || 0;
    return rows.filter((rider) => {
      if (duty === "on" && !rider.isOnline) return false;
      if (duty === "off" && rider.isOnline) return false;
      if (rating && (rider.currentRating ?? rider.rating ?? 0) < rating) return false;
      return true;
    });
  }, [rows, list.filters]);

  const active = rows.filter(
    (rider) => (rider.status ?? "active") === "active" && rider.isBlocked !== true
  ).length;
  const onDuty = rows.filter((rider) => rider.isOnline).length;
  const earnings = rows.reduce((sum, rider) => sum + (rider.totalEarnings ?? 0), 0);
  const deliveries = rows.reduce(
    (sum, rider) => sum + (rider.totalDeliveries ?? 0),
    0
  );

  const columns: Column<Rider>[] = [
    {
      id: "partner",
      header: "Partner Details",
      cell: (rider) => (
        <IdentityCell
          name={rider.name ?? "Unnamed"}
          secondary={<DutyLine rider={rider} />}
          image={rider.image}
        />
      ),
    },
    {
      id: "partnerId",
      header: "Partner ID",
      hideBelow: "lg",
      cell: (rider) => (
        <span className="text-[0.8125rem]">
          {rider.riderId ?? shortId(rider._id, "RDTP")}
        </span>
      ),
    },
    {
      id: "vehicle",
      header: "Vehicle Details",
      hideBelow: "xl",
      cell: (rider) => (
        <StackedCell
          primary={rider.vehicleName ?? rider.vehicleType ?? "—"}
          secondary={rider.vehicleNumber}
        />
      ),
    },
    {
      id: "phone",
      header: "Phone",
      hideBelow: "lg",
      cell: (rider) => formatPhone(rider.phone),
    },
    {
      id: "status",
      header: "Status",
      cell: (rider) =>
        /*
         * An unfinished signup is not active, inactive or blocked - it is a
         * person who started and stopped, and saying "Active" of somebody with
         * no account would be a lie.
         */
        rider.onboardingStatus === "onboarding_pending" ? (
          <StatusBadge tone="warning" dot={false} label="Onboarding Pending" />
        ) : (
          <StatusBadge status={rider.isBlocked ? "blocked" : (rider.status ?? "active")} />
        ),
    },
    {
      id: "rating",
      header: "Rating",
      align: "right",
      hideBelow: "md",
      cell: (rider) => {
        const rating = rider.currentRating ?? rider.rating;
        if (rating === undefined)
          return <span className="text-muted-foreground">—</span>;
        return (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {rating.toFixed(1)}
            <span className="text-[0.6875rem] text-muted-foreground">
              ({formatNumber(rider.totalDeliveries ?? 0)})
            </span>
          </span>
        );
      },
    },
    {
      id: "earnings",
      header: "Total Earnings",
      align: "right",
      cell: (rider) => (
        <span className="font-medium tabular-nums">
          {currency(rider.totalEarnings ?? 0)}
        </span>
      ),
    },
    {
      id: "joined",
      header: "Joined Date",
      hideBelow: "xl",
      cell: (rider) => formatDate(rider.createdAt),
    },
    {
      id: "actions",
      header: "Action",
      align: "right",
      cell: (rider) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            asChild
            variant="outline"
            size="icon-sm"
            aria-label="View partner"
            onClick={(event) => event.stopPropagation()}
          >
            <Link href={`/partners/${rider._id}`}>
              <Eye className="size-3.5" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="icon-sm"
            aria-label="Edit partner"
            onClick={(event) => event.stopPropagation()}
          >
            <Link href={`/partners/${rider._id}`}>
              <Pencil className="size-3.5" />
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Partner actions"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48"
              onClick={(event) => event.stopPropagation()}
            >
              {/*
                Both of these opened a platform-wide screen filtered by this
                partner, so looking at one person meant leaving them and
                finding them again. Their own page carries the documents and
                the money now.
              */}
              <DropdownMenuItem asChild>
                <Link href={`/partners/${rider._id}`}>
                  <ShieldCheck className="size-4" />
                  Documents
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/partners/${rider._id}`}>
                  <Wallet className="size-4" />
                  Payout &amp; earnings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/support?riderId=${rider._id}`}>
                  <Send className="size-4" />
                  Send Message
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {rider.kycStatus !== "approved" && (
                <DropdownMenuItem
                  onSelect={() =>
                    run(
                      () =>
                        updateKyc.mutateAsync({ id: rider._id, kycStatus: "approved" }),
                      "KYC verified"
                    )
                  }
                >
                  <CircleCheck className="size-4" />
                  Verify KYC
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() =>
                  run(
                    () =>
                      setBlocked.mutateAsync({
                        id: rider._id,
                        isBlocked: !rider.isBlocked,
                      }),
                    rider.isBlocked ? "Partner unblocked" : "Partner blocked"
                  )
                }
              >
                <Ban className="size-4" />
                {rider.isBlocked ? "Unblock Partner" : "Block Partner"}
              </DropdownMenuItem>
              {/* Deleting a partner had no handler and there is no endpoint
                  behind it; a rider with deliveries against them is blocked,
                  which is the entry above. */}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Delivery Partners"
        description="Manage and monitor all delivery partners."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Delivery Partners", href: "/partners" },
          { label: "All Delivery Partners" },
        ]}
        actions={
          <>
            <ExportButton<Rider>
              path="/admin/riders"
              listKey="riders"
              filename="reditoe-delivery-partners"
              query={list.params}
              columns={PARTNER_COLUMNS}
            />
            <Button asChild size="lg">
              <Link href="/partners/new">
                <Plus className="size-4" />
                Add Delivery Partner
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MiniMetricCard
          label="Total Partners"
          value={formatNumber(riders.data?.total)}
          hint="All delivery partners"
          icon={UserRoundCheck}
          tone="purple"
        />
        <MiniMetricCard
          label="Active Partners"
          value={formatNumber(active)}
          hint="Active on this page"
          icon={CircleCheck}
          tone="green"
        />
        <MiniMetricCard
          label="On Duty"
          value={formatNumber(onDuty)}
          hint="Online on this page"
          icon={Bike}
          tone="amber"
        />
        <MiniMetricCard
          label="Total Earnings"
          value={currencyCompact(earnings)}
          hint="Across this page"
          icon={IndianRupee}
          tone="blue"
        />
        <MiniMetricCard
          label="Deliveries"
          value={formatNumber(deliveries)}
          hint="Across this page"
          icon={Wallet}
          tone="green"
        />
      </div>

      <div className="mt-3">
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(rider) => rider._id}
          loading={riders.isPending}
          error={riders.error}
          onRetry={() => riders.refetch()}
          /*
           * An unfinished signup has no account behind it, so there is no
           * page to open - the id on that row is a placeholder. Clicking it
           * would land on a 404, so it does nothing.
           */
          onRowClick={(rider) => {
            if (rider.hasAccount === false) return;
            router.push(`/partners/${rider._id}`);
          }}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          emptyTitle="No delivery partners match these filters"
          emptyAction={
            <Button asChild size="sm">
              <Link href="/partners/new">Add the first partner</Link>
            </Button>
          }
          toolbar={
            <FilterBar onReset={list.reset}>
              <SearchField
                value={list.search}
                onChange={list.setSearch}
                placeholder="Search by name, phone or ID…"
              />
              <FilterSelect
                value={list.filters.status ?? ""}
                onChange={(value) => list.setFilter("status", value)}
                options={RIDER_STATUS_OPTIONS}
                placeholder="All Status"
                allLabel="All Status"
              />
              <FilterSelect
                value={list.filters.duty ?? ""}
                onChange={(value) => list.setFilter("duty", value)}
                options={DUTY_OPTIONS}
                placeholder="On Duty"
                allLabel="Any duty"
              />
              <FilterSelect
                value={list.filters.vehicleType ?? ""}
                onChange={(value) => list.setFilter("vehicleType", value)}
                options={VEHICLE_TYPE_OPTIONS}
                placeholder="Vehicle Type"
                allLabel="All Vehicles"
              />
              <FilterSelect
                value={list.filters.rating ?? ""}
                onChange={(value) => list.setFilter("rating", value)}
                options={RATING_OPTIONS}
                placeholder="All Rating"
                allLabel="All Rating"
              />
              <FilterSelect
                value={list.filters.kycStatus ?? ""}
                onChange={(value) => list.setFilter("kycStatus", value)}
                options={KYC_STATUS_OPTIONS}
                placeholder="All KYC"
                allLabel="All KYC"
              />
              {/*
                Who has finished signing up. "Onboarding pending" covers both
                somebody who verified their details and stopped - who has no
                account yet, and so was invisible here - and somebody who
                registered but never submitted.
              */}
              <FilterSelect
                value={list.filters.onboardingStatus ?? ""}
                onChange={(value) => list.setFilter("onboardingStatus", value)}
                options={ONBOARDING_STATUS_OPTIONS}
                placeholder="All Onboarding"
                allLabel="All Onboarding"
              />
            </FilterBar>
          }
        />

        {selected.length > 0 && (
          <div className="surface mt-3 flex flex-wrap items-center gap-3 px-4 py-3">
            <CircleCheck className="size-4 text-primary" />
            <span className="text-sm">
              {selected.length} partner{selected.length === 1 ? "" : "s"} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setSelected([])}
            >
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                /*
                 * The rows the user ticked, not the whole list. They are
                 * already on screen, so this needs no request - and pressing
                 * it used to do nothing at all.
                 */
                const chosen = rows.filter((rider) => selected.includes(rider._id));
                if (chosen.length === 0) return;
                downloadCsv(
                  stampedName("reditoe-partners-selected"),
                  toCsv(chosen, [
                    { header: "Partner", value: (r) => r.name ?? "" },
                    { header: "Phone", value: (r) => r.phone ?? "" },
                    { header: "City", value: (r) => r.city ?? "" },
                    { header: "Deliveries", value: (r) => r.totalDeliveries ?? 0 },
                    { header: "Status", value: (r) => (r.isBlocked ? "Blocked" : "Active") },
                  ])
                );
                toast.success(
                  `Exported ${chosen.length} partner${chosen.length === 1 ? "" : "s"}`
                );
              }}
            >
              <Download className="size-3.5" />
              Export selected
            </Button>
          </div>
        )}

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
    </>
  );
}
