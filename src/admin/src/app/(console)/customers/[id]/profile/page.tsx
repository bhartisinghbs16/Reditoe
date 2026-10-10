"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  BellRing,
  CalendarDays,
  Copy,
  CreditCard,
  Download,
  FileClock,
  GitMerge,
  Home,
  KeyRound,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  ScrollText,
  Settings2,
  Shield,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
  Wallet,
  WalletMinimal,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { CreateDialog } from "@/components/common/create-dialog";
import { Panel } from "@/components/common/panel";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCustomer, useSetCustomerBlocked, useAdjustCustomerWallet } from "@/lib/queries";
import {
  currency,
  date as formatDate,
  dateTime,
  initials,
  phone as formatPhone,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Customer } from "@/lib/types";

/**
 * Profile Information, built to the client's reference screen: an identity
 * rail with the section list, wallet and loyalty cards, and the personal /
 * address / account panels beside it.
 *
 * The reference shows a richer customer record than the API returns — gender,
 * blood group, date of birth, referral chain, PAN and Aadhaar are all drawn
 * but none exist on the user document. Those fields render as em-dashes
 * rather than being dropped, so the screen doubles as the list of what the
 * backend still has to expose.
 */

const SECTIONS = [
  { value: "profile", label: "Profile Information", icon: UserRound },
  { value: "addresses", label: "Saved Addresses", icon: Home },
  { value: "payment", label: "Payment Methods", icon: CreditCard },
  { value: "preferences", label: "Preferences", icon: Settings2 },
  { value: "security", label: "Security", icon: Shield },
  { value: "notifications", label: "Notifications", icon: BellRing },
  { value: "activity", label: "Activity Log", icon: ScrollText },
];

/** Label above value — the reference's three-across field grid. */
function Field({
  label,
  value,
  verified,
  copy,
}: {
  label: string;
  value?: React.ReactNode;
  verified?: boolean;
  copy?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.75rem] text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] font-medium break-words">
        {value ?? "—"}
        {verified && (
          <span className="rounded bg-success-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-success-foreground">
            Verified
          </span>
        )}
        {copy && <CopyButton value={copy} label={label} />}
      </p>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
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

/**
 * Editing is done on the customer's own page, which has the dialog that saves.
 * This button had no handler at all, so every "Edit" on this screen was inert.
 */
function EditAction({ customerId }: { customerId: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/customers/${customerId}`}>
        <Pencil className="size-3.5" />
        Edit
      </Link>
    </Button>
  );
}

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const customer = useCustomer(params.id);
  const [section, setSection] = React.useState("profile");
  const setBlocked = useSetCustomerBlocked();
  const adjustWallet = useAdjustCustomerWallet(params.id);
  /** Which way the wallet is being moved, or null when the dialog is shut. */
  const [adjusting, setAdjusting] = React.useState<"credit" | "debit" | null>(null);

  if (customer.isPending) {
    return (
      <>
        <Skeleton className="h-9 w-64" />
        <div className="mt-4 grid gap-3 xl:grid-cols-[20rem_1fr]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
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

  const address = data.savedAddresses?.[0];
  const blocked = data.isBlocked === true;
  const customerId = `#${data._id.slice(-8).toUpperCase()}`;

  return (
    <>
      <CreateDialog
        open={adjusting !== null}
        onOpenChange={(open) => setAdjusting(open ? adjusting : null)}
        title={adjusting === "debit" ? "Deduct wallet amount" : "Add wallet balance"}
        description={`${data.name ?? "This customer"}'s wallet. The change is recorded against their ledger.`}
        submitLabel={adjusting === "debit" ? "Deduct" : "Add"}
        fields={[
          { name: "amount", label: "Amount (₹)", required: true, placeholder: "500" },
          {
            name: "reason",
            label: "Reason",
            required: true,
            type: "textarea",
            placeholder: "Goodwill credit for order RI-2609-150001",
          },
        ]}
        onSubmit={async (values) => {
          const amount = Number(values.amount);
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("Enter an amount greater than zero.");
          }
          await adjustWallet.mutateAsync({
            action: adjusting === "debit" ? "remove" : "add",
            amount,
            comment: values.reason.trim(),
          });
          setAdjusting(null);
        }}
      />

      <PageHeader
        title="Profile Information"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Customers", href: "/customers" },
          { label: "Customer Details", href: `/customers/${data._id}` },
          { label: "Profile Information" },
        ]}
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href={`/customers/${data._id}`}>
                <ArrowLeft className="size-4" />
                Back to Customer
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="lg">
                  More Actions
                </Button>
              </DropdownMenuTrigger>
              {/*
                Every entry in this menu used to close it and do nothing.
                What is left is what the platform can actually carry out;
                sending a message, loyalty points, password resets, merging,
                data export, login history and deletion each had no endpoint
                behind them, and a menu full of entries that do nothing is
                worse than a short one that works.
              */}
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setAdjusting("credit")}>
                  <Wallet className="size-4" />
                  Add Wallet Balance
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAdjusting("debit")}>
                  <WalletMinimal className="size-4" />
                  Deduct Wallet Amount
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant={blocked ? undefined : "destructive"}
                  onSelect={() => {
                    setBlocked
                      .mutateAsync({ id: data._id, isBlocked: !blocked })
                      .then(() =>
                        toast.success(blocked ? "Customer unblocked" : "Customer blocked")
                      )
                      .catch((error: unknown) =>
                        toast.error(
                          error instanceof Error ? error.message : "Couldn't change that"
                        )
                      );
                  }}
                >
                  <Ban className="size-4" />
                  {blocked ? "Unblock Customer" : "Block Customer"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid items-start gap-3 xl:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-3">
          {/* Identity */}
          <div className="surface p-4">
            <div className="flex items-start gap-3">
              <Avatar className="size-16">
                <AvatarImage src={data.avatar ?? data.profilePhoto} alt="" />
                <AvatarFallback className="text-base">
                  {initials(data.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold">
                    {data.name ?? "Customer"}
                  </h2>
                  <StatusBadge status={blocked ? "blocked" : "active"} />
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
                  Customer ID:
                  <span className="font-medium text-foreground">{customerId}</span>
                  <CopyButton value={customerId} label="Customer ID" />
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <p className="flex items-start gap-2 text-[0.8125rem]">
                <Phone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">{formatPhone(data.phone)}</span>
              </p>
              <p className="flex items-start gap-2 text-[0.8125rem]">
                <Mail className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 break-words">{data.email ?? "—"}</span>
              </p>
              <p className="flex items-start gap-2 text-[0.8125rem]">
                <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  Joined on {formatDate(data.createdAt)}
                </span>
              </p>
              {address && (
                <p className="flex items-start gap-2 text-[0.8125rem]">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 break-words">
                    {[address.city, address.state, address.zipCode]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Section list */}
          <nav className="surface p-1.5">
            <ul>
              {SECTIONS.map(({ value, label, icon: Icon }) => {
                const active = value === section;
                return (
                  <li key={value}>
                    <button
                      type="button"
                      onClick={() => setSection(value)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[0.8125rem] transition-colors",
                        active
                          ? "bg-primary/8 font-medium text-primary"
                          : "text-foreground hover:bg-muted/60"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Wallet */}
          <div className="surface overflow-hidden">
            <div className="bg-success-muted/50 p-4">
              <p className="flex items-center gap-2 text-[0.8125rem] font-medium">
                <Wallet className="size-4 text-emerald-600" />
                Wallet Balance
              </p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p data-numeric className="text-xl font-semibold tracking-tight">
                    {currency(data.walletBalance ?? 0, true)}
                  </p>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Available Balance
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/finance/wallets">View Wallet</Link>
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
              <div className="px-4 py-2.5">
                <p className="text-[0.6875rem] text-muted-foreground">Total Added</p>
                <p className="text-[0.8125rem] font-medium tabular-nums">—</p>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-[0.6875rem] text-muted-foreground">Total Used</p>
                <p className="text-[0.8125rem] font-medium tabular-nums">
                  {currency(data.totalSpent, true)}
                </p>
              </div>
            </div>
          </div>

          {/* Loyalty */}
          <div className="surface bg-warning-muted/40 p-4">
            <p className="flex items-center gap-2 text-[0.8125rem] font-medium">
              <Star className="size-4 text-amber-500" />
              Loyalty Points
            </p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p data-numeric className="text-xl font-semibold tracking-tight">
                  —
                </p>
                <p className="text-[0.6875rem] text-muted-foreground">
                  Not tracked by the API yet
                </p>
              </div>
              <Button variant="outline" size="sm" disabled>
                View Rewards
              </Button>
            </div>
          </div>
        </div>

        {/* Sections */}
        {section === "profile" ? (
          <div className="flex flex-col gap-3">
            <Panel title="Personal Information" action={<EditAction customerId={data._id} />}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Full Name" value={data.name} />
                <Field label="Phone Number" value={formatPhone(data.phone)} />
                <Field label="Alternate Phone" />
                <Field label="Email Address" value={data.email} />
                <Field label="Gender" />
                <Field label="Blood Group" />
                <Field label="Date of Birth" />
                <Field label="Anniversary" />
                <Field label="Customer Since" value={formatDate(data.createdAt)} />
              </div>
            </Panel>

            <Panel title="Address Information" action={<EditAction customerId={data._id} />}>
              {address ? (
                <>
                  <StatusBadge tone="success" dot={false} label="Primary Address" />
                  <p className="mt-2 text-[0.8125rem]">
                    {[address.street, address.city, address.state, address.zipCode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Address Type" value={address.label} />
                    <Field label="Landmark" />
                    <Field label="Pincode" value={address.zipCode} />
                  </div>
                </>
              ) : (
                <p className="text-[0.8125rem] text-muted-foreground">
                  No address saved for this customer.
                </p>
              )}
            </Panel>

            <Panel title="Account Information" action={<EditAction customerId={data._id} />}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Account Status"
                  value={<StatusBadge status={blocked ? "blocked" : "active"} />}
                />
                <Field label="Account Type" value="Individual" />
                <Field label="Refer Code" />
                <Field label="Referred By" />
                <Field label="Referral Date" />
                <Field label="Total Referrals" />
              </div>
            </Panel>

            <Panel
              title={
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  KYC Information
                </span>
              }
            >
              <p className="text-[0.8125rem] text-muted-foreground">
                No KYC record is held against a customer account. PAN and Aadhaar
                verification apply to restaurants and delivery partners.
              </p>
            </Panel>

            <p className="text-[0.6875rem] text-muted-foreground">
              Last updated {dateTime(data.updatedAt ?? data.createdAt)}
            </p>
          </div>
        ) : section === "addresses" ? (
          <Panel title="Saved Addresses" flush>
            {(data.savedAddresses?.length ?? 0) === 0 ? (
              <EmptyState
                icon={Home}
                title="No saved addresses"
                description="Addresses the customer saves in the app appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.savedAddresses!.map((entry, index) => (
                  <li key={index} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <MapPin className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[0.8125rem] font-medium">
                          {entry.label ?? `Address ${index + 1}`}
                        </span>
                        {index === 0 && (
                          <StatusBadge tone="success" dot={false} label="Primary" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                        {[entry.street, entry.city, entry.state, entry.zipCode]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : (
          <Panel title={SECTIONS.find((entry) => entry.value === section)?.label}>
            <EmptyState
              icon={SECTIONS.find((entry) => entry.value === section)?.icon}
              title="Not available yet"
              description="The API doesn't expose this for a customer account. It is listed here because the reference screen calls for it."
            />
          </Panel>
        )}
      </div>
    </>
  );
}
