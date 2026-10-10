"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgePercent,
  Copy,
  Info,
  MousePointerClick,
  Pencil,
  ShoppingBag,
  Target,
  Trash2,
  UsersRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { SegmentedTabs } from "@/components/common/filter-bar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCampaign, useDeleteCampaign } from "@/lib/queries";
import {
  currency,
  date as formatDate,
  dateTime,
  number as formatNumber,
  percent,
  shortId,
  titleCase,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { campaignView, type CampaignView } from "@/lib/campaigns";

/**
 * Campaign Details, built to the client's reference screen: the creative and
 * the campaign's facts across the top, a tab strip, then the funnel and what
 * the platform actually knows about how it performed.
 *
 * A campaign record holds impressions, clicks, conversions, budget and spend.
 * The reference also draws reach, redemptions, a per-day series and device,
 * gender, channel and location breakdowns — all of which need event-level data
 * the API doesn't keep. Those are named as missing rather than filled with
 * numbers, and the funnel below is built from the three counts that are real.
 */

const TABS = [
  { label: "Overview", value: "overview" },
  { label: "Performance", value: "performance" },
  { label: "Audience", value: "audience" },
  { label: "Locations", value: "locations" },
];

/** Breakdowns the reference draws that need event-level data to exist. */
const MISSING_BREAKDOWNS = [
  { label: "Device breakdown", needs: "Per-impression device recorded on delivery." },
  { label: "Gender & age breakdown", needs: "Demographics on the user record." },
  { label: "Channel breakdown", needs: "Which surface each impression came from." },
  { label: "Location breakdown", needs: "Impressions and redemptions tagged by city." },
  { label: "Redemptions", needs: "A link from a coupon redemption back to a campaign." },
  { label: "Per-day series", needs: "Daily counters, not lifetime totals." },
];

function Metric({
  icon: Icon,
  label,
  value,
  foot,
  tone,
}: {
  icon: typeof UsersRound;
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="surface flex flex-col p-3.5">
      <span className="flex items-center gap-2 text-[0.75rem] text-muted-foreground">
        <span
          className={cn("flex size-7 items-center justify-center rounded-lg", tone)}
        >
          <Icon className="size-3.5" />
        </span>
        {label}
      </span>
      <p data-numeric className="mt-2 text-xl font-semibold tracking-tight">
        {value}
      </p>
      {foot && (
        <div className="mt-2 border-t border-border pt-2 text-[0.6875rem] text-muted-foreground">
          {foot}
        </div>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-[0.8125rem] font-medium break-words">{children}</div>
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaign = useCampaign(params.id);

  if (campaign.isPending) {
    return (
      <>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-40 w-full" />
        <Skeleton className="mt-3 h-96 w-full" />
      </>
    );
  }

  if (campaign.isError) {
    return (
      <div className="surface">
        <ErrorState
          title="Couldn't load this campaign"
          description={campaign.error?.message}
          onRetry={() => campaign.refetch()}
        />
      </div>
    );
  }

  if (!campaign.data) {
    return (
      <div className="surface">
        <EmptyState
          title="Campaign not found"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/marketing/campaigns">Back to campaigns</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <CampaignDetail campaign={campaignView(campaign.data)} />;
}

function CampaignDetail({ campaign }: { campaign: CampaignView }) {
  const router = useRouter();
  const deleteCampaign = useDeleteCampaign();
  const [tab, setTab] = React.useState("overview");

  const impressions = campaign.impressions ?? 0;
  const clicks = campaign.clicks ?? 0;
  const conversions = campaign.conversions ?? 0;
  const budget = campaign.budget ?? 0;
  const spent = campaign.spent ?? 0;

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;
  const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : null;
  const spendShare = budget > 0 ? Math.min((spent / budget) * 100, 100) : null;

  const code = shortId(campaign._id, "CMP");
  const duration =
    campaign.startDate && campaign.endDate
      ? Math.max(
          1,
          Math.round(
            (new Date(campaign.endDate).getTime() -
              new Date(campaign.startDate).getTime()) /
              86_400_000
          ) + 1
        )
      : null;

  /** Impressions → clicks → orders, the three counts that are real. */
  const funnel = [
    { stage: "Impressions", count: impressions },
    { stage: "Clicks", count: clicks },
    { stage: "Orders", count: conversions },
  ];

  return (
    <>
      <PageHeader
        title="Campaign Details"
        badge={<StatusBadge status={campaign.status ?? "draft"} />}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Campaigns", href: "/marketing/campaigns" },
          { label: campaign.name ?? "Detail" },
        ]}
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href="/marketing/campaigns">
                <ArrowLeft className="size-4" />
                Back to Campaigns
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="lg">
                  Actions
                </Button>
              </DropdownMenuTrigger>
              {/* "Edit campaign" had no handler and no endpoint: a campaign
                  that has gone out is not rewritten. */}
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/marketing/campaigns/new">
                    <Copy className="size-4" />
                    Duplicate
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    deleteCampaign
                      .mutateAsync({ id: campaign._id })
                      .then(() => {
                        toast.success("Campaign deleted");
                        router.push("/marketing/campaigns");
                      })
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
          </>
        }
      />

      {/* Creative beside the facts, as the reference opens. */}
      <div className="grid items-start gap-3 lg:grid-cols-[1fr_1.8fr]">
        <div className="surface overflow-hidden p-4">
          <div className="rounded-xl bg-accent p-4">
            <span className="inline-flex rounded bg-primary px-2 py-0.5 text-[0.625rem] font-bold tracking-wide text-primary-foreground uppercase">
              {titleCase(campaign.type)}
            </span>
            <p className="mt-2 text-lg leading-tight font-bold text-accent-foreground">
              {campaign.name ?? "Untitled campaign"}
            </p>
            <p className="mt-1 text-[0.8125rem] text-accent-foreground/80">
              {campaign.objective ?? "All users"}
            </p>
          </div>
          <p className="mt-2 text-[0.6875rem] text-muted-foreground">
            {/* The record has no creative, so the preview is built from the
                campaign's own fields rather than an uploaded banner. */}
            Built from the campaign&apos;s fields — no banner artwork is stored.
          </p>
        </div>

        <div className="surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {campaign.name ?? "Untitled campaign"}
            </h2>
            <StatusBadge status={campaign.status ?? "draft"} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
            <StatusBadge tone="info" dot={false} label={titleCase(campaign.type)} />
            <StatusBadge
              tone="neutral"
              dot={false}
              label={campaign.objective ?? "All users"}
            />
          </p>

          <div className="mt-4 grid gap-4 border-t border-border pt-3 sm:grid-cols-3 xl:grid-cols-5">
            <Fact label="Campaign Code">
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-[0.75rem]">{code}</span>
                <button
                  type="button"
                  aria-label="Copy campaign code"
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(code);
                      toast.success("Campaign code copied");
                    } catch {
                      toast.error("Couldn't copy to the clipboard");
                    }
                  }}
                >
                  <Copy className="size-3.5" />
                </button>
              </span>
            </Fact>
            <Fact label="Start Date">{dateTime(campaign.startDate)}</Fact>
            <Fact label="End Date">{dateTime(campaign.endDate)}</Fact>
            <Fact label="Duration">
              {duration === null ? "—" : `${duration} day${duration === 1 ? "" : "s"}`}
            </Fact>
            <Fact label="Created">{formatDate(campaign.createdAt)}</Fact>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          options={TABS}
          className="mb-4 w-fit max-w-full"
        />
      </div>

      {tab === "overview" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric
              icon={UsersRound}
              tone="bg-sky-50 text-sky-600"
              label="Total Reach"
              value="—"
              foot="Distinct users reached isn't recorded"
            />
            <Metric
              icon={Target}
              tone="bg-violet-50 text-violet-600"
              label="Impressions"
              value={formatNumber(impressions)}
            />
            <Metric
              icon={MousePointerClick}
              tone="bg-emerald-50 text-emerald-600"
              label="Clicks"
              value={formatNumber(clicks)}
              foot={ctr === null ? "No impressions yet" : `CTR ${percent(ctr, 2)}`}
            />
            <Metric
              icon={ShoppingBag}
              tone="bg-amber-50 text-amber-600"
              label="Orders"
              value={formatNumber(conversions)}
              foot={
                conversionRate === null
                  ? "No clicks yet"
                  : `Conversion ${percent(conversionRate, 2)}`
              }
            />
            <Metric
              icon={BadgePercent}
              tone="bg-rose-50 text-rose-600"
              label="Redemptions"
              value="—"
              foot="Coupon redemptions aren't linked to a campaign"
            />
            <Metric
              icon={Wallet}
              tone="bg-emerald-50 text-emerald-600"
              label="Total Spend"
              value={currency(spent)}
              foot={
                <>
                  <span className="block">Budget {currency(budget)}</span>
                  {spendShare !== null && (
                    <>
                      <Progress value={spendShare} className="mt-1.5 h-1.5" />
                      <span className="mt-1 block tabular-nums">
                        {percent(spendShare)} used
                      </span>
                    </>
                  )}
                </>
              }
            />
          </div>

          <div className="mt-3 grid items-start gap-3 xl:grid-cols-[1.6fr_1fr]">
            <Panel
              title="Funnel"
              description="Impressions to clicks to orders — the three counts the campaign record actually keeps."
            >
              {/*
                A bar chart is the wrong form here: impressions run ~70x the
                order count, so on a shared linear axis the last two stages
                render as invisible slivers. Proportional rows keep every
                stage readable and put the drop-off between them where it
                belongs.
              */}
              <ol className="space-y-3">
                {funnel.map((stage, index) => {
                  const share =
                    funnel[0].count > 0 ? (stage.count / funnel[0].count) * 100 : 0;
                  const previous = index > 0 ? funnel[index - 1].count : null;
                  const stepRate =
                    previous && previous > 0 ? (stage.count / previous) * 100 : null;
                  return (
                    <li key={stage.stage}>
                      <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                        <span className="font-medium">{stage.stage}</span>
                        <span className="flex items-baseline gap-2">
                          <span data-numeric className="font-semibold">
                            {formatNumber(stage.count)}
                          </span>
                          <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                            {percent(share, 1)} of impressions
                          </span>
                        </span>
                      </div>
                      <div
                        aria-hidden
                        className="mt-1 h-6 overflow-hidden rounded bg-muted"
                      >
                        <div
                          className="h-full rounded bg-primary"
                          style={{ width: `${Math.max(share, 0.4)}%` }}
                        />
                      </div>
                      {stepRate !== null && (
                        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                          {percent(stepRate, 2)} of {funnel[index - 1].stage.toLowerCase()}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
              <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                <Fact label="Click-through rate">
                  {ctr === null ? "—" : percent(ctr, 2)}
                </Fact>
                <Fact label="Click-to-order rate">
                  {conversionRate === null ? "—" : percent(conversionRate, 2)}
                </Fact>
              </div>
            </Panel>

            <Panel
              title="What this screen still needs"
              description="The reference draws these; the API keeps lifetime totals only."
            >
              <ul className="space-y-2.5">
                {MISSING_BREAKDOWNS.map((entry) => (
                  <li key={entry.label} className="flex items-start gap-2.5">
                    <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.8125rem] font-medium">
                        {entry.label}
                      </span>
                      <span className="block text-[0.6875rem] text-muted-foreground">
                        Needs: {entry.needs}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}

      {tab !== "overview" && (
        <Panel title={TABS.find((entry) => entry.value === tab)?.label}>
          <p className="text-[0.8125rem] text-muted-foreground">
            This breakdown needs event-level campaign data — per-impression device,
            location and audience — which the API doesn&apos;t record. Overview shows
            the totals that are kept.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setTab("overview")}
          >
            Back to Overview
          </Button>
        </Panel>
      )}
    </>
  );
}
