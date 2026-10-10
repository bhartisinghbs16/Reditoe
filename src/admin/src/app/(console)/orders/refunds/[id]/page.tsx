"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Bike,
  Check,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Flag,
  Mail,
  MapPin,
  Paperclip,
  Phone,
  Printer,
  Receipt,
  ShieldCheck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { SegmentedTabs } from "@/components/common/filter-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useOrder, useRefund } from "@/lib/queries";
import { orderAmountLines } from "@/lib/domain";
import {
  currency,
  dateTime,
  initials,
  phone as formatPhone,
  relativeTime,
  titleCase,
} from "@/lib/format";
import { refDoc, refId } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Customer, Order, Refund, Restaurant, Rider } from "@/lib/types";

/**
 * Refund Request Details, built to the client's reference screen: the request
 * summary beside the order it belongs to and its timeline, with the customer,
 * refund figures and actions in a rail on the right.
 *
 * The refund record is thin — id, amount, status, reason, method, order and
 * customer. Everything about the order itself comes from fetching the order
 * behind it, so the items and breakdown here are the real ones rather than a
 * copy stored on the refund.
 */

const TABS = [
  { label: "Customer Details", value: "customer" },
  { label: "Communication", value: "communication" },
  { label: "Admin Notes", value: "notes" },
];

/** The stages a refund moves through, as the reference draws the timeline. */
const STAGES = [
  { key: "requested", label: "Return / Refund Requested", hint: "Raised by the customer" },
  { key: "review", label: "Under Review", hint: "Request is being reviewed" },
  { key: "approved", label: "Approved", hint: "Refund approved by admin" },
  { key: "refunded", label: "Refunded", hint: "Amount refunded to the customer" },
];

function CopyButton({ value, label }: { value: string; label: string }) {
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

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value?: React.ReactNode;
  tone?: "money";
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-[0.8125rem] not-last:border-b not-last:border-border/70">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 text-right font-medium break-words",
          tone === "money" && "text-primary"
        )}
      >
        {value ?? "—"}
      </span>
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

/** How far through the ladder this refund has got. */
function reachedIndex(status?: string) {
  const value = (status ?? "").toLowerCase();
  if (value === "refunded") return 3;
  if (value === "approved") return 2;
  if (value === "processing") return 1;
  if (value === "rejected") return 2;
  return 0;
}

export default function RefundDetailPage() {
  const params = useParams<{ id: string }>();
  const refund = useRefund(params.id);

  if (refund.isPending) {
    return (
      <>
        <Skeleton className="h-9 w-64" />
        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1.4fr_1fr]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </>
    );
  }

  if (refund.isError) {
    return (
      <div className="surface">
        <ErrorState
          title="Couldn't load this refund request"
          description={refund.error?.message}
          onRetry={() => refund.refetch()}
        />
      </div>
    );
  }

  if (!refund.data) {
    return (
      <div className="surface">
        <EmptyState
          title="Refund request not found"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/orders/refunds">Back to refunds</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <RefundDetail refund={refund.data} />;
}

function RefundDetail({ refund }: { refund: Refund }) {
  const [tab, setTab] = React.useState("customer");
  const [note, setNote] = React.useState("");

  const orderId = refId<Order>(refund.orderId);
  const order = useOrder(orderId ?? undefined);

  const customer =
    refDoc<Customer>(refund.userId) ?? refDoc<Customer>(order.data?.userId);
  const restaurant = refDoc<Restaurant>(order.data?.restaurantId);
  const rider = refDoc<Rider>(order.data?.riderId);

  const reference = refund.refundId ?? `#${refund._id.slice(-8).toUpperCase()}`;
  const orderReference =
    refDoc<Order>(refund.orderId)?.orderNumber ??
    order.data?.orderNumber ??
    (orderId ? `#${orderId.slice(-8).toUpperCase()}` : "—");

  const reached = reachedIndex(refund.status);
  const rejected = (refund.status ?? "").toLowerCase() === "rejected";
  const amountLines = order.data ? orderAmountLines(order.data) : [];

  return (
    <>
      <PageHeader
        title="Returns & Refunds"
        badge={<StatusBadge status={refund.status} />}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Orders", href: "/orders" },
          { label: "Returns & Refunds", href: "/orders/refunds" },
          { label: "Request Details" },
        ]}
        actions={
          <Button variant="outline" size="lg" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print Details
          </Button>
        }
      />

      <div className="grid items-start gap-3 xl:grid-cols-[1fr_1.5fr_1fr]">
        {/* What was asked for. */}
        <Panel
          title="Request Summary"
          action={<StatusBadge status={refund.status} />}
        >
          <Row
            label="Request ID"
            value={
              <span className="flex items-center justify-end gap-1.5">
                {reference}
                <CopyButton value={reference} label="Request ID" />
              </span>
            }
          />
          <Row
            label="Order ID"
            value={
              orderId ? (
                <span className="flex flex-col items-end gap-0.5">
                  <span className="flex items-center gap-1.5">
                    {orderReference}
                    <CopyButton value={orderReference} label="Order ID" />
                  </span>
                  <Link
                    href={`/orders/${orderId}`}
                    className="text-[0.6875rem] font-medium text-primary hover:underline"
                  >
                    View Order
                  </Link>
                </span>
              ) : undefined
            }
          />
          <Row
            label="Requested On"
            value={
              <span className="flex flex-col items-end">
                {dateTime(refund.createdAt)}
                <span className="text-[0.6875rem] font-normal text-muted-foreground">
                  {relativeTime(refund.createdAt)}
                </span>
              </span>
            }
          />
          <Row
            label="Status"
            value={
              <span className="flex flex-col items-end gap-0.5">
                <StatusBadge status={refund.status} />
                {refund.processedAt && (
                  <span className="text-[0.6875rem] font-normal text-muted-foreground">
                    {titleCase(refund.status)} on {dateTime(refund.processedAt)}
                  </span>
                )}
              </span>
            }
          />
          <Row label="Refund Amount" tone="money" value={currency(refund.amount, true)} />
          <Row
            label="Refund To"
            value={
              customer ? (
                <span className="flex flex-col items-end">
                  {customer.name}
                  <span className="text-[0.6875rem] font-normal text-muted-foreground">
                    {customer.email}
                  </span>
                </span>
              ) : undefined
            }
          />
          <Row label="Payment Method" value={refund.method} />
          <Row label="Request Type" value="Refund" />
          <Row label="Reason" value={titleCase(refund.reason)} />

          <div className="mt-3 border-t border-border pt-3">
            <p className="text-[0.6875rem] text-muted-foreground">Attachments</p>
            {/*
              A refund record carries no attachments, so rather than draw an
              empty file card the panel says what would appear here.
            */}
            <p className="mt-1 flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
              <Paperclip className="size-3.5 shrink-0" />
              None — the refund record doesn&apos;t carry uploads yet.
            </p>
          </div>
        </Panel>

        {/* The order it belongs to. */}
        <div className="flex flex-col gap-3">
          <Panel
            title="Order Summary"
            action={
              orderId ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/orders/${orderId}`}>
                    <ExternalLink className="size-3.5" />
                    View Order
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {order.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : !order.data ? (
              <p className="text-[0.8125rem] text-muted-foreground">
                The order behind this request couldn&apos;t be loaded.
              </p>
            ) : (
              <>
                <div className="flex items-start gap-2.5">
                  <Avatar className="size-10 rounded-md">
                    {restaurant?.image && (
                      <AvatarImage
                        src={restaurant.image}
                        alt=""
                        className="rounded-md object-cover"
                      />
                    )}
                    <AvatarFallback className="rounded-md bg-muted">
                      <UtensilsCrossed className="size-4 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-[0.8125rem] font-semibold">
                      {restaurant?.name ?? "Restaurant"}
                    </p>
                    <p className="truncate text-[0.6875rem] text-muted-foreground">
                      {restaurant?.address?.city ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-4">
                  <Fact label="Order Time">{dateTime(order.data.createdAt)}</Fact>
                  <Fact label="Delivery Type">
                    {order.data.deliveryAddress ? "Delivery" : "Pickup"}
                  </Fact>
                  <Fact label="Payment Method">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {order.data.paymentMethod ?? "—"}
                      <StatusBadge status={order.data.paymentStatus} dot={false} />
                    </span>
                  </Fact>
                  <Fact label="Delivery Partner">
                    {rider ? (
                      <span className="flex flex-col">
                        {rider.name}
                        <span className="text-[0.6875rem] font-normal text-muted-foreground">
                          {formatPhone(rider.phone)}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </Fact>
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-[0.8125rem] font-semibold">Order Items</p>
                  <table className="mt-1.5 w-full">
                    <thead>
                      <tr className="text-[0.6875rem] text-muted-foreground">
                        <th scope="col" className="py-1 text-left font-medium">
                          Item
                        </th>
                        <th scope="col" className="py-1 text-right font-medium">
                          Price
                        </th>
                        <th scope="col" className="py-1 text-right font-medium">
                          Qty
                        </th>
                        <th scope="col" className="py-1 text-right font-medium">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(order.data.items ?? []).map((item, index) => (
                        <tr
                          key={item._id ?? index}
                          className="border-t border-border/70 text-[0.8125rem]"
                        >
                          <td className="py-2">
                            <span className="font-medium">{item.name ?? "Item"}</span>
                            {(item.selectedAddons?.length ?? 0) > 0 && (
                              <span className="block text-[0.6875rem] text-muted-foreground">
                                {item.selectedAddons!
                                  .map((addon) => addon.name)
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {currency(item.price)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {item.quantity ?? 1}
                          </td>
                          <td className="py-2 text-right font-medium tabular-nums">
                            {currency((item.price ?? 0) * (item.quantity ?? 1))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-3 border-t border-border pt-2">
                    {amountLines
                      .filter((line) => !line.emphasis)
                      .map((line) => (
                        <div
                          key={line.label}
                          className="flex items-center justify-between gap-3 py-1 text-[0.8125rem]"
                        >
                          <span className="text-muted-foreground">{line.label}</span>
                          <span className="tabular-nums">
                            {line.negative ? "−" : ""}
                            {currency(line.value, true)}
                          </span>
                        </div>
                      ))}
                  </div>

                  <div className="mt-2 flex items-center justify-between rounded-lg bg-primary/8 px-3 py-2.5">
                    <span className="text-[0.8125rem] font-semibold text-primary">
                      Total Amount
                    </span>
                    <span
                      data-numeric
                      className="text-base font-semibold text-primary"
                    >
                      {currency(order.data.total)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </Panel>

          <Panel title="Timeline">
            <ol className="relative space-y-4 pl-8">
              <span
                aria-hidden
                className="absolute top-2 bottom-2 left-[0.6875rem] w-px bg-border"
              />
              {STAGES.map((stage, index) => {
                const done = index < reached;
                const current = index === reached;
                const failed = rejected && index === 2;
                return (
                  <li key={stage.key} className="relative">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-0 -left-8 flex size-6 items-center justify-center rounded-full ring-4 ring-card",
                        failed && "bg-danger text-white",
                        !failed && done && "bg-success text-white",
                        !failed && current && "bg-warning text-white",
                        !failed && !done && !current && "bg-muted text-muted-foreground"
                      )}
                    >
                      {failed ? (
                        <X className="size-3.5" />
                      ) : done ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Clock className="size-3" />
                      )}
                    </span>
                    <div
                      className={cn(
                        "text-[0.8125rem] font-medium",
                        !done && !current && "text-muted-foreground"
                      )}
                    >
                      {failed ? "Rejected" : stage.label}
                    </div>
                    <div className="text-[0.6875rem] text-muted-foreground">
                      {failed ? "Request declined by admin" : stage.hint}
                    </div>
                    <div className="text-[0.6875rem] text-muted-foreground">
                      {index === 0
                        ? dateTime(refund.createdAt)
                        : index === reached && refund.processedAt
                          ? dateTime(refund.processedAt)
                          : "—"}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 border-t border-border pt-2.5 text-[0.75rem] text-muted-foreground">
              A refund record carries a created and a processed time, so the middle
              stages show a dash rather than an invented timestamp.
            </p>
          </Panel>
        </div>

        {/* Who it's for, and what happens next. */}
        <div className="flex flex-col gap-3">
          <Panel title={`Request Details — ${reference}`} bodyClassName="p-4 pt-3">
            <SegmentedTabs value={tab} onChange={setTab} options={TABS} />

            {tab === "customer" && (
              <div className="mt-3">
                {customer ? (
                  <>
                    <div className="flex items-start gap-2.5">
                      <Avatar className="size-11">
                        <AvatarImage
                          src={customer.avatar ?? customer.profilePhoto}
                          alt=""
                        />
                        <AvatarFallback>{initials(customer.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate text-[0.8125rem] font-semibold">
                            {customer.name}
                          </span>
                          <Link
                            href={`/customers/${customer._id}`}
                            className="shrink-0 text-[0.6875rem] font-medium text-primary hover:underline"
                          >
                            View Profile
                          </Link>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 space-y-1.5">
                      <p className="flex items-start gap-2 text-[0.8125rem]">
                        <Phone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        {formatPhone(customer.phone)}
                      </p>
                      <p className="flex items-start gap-2 text-[0.8125rem]">
                        <Mail className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 break-words">
                          {customer.email ?? "—"}
                        </span>
                      </p>
                      {order.data?.deliveryAddress && (
                        <p className="flex items-start gap-2 text-[0.8125rem]">
                          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 break-words">
                            {[
                              order.data.deliveryAddress.street,
                              order.data.deliveryAddress.city,
                              order.data.deliveryAddress.zipCode,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-[0.8125rem] text-muted-foreground">
                    No customer is linked to this request.
                  </p>
                )}
              </div>
            )}

            {tab === "communication" && (
              <p className="mt-3 text-[0.8125rem] text-muted-foreground">
                Message history between the customer and support needs the
                order-communication endpoint, which isn&apos;t surfaced yet. Support
                tickets for this customer are on the Support screen.
              </p>
            )}

            {tab === "notes" && (
              <div className="mt-3 space-y-2">
                <Textarea
                  rows={4}
                  value={note}
                  placeholder="Add a note for whoever picks this up next…"
                  onChange={(event) => setNote(event.target.value)}
                />
                <p className="text-[0.75rem] text-muted-foreground">
                  A refund record has no notes field yet, so this isn&apos;t saved.
                  Order-level notes live on the order screen.
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Refund Details">
            <Row label="Refund Amount" tone="money" value={currency(refund.amount, true)} />
            <Row label="Processing Fee" value={currency(0, true)} />
            <Row
              label="Net Refund Amount"
              tone="money"
              value={currency(refund.amount, true)}
            />
            <Row label="Refund Method" value={refund.method} />
            <Row label="Refund To" value={customer?.email ?? customer?.name} />
            <Row label="UTR / Reference ID" value={undefined} />
            <Row label="Refunded On" value={dateTime(refund.processedAt)} />
          </Panel>

          {(refund.status ?? "").toLowerCase() === "refunded" && (
            <p className="flex items-start gap-2 rounded-xl bg-success-muted px-3.5 py-3 text-[0.75rem] text-success-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block font-semibold">Important</span>
                The refund has been processed and credited to the customer.
              </span>
            </p>
          )}

          <Panel title="Actions" bodyClassName="p-3">
            <div className="flex flex-col gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={orderId ? `/orders/${orderId}` : "/orders/refunds"}>
                  <Receipt className="size-3.5" />
                  Open the order
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast.info("Invoice export isn't wired to the API yet.")
                }
              >
                <Download className="size-3.5" />
                Download Invoice
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/support/disputes">
                  <Flag className="size-3.5" />
                  Raise Dispute
                </Link>
              </Button>
              {rider && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/partners/${rider._id}`}>
                    <Bike className="size-3.5" />
                    Delivery partner
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="/orders/refunds">
                  <CreditCard className="size-3.5" />
                  Back to refunds
                </Link>
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
