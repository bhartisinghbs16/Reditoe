"use client";

import * as React from "react";
import Link from "next/link";
import {
  BadgePercent,
  BarChart3,
  CalendarClock,
  CircleCheck,
  Copy,
  Download,
  Eye,
  IndianRupee,
  Megaphone,
  MoreVertical,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { MiniMetricCard } from "@/components/dashboard/metric-card";
import { Panel, PanelLink } from "@/components/common/panel";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterBar, FilterSelect, SearchField } from "@/components/common/filter-bar";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/common/export-button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateCoupon, useCoupons, useDeleteCoupon, useUpdateCoupon } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { CreateDialog } from "@/components/common/create-dialog";
import {
  currency,
  currencyCompact,
  date as formatDate,
  dateTime,
  number as formatNumber,
  percent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Coupon } from "@/lib/types";

/**
 * Offers & Coupons, built to the client's reference screen: six headline
 * figures, a filter row, the offer table with usage meters, and a right rail
 * carrying the selected offer, its performance and the quick actions.
 */

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "expired", label: "Expired" },
  { value: "inactive", label: "Inactive" },
];

const TYPE_OPTIONS = [
  { value: "flat", label: "Flat discount" },
  { value: "percentage", label: "Percentage" },
];

/**
 * FilterSelect reserves "all" for its own no-filter row, so the everyone
 * audience needs a distinct value here or Radix renders both labels in the
 * trigger ("All AudiencesAll users").
 */
const AUDIENCE_OPTIONS = [
  { value: "all_users", label: "All users" },
  { value: "new", label: "New users" },
  { value: "partners", label: "Delivery partners" },
];

/** An offer with no audience set applies to everyone. */
function audienceKey(coupon: Coupon) {
  const value = coupon.applicableFor;
  return !value || value === "all" ? "all_users" : value;
}

function audienceLabel(coupon: Coupon) {
  return (
    AUDIENCE_OPTIONS.find((option) => option.value === audienceKey(coupon))?.label ??
    "All users"
  );
}

/** Rotates the code tile through the reference's offer colours. */
const CODE_TINTS = [
  "bg-amber-50 text-amber-700",
  "bg-emerald-50 text-emerald-700",
  "bg-sky-50 text-sky-700",
  "bg-violet-50 text-violet-700",
  "bg-rose-50 text-rose-700",
  "bg-orange-50 text-orange-700",
];

/** Derives a display status when the API doesn't set one explicitly. */
function couponStatus(coupon: Coupon) {
  if (coupon.status) return coupon.status;
  const now = Date.now();
  if (coupon.validFrom && new Date(coupon.validFrom).getTime() > now) return "scheduled";
  if (coupon.validTill && new Date(coupon.validTill).getTime() < now) return "expired";
  return coupon.isActive === false ? "inactive" : "active";
}

function isFlat(coupon: Coupon) {
  return (coupon.discountType ?? "").toLowerCase().startsWith("flat");
}

/** "₹250 OFF" or "50% OFF", as the reference renders the benefit. */
function benefitLabel(coupon: Coupon) {
  if (coupon.discountValue === undefined) return "—";
  return isFlat(coupon)
    ? `${currency(coupon.discountValue)} OFF`
    : `${coupon.discountValue}% OFF`;
}

function CopyCode({ code }: { code: string }) {
  return (
    <button
      type="button"
      aria-label={`Copy ${code}`}
      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      onClick={async (event) => {
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(code);
          toast.success(`${code} copied`);
        } catch {
          toast.error("Couldn't copy to the clipboard");
        }
      }}
    >
      <Copy className="size-3.5" />
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-[0.8125rem] not-last:border-b not-last:border-border/70">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-words">{value ?? "—"}</span>
    </div>
  );
}

export default function OffersPage() {
  const list = useListState({ status: "", discountType: "", applicableFor: "" });
  const coupons = useCoupons(list.params);
  const createCoupon = useCreateCoupon();
  const [creating, setCreating] = React.useState(false);
  const deleteCoupon = useDeleteCoupon();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  /** The offer being corrected, or null when the edit dialog is shut. */
  const [editing, setEditing] = React.useState<Coupon | null>(null);
  const updateCoupon = useUpdateCoupon();

  const rows = React.useMemo(() => coupons.data?.items ?? [], [coupons.data]);

  // Status and audience aren't query params the API accepts, so they narrow
  // the loaded page rather than pretending to filter the whole result set.
  const visible = React.useMemo(() => {
    const status = list.filters.status ?? "";
    const audience = list.filters.applicableFor ?? "";
    return rows.filter((coupon) => {
      if (status && couponStatus(coupon) !== status) return false;
      if (audience && audienceKey(coupon) !== audience) return false;
      return true;
    });
  }, [rows, list.filters]);

  const selected =
    visible.find((coupon) => coupon._id === selectedId) ?? visible[0] ?? null;

  const countOf = (status: string) =>
    rows.filter((coupon) => couponStatus(coupon) === status).length;
  const redemptions = rows.reduce((sum, coupon) => sum + (coupon.usedCount ?? 0), 0);

  // A flat discount's spend is exactly redemptions x value. A percentage
  // discount depends on the order it was applied to, which isn't on the coupon
  // — so this totals the flat offers only, and the tile says so.
  const flatSpend = rows
    .filter(isFlat)
    .reduce(
      (sum, coupon) => sum + (coupon.usedCount ?? 0) * (coupon.discountValue ?? 0),
      0
    );

  async function onDelete(coupon: Coupon) {
    try {
      await deleteCoupon.mutateAsync({ id: coupon._id });
      toast.success(`Offer ${coupon.code ?? ""} removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove offer");
    }
  }

  const columns: Column<Coupon>[] = [
    {
      id: "offer",
      header: "Offer / Coupon Details",
      cell: (coupon, index) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg px-1 text-center text-[0.5625rem] leading-tight font-bold",
              CODE_TINTS[index % CODE_TINTS.length]
            )}
          >
            {(coupon.code ?? "OFFER").slice(0, 8)}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{coupon.title ?? "Untitled offer"}</div>
            <div className="truncate text-xs text-muted-foreground">
              {coupon.description}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "code",
      header: "Code",
      hideBelow: "lg",
      cell: (coupon) =>
        coupon.code ? (
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[0.75rem]">{coupon.code}</span>
            <CopyCode code={coupon.code} />
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "type",
      header: "Type",
      hideBelow: "xl",
      cell: (coupon) => (
        <StatusBadge
          tone={isFlat(coupon) ? "accent" : "info"}
          dot={false}
          label={isFlat(coupon) ? "Flat Discount" : "% Discount"}
        />
      ),
    },
    {
      id: "audience",
      header: "Applicable For",
      hideBelow: "xl",
      cell: (coupon) => audienceLabel(coupon),
    },
    {
      id: "benefit",
      header: "Discount / Benefit",
      cell: (coupon) => (
        <div className="min-w-0">
          <div className="font-medium">{benefitLabel(coupon)}</div>
          <div className="text-xs text-muted-foreground">
            {coupon.minOrderValue
              ? `Min. order ${currency(coupon.minOrderValue)}`
              : coupon.maxDiscount
                ? `Up to ${currency(coupon.maxDiscount)}`
                : "No minimum"}
          </div>
        </div>
      ),
    },
    {
      id: "usage",
      header: "Usage",
      hideBelow: "lg",
      cell: (coupon) => {
        const used = coupon.usedCount ?? 0;
        const cap = coupon.usageLimit ?? 0;
        const share = cap > 0 ? Math.min((used / cap) * 100, 100) : null;
        return (
          <div className="min-w-[7rem]">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="tabular-nums">
                {formatNumber(used)}
                {cap > 0 && (
                  <span className="text-muted-foreground"> / {formatNumber(cap)}</span>
                )}
              </span>
              {share !== null && (
                <span className="text-muted-foreground tabular-nums">
                  {percent(share)}
                </span>
              )}
            </div>
            {share !== null && <Progress value={share} className="mt-1 h-1.5" />}
          </div>
        );
      },
    },
    {
      id: "validity",
      header: "Validity",
      hideBelow: "xl",
      cell: (coupon) => (
        <div className="min-w-0 text-xs">
          <div>{formatDate(coupon.validFrom)}</div>
          <div className="text-muted-foreground">to {formatDate(coupon.validTill)}</div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (coupon) => <StatusBadge status={couponStatus(coupon)} />,
    },
    {
      id: "actions",
      header: "Action",
      align: "right",
      cell: (coupon) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`View ${coupon.code ?? "offer"}`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(coupon._id);
            }}
          >
            <Eye className="size-3.5" />
          </Button>
          {/* The pencil had no handler at all, so an offer could be created
              and read but never corrected. */}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Edit offer"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(coupon);
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Offer actions"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenuItem
                onSelect={() => {
                  if (coupon.code) navigator.clipboard?.writeText(coupon.code);
                  toast.success("Code copied");
                }}
              >
                <Copy className="size-4" />
                Copy code
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/marketing/campaigns">
                  <Megaphone className="size-4" />
                  Use in a campaign
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(coupon)}>
                <Trash2 className="size-4" />
                Delete offer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Offers & Coupons"
        description="Create, manage and track all offers, coupons and discounts."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Offers & Coupons" },
        ]}
        actions={
          <>
            {/* "Import Coupons" had no handler and the API has no bulk
                coupon import; they are created one at a time. */}
            <ExportButton<Coupon>
              path="/admin/coupons"
              listKey="coupons"
              filename="reditoe-offers"
              query={list.params}
              label="Export Report"
              columns={[
                { header: "Code", value: (r) => r.code ?? "" },
                { header: "Description", value: (r) => r.description ?? "" },
                { header: "Type", value: (r) => r.discountType ?? "" },
                { header: "Value", value: (r) => r.discountValue ?? 0 },
                { header: "Min order", value: (r) => r.minOrderValue ?? 0 },
                { header: "Used", value: (r) => r.usedCount ?? 0 },
                { header: "Limit", value: (r) => r.usageLimit ?? "" },
                { header: "Valid from", value: (r) => r.validFrom ?? "" },
                { header: "Valid to", value: (r) => r.validTill ?? "" },
                { header: "Active", value: (r) => (r.isActive ? "Yes" : "No") },
              ]}
            />
            <Button size="lg" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Create Offer / Coupon
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MiniMetricCard
          label="Total Offers"
          value={formatNumber(coupons.data?.total)}
          hint="All offers & coupons"
          icon={Tag}
          tone="purple"
        />
        <MiniMetricCard
          label="Active Offers"
          value={formatNumber(countOf("active"))}
          hint="Currently active"
          icon={CircleCheck}
          tone="green"
        />
        <MiniMetricCard
          label="Scheduled"
          value={formatNumber(countOf("scheduled"))}
          hint="Upcoming offers"
          icon={CalendarClock}
          tone="amber"
        />
        <MiniMetricCard
          label="Expired"
          value={formatNumber(countOf("expired"))}
          hint="Expired offers"
          icon={XCircle}
          tone="red"
        />
        <MiniMetricCard
          label="Total Redemptions"
          value={formatNumber(redemptions)}
          hint="Across this page"
          icon={BadgePercent}
          tone="blue"
        />
        <MiniMetricCard
          label="Discount Given"
          value={currencyCompact(flatSpend)}
          hint="Flat-discount offers only"
          icon={IndianRupee}
          tone="green"
        />
      </div>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[3fr_1fr]">
        <div>
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(coupon) => coupon._id}
            loading={coupons.isPending}
            error={coupons.error}
            onRetry={() => coupons.refetch()}
            onRowClick={(coupon) => setSelectedId(coupon._id)}
            emptyTitle="No offers match these filters"
            emptyDescription="Coupons and discounts you create appear here."
            toolbar={
              <FilterBar onReset={list.reset}>
                <SearchField
                  value={list.search}
                  onChange={list.setSearch}
                  placeholder="Search by offer name or code…"
                />
                <FilterSelect
                  value={list.filters.discountType ?? ""}
                  onChange={(value) => list.setFilter("discountType", value)}
                  options={TYPE_OPTIONS}
                  placeholder="Offer Type"
                  allLabel="All Types"
                />
                <FilterSelect
                  value={list.filters.applicableFor ?? ""}
                  onChange={(value) => list.setFilter("applicableFor", value)}
                  options={AUDIENCE_OPTIONS}
                  placeholder="Applicable For"
                  allLabel="All Audiences"
                />
                <FilterSelect
                  value={list.filters.status ?? ""}
                  onChange={(value) => list.setFilter("status", value)}
                  options={STATUS_OPTIONS}
                  placeholder="All Status"
                  allLabel="All Status"
                />
              </FilterBar>
            }
          />

          <div className="surface mt-3">
            <TablePagination
              page={list.page}
              pageSize={list.limit}
              total={coupons.data?.total ?? 0}
              onPageChange={list.setPage}
              onPageSizeChange={list.setLimit}
              className="border-t-0"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Panel
            title="Offer Details"
            action={
              selected ? <StatusBadge status={couponStatus(selected)} /> : undefined
            }
          >
            {selected ? (
              <>
                <div className="flex items-start gap-2.5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 px-1 text-center text-[0.5625rem] leading-tight font-bold text-amber-700">
                    {(selected.code ?? "OFFER").slice(0, 8)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[0.8125rem] font-semibold">
                      {selected.title ?? "Untitled offer"}
                    </p>
                    <p className="truncate text-[0.6875rem] text-muted-foreground">
                      {selected.description}
                    </p>
                  </div>
                </div>

                <div className="mt-3 border-t border-border pt-2">
                  <DetailRow
                    label="Offer Code"
                    value={
                      selected.code ? (
                        <span className="flex items-center justify-end gap-1.5">
                          <span className="font-mono text-[0.75rem]">
                            {selected.code}
                          </span>
                          <CopyCode code={selected.code} />
                        </span>
                      ) : undefined
                    }
                  />
                  <DetailRow
                    label="Offer Type"
                    value={isFlat(selected) ? "Flat discount" : "Percentage"}
                  />
                  <DetailRow
                    label="Applicable For"
                    value={audienceLabel(selected)}
                  />
                  <DetailRow label="Discount / Benefit" value={benefitLabel(selected)} />
                  <DetailRow
                    label="Max Discount"
                    value={
                      selected.maxDiscount ? currency(selected.maxDiscount) : undefined
                    }
                  />
                  <DetailRow
                    label="Min Order Value"
                    value={
                      selected.minOrderValue
                        ? currency(selected.minOrderValue)
                        : undefined
                    }
                  />
                  <DetailRow
                    label="Total Redemptions"
                    value={formatNumber(selected.usedCount ?? 0)}
                  />
                  <DetailRow label="Valid From" value={dateTime(selected.validFrom)} />
                  <DetailRow label="Valid Till" value={dateTime(selected.validTill)} />
                  <DetailRow
                    label="Usage Limit"
                    value={
                      selected.usageLimit ? formatNumber(selected.usageLimit) : "No limit"
                    }
                  />
                </div>
              </>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">
                Pick an offer to see its detail here.
              </p>
            )}
          </Panel>

          <Panel
            title="Performance Summary"
            description="Across the offers on this page."
            action={<PanelLink href="/analytics">View Full Analytics</PanelLink>}
          >
            <DetailRow label="Total Redemptions" value={formatNumber(redemptions)} />
            <DetailRow
              label="Discount Given"
              value={
                <span>
                  {currency(flatSpend)}
                  <span className="block text-[0.6875rem] font-normal text-muted-foreground">
                    Flat-discount offers only
                  </span>
                </span>
              }
            />
            <DetailRow
              label="Avg. Redemptions / Offer"
              value={
                rows.length ? formatNumber(Math.round(redemptions / rows.length)) : "—"
              }
            />
            <DetailRow
              label="Offers at Cap"
              value={formatNumber(
                rows.filter(
                  (coupon) =>
                    coupon.usageLimit &&
                    (coupon.usedCount ?? 0) >= (coupon.usageLimit ?? 0)
                ).length
              )}
            />
          </Panel>

          <Panel title="Quick Actions" bodyClassName="p-0">
            <ul>
              {[
                { icon: Plus, label: "Create New Offer", href: "/marketing/offers" },
                {
                  icon: Megaphone,
                  label: "Manage Campaigns",
                  href: "/marketing/campaigns",
                },
                { icon: BarChart3, label: "View Offer Analytics", href: "/analytics" },
              ].map(({ icon: Icon, label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[0.8125rem] transition-colors not-last:border-b not-last:border-border/70 hover:bg-muted/60"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        title="Create offer / coupon"
        description="Customers redeem this by entering the code at checkout."
        initial={{ discountType: "percentage" }}
        fields={[
          { name: "code", label: "Code", required: true, placeholder: "WELCOME50", hint: "Stored in capitals; it must be unique." },
          { name: "title", label: "Title", required: true, placeholder: "₹50 off your first order" },
          { name: "description", label: "Description", type: "textarea", placeholder: "Valid on orders above ₹199." },
          {
            name: "discountType",
            label: "Discount type",
            type: "select",
            required: true,
            options: [
              { value: "percentage", label: "Percentage off" },
              { value: "fixed", label: "Flat amount off" },
            ],
          },
          { name: "discountValue", label: "Discount value", type: "number", required: true, placeholder: "50" },
          { name: "minOrderValue", label: "Minimum order", type: "number", placeholder: "199" },
          { name: "maxDiscount", label: "Maximum discount", type: "number", placeholder: "100", hint: "Caps a percentage discount." },
          { name: "usageLimit", label: "Total uses allowed", type: "number", placeholder: "500" },
          { name: "validTill", label: "Valid until", type: "date", required: true },
        ]}
        onSubmit={(values) =>
          createCoupon.mutateAsync({
            code: values.code.trim().toUpperCase(),
            title: values.title,
            description: values.description || undefined,
            discountType: values.discountType,
            // Sent as numbers: the API compares these, and "50" would sort and
            // cap as text rather than as an amount.
            discountValue: Number(values.discountValue),
            minOrderValue: values.minOrderValue ? Number(values.minOrderValue) : undefined,
            maxDiscount: values.maxDiscount ? Number(values.maxDiscount) : undefined,
            usageLimit: values.usageLimit ? Number(values.usageLimit) : undefined,
            validTill: values.validTill,
            isActive: true,
          })
        }
      />

      {/* Correcting an existing offer — the same fields, filled in. */}
      <CreateDialog
        key={editing?._id ?? "no-edit"}
        open={editing !== null}
        onOpenChange={(open) => setEditing(open ? editing : null)}
        title="Edit offer / coupon"
        description="Changes apply to every future redemption of this code."
        submitLabel="Save"
        initial={{
          title: editing?.title ?? "",
          description: editing?.description ?? "",
          discountType: editing?.discountType ?? "percentage",
          discountValue: String(editing?.discountValue ?? ""),
          minOrderValue: editing?.minOrderValue ? String(editing.minOrderValue) : "",
          maxDiscount: editing?.maxDiscount ? String(editing.maxDiscount) : "",
          usageLimit: editing?.usageLimit ? String(editing.usageLimit) : "",
          validTill: (editing?.validTill ?? "").slice(0, 10),
        }}
        fields={[
          { name: "title", label: "Title", required: true, placeholder: "₹50 off your first order" },
          { name: "description", label: "Description", type: "textarea" },
          {
            name: "discountType",
            label: "Discount type",
            type: "select",
            required: true,
            options: [
              { value: "percentage", label: "Percentage off" },
              { value: "fixed", label: "Flat amount off" },
            ],
          },
          { name: "discountValue", label: "Discount value", type: "number", required: true },
          { name: "minOrderValue", label: "Minimum order", type: "number" },
          { name: "maxDiscount", label: "Maximum discount", type: "number" },
          { name: "usageLimit", label: "Total uses allowed", type: "number" },
          { name: "validTill", label: "Valid until", type: "date", required: true },
        ]}
        onSubmit={async (values) => {
          if (!editing) return;
          await updateCoupon.mutateAsync({
            id: editing._id,
            title: values.title,
            description: values.description || undefined,
            discountType: values.discountType,
            discountValue: Number(values.discountValue),
            minOrderValue: values.minOrderValue ? Number(values.minOrderValue) : undefined,
            maxDiscount: values.maxDiscount ? Number(values.maxDiscount) : undefined,
            usageLimit: values.usageLimit ? Number(values.usageLimit) : undefined,
            validTill: values.validTill,
          });
          setEditing(null);
        }}
      />
    </>
  );
}
