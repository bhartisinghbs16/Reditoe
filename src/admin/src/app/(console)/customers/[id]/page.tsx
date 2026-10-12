"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Ban,
  BadgeCheck,
  Calendar,
  Home,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShoppingBag,
  Star,
  Tag,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { DataTable, type Column } from "@/components/common/data-table";
import { SegmentedTabs } from "@/components/common/filter-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useCustomer,
  useCustomerOrders,
  useSetCustomerBlocked,
  useAdjustCustomerWallet,
  type WalletAction,
  useSetCustomerMembership,
  useUpdateCustomer,
} from "@/lib/queries";
import { orderStatusLabel } from "@/lib/domain";
import {
  currency,
  date as formatDate,
  dateTime,
  number as formatNumber,
  phone as formatPhone,
} from "@/lib/format";
import { refDoc } from "@/lib/types";
import type { Customer, Order, Restaurant } from "@/lib/types";

/**
 * Customer Details, built to the client's reference screen: profile card and
 * lifetime metrics across the top, order history under a tab strip, and a
 * right rail carrying wallet, addresses and payment methods.
 */

const TABS = [
  { label: "Order History", value: "orders" },
  { label: "Profile Information", value: "profile" },
  { label: "Activity", value: "activity" },
  { label: "Reviews", value: "reviews" },
  { label: "Support Tickets", value: "tickets" },
];

/** One of the five circular lifetime metrics in the reference's centre card. */
function LifetimeMetric({
  icon: Icon,
  value,
  label,
  tint,
}: {
  icon: typeof ShoppingBag;
  value: React.ReactNode;
  label: string;
  tint: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 px-1 text-center">
      <span className={cn("flex size-10 items-center justify-center rounded-full", tint)}>
        <Icon className="size-[1.05rem]" />
      </span>
      <span data-numeric className="text-base font-semibold tracking-tight">
        {value}
      </span>
      <span className="text-[0.6875rem] text-muted-foreground">{label}</span>
    </div>
  );
}

function ContactLine({
  icon: Icon,
  children,
  verified,
}: {
  icon: typeof Phone;
  children: React.ReactNode;
  verified?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-[0.8125rem]">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-pretty">{children}</span>
      {verified && (
        <span className="shrink-0 rounded bg-success-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-success-foreground">
          Verified
        </span>
      )}
    </div>
  );
}

/** How the stored paymentMethod values read on screen. */
const PAYMENT_LABELS: Record<string, { label: string; short: string }> = {
  razorpay: { label: "Razorpay", short: "RZP" },
  cashfree: { label: "Cashfree", short: "CF" },
  wallet: { label: "Reditoe Money", short: "WLT" },
  cod: { label: "Cash on Delivery", short: "COD" },
  UPI: { label: "UPI", short: "UPI" },
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customer = useCustomer(params.id);
  const orders = useCustomerOrders(params.id);
  const setBlocked = useSetCustomerBlocked();
  const updateCustomer = useUpdateCustomer();
  const setMembership = useSetCustomerMembership();
  const adjustWallet = useAdjustCustomerWallet(params.id);
  const [credit, setCredit] = React.useState<{
    action: WalletAction;
    amount: string;
    comment: string;
  }>({ action: "add", amount: "", comment: "" });
  const [editOpen, setEditOpen] = React.useState(false);
  const [edit, setEdit] = React.useState({
    name: "",
    email: "",
    phone: "",
    codEnabled: false,
  });
  const [tab, setTab] = React.useState("orders");

  /*
   * Built here, above the early returns below.
   *
   * A hook placed after them runs on some renders and not others - React
   * counts a different number of hooks once the customer loads and throws
   * the whole page away, which is what "this page couldn't load" was.
   */
  const orderRows = orders.data?.items ?? [];
  /**
   * One timeline: recent orders and every admin change to the wallet.
   *
   * Wallet entries carry the reason and the admin who made the change,
   * because "the balance is wrong" is only answerable if the record says
   * who moved it and why.
   */
  const activityRows = React.useMemo(() => {
    const rows: {
      key: string;
      kind: "order" | "wallet";
      title: string;
      comment?: string;
      by?: string | null;
      at: string;
    }[] = [];

    for (const order of orderRows.slice(0, 5)) {
      rows.push({
        key: `order-${order._id}`,
        kind: "order",
        title: `Order ${order.orderNumber} ${orderStatusLabel(order.status)}`,
        at: order.createdAt ?? "",
      });
    }

    const VERB: Record<string, string> = {
      add: "Added",
      remove: "Removed",
      hold: "Put on hold",
      unhold: "Released from hold",
    };

    for (const entry of customer.data?.walletActivity ?? []) {
      rows.push({
        key: `wallet-${entry.id}`,
        kind: "wallet",
        title: `${VERB[entry.action] ?? "Changed"} ${currency(entry.amount)}`,
        comment: entry.comment,
        by: entry.by,
        at: entry.at,
      });
    }

    return rows
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 8);
  }, [orderRows, customer.data?.walletActivity]);

  if (customer.isPending) {
    return (
      <>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-40 w-full" />
        <Skeleton className="mt-3 h-80 w-full" />
      </>
    );
  }

  if (customer.isError) {
    return (
      <div className="surface">
        <ErrorState
          title="Couldn't load this customer"
          description={customer.error?.message}
          onRetry={() => customer.refetch()}
        />
      </div>
    );
  }

  const data = customer.data as Customer | undefined;
  if (!data) {
    return (
      <div className="surface">
        <EmptyState
          title="Customer not found"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/customers">Back to customers</Link>
            </Button>
          }
        />
      </div>
    );
  }

  /*
   * Totals come from the server, which aggregates the customer's whole order
   * history. Summing `orderRows` only ever added up the page of orders that
   * happened to be loaded, so "Total Spent" fell as an admin paged through.
   */
  const spent = data.stats?.totalSpent ?? orderRows.reduce((sum, order) => sum + (order.total ?? 0), 0);
  const orderCount = data.stats?.totalOrders ?? orders.data?.total ?? orderRows.length;

  const columns: Column<Order>[] = [
    {
      id: "order",
      header: "Order ID",
      cell: (order) => (
        <Link href={`/orders/${order._id}`} className="font-medium hover:text-primary">
          {order.orderNumber}
        </Link>
      ),
    },
    {
      id: "restaurant",
      header: "Restaurant",
      hideBelow: "md",
      cell: (order) => {
        const restaurant = refDoc<Restaurant>(order.restaurantId);
        return (
          <div className="flex items-center gap-2">
            <span className="size-8 shrink-0 rounded-md bg-muted" />
            <div className="min-w-0">
              <p className="truncate font-medium">{restaurant?.name ?? "—"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {restaurant?.address?.city}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "items",
      header: "Items",
      hideBelow: "lg",
      cell: (order) =>
        `${order.items?.length ?? 0} Item${(order.items?.length ?? 0) === 1 ? "" : "s"}`,
    },
    {
      id: "amount",
      header: "Amount",
      cell: (order) => <span data-numeric>{currency(order.total, true)}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (order) => (
        <StatusBadge status={order.status} label={orderStatusLabel(order.status)} />
      ),
    },
    {
      id: "placed",
      header: "Ordered On",
      hideBelow: "lg",
      cell: (order) => (
        <span className="text-xs text-muted-foreground">{dateTime(order.createdAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "Action",
      align: "right",
      cell: (order) => (
        <Button asChild variant="outline" size="sm">
          <Link href={`/orders/${order._id}`}>View Details</Link>
        </Button>
      ),
    },
  ];

  async function toggleBlock() {
    if (!data) return;
    try {
      await setBlocked.mutateAsync({ id: data._id, isBlocked: !data.isBlocked });
      toast.success(data.isBlocked ? "Customer unblocked" : "Customer blocked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update customer");
    }
  }

  return (
    <>
      <PageHeader
        title="Customer Details"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Customers", href: "/customers" },
          { label: "Customer Details" },
        ]}
        actions={
          <>
            <Button variant="outline" disabled={setBlocked.isPending} onClick={toggleBlock}>
              {data.isBlocked ? (
                <UserRoundCheck className="size-4" />
              ) : (
                <Ban className="size-4" />
              )}
              {data.isBlocked ? "Unblock" : "Block"}
            </Button>
            <Dialog
              open={editOpen}
              onOpenChange={(next) => {
                setEditOpen(next);
                // Start from what is on file each time it opens, so an
                // abandoned edit is not still sitting there on the next one.
                if (next) {
                  setEdit({
                    name: data.name ?? "",
                    email: data.email ?? "",
                    phone: data.phone ?? "",
                    codEnabled: data.codEnabled === true,
                  });
                }
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Pencil className="size-4" />
                  Edit Customer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit customer</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-name">Name</Label>
                    <Input
                      id="customer-name"
                      value={edit.name}
                      onChange={(event) =>
                        setEdit((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-email">Email</Label>
                    <Input
                      id="customer-email"
                      type="email"
                      value={edit.email}
                      onChange={(event) =>
                        setEdit((current) => ({ ...current, email: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-phone">Phone</Label>
                    <Input
                      id="customer-phone"
                      value={edit.phone}
                      onChange={(event) =>
                        setEdit((current) => ({ ...current, phone: event.target.value }))
                      }
                    />
                  </div>
                  {/*
                    Cash is offered per customer rather than to everyone: it
                    is the one method where the platform is owed money after
                    the food has already gone.
                  */}
                  <label className="flex items-start gap-2.5 rounded-md border border-border p-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={edit.codEnabled}
                      onChange={(event) =>
                        setEdit((current) => ({
                          ...current,
                          codEnabled: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <span className="block text-[0.8125rem] font-medium">
                        Allow cash on delivery
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        This customer can choose to pay the rider in cash.
                      </span>
                    </span>
                  </label>

                  <p className="text-xs text-muted-foreground">
                    Wallet balance is not edited here. Money moves through the
                    wallet ledger so there is a record of who credited what.
                  </p>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" size="sm">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    size="sm"
                    disabled={updateCustomer.isPending || !edit.name.trim()}
                    onClick={() => {
                      updateCustomer.mutate(
                        {
                          id: params.id,
                          name: edit.name.trim(),
                          email: edit.email.trim(),
                          phone: edit.phone.trim(),
                          codEnabled: edit.codEnabled,
                        },
                        {
                          onSuccess: () => {
                            toast.success("Customer updated");
                            setEditOpen(false);
                          },
                          onError: (error) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Could not update this customer"
                            ),
                        }
                      );
                    }}
                  >
                    {updateCustomer.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="grid items-start gap-3 xl:grid-cols-[1fr_20rem]">
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="grid items-start gap-3 lg:grid-cols-[1fr_1.35fr]">
            {/* Profile */}
            <div className="surface p-4">
              <div className="flex items-start gap-3">
                <span className="size-16 shrink-0 rounded-full bg-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{data.name}</h2>
                    <StatusBadge status={data.isBlocked ? "blocked" : "active"} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Customer ID: {data._id.slice(-8).toUpperCase()}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <ContactLine icon={Phone} verified>
                  {formatPhone(data.phone)}
                </ContactLine>
                <ContactLine icon={Mail} verified={data.isProfileComplete}>
                  {data.email}
                </ContactLine>
                <ContactLine icon={Calendar}>
                  Joined on {formatDate(data.createdAt)}
                </ContactLine>
                {data.savedAddresses?.[0] && (
                  <ContactLine icon={MapPin}>
                    {[
                      data.savedAddresses[0].city,
                      data.savedAddresses[0].state,
                      data.savedAddresses[0].zipCode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </ContactLine>
                )}
              </div>

              <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                <Link href={`/customers/${params.id}/profile`}>View Full Profile</Link>
              </Button>
            </div>

            {/* Lifetime metrics */}
            <div className="surface p-4">
              <div className="flex flex-wrap justify-between gap-y-3">
                <LifetimeMetric
                  icon={ShoppingBag}
                  value={formatNumber(orderCount)}
                  label="Total Orders"
                  tint="bg-red-50 text-red-600"
                />
                <LifetimeMetric
                  icon={Wallet}
                  value={currency(spent)}
                  label="Total Spent"
                  tint="bg-violet-50 text-violet-600"
                />
                <LifetimeMetric
                  icon={Tag}
                  value={currency(data.stats?.totalSavings ?? 0)}
                  label="Total Savings"
                  tint="bg-emerald-50 text-emerald-600"
                />
                <LifetimeMetric
                  icon={Star}
                  value={
                    data.stats?.averageRating != null
                      ? data.stats.averageRating.toFixed(1)
                      : "—"
                  }
                  label={
                    data.stats?.ratingCount
                      ? `Avg. Rating (${data.stats.ratingCount})`
                      : "Avg. Rating"
                  }
                  tint="bg-sky-50 text-sky-600"
                />
              </div>

              {/* Loyalty strip, as the reference places beneath the metrics. */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success-muted px-3 py-2">
                <p className="text-xs text-success-foreground">
                  Loyal since {formatDate(data.createdAt)} · {formatNumber(560)} Reward
                  Points
                </p>
                <Link
                  href="/marketing/referrals"
                  className="text-xs font-semibold text-success-foreground hover:underline"
                >
                  View Rewards →
                </Link>
              </div>
            </div>
          </div>

          {/* Tabbed history */}
          <div className="surface overflow-hidden">
            <div className="px-4 pt-3">
              <SegmentedTabs
                value={tab}
                // Profile Information is its own screen in the reference, not a
                // pane of this one — the tab hands off to it.
                onChange={(next) =>
                  next === "profile"
                    ? router.push(`/customers/${params.id}/profile`)
                    : setTab(next)
                }
                options={TABS}
              />
            </div>

            {tab === "orders" ? (
              <DataTable
                columns={columns}
                rows={orderRows}
                rowKey={(order) => order._id}
                loading={orders.isPending}
                error={orders.error}
                onRetry={() => orders.refetch()}
                emptyTitle="No orders yet"
                emptyDescription="This customer hasn't placed an order."
                className="rounded-none border-0 shadow-none"
              />
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing recorded under {TABS.find((t) => t.value === tab)?.label} yet.
              </div>
            )}

            {tab === "orders" && orderRows.length > 0 && (
              <div className="border-t border-border py-2.5 text-center">
                <Link
                  href={`/orders?customer=${data._id}`}
                  className="text-[0.8125rem] font-semibold text-primary hover:underline"
                >
                  View All Orders →
                </Link>
              </div>
            )}
          </div>

          {/* Activity and notes */}
          <div className="grid items-start gap-3 lg:grid-cols-2">
            <Panel title="Recent Activity">
              <ul className="space-y-3">
                {/*
                  Orders and wallet changes in one list, newest first. They
                  are the same story from the customer's side - what they
                  bought and what was done to their money - and reading them
                  apart made a balance change look like it came from nowhere.
                */}
                {activityRows.length === 0 && (
                  <li className="text-sm text-muted-foreground">No activity yet.</li>
                )}
                {activityRows.map((entry) => (
                  <li key={entry.key} className="flex gap-2.5">
                    <span
                      className={
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded " +
                        (entry.kind === "order"
                          ? "bg-success-muted"
                          : "bg-primary/10")
                      }
                    >
                      {entry.kind === "order" ? (
                        <ShoppingBag className="size-3 text-success-foreground" />
                      ) : (
                        <Wallet className="size-3 text-primary" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[0.8125rem]">{entry.title}</p>
                      {entry.comment ? (
                        <p className="text-xs text-pretty text-muted-foreground">
                          &ldquo;{entry.comment}&rdquo;
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {dateTime(entry.at)}
                        {entry.by ? ` \u00b7 by ${entry.by}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Customer Notes">
              {/*
                These read "Prefers less spicy food", "Usually orders on
                weekends", "Good customer, no major issues" - on every
                customer alike, for accounts nobody had ever spoken to. It
                was a mock-up caption left in place, and staff had no way to
                tell it from something a colleague had actually written.
                Nothing stores notes yet, so the panel says so.
              */}
              <p className="text-[0.8125rem] text-muted-foreground text-pretty">
                No notes. Notes about a customer are not recorded yet - use
                the support ticket for anything that needs keeping.
              </p>
            </Panel>
          </div>
        </div>

        {/* ── Right rail ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Panel
            title="Wallet Balance"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/finance/wallets">View Wallet</Link>
              </Button>
            }
          >
            <p data-numeric className="text-2xl font-semibold tracking-tight">
              {currency(data.wallet?.balance ?? data.walletBalance ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Wallet balance
              {(data.wallet?.heldAmount ?? 0) > 0
                ? ` \u00b7 ${currency(data.wallet?.spendable ?? 0)} spendable`
                : ""}
            </p>

            {(data.wallet?.heldAmount ?? 0) > 0 ? (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {currency(data.wallet?.heldAmount ?? 0)} on hold. The customer
                cannot pay with it until it is released.
              </p>
            ) : null}

            {/*
              The four things an admin can do to a wallet. Money is never
              typed over the old balance - each change goes through the
              ledger with a reason, so who did what survives it.
            */}
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { key: "add", label: "Add" },
                    { key: "remove", label: "Remove" },
                    { key: "hold", label: "Hold" },
                    { key: "unhold", label: "Unhold" },
                  ] as { key: WalletAction; label: string }[]
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() =>
                      setCredit((current) => ({ ...current, action: option.key }))
                    }
                    className={
                      "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors " +
                      (credit.action === option.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted")
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <Input
                type="number"
                min={1}
                placeholder="Amount"
                className="h-9"
                value={credit.amount}
                onChange={(event) =>
                  setCredit((current) => ({ ...current, amount: event.target.value }))
                }
              />
              <Input
                placeholder="Reason (required)"
                className="h-9"
                value={credit.comment}
                onChange={(event) =>
                  setCredit((current) => ({ ...current, comment: event.target.value }))
                }
              />
              <Button
                size="sm"
                className="h-9 w-full"
                disabled={
                  adjustWallet.isPending ||
                  !(Number(credit.amount) > 0) ||
                  credit.comment.trim().length < 3
                }
                onClick={() =>
                  adjustWallet.mutate(
                    {
                      action: credit.action,
                      amount: Number(credit.amount),
                      comment: credit.comment.trim(),
                    },
                    {
                      onSuccess: () => {
                        toast.success("Wallet updated");
                        setCredit({ action: credit.action, amount: "", comment: "" });
                      },
                      onError: (error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not change the wallet"
                        ),
                    }
                  )
                }
              >
                {adjustWallet.isPending ? "Saving..." : "Apply"}
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
              <div>
                <p className="text-xs text-muted-foreground">Total Added</p>
                <p data-numeric className="text-[0.8125rem] font-medium">
                  {currency(data.wallet?.totalAdded ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Used</p>
                <p data-numeric className="text-[0.8125rem] font-medium">
                  {currency(data.wallet?.totalSpent ?? 0)}
                </p>
              </div>
            </div>
          </Panel>

          <Panel
            title="Saved Addresses"
            action={
              <Link
              href="/orders"
              className="text-[0.8125rem] font-semibold text-primary hover:underline"
            >
              View All
            </Link>
            }
          >
            {(data.savedAddresses?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No addresses saved.</p>
            ) : (
              <ul className="space-y-3">
                {data.savedAddresses!.map((address, index) => (
                  <li key={index} className="flex gap-2.5">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent">
                      <Home className="size-3.5 text-accent-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[0.8125rem] font-medium">
                          {address.label ?? "Address"}
                        </p>
                        {index === 0 && (
                          <StatusBadge tone="accent" label="Default" dot={false} />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                        {[address.street, address.city, address.state, address.zipCode]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/*
              Addresses are the customer's own, set from their app against a
              map. The coordinates they carry are what the delivery fee is
              measured from, so an address typed in here without a map picker
              would be charged from the wrong place. These three buttons did
              nothing at all; the customer manages their address book.
            */}
          </Panel>

          <Panel
            title="Payment Methods"
            action={
              <Link
              href="/finance/transactions"
              className="text-[0.8125rem] font-semibold text-primary hover:underline"
            >
              View All
            </Link>
            }
          >
            {/*
              What this customer has actually paid with, newest first.

              This listed a Visa ending 4242 and a Mastercard ending 1836 for
              every customer, plus a UPI handle assembled from their email
              address. None of it was real, and none of it could be: card
              details live with Razorpay, not here, so there is no saved-card
              vault for this platform to read. What it can honestly show is
              the methods their paid orders went through.
            */}
            {(data.paymentMethods?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed payments yet.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {data.paymentMethods!.map((method) => (
                  <li key={method.method} className="flex items-center gap-2.5">
                    <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded border border-border text-[0.625rem] font-bold uppercase">
                      {PAYMENT_LABELS[method.method]?.short ?? method.method.slice(0, 4)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-medium">
                        {PAYMENT_LABELS[method.method]?.label ?? method.method}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {method.timesUsed === 1
                          ? "Used once"
                          : `Used ${method.timesUsed} times`}
                        {method.lastUsedAt
                          ? ` · last ${new Date(method.lastUsedAt).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

          </Panel>

          {/*
            The account's real verification state. This read "Phone and email
            verified" for everyone, including accounts that had verified
            neither.
          */}
          {/*
            Reditoe Plus waives the delivery fee, so who holds it is a
            commercial decision - and one the client wanted to be able to make
            directly rather than only when a customer pays for it. Granted
            here it costs nothing and does not auto-renew: it is a gift, and
            it should lapse rather than quietly start charging somebody.
          */}
          <Panel title="Reditoe Plus">
            {data.membership?.active ? (
              <>
                <div className="flex items-center gap-2 text-[0.8125rem]">
                  <StatusBadge tone="success" label="Active" dot={false} />
                  <span className="text-muted-foreground">
                    {data.membership.grantedByAdmin ? "Granted by admin" : "Paid membership"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Valid until{" "}
                  {data.membership.validTill
                    ? new Date(data.membership.validTill).toLocaleDateString()
                    : "—"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  disabled={setMembership.isPending}
                  onClick={() =>
                    setMembership.mutate(
                      { id: params.id, active: false },
                      {
                        onSuccess: () => toast.success("Reditoe Plus withdrawn"),
                        onError: (error) =>
                          toast.error(
                            error instanceof Error ? error.message : "Could not update"
                          ),
                      }
                    )
                  }
                >
                  Withdraw Plus
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  This customer is not a Plus member, so they pay the delivery
                  fee on every order.
                </p>
                <div className="mt-3 flex gap-2">
                  {[1, 3, 12].map((months) => (
                    <Button
                      key={months}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={setMembership.isPending}
                      onClick={() =>
                        setMembership.mutate(
                          { id: params.id, active: true, months },
                          {
                            onSuccess: () =>
                              toast.success(
                                `Reditoe Plus granted for ${months} month${months === 1 ? "" : "s"}`
                              ),
                            onError: (error) =>
                              toast.error(
                                error instanceof Error ? error.message : "Could not update"
                              ),
                          }
                        )
                      }
                    >
                      {months}m
                    </Button>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel title="Verification">
            <div className="flex items-center gap-2 text-[0.8125rem]">
              {data.accountVerified === false ? (
                <>
                  <BadgeCheck className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Not verified yet</span>
                </>
              ) : (
                <>
                  <BadgeCheck className="size-4 text-success" />
                  <span>Account verified</span>
                </>
              )}
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>{data.email ? `Email: ${data.email}` : "No email on file"}</p>
              <p>{data.phone ? `Phone: ${data.phone}` : "No phone on file"}</p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
