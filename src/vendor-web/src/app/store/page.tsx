"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bike,
  Building2,
  Clock,
  Eye,
  FileCheck2,
  MapPin,
  Pencil,
  ShieldCheck,
  Star,
  Store as StoreIcon,
  Timer,
} from "lucide-react";
import { PageActions } from "@/components/common/page-actions";
import { Panel, FieldRow } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { FoodThumb } from "@/components/common/food-thumb";
import { EmptyState } from "@/components/common/empty-state";
import { PromoBanner } from "@/components/common/promo-banner";
import { ProfileDialog } from "@/components/store/profile-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchKycStatus, fetchRestaurantDetail } from "@/lib/vendor-api";
import { useVendor } from "@/lib/store";

/** The "Edit" affordance each panel header carries, opening the one editor. */
function EditButton({
  label = "Edit",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-0.5 text-[0.8125rem] font-semibold text-indigo-600 transition-opacity hover:opacity-80 dark:text-indigo-400"
    >
      {label}
      <Pencil className="ml-0.5 size-3.5" />
    </button>
  );
}

export default function StoreProfilePage() {
  const { profile, storeOpen, loadingProfile } = useVendor();
  const [editOpen, setEditOpen] = React.useState(false);

  const detail = useQuery({
    queryKey: ["restaurant", "documents"],
    queryFn: fetchRestaurantDetail,
  });
  const kyc = useQuery({ queryKey: ["kyc"], queryFn: fetchKycStatus });

  // Gated on the profile alone — this screen needs nothing else.
  if (loadingProfile || !profile) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const documents = detail.data?.documents ?? [];
  const required = kyc.data?.requiredDocuments ?? [];
  const uploaded = new Set(kyc.data?.uploadedDocuments ?? []);

  return (
    <>
      <PageActions>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Eye className="size-4" />
          Preview Restaurant
        </Button>
        <Button onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" />
          Edit Profile
        </Button>
      </PageActions>

      {/* The outlet header the reference opens the vendor app with. */}
      <div className="surface flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
        <FoodThumb
          src={profile.image}
          name={profile.name}
          size={128}
          rounded="rounded-xl"
          className="w-full lg:w-32"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">{profile.name}</h2>
            {profile.approved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                <BadgeCheck className="size-3.5" />
                Approved
              </span>
            )}
            <StatusBadge
              status={profile.kycStatus}
              label={`KYC ${titleCase(profile.kycStatus)}`}
            />
          </div>

          <p className="mt-1 text-[0.8125rem] text-muted-foreground">
            Outlet ID: <span className="font-medium">{profile.id}</span>
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem]">
            <span className="flex items-center gap-1 font-medium">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {profile.rating.toFixed(1)}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Timer className="size-3.5" />
              {profile.deliveryTime}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Bike className="size-3.5" />
              {profile.deliveryRadiusKm} km radius
            </span>
          </div>

          <p className="mt-2 flex items-start gap-1.5 text-[0.8125rem] text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            {profile.address}
          </p>
        </div>

        <div className="shrink-0 rounded-xl border border-border p-3.5 lg:w-52">
          <p className="text-[0.75rem] text-muted-foreground">Today&apos;s Status</p>
          <p
            className={cn(
              "mt-0.5 text-lg font-bold",
              storeOpen ? "text-emerald-600" : "text-muted-foreground"
            )}
          >
            {storeOpen ? "Open" : "Closed"}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
            <Clock className="size-3.5" />
            {profile.openFrom} – {profile.openTo}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Restaurant Information"
          action={<EditButton onClick={() => setEditOpen(true)} />}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldRow label="Restaurant Name" value={profile.name} />
            <FieldRow label="Food Type" value={titleCase(profile.foodType)} />
            <FieldRow label="City" value={profile.city} />
            <FieldRow label="Pincode" value={profile.pincode} />
            <FieldRow label="Contact Number" value={profile.phone} />
            <FieldRow label="FSSAI" value={profile.fssai} />
            <FieldRow label="GSTIN" value={profile.gstin} />
            <FieldRow label="Status" value={titleCase(profile.approved ? "approved" : "pending")} />
          </div>
          <div className="mt-4">
            <FieldRow label="Address" value={profile.address} />
          </div>
          {profile.description && (
            <div className="mt-4">
              <FieldRow label="Description" value={profile.description} />
            </div>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Operations"
            action={<EditButton onClick={() => setEditOpen(true)} />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldRow
                label="Working Hours"
                value={`${profile.openFrom} – ${profile.openTo}`}
              />
              <FieldRow
                label="Prep Time"
                value={profile.prepMinutes > 0 ? `${profile.prepMinutes} mins` : "—"}
              />
              <FieldRow
                label="Delivery Radius"
                value={`${profile.deliveryRadiusKm} km`}
              />
              <FieldRow
                label="Platform Commission"
                value={`${profile.commissionPercent}%`}
              />
            </div>
          </Panel>

          <Panel
            title="Bank Details"
            action={<EditButton onClick={() => setEditOpen(true)} />}
          >
            <div className="flex items-start gap-3">
              <span className="icon-circle bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                <Building2 className="size-5" />
              </span>
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <FieldRow label="Bank Name" value={profile.bank.name} />
                <FieldRow label="Branch" value={profile.bank.branch} />
                <FieldRow label="Account Number" value={profile.bank.accountMasked} />
                <FieldRow label="IFSC Code" value={profile.bank.ifsc} />
                <FieldRow label="UPI ID" value={profile.bank.upi} />
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        className="mt-4"
        title="Documents & KYC"
        description={
          kyc.data
            ? `${uploaded.size} of ${required.length} required documents uploaded`
            : undefined
        }
        action={
          <StatusBadge
            status={kyc.data?.isComplete ? "verified" : "pending"}
            label={kyc.data?.isComplete ? "Complete" : "Incomplete"}
          />
        }
        flush
        divided
      >
        {required.length === 0 && documents.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No documents on file"
            description="Upload your FSSAI, PAN, GST and identity proof to finish verification."
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-[0.75rem] font-semibold text-muted-foreground">
                  <th scope="col" className="px-4 py-3 text-left">
                    Document
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {required.map((type) => (
                  <tr key={type} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-medium">
                        <FileCheck2 className="size-4 text-muted-foreground" />
                        {titleCase(type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge
                        status={uploaded.has(type) ? "verified" : "pending"}
                        label={uploaded.has(type) ? "Uploaded" : "Missing"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={profile}
      />

      <PromoBanner
        className="mt-4"
        icon={StoreIcon}
        tone="red"
        title="A complete profile gets more orders"
        description="Restaurants with photos, accurate hours and a full menu appear higher in customer search."
        actions={
          <Button asChild variant="outline">
            <Link href="/menu">Update Menu</Link>
          </Button>
        }
      />
    </>
  );
}
