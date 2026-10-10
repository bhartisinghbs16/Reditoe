"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  FileText,
  IndianRupee,
  Pencil,
  Percent,
  Phone,
  Send,
  ShoppingBag,
  Star,
  Trash2,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ApplicationPanel } from "@/components/restaurants/application-panel";
import { Panel } from "@/components/common/panel";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/common/status-badge";
import {
  Field,
  RestaurantBoundary,
  RestaurantShell,
} from "@/components/restaurants/restaurant-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useApproveRestaurant,
  useVerifyVendorContact,
  useResendVendorVerification,
  useUpdateRestaurant,
  useUpdateRestaurantStatus,
  useUpdateRestaurantRadius,
} from "@/lib/queries";
import {
  currency,
  date as formatDate,
  number as formatNumber,
  phone as formatPhone,
  shortId,
} from "@/lib/format";
import { refDoc } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Customer, Restaurant } from "@/lib/types";

/**
 * Restaurant Details — the Overview section of the reference's restaurant
 * screen. The identity header and section rail live in RestaurantShell, which
 * Documents and Operational Details share.
 *
 * The reference shows a vendor record the API doesn't hold — FSSAI licence,
 * tagline, GST and PAN, the contact person's designation and alternate number,
 * bank details and business hours. Those render as em-dashes rather than being
 * dropped, so the screen doubles as the list of what the backend still owes.
 */

/** Label/value across a row — the Restaurant Information panel's shape. */
function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-[0.8125rem] not-last:border-b not-last:border-border/70">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 font-medium break-words">{value ?? "—"}</span>
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: React.ReactNode;
  tint: string;
}) {
  return (
    <div className="rounded-xl border border-border p-3 text-center">
      <span className={cn("mx-auto flex size-9 items-center justify-center rounded-lg", tint)}>
        <Icon className="size-[1.05rem]" />
      </span>
      <p className="mt-2 text-[0.6875rem] text-muted-foreground">{label}</p>
      <p data-numeric className="mt-0.5 text-base font-semibold tracking-tight">
        {value}
      </p>
    </div>
  );
}

/** One field in an edit dialog. `path` is where it sits on the restaurant. */
interface EditField {
  path: string;
  label: string;
  multiline?: boolean;
}

/**
 * The Edit button on a panel, and the dialog behind it.
 *
 * There were five of these on this page and not one of them did anything.
 * Two are wired here - the panels whose fields actually live on the
 * restaurant record. The other three said their data was held elsewhere
 * (payouts in Finance, opening hours not stored at all), so an Edit there had
 * nothing to save and has been taken away rather than left looking live.
 */
function EditAction({
  restaurant,
  title,
  fields,
}: {
  restaurant: Restaurant;
  title: string;
  fields: EditField[];
}) {
  const update = useUpdateRestaurant(restaurant._id);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  const read = (path: string) =>
    path
      .split(".")
      .reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], restaurant);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Filled from the record each time it opens, so an abandoned edit is
        // not still sitting in the form on the next one.
        if (next) {
          setDraft(
            Object.fromEntries(
              fields.map((field) => [field.path, String(read(field.path) ?? "")])
            )
          );
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((field) => (
            <div key={field.path} className="space-y-1.5">
              <Label htmlFor={field.path}>{field.label}</Label>
              {field.multiline ? (
                <Textarea
                  id={field.path}
                  rows={3}
                  value={draft[field.path] ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field.path]: event.target.value,
                    }))
                  }
                />
              ) : (
                <Input
                  id={field.path}
                  value={draft[field.path] ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field.path]: event.target.value,
                    }))
                  }
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            disabled={update.isPending}
            onClick={async () => {
              /*
               * Sent nested the way it is stored: "address.city" has to reach
               * the server as { address: { city } }, or a flat key of that
               * name would be written beside the address rather than into it.
               */
              const body: Record<string, unknown> = {};
              for (const field of fields) {
                const parts = field.path.split(".");
                let target = body;
                for (const part of parts.slice(0, -1)) {
                  target[part] = {
                    ...((read(part) as Record<string, unknown>) ?? {}),
                    ...((target[part] as Record<string, unknown>) ?? {}),
                  };
                  target = target[part] as Record<string, unknown>;
                }
                target[parts[parts.length - 1]] = draft[field.path]?.trim() ?? "";
              }

              try {
                await update.mutateAsync(body);
                toast.success(`${title} updated`);
                setOpen(false);
              } catch (caught) {
                toast.error(
                  caught instanceof Error ? caught.message : "Could not save the changes."
                );
              }
            }}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RestaurantOverviewPage() {
  const params = useParams<{ id: string }>();
  return (
    <RestaurantBoundary id={params.id}>
      {(restaurant) => <Overview restaurant={restaurant} />}
    </RestaurantBoundary>
  );
}

function Overview({ restaurant }: { restaurant: Restaurant }) {
  const approve = useApproveRestaurant();
  const verifyVendor = useVerifyVendorContact(restaurant._id);
  const resendVendor = useResendVendorVerification(restaurant._id);
  const [vendorOtp, setVendorOtp] = React.useState({ email: "", phone: "" });
  const updateStatus = useUpdateRestaurantStatus();
  const saveRadius = useUpdateRestaurantRadius();

  const coords = restaurant?.address?.coordinates;
  const hasPoint =
    Number.isFinite(coords?.latitude) &&
    Number.isFinite(coords?.longitude) &&
    !(coords?.latitude === 0 && coords?.longitude === 0);

  const [radius, setRadius] = React.useState("");
  React.useEffect(() => {
    setRadius(String(restaurant?.deliveryRadius ?? ""));
  }, [restaurant?.deliveryRadius]);

  const radiusChanged =
    radius !== "" &&
    Number(radius) >= 1 &&
    Number(radius) <= 50 &&
    Number(radius) !== restaurant?.deliveryRadius;
  const owner = refDoc<Customer>(restaurant.owner);
  const code = shortId(restaurant._id, "REST");

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }

  return (
    <RestaurantShell
      restaurant={restaurant}
      title="Restaurant Details"
      section="overview"
      actions={
        <>
          <Button asChild variant="outline" size="lg">
            <Link href="/restaurants">
              <ArrowLeft className="size-4" />
              Back to Restaurants
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="lg">
                More Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {!restaurant.isApproved && (
                <DropdownMenuItem
                  onSelect={() =>
                    run(
                      () => approve.mutateAsync({ id: restaurant._id, isApproved: true }),
                      "Restaurant approved"
                    )
                  }
                >
                  <CheckCircle2 className="size-4" />
                  Approve Restaurant
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href={`/restaurants/${restaurant._id}/menu`}>
                  <UtensilsCrossed className="size-4" />
                  Menu Management
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/restaurants/${restaurant._id}/documents`}>
                  <FileText className="size-4" />
                  Documents
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/restaurants/${restaurant._id}/payout`}>
                  <Wallet className="size-4" />
                  Payouts
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/support?restaurantId=${restaurant._id}`}>
                  <Send className="size-4" />
                  Send Message
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={updateStatus.isPending}
                onSelect={() =>
                  run(
                    () =>
                      updateStatus.mutateAsync({
                        id: restaurant._id,
                        status: "suspended",
                      }),
                    "Restaurant suspended"
                  )
                }
              >
                <Ban className="size-4" />
                Suspend Restaurant
              </DropdownMenuItem>
              {/* Deleting a restaurant had no handler and no endpoint behind
                  it; suspending is the entry above. */}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <div className="grid items-start gap-3 xl:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-3">
          {/* The first thing to decide about a restaurant: whether it is on the
            platform at all. */}
          <ApplicationPanel restaurant={restaurant} />

          {/*
            The codes sent when staff created this vendor. The restaurant
            cannot trade until both are confirmed: nobody has shown that the
            email address and the phone number typed for them are theirs, and
            that number is what riders and customers use to reach the kitchen.
          */}
          {restaurant.contactVerification?.pending && (
            <Panel title="Confirm contact details">
              <p className="text-sm text-muted-foreground">
                This restaurant stays disabled until the codes sent to the
                owner&apos;s email and mobile are both entered.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="vendor-email-otp">
                    Email code{restaurant.contactVerification.emailVerified && " ✓"}
                  </Label>
                  <Input
                    id="vendor-email-otp"
                    inputMode="numeric"
                    maxLength={6}
                    disabled={restaurant.contactVerification.emailVerified}
                    value={vendorOtp.email}
                    onChange={(event) =>
                      setVendorOtp((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vendor-phone-otp">
                    Mobile code{restaurant.contactVerification.phoneVerified && " ✓"}
                  </Label>
                  <Input
                    id="vendor-phone-otp"
                    inputMode="numeric"
                    maxLength={6}
                    disabled={restaurant.contactVerification.phoneVerified}
                    value={vendorOtp.phone}
                    onChange={(event) =>
                      setVendorOtp((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={verifyVendor.isPending}
                  onClick={() =>
                    verifyVendor.mutate(
                      { emailOtp: vendorOtp.email, phoneOtp: vendorOtp.phone },
                      {
                        onSuccess: (result) => {
                          const payload = (result as { data?: { complete?: boolean } })?.data;
                          toast[payload?.complete ? "success" : "message"](
                            payload?.complete
                              ? "Both codes confirmed."
                              : "Saved. The other code is still outstanding."
                          );
                          setVendorOtp({ email: "", phone: "" });
                        },
                        onError: (error) =>
                          toast.error(
                            error instanceof Error ? error.message : "Could not confirm"
                          ),
                      }
                    )
                  }
                >
                  {verifyVendor.isPending ? "Checking…" : "Confirm"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resendVendor.isPending}
                  onClick={() =>
                    resendVendor.mutate(undefined, {
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

          <Panel
            title="Restaurant Information"
            action={
              <EditAction
                restaurant={restaurant}
                title="Restaurant information"
                fields={[
                  { path: "name", label: "Restaurant name" },
                  { path: "description", label: "Description", multiline: true },
                ]}
              />
            }
          >
            <Row label="Restaurant Name" value={restaurant.name} />
            <Row label="Restaurant Code" value={code} />
            <Row label="Tagline" />
            <Row label="Description" value={restaurant.description} />
            <Row label="Established On" value={formatDate(restaurant.createdAt)} />
            <Row label="Restaurant Type" />
            <Row label="GST Number" />
            <Row label="PAN Number" />
          </Panel>

          <Panel title="Contact Person">
            {owner ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={owner.name} />
                <Field label="Designation" value="Owner" />
                <Field label="Phone" value={formatPhone(owner.phone)} />
                <Field label="Alternate Number" />
                <Field
                  label="Email Address"
                  value={owner.email}
                  copy={owner.email}
                  className="sm:col-span-2"
                />
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${owner.phone ?? restaurant.phone ?? ""}`}>
                      <Phone className="size-3.5" />
                      Call
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/customers/${owner._id}`}>Open account</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">
                No owner account is linked to this restaurant.
              </p>
            )}
          </Panel>

          <Panel title="Bank Details">
            {/*
              The account this vendor is paid into. The panel used to say
              these were not held on the restaurant record and send people to
              Finance to look - they are held here, and were all along.
              Only the last four digits are shown: a full account number is a
              liability on every screen it is left open on.
            */}
            {restaurant.bankDetails?.accountNumber ? (
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Account holder"
                  value={restaurant.bankDetails.accountHolderName ?? "—"}
                />
                <Field label="Bank" value={restaurant.bankDetails.bankName ?? "—"} />
                <Field
                  label="Account number"
                  value={`•••• ${String(restaurant.bankDetails.accountNumber).slice(-4)}`}
                />
                <Field label="IFSC" value={restaurant.bankDetails.ifsc ?? "—"} />
              </div>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">
                No bank account is on file. This vendor cannot be paid until
                their account details are recorded.
              </p>
            )}
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href={`/restaurants/${restaurant._id}/payout`}>
                <Wallet className="size-3.5" />
                Payout &amp; settlement
              </Link>
            </Button>
          </Panel>
        </div>

        <div className="flex flex-col gap-3">
          <Panel
            title="Address Information"
            action={
              <EditAction
                restaurant={restaurant}
                title="Address"
                fields={[
                  { path: "address.street", label: "Street" },
                  { path: "address.city", label: "City" },
                  { path: "address.state", label: "State" },
                  { path: "address.zipCode", label: "PIN code" },
                ]}
              />
            }
          >
            {restaurant.address ? (
              <>
                <StatusBadge tone="success" dot={false} label="Registered Address" />
                <p className="mt-2 text-[0.8125rem]">
                  {[
                    restaurant.address.street,
                    restaurant.address.city,
                    restaurant.address.state,
                    restaurant.address.zipCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="City" value={restaurant.address.city} />
                  <Field label="State" value={restaurant.address.state} />
                  <Field label="Pincode" value={restaurant.address.zipCode} />
                  <Field label="Landmark" />
                </div>
              </>
            ) : (
              <p className="text-[0.8125rem] text-muted-foreground">
                No address on file.
              </p>
            )}
          </Panel>

          {/*
            The radius decides who may order from this restaurant at all, so
            it belongs beside the address it is measured from rather than
            buried in a settings page.
          */}
          <Panel title="Delivery Area">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Delivery radius"
                value={
                  restaurant.deliveryRadius
                    ? `${restaurant.deliveryRadius} km`
                    : "Not set"
                }
              />
              <Field
                label="Radius centre"
                value={
                  hasPoint
                    ? `${coords!.latitude!.toFixed(4)}, ${coords!.longitude!.toFixed(4)}`
                    : "No location set"
                }
              />
            </div>

            {!hasPoint && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                This restaurant has no coordinates, so no customer can order
                from it. The vendor sets these when they save their restaurant
                location.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="text-[0.8125rem]">
                <span className="mb-1 block text-muted-foreground">
                  Change radius (km)
                </span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={radius}
                  onChange={(event) => setRadius(event.target.value)}
                  className="h-9 w-28 rounded-md border border-border bg-background px-2 text-sm"
                />
              </label>
              <Button
                size="sm"
                disabled={!radiusChanged || saveRadius.isPending}
                onClick={() =>
                  toast.promise(
                    saveRadius.mutateAsync({
                      id: restaurant._id,
                      deliveryRadius: Number(radius),
                    }),
                    {
                      loading: "Saving…",
                      success: `Delivery radius set to ${radius} km`,
                      error: (reason) =>
                        reason instanceof Error ? reason.message : "Could not save",
                    }
                  )
                }
              >
                Save radius
              </Button>
              <p className="text-[0.75rem] text-muted-foreground">
                Customers further than this from the restaurant cannot order
                from it, however close they are to another one.
              </p>
            </div>
          </Panel>

          <Panel title="Business Hours">
            <p className="text-[0.8125rem] text-muted-foreground">
              Opening hours aren&apos;t stored against a restaurant yet. The kitchen
              currently reports itself as{" "}
              <span className="font-medium text-foreground">
                {restaurant.isOpen ? "open" : "closed"}
              </span>
              .
            </p>
          </Panel>

          <Panel title="Quick Stats">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <QuickStat
                icon={ShoppingBag}
                tint="bg-sky-50 text-sky-600"
                label="Total Orders"
                value={formatNumber(restaurant.totalOrders ?? 0)}
              />
              <QuickStat
                icon={IndianRupee}
                tint="bg-violet-50 text-violet-600"
                label="Total Revenue"
                value={currency(restaurant.totalRevenue ?? 0)}
              />
              <QuickStat
                icon={Percent}
                tint="bg-emerald-50 text-emerald-600"
                label="Avg. Order Value"
                value={
                  restaurant.totalOrders
                    ? currency(
                        (restaurant.totalRevenue ?? 0) / restaurant.totalOrders,
                        true
                      )
                    : "—"
                }
              />
              <QuickStat
                icon={Star}
                tint="bg-amber-50 text-amber-600"
                label="Rating"
                value={restaurant.rating ? restaurant.rating.toFixed(1) : "—"}
              />
            </div>
          </Panel>
        </div>
      </div>
    </RestaurantShell>
  );
}
