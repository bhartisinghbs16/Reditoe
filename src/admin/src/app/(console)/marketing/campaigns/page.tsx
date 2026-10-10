"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  BarChart3,
  CalendarClock,
  CircleCheck,
  Eye,
  Image as ImageIcon,
  Lightbulb,
  Megaphone,
  MoreVertical,
  MousePointerClick,
  Pencil,
  Plus,
  Send,
  Target,
  Trash2,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { MiniMetricCard } from "@/components/dashboard/metric-card";
import { Panel, PanelLink } from "@/components/common/panel";
import { DonutChart } from "@/components/charts/charts";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterBar, FilterSelect, SearchField } from "@/components/common/filter-bar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { CampaignDraft } from "@/lib/queries";
import { useCreateCampaign, useCampaigns, useDeleteCampaign } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";
import { CreateDialog } from "@/components/common/create-dialog";
import {
  currency,
  date as formatDate,
  number as formatNumber,
  percent,
  titleCase,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { campaignView, type CampaignView } from "@/lib/campaigns";

/**
 * Campaigns, built to the client's reference screen: six headline figures, a
 * filter row, the campaign table with engagement meters, and a right rail
 * carrying the status donut, the top performers and the quick actions.
 *
 * The reference's Reach and Engagement map onto impressions and clicks, which
 * is what a campaign record actually holds.
 */

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
  { value: "draft", label: "Draft" },
];

/**
 * The API filters on the delivery channel, which is what it stores as a
 * campaign's type. Offering purposes here sent values the API has no rows for,
 * so every choice returned nothing.
 */
const TYPE_OPTIONS = [
  { value: "PUSH_NOTIFICATION", label: "Push notification" },
  { value: "EMAIL", label: "Email" },
  { value: "BANNER", label: "In-app banner" },
  { value: "MULTI_CHANNEL", label: "Multi-channel" },
];

/** Rotates the campaign tile through the reference's banner colours. */
const TILE_TINTS = [
  "bg-rose-50 text-rose-600",
  "bg-amber-50 text-amber-600",
  "bg-violet-50 text-violet-600",
  "bg-emerald-50 text-emerald-600",
  "bg-sky-50 text-sky-600",
  "bg-orange-50 text-orange-600",
];

/** Medals on the top-three ranking, as the reference draws them. */
const MEDALS = ["text-amber-500", "text-slate-400", "text-orange-700"];

function engagementRate(campaign: CampaignView) {
  const reach = campaign.impressions ?? 0;
  if (!reach) return null;
  return ((campaign.clicks ?? 0) / reach) * 100;
}

export default function CampaignsPage() {
  const list = useListState({ status: "", type: "", objective: "" });
  const campaigns = useCampaigns(list.params);
  const deleteCampaign = useDeleteCampaign();
  const createCampaign = useCreateCampaign();
  const [creating, setCreating] = React.useState(false);

  const rows = React.useMemo(
    () => (campaigns.data?.items ?? []).map(campaignView),
    [campaigns.data]
  );

  // Audience isn't a query parameter the API accepts, so it narrows the loaded
  // page; status and type still go to the API.
  const visible = React.useMemo(() => {
    const audience = list.filters.objective ?? "";
    if (!audience) return rows;
    return rows.filter((campaign) => campaign.objective === audience);
  }, [rows, list.filters.objective]);

  const countOf = (status: string) =>
    rows.filter((campaign) => (campaign.status ?? "draft") === status).length;
  const reach = rows.reduce((sum, campaign) => sum + (campaign.impressions ?? 0), 0);
  const engagement = rows.reduce((sum, campaign) => sum + (campaign.clicks ?? 0), 0);

  const audienceOptions = React.useMemo(() => {
    const values = [...new Set(rows.map((c) => c.objective).filter(Boolean))];
    return values.sort().map((value) => ({ value: value!, label: value! }));
  }, [rows]);

  const statusMix = React.useMemo(() => {
    const totals = new Map<string, number>();
    for (const campaign of rows) {
      const label = titleCase(campaign.status ?? "draft");
      totals.set(label, (totals.get(label) ?? 0) + 1);
    }
    return [...totals.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  const topPerformers = React.useMemo(
    () =>
      [...rows]
        .filter((campaign) => (campaign.impressions ?? 0) > 0)
        .sort((a, b) => (engagementRate(b) ?? 0) - (engagementRate(a) ?? 0))
        .slice(0, 3),
    [rows]
  );

  const columns: Column<CampaignView>[] = [
    {
      id: "campaign",
      header: "Campaign Details",
      cell: (campaign, index) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              TILE_TINTS[index % TILE_TINTS.length]
            )}
          >
            <Megaphone className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{campaign.name ?? "Untitled"}</div>
            <div className="truncate text-xs text-muted-foreground">
              {campaign.budget !== undefined
                ? `Budget ${currency(campaign.budget)}`
                : "No budget set"}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      hideBelow: "lg",
      cell: (campaign) => (
        <StatusBadge tone="info" dot={false} label={titleCase(campaign.type)} />
      ),
    },
    {
      id: "audience",
      header: "Target Audience",
      hideBelow: "xl",
      cell: (campaign) => campaign.objective ?? "—",
    },
    {
      id: "reach",
      header: "Reach",
      align: "right",
      cell: (campaign) => (
        <span className="tabular-nums">{formatNumber(campaign.impressions ?? 0)}</span>
      ),
    },
    {
      id: "engagement",
      header: "Engagement",
      hideBelow: "lg",
      cell: (campaign) => {
        const rate = engagementRate(campaign);
        return (
          <div className="min-w-[6.5rem]">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium tabular-nums">
                {rate === null ? "—" : percent(rate)}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(campaign.clicks ?? 0)}
              </span>
            </div>
            {rate !== null && (
              <Progress value={Math.min(rate, 100)} className="mt-1 h-1.5" />
            )}
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: (campaign) => <StatusBadge status={campaign.status ?? "draft"} />,
    },
    {
      id: "duration",
      header: "Duration",
      hideBelow: "xl",
      cell: (campaign) => (
        <div className="min-w-0 text-xs">
          <div>{formatDate(campaign.startDate)}</div>
          <div className="text-muted-foreground">to {formatDate(campaign.endDate)}</div>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Action",
      align: "right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button asChild variant="outline" size="icon-sm" aria-label="View campaign">
            <Link href={`/marketing/campaigns/${row._id}`}>
              <Eye className="size-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm" aria-label="Campaign analytics">
            <Link href="/analytics">
              <TrendingUp className="size-3.5" />
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Campaign actions">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            {/* "Edit campaign" and "Duplicate" used to sit above the delete
                entry with no handlers and no endpoints behind them. */}
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  deleteCampaign
                    .mutateAsync({ id: row._id })
                    .then(() => toast.success("Campaign deleted"))
                    .catch((error: unknown) =>
                      toast.error(
                        error instanceof Error ? error.message : "Couldn't delete it"
                      )
                    );
                }}
              >
                <Trash2 className="size-4" />
                Delete campaign
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
        title="Campaigns"
        description="Create, manage and track all marketing campaigns."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Campaigns" },
        ]}
        actions={
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Create Campaign
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MiniMetricCard
          label="Total Campaigns"
          value={formatNumber(campaigns.data?.total)}
          hint="All time"
          icon={Megaphone}
          tone="purple"
        />
        <MiniMetricCard
          label="Active Campaigns"
          value={formatNumber(countOf("active"))}
          hint="Currently running"
          icon={CircleCheck}
          tone="green"
        />
        <MiniMetricCard
          label="Scheduled"
          value={formatNumber(countOf("scheduled"))}
          hint="Upcoming"
          icon={CalendarClock}
          tone="amber"
        />
        <MiniMetricCard
          label="Completed"
          value={formatNumber(countOf("completed"))}
          hint="Finished"
          icon={Target}
          tone="blue"
        />
        <MiniMetricCard
          label="Total Reach"
          value={formatNumber(reach)}
          hint="Impressions on this page"
          icon={UsersRound}
          tone="blue"
        />
        <MiniMetricCard
          label="Total Engagement"
          value={formatNumber(engagement)}
          hint="Clicks on this page"
          icon={MousePointerClick}
          tone="green"
        />
      </div>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[3fr_1fr]">
        <div>
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(campaign) => campaign._id}
            loading={campaigns.isPending}
            error={campaigns.error}
            onRetry={() => campaigns.refetch()}
            emptyTitle="No campaigns match these filters"
            emptyDescription="Campaigns you create appear here."
            toolbar={
              <FilterBar onReset={list.reset}>
                <SearchField
                  value={list.search}
                  onChange={list.setSearch}
                  placeholder="Search campaign name…"
                />
                <FilterSelect
                  value={list.filters.type ?? ""}
                  onChange={(value) => list.setFilter("type", value)}
                  options={TYPE_OPTIONS}
                  placeholder="Campaign Type"
                  allLabel="All Types"
                />
                <FilterSelect
                  value={list.filters.objective ?? ""}
                  onChange={(value) => list.setFilter("objective", value)}
                  options={audienceOptions}
                  placeholder="Target Audience"
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
              total={campaigns.data?.total ?? 0}
              onPageChange={list.setPage}
              onPageSizeChange={list.setLimit}
              className="border-t-0"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Panel title="Campaign Overview">
            {rows.length === 0 ? (
              <p className="text-[0.8125rem] text-muted-foreground">
                No campaigns loaded.
              </p>
            ) : (
              <DonutChart
                slices={statusMix}
                centerLabel="Total"
                centerValue={formatNumber(rows.length)}
                height={230}
              />
            )}
          </Panel>

          <Panel
            title="Top Performing Campaigns"
            description="By engagement rate on this page."
            action={<PanelLink href="/analytics">View All</PanelLink>}
          >
            {topPerformers.length === 0 ? (
              <p className="text-[0.8125rem] text-muted-foreground">
                No campaign has reach recorded yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {topPerformers.map((campaign, index) => (
                  <li key={campaign._id} className="flex items-start gap-2.5">
                    <Award className={cn("mt-0.5 size-4 shrink-0", MEDALS[index])} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-medium">
                        {campaign.name ?? "Untitled"}
                      </p>
                      <p className="text-[0.6875rem] text-muted-foreground">
                        Reach {formatNumber(campaign.impressions ?? 0)}
                      </p>
                      <p className="text-[0.6875rem] text-muted-foreground">
                        Engagement {percent(engagementRate(campaign) ?? 0)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Quick Actions" bodyClassName="p-0">
            <ul>
              {[
                { icon: Plus, label: "Create Campaign", href: "/marketing/campaigns" },
                {
                  icon: Send,
                  label: "Send Push Notification",
                  href: "/marketing/notifications",
                },
                { icon: ImageIcon, label: "Manage Banners", href: "/marketing/banners" },
                { icon: BarChart3, label: "View Campaign Analytics", href: "/analytics" },
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

          <div className="rounded-xl bg-accent p-3.5">
            <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-accent-foreground">
              <Lightbulb className="size-4" />
              Campaign Tips
            </p>
            <ul className="mt-2 space-y-1.5">
              {[
                "Use attractive banners for more engagement.",
                "Target the right audience for better results.",
                "Track performance and optimise regularly.",
              ].map((tip) => (
                <li
                  key={tip}
                  className="flex items-start gap-2 text-[0.75rem] text-accent-foreground"
                >
                  <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
                  <span className="min-w-0 flex-1">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        title="Create campaign"
        description="Created paused. Activate it from the list when you are ready to send."
        initial={{ campaignType: "PUSH_NOTIFICATION" }}
        fields={[
          { name: "name", label: "Campaign name", required: true, placeholder: "Weekend biryani push" },
          {
            name: "campaignType",
            label: "Channel",
            type: "select",
            required: true,
            options: [
              { value: "PUSH_NOTIFICATION", label: "Push notification" },
              { value: "EMAIL", label: "Email" },
              { value: "SMS", label: "SMS" },
              { value: "IN_APP", label: "In-app" },
              { value: "BANNER", label: "Banner" },
            ],
          },
          { name: "description", label: "Description", type: "textarea", placeholder: "What this campaign is for." },
          { name: "title", label: "Message title", required: true, placeholder: "Hungry this weekend?" },
          {
            name: "message",
            label: "Message",
            type: "textarea",
            required: true,
            placeholder: "Flat 20% off every biryani until Sunday.",
          },
        ]}
        onSubmit={(values) =>
          createCampaign.mutateAsync({
            name: values.name,
            campaignType: values.campaignType as CampaignDraft["campaignType"],
            description: values.description || undefined,
            // Push and email are refused without both of these.
            content: { title: values.title, message: values.message },
          })
        }
      />
    </>
  );
}
