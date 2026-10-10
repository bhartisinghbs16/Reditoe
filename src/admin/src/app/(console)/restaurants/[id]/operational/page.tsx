"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import {
  Field,
  RestaurantBoundary,
  RestaurantShell,
} from "@/components/restaurants/restaurant-shell";
import { Button } from "@/components/ui/button";
import { ChargesPanel } from "@/components/restaurants/charges-panel";
import type { Restaurant } from "@/lib/types";
import { kycLabel, documentStatus } from "@/lib/domain";

/**
 * Operational Details — the trading terms and compliance state for one
 * restaurant, and the only place its charges are edited.
 */

export default function RestaurantOperationalPage() {
  const params = useParams<{ id: string }>();
  return (
    <RestaurantBoundary id={params.id}>
      {(restaurant) => <Operational restaurant={restaurant} />}
    </RestaurantBoundary>
  );
}

function Operational({ restaurant }: { restaurant: Restaurant }) {
  const cuisines = [...new Set(restaurant.categories ?? [])];

  return (
    <RestaurantShell
      restaurant={restaurant}
      title="Operational Details"
      section="operational"
      breadcrumbTail={[{ label: "Operational Details" }]}
      actions={
        <Button asChild variant="outline" size="lg">
          <Link href={`/restaurants/${restaurant._id}`}>
            <ArrowLeft className="size-4" />
            Back to Restaurant
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Panel
          title="Trading"
          description="How this kitchen appears to customers and what it charges."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Delivery Time" value={restaurant.deliveryTime} />
            <Field
              label="Kitchen"
              value={
                <StatusBadge
                  status={restaurant.isOpen ? "online" : "offline"}
                  label={restaurant.isOpen ? "Open" : "Closed"}
                />
              }
            />
            <Field
              label="Food Type"
              value={
                restaurant.foodType === "veg"
                  ? "Pure vegetarian"
                  : restaurant.foodType === "nonveg"
                    ? "Non-vegetarian"
                    : restaurant.foodType === "both"
                      ? "Veg & non-veg"
                      : undefined
              }
            />
            <Field
              label="Featured Listing"
              value={restaurant.isFeatured ? "Yes" : "No"}
            />
            <Field label="Enabled" value={restaurant.isEnabled ? "Yes" : "No"} />
          </div>
        </Panel>

        <ChargesPanel restaurantId={restaurant._id} />

        <Panel title="Compliance">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="KYC Status"
              value={<StatusBadge status={restaurant.kycStatus} label={kycLabel(restaurant.kycStatus)} />}
            />
            <Field
              label="Document Verification"
              value={<StatusBadge
                  status={documentStatus(restaurant.documentVerificationStatus).status}
                  label={documentStatus(restaurant.documentVerificationStatus).label}
                />}
            />
            <Field label="Approved" value={restaurant.isApproved ? "Yes" : "No"} />
          </div>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={`/restaurants/${restaurant._id}/documents`}>
              <FileText className="size-3.5" />
              Review documents
            </Link>
          </Button>
        </Panel>

        <Panel title="Cuisines & Categories">
          {cuisines.length === 0 ? (
            <p className="text-[0.8125rem] text-muted-foreground">None set.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {cuisines.map((cuisine) => (
                <StatusBadge key={cuisine} tone="neutral" dot={false} label={cuisine} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </RestaurantShell>
  );
}
