"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Landmark, Lock, Wallet } from "lucide-react";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Field,
  RestaurantBoundary,
  RestaurantShell,
} from "@/components/restaurants/restaurant-shell";
import { Button } from "@/components/ui/button";
import { useRestaurantPayouts } from "@/lib/queries";
import { currency, date as formatDate } from "@/lib/format";
import type { Restaurant } from "@/lib/types";

/**
 * Payout & Settlement for one restaurant.
 *
 * This tab used to leave the restaurant entirely and open the platform-wide
 * payouts screen, where staff then had to find this vendor among all the
 * others - and where a mis-click pays somebody.
 *
 * So it reads, and only reads. Where the vendor stands is shown here; the
 * money is moved from Finance, which is the one place that does it.
 */

export default function RestaurantPayoutPage() {
  const params = useParams<{ id: string }>();
  return (
    <RestaurantBoundary id={params.id}>
      {(restaurant) => <Payouts restaurant={restaurant} />}
    </RestaurantBoundary>
  );
}

const FREQUENCY: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function Payouts({ restaurant }: { restaurant: Restaurant }) {
  const query = useRestaurantPayouts(restaurant._id);
  const data = query.data;
  const owed = data?.summary.notYetOnAPayout;

  return (
    <RestaurantShell
      restaurant={restaurant}
      title="Payout & Settlement"
      section="payout"
      breadcrumbTail={[{ label: "Payout & Settlement" }]}
      actions={
        <Button asChild variant="outline" size="lg">
          <Link href={`/restaurants/${restaurant._id}`}>
            <ArrowLeft className="size-4" />
            Back to Restaurant
          </Link>
        </Button>
      }
    >
      {query.isError && (
        <div className="surface">
          <ErrorState
            title="Couldn't load the payout details"
            description={query.error?.message}
            onRetry={() => query.refetch()}
          />
        </div>
      )}

      {query.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : data ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Panel title="Awaiting a payout">
              <p data-numeric className="text-2xl font-semibold tracking-tight">
                {currency(owed?.net ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground text-pretty">
                {owed?.orders ?? 0} delivered{" "}
                {owed?.orders === 1 ? "order" : "orders"} not yet on a payout.
                {owed?.lastOrderAt
                  ? ` Latest ${formatDate(owed.lastOrderAt)}.`
                  : ""}
              </p>
            </Panel>

            <Panel title="On a pending payout">
              <p data-numeric className="text-2xl font-semibold tracking-tight">
                {currency(data.summary.awaitingPayment.net)}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.summary.awaitingPayment.count} payout
                {data.summary.awaitingPayment.count === 1 ? "" : "s"} raised, not
                yet paid
              </p>
            </Panel>

            <Panel title="Paid to date">
              <p data-numeric className="text-2xl font-semibold tracking-tight">
                {currency(data.summary.paid.net)}
              </p>
              <p className="text-xs text-muted-foreground">
                Across {data.summary.paid.count} settled payout
                {data.summary.paid.count === 1 ? "" : "s"}
              </p>
            </Panel>

            <Panel title="Commission kept">
              <p data-numeric className="text-2xl font-semibold tracking-tight">
                {currency(
                  data.summary.paid.commission + data.summary.awaitingPayment.commission
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                At {data.terms.commissionPercent}% of food value
              </p>
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Settlement terms"
              action={<Wallet className="size-4 text-muted-foreground" />}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Commission"
                  value={`${data.terms.commissionPercent}%`}
                />
                <Field
                  label="Frequency"
                  value={FREQUENCY[data.terms.frequency] ?? data.terms.frequency}
                />
                <Field
                  label="Settlement day"
                  value={
                    data.terms.settlementDay ? String(data.terms.settlementDay) : "—"
                  }
                />
                <Field
                  label="Minimum threshold"
                  value={currency(data.terms.minimumThreshold)}
                />
                <Field
                  label="Automatic settlement"
                  value={data.terms.autoSettlement ? "On" : "Off"}
                />
                <Field
                  label="Payouts held"
                  value={data.terms.settlementLock ? "Yes" : "No"}
                />
              </div>
              {data.terms.settlementLock && (
                <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <Lock className="mt-0.5 size-3.5 shrink-0" />
                  Payouts are on hold for this vendor. Nothing will be settled
                  until the hold is lifted in Operational Details.
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground text-pretty">
                Terms are changed in Operational Details. Payments are made in
                Finance → Vendor Payouts.
              </p>
            </Panel>

            <Panel
              title="Where the money goes"
              action={<Landmark className="size-4 text-muted-foreground" />}
            >
              {data.bank.accountNumberLast4 ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Account holder"
                    value={data.bank.accountHolderName ?? "—"}
                  />
                  <Field label="Bank" value={data.bank.bankName ?? "—"} />
                  <Field
                    label="Account number"
                    value={`•••• ${data.bank.accountNumberLast4}`}
                  />
                  <Field label="IFSC" value={data.bank.ifsc ?? "—"} />
                </div>
              ) : (
                <EmptyState
                  title="No bank account on file"
                  description="This vendor cannot be paid until their account details are recorded."
                />
              )}
              {/* Last four only. A full account number is a liability on
                  every screen it is left open on, and nothing here needs it. */}
              <p className="mt-3 text-xs text-muted-foreground text-pretty">
                Only the last four digits are shown here.
              </p>
            </Panel>
          </div>

          <Panel title="Payout history">
            {data.payouts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.8125rem]">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Raised</th>
                      <th className="pb-2 font-medium">Orders</th>
                      <th className="pb-2 font-medium">Food value</th>
                      <th className="pb-2 font-medium">Commission</th>
                      <th className="pb-2 font-medium">Paid to vendor</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payouts.map((payout) => (
                      <tr key={payout.id} className="border-t border-border">
                        <td className="py-2">{formatDate(payout.createdAt)}</td>
                        <td data-numeric className="py-2">
                          {payout.orders}
                        </td>
                        <td data-numeric className="py-2">
                          {currency(payout.grossAmount)}
                        </td>
                        <td data-numeric className="py-2">
                          {currency(payout.commissionAmount)}
                        </td>
                        <td data-numeric className="py-2 font-medium">
                          {currency(payout.netAmount)}
                        </td>
                        <td className="py-2">
                          <StatusBadge status={payout.status} />
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {payout.transactionId || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No payouts yet"
                description="Payouts appear here once they are raised in Finance."
              />
            )}
          </Panel>
        </div>
      ) : null}
    </RestaurantShell>
  );
}
