"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Loader2, MapPin, Phone, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { FoodThumb } from "@/components/common/food-thumb";
import { currency, dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CANCELLABLE,
  NEXT_STATUS,
  downloadInvoice,
  type Order,
} from "@/lib/vendor-api";
import { useVendor } from "@/lib/store";

/**
 * The whole order on one surface: who ordered, what they ordered, what it
 * cost, and the same transitions the board offers — so a vendor who opened a
 * row to check an address doesn't have to close it again to act.
 */
export function OrderDetailDialog({
  order,
  onOpenChange,
}: {
  /** Null closes the dialog. */
  order: Order | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { advance, advancing } = useVendor();
  const [downloading, setDownloading] = React.useState(false);

  if (!order) return null;

  const next = NEXT_STATUS[order.status];
  const canCancel = CANCELLABLE.includes(order.status);
  const busy = advancing === order.id;

  const getInvoice = async () => {
    setDownloading(true);
    try {
      await downloadInvoice(order.id, order.reference);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not fetch the invoice"
      );
    } finally {
      setDownloading(false);
    }
  };

  const lineTotal = order.lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0
  );

  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            #{order.reference}
            <StatusBadge status={order.stage} dot={false} />
          </DialogTitle>
          <DialogDescription suppressHydrationWarning>
            Placed {dateTime(order.placedAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Customer
            </p>
            <div className="mt-2 space-y-1.5 text-[0.8125rem]">
              <p className="flex items-center gap-2 font-semibold">
                <User className="size-4 shrink-0 text-muted-foreground" />
                {order.customer}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-4 shrink-0" />
                {order.phone}
              </p>
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                {order.address}
              </p>
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="mb-2 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Items ({order.itemCount})
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {order.lines.map((line, index) => (
                <li key={index} className="flex items-center gap-3 p-3">
                  <FoodThumb src={line.image} name={line.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-medium">
                      {line.name}
                    </p>
                    <p className="text-[0.75rem] text-muted-foreground">
                      {currency(line.price)} × {line.quantity}
                    </p>
                  </div>
                  <span data-numeric className="shrink-0 text-[0.8125rem] font-semibold">
                    {currency(line.price * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Money */}
          <dl className="space-y-1.5 rounded-lg border border-border p-3 text-[0.8125rem]">
            {[
              { label: "Item total", value: order.subtotal || lineTotal },
              { label: "Delivery fee", value: order.deliveryFee },
              { label: "Taxes & packaging", value: order.tax },
            ]
              .filter((row) => row.value > 0)
              .map((row) => (
                <div key={row.label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd data-numeric>{currency(row.value, true)}</dd>
                </div>
              ))}
            <div className="mt-2 flex justify-between gap-3 border-t border-border pt-2">
              <dt className="font-semibold">Total</dt>
              <dd data-numeric className="text-base font-bold">
                {currency(order.total, true)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Payment</dt>
              <dd
                className={cn(
                  "font-medium",
                  order.payment === "COD" ? "text-blue-600" : "text-emerald-600"
                )}
              >
                {order.payment === "COD"
                  ? "Cash on delivery"
                  : order.paid
                    ? "Paid online"
                    : "Online · unpaid"}
              </dd>
            </div>
          </dl>

          {order.cancelReason && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[0.8125rem] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              Cancelled — {order.cancelReason}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={getInvoice} disabled={downloading}>
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Invoice
          </Button>

          <div className="flex gap-2">
            {canCancel && (
              <Button
                variant="outline"
                disabled={busy}
                className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-600"
                onClick={() => advance(order.id, "Cancelled")}
              >
                Reject
              </Button>
            )}
            {next && (
              <Button disabled={busy} onClick={() => advance(order.id, next.to)}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {next.label}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
