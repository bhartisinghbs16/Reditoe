"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Ban,
  Bike,
  IndianRupee,
  Landmark,
  Pencil,
  Phone,
  ShieldCheck,
  Star,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel, DetailRow } from "@/components/common/panel";
import { StatCard, StatGrid } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { IdentityCell } from "@/components/common/cells";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { DataTable, type Column } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useRider,
  useRiderOrders,
  useSetRiderBlocked,
  useUpdateRiderKyc,
  useVerifyRiderContact,
  useResendRiderVerification,
} from "@/lib/queries";
import { orderStatusLabel, kycLabel } from "@/lib/domain";
import {
  useRiderActivity,
  useRiderDocuments,
  useRiderPayouts,
  useUpdateRiderDocument,
} from "@/lib/queries";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  currency,
  date as formatDate,
  dateTime,
  number as formatNumber,
  percent,
  phone as formatPhone,
} from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, Order, Rider } from "@/lib/types";

type DocStatus = "pending" | "verified" | "rejected";

/** The document whose recorded details are being corrected, if any. */
interface EditingDoc {
  type: string;
  label: string;
  expires: boolean;
  /** False when nothing has been filed: status cannot then be verified. */
  hasFile: boolean;
  number: string;
  uploadedAt: string;
  expiryDate: string;
  status: DocStatus;
  verifiedBy: string;
}

function shortDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const rider = useRider(params.id);
  const verifyContact = useVerifyRiderContact(params.id);
  const resendVerification = useResendRiderVerification(params.id);
  const [otp, setOtp] = React.useState({ email: "", phone: "" });
  const orders = useRiderOrders(params.id);
  const setBlocked = useSetRiderBlocked();
  const updateKyc = useUpdateRiderKyc();

  /*
   * These sit above the early returns below. A hook placed after them runs on
   * some renders and not others, and React throws the whole page away when
   * the count changes.
   */
  const documents = useRiderDocuments(params.id);
  const payouts = useRiderPayouts(params.id);
  const activity = useRiderActivity(params.id);
  const updateDoc = useUpdateRiderDocument(params.id);
  const [editingDoc, setEditingDoc] = React.useState<EditingDoc | null>(null);

  const documentRows = documents.data?.documents ?? [];
  const money = payouts.data;
  const activityRows = activity.data?.activity ?? [];

  if (rider.isPending) {
    return (
      <>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-6 h-40 w-full" />
        <Skeleton className="mt-4 h-80 w-full" />
      </>
    );
  }

  if (rider.isError) {
    return (
      <div className="surface">
        <ErrorState
          title="Couldn't load this partner"
          description={rider.error?.message}
          onRetry={() => rider.refetch()}
        />
      </div>
    );
  }

  const data = rider.data as Rider | undefined;
  if (!data) {
    return (
      <div className="surface">
        <EmptyState
          title="Delivery partner not found"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/partners">Back to partners</Link>
            </Button>
          }
        />
      </div>
    );
  }

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }

  const columns: Column<Order>[] = [
    {
      id: "order",
      header: "Order",
      cell: (order) => (
        <Link
          href={`/orders/${order._id}`}
          className="font-medium text-primary hover:underline"
        >
          {order.orderNumber}
        </Link>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      hideBelow: "md",
      cell: (order) => refDoc<Customer>(order.userId)?.name ?? "—",
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (order) => <span className="tabular-nums">{currency(order.total, true)}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (order) => (
        <StatusBadge status={order.status} label={orderStatusLabel(order.status)} />
      ),
    },
    {
      id: "date",
      header: "Delivered",
      hideBelow: "lg",
      cell: (order) => dateTime(order.updatedAt ?? order.createdAt),
    },
  ];

  const rating = data.currentRating ?? data.rating;

  return (
    <>
      <PageHeader
        title={data.name ?? "Delivery partner"}
        description={data.riderId ? `Partner ID ${data.riderId}` : data.email}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Delivery partners", href: "/partners" },
          { label: data.name ?? "Detail" },
        ]}
        actions={
          <>
            <StatusBadge
              status={data.isBlocked ? "blocked" : (data.status ?? "inactive")}
              className="px-2.5 py-1 text-[0.8125rem]"
            />
            {data.kycStatus !== "approved" && (
              <Button
                variant="outline"
                size="lg"
                disabled={updateKyc.isPending}
                onClick={() =>
                  run(
                    () =>
                      updateKyc.mutateAsync({ id: data._id, kycStatus: "approved" }),
                    "KYC verified"
                  )
                }
              >
                <ShieldCheck className="size-4" />
                Verify KYC
              </Button>
            )}
            <Button
              variant={data.isBlocked ? "default" : "destructive"}
              size="lg"
              disabled={setBlocked.isPending}
              onClick={() =>
                run(
                  () =>
                    setBlocked.mutateAsync({
                      id: data._id,
                      isBlocked: !data.isBlocked,
                    }),
                  data.isBlocked ? "Partner unblocked" : "Partner blocked"
                )
              }
            >
              {data.isBlocked ? (
                <>
                  <UserRoundCheck className="size-4" />
                  Unblock
                </>
              ) : (
                <>
                  <Ban className="size-4" />
                  Block
                </>
              )}
            </Button>
          </>
        }
      />

      <StatGrid columns={4}>
        <StatCard
          label="Total deliveries"
          value={formatNumber(data.totalDeliveries ?? 0)}
          icon={Bike}
          tone="indigo"
        />
        <StatCard
          label="Total earnings"
          value={currency(data.totalEarnings ?? 0)}
          icon={IndianRupee}
          tone="emerald"
        />
        <StatCard
          label="Rating"
          value={rating ? rating.toFixed(1) : "—"}
          icon={Star}
          tone="amber"
        />
        <StatCard
          label="Success rate"
          value={data.successRate !== undefined ? percent(data.successRate) : "—"}
          icon={ShieldCheck}
          tone="violet"
        />
      </StatGrid>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1.8fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Partner">
            <IdentityCell
              name={data.name}
              secondary={data.email}
              image={data.image}
            />
            <div className="mt-3">
              <DetailRow label="Phone" value={formatPhone(data.phone)} />
              <DetailRow label="Partner ID" value={data.riderId ?? "—"} />
              <DetailRow
                label="KYC"
                value={<StatusBadge status={data.kycStatus} label={kycLabel(data.kycStatus)} />}
              />
              <DetailRow
                label="Availability"
                value={
                  <StatusBadge
                    status={data.isOnline ? "online" : "offline"}
                    label={data.isOnline ? "Online" : "Offline"}
                  />
                }
              />
              <DetailRow label="Joined" value={formatDate(data.createdAt)} />
            </div>
            {data.phone && (
              <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                <a href={`tel:${data.phone}`}>
                  <Phone className="size-3.5" />
                  Call partner
                </a>
              </Button>
            )}
          </Panel>

          <Panel title="Vehicle">
            <DetailRow label="Type" value={data.vehicleType ?? "—"} />
            <DetailRow label="Model" value={data.vehicleName ?? "—"} />
            <DetailRow label="Number plate" value={data.vehicleNumber ?? "—"} />
            <DetailRow
              label="Per-km charge"
              value={data.perKmCharge ? currency(data.perKmCharge) : "—"}
            />
          </Panel>

          {/*
            The codes sent when staff created this account. Until both are
            confirmed the rider is blocked: nobody has shown that the email
            address and the phone number typed for them are actually theirs,
            and a mistyped digit makes an account that cannot be signed into.
          */}
          {data.contactVerification?.pending && (
            <Panel title="Confirm contact details">
              <p className="text-sm text-muted-foreground">
                This partner is blocked until the codes sent to their email and
                mobile are both entered.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="email-otp">
                    Email code
                    {data.contactVerification.emailVerified && " ✓"}
                  </Label>
                  <Input
                    id="email-otp"
                    inputMode="numeric"
                    maxLength={6}
                    disabled={data.contactVerification.emailVerified}
                    value={otp.email}
                    onChange={(event) =>
                      setOtp((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone-otp">
                    Mobile code
                    {data.contactVerification.phoneVerified && " ✓"}
                  </Label>
                  <Input
                    id="phone-otp"
                    inputMode="numeric"
                    maxLength={6}
                    disabled={data.contactVerification.phoneVerified}
                    value={otp.phone}
                    onChange={(event) =>
                      setOtp((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={verifyContact.isPending}
                  onClick={() =>
                    verifyContact.mutate(
                      { emailOtp: otp.email, phoneOtp: otp.phone },
                      {
                        onSuccess: (result) => {
                          const payload = (result as { data?: { complete?: boolean } })?.data;
                          toast[payload?.complete ? "success" : "message"](
                            payload?.complete
                              ? "Both codes confirmed — the partner is active."
                              : "Saved. The other code is still outstanding."
                          );
                          setOtp({ email: "", phone: "" });
                        },
                        onError: (error) =>
                          toast.error(
                            error instanceof Error ? error.message : "Could not confirm"
                          ),
                      }
                    )
                  }
                >
                  {verifyContact.isPending ? "Checking…" : "Confirm"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resendVerification.isPending}
                  onClick={() =>
                    resendVerification.mutate(undefined, {
                      onSuccess: () => toast.success("New codes sent"),
                      onError: (error) =>
                        toast.error(
                          error instanceof Error ? error.message : "Could not resend"
                        ),
                    })
                  }
                >
                  Resend codes
                </Button>
              </div>
            </Panel>
          )}

          {/*
            Everything else the account holds. All of it was already stored
            and returned by the API; this page just never showed any of it, so
            an admin opening a partner saw a name, a vehicle and a delivery
            count - no documents, no way to reach anyone, no address.
          */}
          <Panel title="Identity & contact">
            <DetailRow label="Email" value={data.email ?? "—"} />
            <DetailRow label="Phone" value={formatPhone(data.phone)} />
            <DetailRow
              label="Date of birth"
              value={data.dateOfBirth ? formatDate(data.dateOfBirth) : "—"}
            />
            <DetailRow label="ID type" value={data.idType ?? "—"} />
            <DetailRow
              label="Aadhaar verified"
              value={data.aadhaarVerified ? "Yes" : "No"}
            />
            <DetailRow
              label="Address"
              value={
                [
                  data.address?.fullAddress,
                  data.address?.landmark,
                  data.address?.city,
                  data.address?.state,
                  data.address?.pincode,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
          </Panel>

          <Panel title="Emergency contact">
            <DetailRow label="Name" value={data.emergencyContactName ?? "—"} />
            <DetailRow
              label="Relationship"
              value={data.emergencyRelationship ?? "—"}
            />
            <DetailRow
              label="Phone"
              value={
                data.emergencyContactPhone
                  ? formatPhone(data.emergencyContactPhone)
                  : "—"
              }
            />
          </Panel>

          <Panel title="Documents">
            {/*
              What each document says, not just that a file exists.
              This listed the uploaded files and offered a View link; a
              partner's licence number, when it was filed, when it expires and
              who checked it had nowhere to be seen or corrected. Vendors have
              carried all of that for a while.
            */}
            {documents.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : documentRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents on file yet.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {documentRows.map((row) => (
                  <li key={row.key} className="border-b border-border pb-2.5 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.8125rem] font-medium">
                        {row.label}
                        {row.required && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            required
                          </span>
                        )}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        {row.status ? (
                          <StatusBadge status={row.status} />
                        ) : (
                          <StatusBadge tone="neutral" dot={false} label="Not uploaded" />
                        )}
                        {row.url && (
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            View
                          </a>
                        )}
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Edit ${row.label} details`}
                          onClick={() =>
                            setEditingDoc({
                              type: row.key,
                              label: row.label,
                              expires: row.expires,
                              hasFile: Boolean(row.url),
                              number: row.number ?? "",
                              uploadedAt: row.uploadedAt
                                ? String(row.uploadedAt).slice(0, 10)
                                : "",
                              expiryDate: row.expiryDate
                                ? String(row.expiryDate).slice(0, 10)
                                : "",
                              status: (row.status ?? "pending") as DocStatus,
                              verifiedBy: row.verifiedBy ?? "",
                            })
                          }
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.number ? `No. ${row.number}` : "No number recorded"}
                      {row.expires && row.expiryDate
                        ? ` · expires ${shortDate(row.expiryDate)}`
                        : ""}
                      {row.verifiedBy ? ` · checked by ${row.verifiedBy}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Bank details">
            <DetailRow
              label="Account holder"
              value={data.bankDetails?.accountHolderName || "—"}
            />
            <DetailRow
              label="Account number"
              value={
                data.bankDetails?.accountNumber
                  ? `••••${String(data.bankDetails.accountNumber).slice(-4)}`
                  : "—"
              }
            />
            <DetailRow label="IFSC" value={data.bankDetails?.ifsc || "—"} />
            <DetailRow label="Bank" value={data.bankDetails?.bankName || "—"} />
          </Panel>

          <Panel title="Live location">
            {data.currentLocation?.coordinates ? (
              <>
                <DetailRow
                  label="Coordinates"
                  value={`${data.currentLocation.coordinates[1].toFixed(5)}, ${data.currentLocation.coordinates[0].toFixed(5)}`}
                />
                <DetailRow
                  label="Status"
                  value={data.isOnline ? "Online" : "Offline"}
                />
                <a
                  href={`https://www.google.com/maps?q=${data.currentLocation.coordinates[1]},${data.currentLocation.coordinates[0]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[0.8125rem] font-medium text-primary hover:underline"
                >
                  Open in Maps
                </a>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This partner has not reported a location yet.
              </p>
            )}
          </Panel>

          <Panel title="Delivery record">
            <DetailRow
              label="Completed"
              value={formatNumber(data.completedDeliveries ?? 0)}
            />
            <DetailRow
              label="Cancelled"
              value={formatNumber(data.cancelledDeliveries ?? 0)}
            />
            <DetailRow
              label="Success rate"
              value={data.successRate !== undefined ? percent(data.successRate) : "—"}
            />
          </Panel>
        </div>

        <Panel title="Recent deliveries" flush>
          <DataTable
            columns={columns}
            rows={orders.data?.items ?? []}
            rowKey={(order) => order._id}
            loading={orders.isPending}
            error={orders.error}
            onRetry={() => orders.refetch()}
            emptyTitle="No deliveries yet"
            className="rounded-none border-0 shadow-none"
          />
        </Panel>
      </div>

      {/* ── Payout & settlement ─────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="Wallet balance">
          <p data-numeric className="text-2xl font-semibold tracking-tight">
            {currency(money?.summary.walletBalance ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            {currency(money?.summary.bonusBalance ?? 0)} of it is bonus
          </p>
        </Panel>
        <Panel title="Earned to date">
          <p data-numeric className="text-2xl font-semibold tracking-tight">
            {currency(money?.summary.totalEarned ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            Across {formatNumber(money?.summary.deliveries ?? 0)} deliveries
          </p>
        </Panel>
        <Panel title="Withdrawn">
          <p data-numeric className="text-2xl font-semibold tracking-tight">
            {currency(money?.summary.totalWithdrawn ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            {money?.summary.paid.count ?? 0} payout
            {money?.summary.paid.count === 1 ? "" : "s"} settled
          </p>
        </Panel>
        <Panel title="Awaiting approval">
          <p data-numeric className="text-2xl font-semibold tracking-tight">
            {currency(money?.summary.awaitingApproval.amount ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            {money?.summary.awaitingApproval.count ?? 0} request
            {money?.summary.awaitingApproval.count === 1 ? "" : "s"} pending
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Settlement"
          action={<Wallet className="size-4 text-muted-foreground" />}
        >
          <DetailRow
            label="Per-km rate"
            value={
              money?.terms.perKmCharge != null
                ? currency(money.terms.perKmCharge)
                : "—"
            }
          />
          <DetailRow label="Delivery fees earned" value={currency(money?.summary.deliveryFees ?? 0)} />
          <DetailRow label="Incentives" value={currency(money?.summary.incentives ?? 0)} />
          <DetailRow label="Penalties" value={currency(money?.summary.penalties ?? 0)} />
          <p className="mt-3 text-xs text-muted-foreground text-pretty">
            Withdrawals are approved and paid in Finance. Nothing on this page
            moves money.
          </p>
        </Panel>

        <Panel
          title="Payout account"
          action={<Landmark className="size-4 text-muted-foreground" />}
        >
          {money?.bank.accountNumberLast4 ? (
            <>
              <DetailRow label="Account holder" value={money.bank.accountHolderName ?? "—"} />
              <DetailRow label="Bank" value={money.bank.bankName ?? "—"} />
              <DetailRow
                label="Account number"
                value={`•••• ${money.bank.accountNumberLast4}`}
              />
              <DetailRow label="IFSC" value={money.bank.ifsc ?? "—"} />
              <DetailRow
                label="Verified"
                value={money.bank.verified ? "Yes" : money.bank.verificationStatus ?? "No"}
              />
            </>
          ) : (
            <EmptyState
              title="No bank account on file"
              description="This partner cannot be paid until their account details are recorded."
            />
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Payout history">
          {payouts.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : money && money.payouts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.8125rem]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Requested</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {money.payouts.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-2">{shortDate(row.requestedAt)}</td>
                      <td data-numeric className="py-2">{currency(row.amount)}</td>
                      <td className="py-2">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {row.reference ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No withdrawals yet" />
          )}
        </Panel>

        <Panel title="Transaction history">
          {payouts.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : money && money.transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.8125rem]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">When</th>
                    <th className="pb-2 font-medium">Order</th>
                    <th className="pb-2 font-medium">Fee</th>
                    <th className="pb-2 font-medium">Incentive</th>
                    <th className="pb-2 font-medium">Penalty</th>
                    <th className="pb-2 font-medium">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {money.transactions.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-2">{shortDate(row.at)}</td>
                      <td className="py-2">{row.orderNumber ?? "—"}</td>
                      <td data-numeric className="py-2">{currency(row.deliveryFee)}</td>
                      <td data-numeric className="py-2">{currency(row.incentive)}</td>
                      <td data-numeric className="py-2">{currency(row.penalty)}</td>
                      <td data-numeric className="py-2 font-medium">
                        {currency(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No earnings yet"
              description="Each completed delivery appears here with what it paid."
            />
          )}
        </Panel>
      </div>

      <Panel title="Recent activity" className="mt-4">
        {/*
          Deliveries, earnings and withdrawal requests in one list. Read
          apart, none of them explains a balance that moved.
        */}
        {activity.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : activityRows.length > 0 ? (
          <ul className="space-y-3">
            {activityRows.map((row, index) => (
              <li key={`${row.kind}-${index}`} className="flex gap-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-muted">
                  {row.kind === "order" ? (
                    <Bike className="size-3 text-muted-foreground" />
                  ) : row.kind === "withdrawal" ? (
                    <Landmark className="size-3 text-muted-foreground" />
                  ) : (
                    <IndianRupee className="size-3 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.8125rem]">{row.title}</p>
                  {row.detail ? (
                    <p className="text-xs text-muted-foreground">{row.detail}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{shortDate(row.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing yet" />
        )}
      </Panel>

      {/* Correcting what was recorded off a document. */}
      <Dialog
        open={editingDoc !== null}
        onOpenChange={(open) => !open && setEditingDoc(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDoc?.label} details</DialogTitle>
          </DialogHeader>
          {editingDoc && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="rider-doc-number">Document number</Label>
                <Input
                  id="rider-doc-number"
                  value={editingDoc.number}
                  onChange={(event) =>
                    setEditingDoc({ ...editingDoc, number: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rider-doc-uploaded">Upload date</Label>
                  <Input
                    id="rider-doc-uploaded"
                    type="date"
                    value={editingDoc.uploadedAt}
                    max={editingDoc.expiryDate || undefined}
                    onChange={(event) =>
                      setEditingDoc({ ...editingDoc, uploadedAt: event.target.value })
                    }
                  />
                </div>
                {editingDoc.expires && (
                  <div className="space-y-1.5">
                    <Label htmlFor="rider-doc-expiry">Expiry date</Label>
                    <Input
                      id="rider-doc-expiry"
                      type="date"
                      value={editingDoc.expiryDate}
                      min={editingDoc.uploadedAt || undefined}
                      onChange={(event) =>
                        setEditingDoc({ ...editingDoc, expiryDate: event.target.value })
                      }
                    />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rider-doc-status">Status</Label>
                <select
                  id="rider-doc-status"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-[0.8125rem]"
                  value={editingDoc.status}
                  onChange={(event) =>
                    setEditingDoc({
                      ...editingDoc,
                      status: event.target.value as DocStatus,
                    })
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="verified" disabled={!editingDoc.hasFile}>
                    Verified
                  </option>
                  <option value="rejected">Rejected</option>
                </select>
                {!editingDoc.hasFile && (
                  <p className="text-xs text-muted-foreground">
                    Nothing has been filed for this document, so it cannot be
                    marked verified.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rider-doc-verifier">Verified by</Label>
                <Input
                  id="rider-doc-verifier"
                  placeholder="Leave blank to record yourself"
                  value={editingDoc.verifiedBy}
                  disabled={editingDoc.status === "pending"}
                  onChange={(event) =>
                    setEditingDoc({ ...editingDoc, verifiedBy: event.target.value })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground text-pretty">
                Approving every required document sets this partner's KYC to
                approved; rejecting one sets it to rejected.
              </p>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={updateDoc.isPending}
              onClick={async () => {
                if (!editingDoc) return;
                try {
                  await updateDoc.mutateAsync({
                    type: editingDoc.type,
                    number: editingDoc.number.trim(),
                    uploadedAt: editingDoc.uploadedAt || "",
                    expiryDate: editingDoc.expires
                      ? editingDoc.expiryDate || ""
                      : undefined,
                    status: editingDoc.status,
                    verifiedBy:
                      editingDoc.status === "pending"
                        ? ""
                        : editingDoc.verifiedBy.trim(),
                  });
                  toast.success(`${editingDoc.label} details updated`);
                  setEditingDoc(null);
                } catch (caught) {
                  toast.error(
                    caught instanceof Error
                      ? caught.message
                      : "Could not update the document."
                  );
                }
              }}
            >
              {updateDoc.isPending ? "Saving…" : "Save details"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
