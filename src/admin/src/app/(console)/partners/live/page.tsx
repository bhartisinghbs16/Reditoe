"use client";

import * as React from "react";
import { Bike, CircleDot, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { MiniMetricCard } from "@/components/dashboard/metric-card";
import { LiveRiderMap } from "@/components/riders/live-rider-map";
import { useRiders } from "@/lib/queries";

/**
 * Where every rider is, right now.
 *
 * The list is refetched on a timer rather than pushed, which is a few seconds
 * behind but needs no socket held open per dispatcher. Riders report their
 * position while they are carrying an order, so a free rider's pin is where
 * they last delivered rather than where they are standing this second.
 */

const REFRESH_MS = 10_000;

export default function LiveRidersPage() {
  const { data, refetch } = useRiders({ limit: 200 });
  const riders = React.useMemo(() => data?.items ?? [], [data]);

  React.useEffect(() => {
    const timer = setInterval(() => void refetch(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refetch]);

  /**
   * The filters, applied in the order a dispatcher thinks in: where, then
   * who. Choosing a state narrows the cities offered, because listing every
   * city in the country beside a state that has two is no help.
   */
  const [state, setState] = React.useState("");
  const [city, setCity] = React.useState("");
  const [status, setStatus] = React.useState<"all" | "delivering" | "free" | "online">("all");

  const states = React.useMemo(
    () => Array.from(new Set(riders.map((r) => r.state).filter(Boolean))).sort() as string[],
    [riders]
  );

  const cities = React.useMemo(
    () =>
      Array.from(
        new Set(
          riders
            .filter((r) => !state || r.state === state)
            .map((r) => r.city)
            .filter(Boolean)
        )
      ).sort() as string[],
    [riders, state]
  );

  // A city chosen under one state has no meaning under another.
  React.useEffect(() => {
    if (city && !cities.includes(city)) setCity("");
  }, [cities, city]);

  const shown = React.useMemo(
    () =>
      riders.filter((rider) => {
        if (state && rider.state !== state) return false;
        if (city && rider.city !== city) return false;
        if (status === "delivering") return Boolean(rider.currentOrderId);
        if (status === "free") return rider.isOnline && !rider.currentOrderId;
        if (status === "online") return Boolean(rider.isOnline);
        return true;
      }),
    [riders, state, city, status]
  );

  const delivering = shown.filter((r) => r.currentOrderId).length;
  const online = shown.filter((r) => r.isOnline).length;
  const located = shown.filter((r) => {
    const pair = r.currentLocation?.coordinates;
    return pair?.length === 2 && !(pair[0] === 0 && pair[1] === 0);
  }).length;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live Rider Map"
        description="Red is carrying an order, green is free and waiting for one."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniMetricCard label="On a delivery" value={String(delivering)} icon={Bike} />
        <MiniMetricCard label="Free right now" value={String(online - delivering)} icon={CircleDot} />
        <MiniMetricCard label="Reporting a location" value={String(located)} icon={MapPin} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <label className="text-[0.8125rem]">
          <span className="mb-1 block text-muted-foreground">State</span>
          <select
            value={state}
            onChange={(event) => setState(event.target.value)}
            className="h-9 min-w-40 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All states</option>
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>

        <label className="text-[0.8125rem]">
          <span className="mb-1 block text-muted-foreground">City</span>
          <select
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="h-9 min-w-40 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Everyone"],
              ["online", "Active"],
              ["free", "Free"],
              ["delivering", "On delivery"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={status === key ? "default" : "outline"}
              onClick={() => setStatus(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="ml-auto text-[0.8125rem] text-muted-foreground">
          Showing {shown.length} of {riders.length}
        </div>
      </div>

      <LiveRiderMap riders={shown} apiKey={apiKey} />
    </div>
  );
}
