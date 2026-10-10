"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  TextInput,
  TextArea,
  ChoiceGroup,
} from "@/components/common/form-field";
import { createCoupon, type CouponDraft, type CouponType } from "@/lib/vendor-api";

const TYPES: Array<{ value: CouponType; label: string }> = [
  { value: "percentage", label: "% Off" },
  { value: "flat", label: "Flat ₹ Off" },
  { value: "bogo", label: "Buy 1 Get 1" },
];

/** A month out, which is the window most promotions actually run for. */
function defaultEndDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}

const EMPTY: CouponDraft = {
  code: "",
  name: "",
  description: "",
  type: "percentage",
  discountValue: 10,
  minOrderValue: 0,
  maxDiscount: undefined,
  usageLimit: undefined,
  endDate: "",
};

/**
 * Create a coupon.
 *
 * Create-only, deliberately: `/vendor/coupons` exposes create, toggle and
 * delete but no update, so offering an edit form would promise something the
 * platform cannot do. Pausing and deleting live on the card instead.
 */
export function OfferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<CouponDraft>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft({ ...EMPTY, endDate: defaultEndDate() });
      setErrors({});
    }
  }

  const set = <K extends keyof CouponDraft>(key: K, value: CouponDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: (body: CouponDraft) => createCoupon(body),
    onSuccess: () => {
      toast.success("Offer published");
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast.error(error.message || "Could not create the offer"),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!draft.code.trim()) next.code = "Customers type this at checkout.";
    if (draft.type !== "bogo" && !(draft.discountValue > 0)) {
      next.discountValue = "Set a discount above zero.";
    }
    if (draft.type === "percentage" && draft.discountValue > 100) {
      next.discountValue = "A percentage can't exceed 100.";
    }
    if (!draft.endDate) next.endDate = "Every offer needs an end date.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    save.mutate({
      ...draft,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim() || draft.code.trim().toUpperCase(),
      // The API takes a date; send the end of that day so the offer runs
      // through it rather than expiring at midnight as it begins.
      endDate: new Date(`${draft.endDate}T23:59:59`).toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Offer</DialogTitle>
          <DialogDescription>
            Goes live on your listing as soon as you publish it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Offer Type" required>
            <ChoiceGroup
              value={draft.type}
              onChange={(type) => set("type", type)}
              options={TYPES}
              className="grid-cols-3"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Coupon Code"
              htmlFor="code"
              required
              error={errors.code}
              hint="Uppercased automatically."
            >
              <TextInput
                id="code"
                value={draft.code}
                maxLength={20}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="FLAT20"
                className="font-semibold tracking-wide"
              />
            </Field>

            <Field label="Offer Name" htmlFor="oname" hint="Defaults to the code.">
              <TextInput
                id="oname"
                value={draft.name}
                maxLength={60}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Weekend saver"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="odesc">
            <TextArea
              id="odesc"
              rows={2}
              maxLength={160}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Flat 20% OFF on orders above ₹199"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            {draft.type !== "bogo" && (
              <Field
                label={draft.type === "percentage" ? "Discount (%)" : "Discount (₹)"}
                htmlFor="value"
                required
                error={errors.discountValue}
              >
                <TextInput
                  id="value"
                  type="number"
                  min={0}
                  max={draft.type === "percentage" ? 100 : undefined}
                  value={draft.discountValue || ""}
                  onChange={(e) => set("discountValue", Number(e.target.value) || 0)}
                />
              </Field>
            )}

            <Field label="Minimum Order (₹)" htmlFor="minorder">
              <TextInput
                id="minorder"
                type="number"
                min={0}
                value={draft.minOrderValue || ""}
                onChange={(e) => set("minOrderValue", Number(e.target.value) || 0)}
                placeholder="199"
              />
            </Field>

            {draft.type === "percentage" && (
              <Field
                label="Maximum Discount (₹)"
                htmlFor="maxdisc"
                hint="Leave blank for no cap."
              >
                <TextInput
                  id="maxdisc"
                  type="number"
                  min={0}
                  value={draft.maxDiscount ?? ""}
                  onChange={(e) =>
                    set(
                      "maxDiscount",
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                  placeholder="200"
                />
              </Field>
            )}

            <Field
              label="Total Usage Limit"
              htmlFor="usage"
              hint="Leave blank for unlimited."
            >
              <TextInput
                id="usage"
                type="number"
                min={0}
                value={draft.usageLimit ?? ""}
                onChange={(e) =>
                  set("usageLimit", e.target.value ? Number(e.target.value) : undefined)
                }
                placeholder="500"
              />
            </Field>

            <Field
              label="Valid Till"
              htmlFor="enddate"
              required
              error={errors.endDate}
            >
              <TextInput
                id="enddate"
                type="date"
                value={draft.endDate}
                onChange={(e) => set("endDate", e.target.value)}
              />
            </Field>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Publish Offer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
