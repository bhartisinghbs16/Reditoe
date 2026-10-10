"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart3,
  Clock,
  Copy,
  FileText,
  Leaf,
  ScrollText,
  Star,
  Store,
  Trophy,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, type Crumb } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestaurant } from "@/lib/queries";
import {
  date as formatDate,
  initials,
  number as formatNumber,
  phone as formatPhone,
  shortId,
  time as formatTime,
} from "@/lib/format";
import { refDoc } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Customer, Restaurant } from "@/lib/types";

/**
 * The chrome every restaurant sub-screen shares in the reference: the identity
 * card beside the fact grid, then a section rail down the left of the content.
 * Overview, Documents and Operational Details are routes under the restaurant;
 * the rest of the rail goes to the screen that already does that job.
 */

export const RESTAURANT_SECTIONS = [
  { value: "overview", label: "Overview", icon: Store, sub: "" },
  { value: "documents", label: "Documents", icon: FileText, sub: "documents" },
  { value: "menu", label: "Menu Management", icon: UtensilsCrossed, sub: "menu" },
  { value: "operational", label: "Operational Details", icon: Clock, sub: "operational" },
  {
    value: "payout",
    label: "Payout & Settlement",
    icon: Wallet,
    // Stays inside the restaurant. It used to open the platform-wide payouts
    // screen, leaving staff to find this vendor among all the others - and
    // putting a screen that pays people one mis-click from a read.
    sub: "payout",
  },
  { value: "performance", label: "Performance", icon: BarChart3, sub: "analytics" },
  { value: "reviews", label: "Reviews & Ratings", icon: Star, href: "/reviews" },
  {
    value: "activity",
    label: "Activity Log",
    icon: ScrollText,
    href: "/system/activity",
    global: true,
  },
];

export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(`${label} copied`);
        } catch {
          toast.error("Couldn't copy to the clipboard");
        }
      }}
    >
      <Copy className="size-3.5" />
    </button>
  );
}

/** Label above value — the reference's fact-grid cell. */
export function Field({
  label,
  value,
  copy,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  copy?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[0.75rem] text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-start gap-1.5 text-[0.8125rem] font-medium break-words">
        {value ?? "—"}
        {copy && <CopyButton value={copy} label={label} />}
      </p>
    </div>
  );
}

/**
 * Load, error and not-found states for a restaurant sub-screen. Every section
 * route needs the same three, and React Query dedupes the fetch between them.
 */
export function RestaurantBoundary({
  id,
  children,
}: {
  id: string;
  children: (restaurant: Restaurant) => React.ReactNode;
}) {
  const restaurant = useRestaurant(id);

  if (restaurant.isPending) {
    return (
      <>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-36 w-full" />
        <Skeleton className="mt-3 h-96 w-full" />
      </>
    );
  }

  if (restaurant.isError) {
    return (
      <div className="surface">
        <ErrorState
          title="Couldn't load this restaurant"
          description={restaurant.error?.message}
          onRetry={() => restaurant.refetch()}
        />
      </div>
    );
  }

  if (!restaurant.data) {
    return (
      <div className="surface">
        <EmptyState
          title="Restaurant not found"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/restaurants">Back to restaurants</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children(restaurant.data)}</>;
}

export function restaurantStatus(restaurant: Restaurant) {
  return (
    restaurant.status ??
    (restaurant.isApproved ? (restaurant.isActive ? "active" : "inactive") : "pending")
  );
}

export function RestaurantShell({
  restaurant,
  title,
  section,
  actions,
  breadcrumbTail,
  children,
}: {
  restaurant: Restaurant;
  title: string;
  /** Which rail entry reads as current. */
  section: string;
  actions?: React.ReactNode;
  /** Appended after the restaurant's own crumb. */
  breadcrumbTail?: Crumb[];
  children: React.ReactNode;
}) {
  const owner = refDoc<Customer>(restaurant.owner);
  const code = shortId(restaurant._id, "REST");
  const cuisines = [...new Set(restaurant.categories ?? [])];
  const status = restaurantStatus(restaurant);

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Restaurants", href: "/restaurants" },
          { label: "All Restaurants", href: "/restaurants" },
          {
            label: restaurant.name ?? "Restaurant",
            href: breadcrumbTail?.length ? `/restaurants/${restaurant._id}` : undefined,
          },
          ...(breadcrumbTail ?? []),
        ]}
        actions={actions}
      />

      <div className="grid items-start gap-3 lg:grid-cols-[1fr_1.6fr]">
        <div className="surface flex items-start gap-4 p-4">
          <Avatar className="size-20 shrink-0">
            <AvatarImage src={restaurant.image} alt="" />
            <AvatarFallback className="text-lg">
              {initials(restaurant.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {restaurant.name ?? "Restaurant"}
              </h2>
              <StatusBadge status={status} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.75rem] text-muted-foreground">
              <span className="font-medium text-foreground">{code}</span>
              <span>· FSSAI: —</span>
              <CopyButton value={code} label="Restaurant code" />
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem]">
              {restaurant.rating ? (
                <span className="inline-flex items-center gap-1 font-semibold">
                  {restaurant.rating.toFixed(1)}
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                </span>
              ) : (
                <span className="text-muted-foreground">Not rated yet</span>
              )}
              <span className="text-muted-foreground">
                ({formatNumber(restaurant.totalOrders ?? 0)} orders)
              </span>
              {(restaurant.rating ?? 0) >= 4.5 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-success-foreground">
                  <Trophy className="size-3" />
                  Top Rated
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="surface grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Owner Name" value={owner?.name} />
          <Field
            label="Phone Number"
            value={formatPhone(owner?.phone ?? restaurant.phone)}
            copy={owner?.phone ?? restaurant.phone}
          />
          <Field label="Email Address" value={owner?.email} copy={owner?.email} />
          <Field label="Restaurant Type" />
          <Field
            label="Cuisine"
            value={
              cuisines.length ? (
                <span className="flex items-center gap-1.5">
                  {cuisines.slice(0, 2).join(", ")}
                  {restaurant.foodType === "veg" && (
                    <Leaf
                      className="size-3.5 shrink-0 text-emerald-600"
                      aria-label="Pure vegetarian"
                    />
                  )}
                </span>
              ) : undefined
            }
          />
          <Field label="City" value={restaurant.address?.city} />
          <Field
            label="Joined On"
            value={
              <span>
                {formatDate(restaurant.createdAt)}
                <span className="block text-[0.75rem] font-normal text-muted-foreground">
                  {formatTime(restaurant.createdAt)}
                </span>
              </span>
            }
          />
          <Field label="Status" value={<StatusBadge status={status} />} />
        </div>
      </div>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[14rem_1fr]">
        <nav className="surface p-1.5">
          <ul>
            {RESTAURANT_SECTIONS.map(({ value, label, icon: Icon, href, sub, global }) => {
              const active = value === section;
              const target = href
                ? global
                  ? href
                  : `${href}?restaurantId=${restaurant._id}`
                : `/restaurants/${restaurant._id}${sub ? `/${sub}` : ""}`;
              return (
                <li key={value}>
                  <Link
                    href={target}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[0.8125rem] transition-colors",
                      active
                        ? "bg-primary/8 font-medium text-primary"
                        : "text-foreground hover:bg-muted/60"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {children}
      </div>
    </>
  );
}
