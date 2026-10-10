"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  Bike,
  Building2,
  ChevronRight,
  CircleHelp,
  Clock,
  FileText,
  LogOut,
  Megaphone,
  Pencil,
  Receipt,
  Shield,
  Store as StoreIcon,
  Tag,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageActions } from "@/components/common/page-actions";
import { Panel } from "@/components/common/panel";
import { FoodThumb } from "@/components/common/food-thumb";
import { ProfileDialog } from "@/components/store/profile-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TONES, type Tone } from "@/lib/accent";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { fetchCoupons, fetchKycStatus } from "@/lib/vendor-api";
import { useVendor } from "@/lib/store";

/**
 * Settings is a directory, not a destination.
 *
 * Every row goes somewhere that exists: either a page in this console, or the
 * editor that owns those fields. Rows whose feature this backend has no
 * endpoint for are not listed at all — an inert row that looks tappable is a
 * dead end a vendor has to discover by tapping it.
 */
interface Row {
  label: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
  meta?: string;
  href?: string;
  onSelect?: () => void;
}

function SettingsLink({ row }: { row: Row }) {
  const Icon = row.icon;

  const body = (
    <>
      <span className={cn("icon-circle size-10 rounded-lg", TONES[row.tone].circle)}>
        <Icon className="size-[1.05rem]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-semibold">
          {row.label}
        </span>
        <span className="block truncate text-[0.8125rem] text-muted-foreground">
          {row.description}
        </span>
      </span>
      {row.meta && (
        <span className="shrink-0 text-[0.8125rem] font-semibold text-primary">
          {row.meta}
        </span>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </>
  );

  const className =
    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60";

  return row.href ? (
    <Link href={row.href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={row.onSelect} className={className}>
      {body}
    </button>
  );
}

export default function SettingsPage() {
  const { profile, storeOpen, setStoreOpen, menu, categories } = useVendor();
  const { user, signOut } = useAuth();
  const [editOpen, setEditOpen] = React.useState(false);

  const coupons = useQuery({ queryKey: ["coupons"], queryFn: fetchCoupons });
  const kyc = useQuery({ queryKey: ["kyc"], queryFn: fetchKycStatus });

  const activeOffers =
    coupons.data?.filter((coupon) => coupon.status === "Active").length ?? 0;
  const kycDone = kyc.data?.isComplete;

  const groups: Array<{ title: string; rows: Row[] }> = [
    {
      title: "Restaurant",
      rows: [
        {
          label: "Restaurant Information",
          description: "Name, address, contact and description",
          icon: StoreIcon,
          tone: "red",
          onSelect: () => setEditOpen(true),
        },
        {
          label: "Working Hours",
          description: "When you accept orders",
          icon: Clock,
          tone: "blue",
          meta:
            profile && profile.openFrom !== "—"
              ? `${profile.openFrom} – ${profile.openTo}`
              : "Not set",
          onSelect: () => setEditOpen(true),
        },
        {
          label: "Delivery Settings",
          description: "Radius, delivery fee and commission",
          icon: Bike,
          tone: "green",
          meta: profile ? `${profile.deliveryRadiusKm} km` : undefined,
          onSelect: () => setEditOpen(true),
        },
        {
          label: "Restaurant Profile",
          description: "The full outlet record and its documents",
          icon: Receipt,
          tone: "violet",
          href: "/store",
        },
      ],
    },
    {
      title: "Menu & Offers",
      rows: [
        {
          label: "Menu Management",
          description: "Dishes, prices, photos and availability",
          icon: UtensilsCrossed,
          tone: "red",
          meta: `${menu.length} item${menu.length === 1 ? "" : "s"}`,
          href: "/menu",
        },
        {
          label: "Categories",
          description: "How your menu is grouped for customers",
          icon: Tag,
          tone: "amber",
          meta: `${categories.length}`,
          href: "/menu",
        },
        {
          label: "Offers & Coupons",
          description: "Create and manage discount codes",
          icon: Megaphone,
          tone: "violet",
          meta: activeOffers > 0 ? `${activeOffers} Active` : undefined,
          href: "/offers",
        },
      ],
    },
    {
      title: "Payments & Documents",
      rows: [
        {
          label: "Payouts & Transactions",
          description: "Balance, settlements and payout history",
          icon: Wallet,
          tone: "green",
          href: "/earnings",
        },
        {
          label: "Bank Details",
          description: "Where your settlements land",
          icon: Building2,
          tone: "blue",
          meta: profile?.bank.name === "Not added" ? "Not added" : profile?.bank.name,
          onSelect: () => setEditOpen(true),
        },
        {
          label: "Documents & KYC",
          description: "FSSAI, PAN, GST and identity proof",
          icon: FileText,
          tone: "violet",
          meta: kycDone ? "Complete" : "Incomplete",
          href: "/store",
        },
      ],
    },
    {
      title: "Account",
      rows: [
        {
          label: "Notifications",
          description: "Order alerts arrive in the topbar bell",
          icon: Bell,
          tone: "amber",
          meta: "On",
          href: "/orders",
        },
        {
          label: "Reviews & Ratings",
          description: "What customers said about your food",
          icon: Shield,
          tone: "green",
          href: "/reviews",
        },
        {
          label: "Reports & Analytics",
          description: "Sales, top items and payment split",
          icon: CircleHelp,
          tone: "blue",
          href: "/insights",
        },
      ],
    },
  ];

  return (
    <>
      <PageActions>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" />
          Edit Profile
        </Button>
      </PageActions>

      {/* Profile card — the reference heads Settings with who you are signed
          in as, and the one switch that stops orders arriving. */}
      <div className="surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <FoodThumb
          src={profile?.image}
          name={profile?.name ?? user?.name ?? "R"}
          size={64}
          rounded="rounded-full"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.0625rem] font-bold">
            {profile?.name ?? user?.name ?? "Your restaurant"}
          </p>
          <p className="truncate text-[0.8125rem] text-muted-foreground">
            {profile?.address ?? "—"}
          </p>
          {profile?.approved && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <BadgeCheck className="size-3.5" />
              Approved
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border px-3.5 py-2.5">
          <div>
            <p className="text-[0.75rem] text-muted-foreground">Accepting orders</p>
            <p
              className={cn(
                "text-[0.9375rem] font-bold",
                storeOpen ? "text-emerald-600" : "text-muted-foreground"
              )}
            >
              {storeOpen ? "Open" : "Closed"}
            </p>
          </div>
          <Switch
            checked={storeOpen}
            onCheckedChange={setStoreOpen}
            aria-label="Store open"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <Panel key={group.title} title={group.title} flush divided>
            <div className="divide-y divide-border">
              {group.rows.map((row) => (
                <SettingsLink key={row.label} row={row} />
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-4 text-center">
        <Button
          variant="outline"
          onClick={signOut}
          className="w-full border-primary/40 text-primary hover:bg-primary/5 hover:text-primary sm:w-auto sm:px-12"
        >
          <LogOut className="size-4" />
          Logout
        </Button>
        <p className="mt-2 text-[0.8125rem] text-muted-foreground">
          Logged in as {user?.email ?? "—"}
        </p>
      </div>

      {profile && (
        <ProfileDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          profile={profile}
        />
      )}
    </>
  );
}
