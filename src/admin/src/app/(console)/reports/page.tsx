"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bike,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Receipt,
  ShoppingBag,
  Star,
  Store,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { HUES, type Hue } from "@/lib/accent";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  hue: Hue;
  /** Where the same data can be explored interactively. */
  exploreHref?: string;
}

const REPORTS: ReportDefinition[] = [
  {
    id: "orders",
    hue: "indigo",
    title: "Order report",
    description:
      "Every order in the range with customer, restaurant, rider, amounts and status.",
    icon: ShoppingBag,
    exploreHref: "/orders",
  },
  {
    id: "revenue",
    hue: "emerald",
    title: "Revenue report",
    description: "Gross revenue, commission, fees and taxes broken down by day.",
    icon: IndianRupee,
    exploreHref: "/finance",
  },
  {
    id: "settlements",
    hue: "teal",
    title: "Settlement report",
    description: "Vendor settlement cycles with gross, deductions and net payable.",
    icon: Receipt,
    exploreHref: "/finance/settlements",
  },
  {
    id: "vendors",
    hue: "rose",
    title: "Vendor performance",
    description: "Orders, revenue, average order value and rating per restaurant.",
    icon: Store,
    exploreHref: "/restaurants/performance",
  },
  {
    id: "riders",
    hue: "sky",
    title: "Delivery partner report",
    description: "Deliveries, earnings, success rate and ratings per partner.",
    icon: Bike,
    exploreHref: "/partners/performance",
  },
  {
    id: "customers",
    hue: "violet",
    title: "Customer report",
    description: "Signups, order frequency, lifetime value and churn signals.",
    icon: UsersRound,
    exploreHref: "/customers/analytics",
  },
  {
    id: "reviews",
    hue: "amber",
    title: "Ratings & reviews",
    description: "Review volume and rating distribution by restaurant and partner.",
    icon: Star,
    exploreHref: "/reviews",
  },
];

const FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel (XLSX)" },
  { value: "pdf", label: "PDF" },
];

/** Defaults to the last 30 days — the range people ask for most. */
function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export default function ReportsPage() {
  const [range, setRange] = React.useState(defaultRange);
  const [format, setFormat] = React.useState("csv");

  function onGenerate(report: ReportDefinition) {
    if (range.from > range.to) {
      toast.error("The start date is after the end date.");
      return;
    }
    // The backend streams the file; opening it lets the browser handle download.
    const params = new URLSearchParams({
      type: report.id,
      from: range.from,
      to: range.to,
      format,
    });
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
    window.open(`${base}/admin/reports/export?${params.toString()}`, "_blank");
    toast.success(`Preparing the ${report.title.toLowerCase()}…`);
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Generate an export for accounting, operations or a board pack."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }]}
      />

      {/* One filter row above everything it scopes — every report below uses it. */}
      <Panel title="Range & format" description="Applies to every report on this page.">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={range.from}
              onChange={(event) =>
                setRange((current) => ({ ...current, from: event.target.value }))
              }
              className="w-[10.5rem]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={range.to}
              onChange={(event) =>
                setRange((current) => ({ ...current, to: event.target.value }))
              }
              className="w-[10.5rem]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="format">Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger id="format" className="w-[9rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-1"
            onClick={() => setRange(defaultRange())}
          >
            Reset to last 30 days
          </Button>
        </div>
      </Panel>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => (
          <Panel key={report.id} className="justify-between">
            <div>
              <span className={cn("icon-tile shadow-sm", HUES[report.hue].tile)}>
                <report.icon className="size-[1.15rem]" />
              </span>
              <h3 className="mt-3 text-sm font-semibold">{report.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                {report.description}
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" onClick={() => onGenerate(report)}>
                <Download className="size-3.5" />
                Export
              </Button>
              {report.exploreHref && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={report.exploreHref}>Explore</Link>
                </Button>
              )}
            </div>
          </Panel>
        ))}
      </div>

      <Panel
        className="mt-6"
        title="Scheduled reports"
        description="Recurring exports emailed to a distribution list."
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <span className={cn("icon-tile shadow-sm", HUES.fuchsia.tile)}>
            <FileSpreadsheet className="size-[1.15rem]" />
          </span>
          <p className="flex-1 text-sm text-muted-foreground text-pretty">
            No schedules configured. Set one up to have the settlement and revenue
            reports delivered automatically at the end of each cycle.
          </p>
          {/* A "Configure" button sat here with no handler; the platform has
              no scheduled-report endpoint to configure. */}
        </div>
      </Panel>
    </>
  );
}
