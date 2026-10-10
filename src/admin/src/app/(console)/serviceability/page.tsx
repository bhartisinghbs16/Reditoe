"use client";

import * as React from "react";
import { Building2, Download, MapPin, Power, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { MiniMetricCard } from "@/components/dashboard/metric-card";
import { Panel } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import {
  useServiceAreas,
  useSaveServiceArea,
  useSetStateActive,
  useSetStateOffice,
  useServiceMap,
  useDeleteServiceArea,
  type ServiceArea,
} from "@/lib/queries";
import { CoverageMap } from "@/components/serviceability/coverage-map";
import { EmptyState } from "@/components/common/empty-state";
import { downloadCsv, stampedName, toCsv } from "@/lib/export";
import { date as formatDate } from "@/lib/format";

/**
 * The cities the platform trades in.
 *
 * Not the same thing as a vendor's delivery radius, and worth keeping apart
 * in the operator's head: a vendor decides how far it will ride, this decides
 * whether the business operates in a place at all. Both have to agree before
 * an order can be taken.
 *
 * A city nobody has listed here is open. Areas are declared as the business
 * expands, so an empty list means "trading everywhere" rather than "trading
 * nowhere" - which is the safer way round for a platform that is still
 * naming its cities.
 */

const EMPTY = {
  state: "",
  city: "",
  district: "",
  radiusKm: "15",
  latitude: "",
  longitude: "",
  isActive: true,
};

export default function ServiceabilityPage() {
  const { data } = useServiceAreas();
  const save = useSaveServiceArea();
  const setState = useSetStateActive();
  const setOffice = useSetStateOffice();
  const map = useServiceMap();
  const [selectedPin, setSelectedPin] = React.useState<string | null>(null);
  const [officeState, setOfficeState] = React.useState<string>("");
  const [office, setOfficeForm] = React.useState({
    gst: "",
    officeAddress: "",
    contactPerson: "",
    contactPhone: "",
    email: "",
  });
  const remove = useDeleteServiceArea();

  const states = data?.states ?? [];
  const summary = data?.summary;

  const [form, setForm] = React.useState(EMPTY);

  const ready =
    form.state.trim() !== "" &&
    form.city.trim() !== "" &&
    Number(form.radiusKm) >= 1 &&
    Number(form.radiusKm) <= 100;

  const submit = () =>
    toast.promise(
      save
        .mutateAsync({
          state: form.state.trim(),
          city: form.city.trim(),
          district: form.district.trim(),
          radiusKm: Number(form.radiusKm),
          isActive: form.isActive,
          ...(form.latitude && form.longitude
            ? {
                center: {
                  latitude: Number(form.latitude),
                  longitude: Number(form.longitude),
                },
              }
            : {}),
        })
        .then(() => setForm(EMPTY)),
      {
        loading: "Saving…",
        success: `${form.city} saved`,
        error: (reason) => (reason instanceof Error ? reason.message : "Could not save"),
      }
    );

  const toggleCity = (city: ServiceArea) =>
    toast.promise(
      save.mutateAsync({
        state: city.state,
        city: city.city,
        // Carried through: the save is an upsert, so omitting it blanks it.
        district: city.district ?? "",
        radiusKm: city.radiusKm,
        isActive: !city.isActive,
      }),
      {
        loading: "Updating…",
        success: `${city.city} is now ${!city.isActive ? "serviceable" : "closed"}`,
        error: "Could not update",
      }
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Serviceability Management"
        description="Which states and cities Reditoe operates in. Separate from each restaurant's own delivery radius — both must allow an order."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniMetricCard label="States" value={String(summary?.states ?? 0)} icon={Building2} />
        <MiniMetricCard label="Cities listed" value={String(summary?.cities ?? 0)} icon={MapPin} />
        <MiniMetricCard
          label="Open for orders"
          value={String(summary?.activeCities ?? 0)}
          icon={Power}
          tone="green"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="States and cities">
          {states.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No areas listed yet — which means Reditoe is currently open
                everywhere.
              </p>
              <p className="mx-auto mt-1 max-w-md text-[0.8125rem] text-muted-foreground">
                Add a city to start managing where you trade. Listing a city
                does not restrict the others; only switching one off does.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {states.map((group) => (
                <div key={group.state} className="rounded-lg border border-border">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{group.state}</span>
                      <StatusBadge
                        tone={group.stateActive ? "success" : "danger"}
                        label={group.stateActive ? "Open" : "Closed"}
                      />
                      <span className="text-[0.75rem] text-muted-foreground">
                        {group.cities.length}{" "}
                        {group.cities.length === 1 ? "city" : "cities"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={group.stateActive ? "outline" : "default"}
                      onClick={() =>
                        toast.promise(
                          setState.mutateAsync({
                            state: group.state,
                            stateActive: !group.stateActive,
                          }),
                          {
                            loading: "Updating…",
                            success: `${group.state} is now ${
                              !group.stateActive ? "open" : "closed"
                            }`,
                            error: "Could not update",
                          }
                        )
                      }
                    >
                      {group.stateActive ? "Close state" : "Open state"}
                    </Button>
                  </div>

                  <table className="w-full text-sm">
                    <tbody>
                      {group.cities.map((city) => (
                        <tr key={city._id} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 font-medium">{city.city}</td>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">
                            {city.radiusKm} km
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge
                              tone={city.isActive && city.stateActive ? "success" : "danger"}
                              label={
                                !city.stateActive
                                  ? "State closed"
                                  : city.isActive
                                    ? "Open"
                                    : "Closed"
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => toggleCity(city)}>
                                {city.isActive ? "Close" : "Open"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  toast.promise(remove.mutateAsync({ id: city._id }), {
                                    loading: "Removing…",
                                    success: `${city.city} removed`,
                                    error: "Could not remove",
                                  })
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Add or update a city">
          <div className="space-y-3">
            <label className="block text-[0.8125rem]">
              <span className="mb-1 block text-muted-foreground">State</span>
              <input
                value={form.state}
                onChange={(event) => setForm((f) => ({ ...f, state: event.target.value }))}
                placeholder="Andhra Pradesh"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              />
            </label>

            <label className="block text-[0.8125rem]">
              <span className="mb-1 block text-muted-foreground">City</span>
              <input
                value={form.city}
                onChange={(event) => setForm((f) => ({ ...f, city: event.target.value }))}
                placeholder="Tirupati"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              />
            </label>

            <label className="block text-[0.8125rem]">
              {/* Optional: the platform ran on state and city alone before. */}
              <span className="mb-1 block text-muted-foreground">
                District <span className="text-xs">(optional)</span>
              </span>
              <input
                value={form.district}
                onChange={(event) => setForm((f) => ({ ...f, district: event.target.value }))}
                placeholder="Chittoor"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              />
            </label>

            <label className="block text-[0.8125rem]">
              <span className="mb-1 block text-muted-foreground">Service radius (km)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={form.radiusKm}
                onChange={(event) => setForm((f) => ({ ...f, radiusKm: event.target.value }))}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[0.8125rem]">
                <span className="mb-1 block text-muted-foreground">Latitude</span>
                <input
                  value={form.latitude}
                  onChange={(event) => setForm((f) => ({ ...f, latitude: event.target.value }))}
                  placeholder="13.6288"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                />
              </label>
              <label className="block text-[0.8125rem]">
                <span className="mb-1 block text-muted-foreground">Longitude</span>
                <input
                  value={form.longitude}
                  onChange={(event) => setForm((f) => ({ ...f, longitude: event.target.value }))}
                  placeholder="79.4192"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-[0.8125rem]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((f) => ({ ...f, isActive: event.target.checked }))}
              />
              <span>Open for orders</span>
            </label>

            <div className="flex gap-2 pt-1">
              <Button onClick={submit} disabled={!ready || save.isPending}>
                Save city
              </Button>
              <Button variant="outline" onClick={() => setForm(EMPTY)}>
                Clear
              </Button>
            </div>

            <p className="pt-1 text-[0.75rem] text-muted-foreground">
              Saving a city that is already listed updates it. Closing a city
              stops orders there without touching the restaurants in it, so it
              can be reopened without anything being set up again.
            </p>
          </div>
        </Panel>
      </div>

      {/* ── Coverage map ──────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Map view">
          {/*
            Drawn, not fetched: no tile server and no API key, so it cannot
            stop working when a key expires. Every pin is a real restaurant at
            its own coordinates, with the circle showing how far it rides.
          */}
          <CoverageMap
            pins={map.data?.restaurants ?? []}
            selectedId={selectedPin}
            onSelect={setSelectedPin}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-[#0e1526]" />
              Restaurant
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full border border-[#15803d] bg-[#16a34a]/20" />
              Delivery range
            </span>
            {(map.data?.summary.unplotted ?? 0) > 0 && (
              <span className="text-amber-700 dark:text-amber-400">
                {map.data?.summary.unplotted} restaurant
                {map.data?.summary.unplotted === 1 ? "" : "s"} have no
                coordinates and cannot be placed.
              </span>
            )}
          </div>
        </Panel>

        <Panel
          title="State office details"
          action={<Building2 className="size-4 text-muted-foreground" />}
        >
          {/*
            Blank until somebody fills it in. A made-up GST number on a
            compliance screen is worse than an empty field.
          */}
          <div className="space-y-3">
            <label className="block text-[0.8125rem]">
              <span className="mb-1 block text-muted-foreground">State</span>
              <select
                value={officeState}
                onChange={(event) => {
                  const next = event.target.value;
                  setOfficeState(next);
                  const found = map.data?.states.find((row) => row.state === next);
                  setOfficeForm({
                    gst: found?.office?.gst ?? "",
                    officeAddress: found?.office?.officeAddress ?? "",
                    contactPerson: found?.office?.contactPerson ?? "",
                    contactPhone: found?.office?.contactPhone ?? "",
                    email: found?.office?.email ?? "",
                  });
                }}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">Choose a state…</option>
                {(map.data?.states ?? []).map((row) => (
                  <option key={row.state} value={row.state}>
                    {row.state}
                  </option>
                ))}
              </select>
            </label>

            {officeState ? (
              <>
                {(
                  [
                    ["gst", "GST number"],
                    ["officeAddress", "Office address"],
                    ["contactPerson", "Contact person"],
                    ["contactPhone", "Contact phone"],
                    ["email", "Email"],
                  ] as [keyof typeof office, string][]
                ).map(([field, label]) => (
                  <label key={field} className="block text-[0.8125rem]">
                    <span className="mb-1 block text-muted-foreground">{label}</span>
                    <input
                      value={office[field]}
                      onChange={(event) =>
                        setOfficeForm((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                    />
                  </label>
                ))}
                <Button
                  disabled={setOffice.isPending}
                  onClick={() =>
                    toast.promise(
                      setOffice.mutateAsync({ state: officeState, ...office }),
                      {
                        loading: "Saving…",
                        success: `${officeState} office details saved`,
                        error: (reason) =>
                          reason instanceof Error ? reason.message : "Could not save",
                      }
                    )
                  }
                >
                  Save details
                </Button>
              </>
            ) : (
              <p className="text-[0.75rem] text-muted-foreground text-pretty">
                Choose a state to record its GST number, office address and who
                to contact there. These are blank until you fill them in.
              </p>
            )}
          </div>
        </Panel>
      </div>

      {/* ── Radius management ─────────────────────────────────────────── */}
      <Panel
        title="Radius management"
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={!map.data?.restaurants.length}
            onClick={() => {
              const rows = map.data?.restaurants ?? [];
              downloadCsv(
                stampedName("reditoe-serviceability"),
                toCsv(rows, [
                  { header: "Name", value: (r) => r.name },
                  { header: "City", value: (r) => r.city ?? "" },
                  { header: "State", value: (r) => r.state ?? "" },
                  { header: "District", value: (r) => r.district ?? "" },
                  { header: "Pincode", value: (r) => r.pincode ?? "" },
                  { header: "Address", value: (r) => r.address ?? "" },
                  { header: "Phone", value: (r) => r.phone ?? "" },
                  { header: "GST", value: (r) => r.gst ?? "" },
                  { header: "Radius (KM)", value: (r) => r.radiusKm ?? "" },
                  { header: "Status", value: (r) => r.status ?? "" },
                  { header: "Registered on", value: (r) => r.registeredOn ?? "" },
                  { header: "On map", value: (r) => (r.plotted ? "Yes" : "No coordinates") },
                ])
              );
            }}
          >
            <Download className="size-3.5" />
            Export
          </Button>
        }
      >
        {map.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (map.data?.restaurants.length ?? 0) === 0 ? (
          <EmptyState
            icon={Store}
            title="No restaurants yet"
            description="Vendors appear here with the range they deliver over."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.8125rem]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Restaurant</th>
                  <th className="pb-2 font-medium">City</th>
                  <th className="pb-2 font-medium">Pincode</th>
                  <th className="pb-2 font-medium">Radius</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody>
                {(map.data?.restaurants ?? []).map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedPin(row.id)}
                    className={
                      "cursor-pointer border-t border-border " +
                      (row.id === selectedPin ? "bg-muted/60" : "hover:bg-muted/30")
                    }
                  >
                    <td className="py-2">
                      <span className="font-medium">{row.name}</span>
                      {!row.plotted && (
                        <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                          not on map
                        </span>
                      )}
                    </td>
                    <td className="py-2">{row.city ?? "—"}</td>
                    <td className="py-2">{row.pincode ?? "—"}</td>
                    <td data-numeric className="py-2">
                      {row.radiusKm ? `${row.radiusKm} km` : "—"}
                    </td>
                    <td className="py-2">
                      <StatusBadge status={row.status ?? "pending"} />
                    </td>
                    <td className="py-2">
                      {row.registeredOn ? formatDate(row.registeredOn) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[0.75rem] text-muted-foreground text-pretty">
              A restaurant&apos;s radius is changed on its own Operational
              Details page, where the rest of its trading terms are.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
