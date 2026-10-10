"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, TextInput, TextArea } from "@/components/common/form-field";
import { FoodThumb } from "@/components/common/food-thumb";
import {
  updateRestaurant,
  updateVendorProfile,
  uploadRestaurantLogo,
  type Restaurant,
} from "@/lib/vendor-api";

/**
 * Edit the outlet.
 *
 * The backend splits these fields across two endpoints — `PATCH
 * /vendor/restaurant` owns the name, phone, address and delivery fee; `PUT
 * /vendor/profile` owns opening hours and the bank details. The vendor sees
 * one form; the save fans out and only sends the halves that changed.
 */
export function ProfileDialog({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Restaurant;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const initial = React.useMemo(
    () => ({
      name: profile.name,
      phone: profile.phone === "—" ? "" : profile.phone,
      description: profile.description,
      deliveryFee: 0,
      addressLine: profile.address,
      city: profile.city === "—" ? "" : profile.city,
      pincode: profile.pincode === "—" ? "" : profile.pincode,
      openingHours:
        profile.openFrom === "—" ? "" : `${profile.openFrom} - ${profile.openTo}`,
      image: profile.image ?? "",
      bankName: profile.bank.name === "Not added" ? "" : profile.bank.name,
      accountHolderName: "",
      accountNumber: "",
      ifscCode: profile.bank.ifsc === "—" ? "" : profile.bank.ifsc,
      upiId: profile.bank.upi === "—" ? "" : profile.bank.upi,
    }),
    [profile]
  );

  const [draft, setDraft] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  // Reload the form each time it opens, so a cancelled edit doesn't persist.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initial);
      setError(null);
    }
  }

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      await updateRestaurant({
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        description: draft.description.trim(),
        deliveryFee: draft.deliveryFee,
        address: {
          addressLine: draft.addressLine.trim(),
          city: draft.city.trim(),
          pincode: draft.pincode.trim(),
        },
      });

      // Only touch the profile endpoint if something it owns actually changed —
      // it accepts a much wider body and a needless write risks clobbering.
      const bankTouched =
        draft.bankName || draft.accountNumber || draft.ifscCode || draft.accountHolderName;
      if (draft.openingHours !== initial.openingHours || draft.upiId !== initial.upiId || bankTouched) {
        await updateVendorProfile({
          openingHours: draft.openingHours.trim() || undefined,
          upiId: draft.upiId.trim() || undefined,
          ...(bankTouched
            ? {
                bankDetails: {
                  bankName: draft.bankName.trim() || undefined,
                  accountNumber: draft.accountNumber.trim() || undefined,
                  ifscCode: draft.ifscCode.trim().toUpperCase() || undefined,
                  accountHolderName: draft.accountHolderName.trim() || undefined,
                },
              }
            : {}),
        });
      }
    },
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["restaurant"] });
      onOpenChange(false);
    },
    onError: (caught: Error) => {
      setError(caught.message || "Could not save the profile");
      toast.error(caught.message || "Could not save the profile");
    },
  });

  const pickLogo = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadRestaurantLogo(file);
      if (url) set("image", url);
      queryClient.invalidateQueries({ queryKey: ["restaurant"] });
      toast.success("Logo updated");
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Could not upload the logo"
      );
    } finally {
      setUploading(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("The restaurant needs a name.");
      return;
    }
    setError(null);
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Restaurant Profile</DialogTitle>
          <DialogDescription>
            What customers see on your listing, and where your payouts land.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-start gap-4">
            <FoodThumb
              src={draft.image}
              name={draft.name || "R"}
              size={80}
              rounded="rounded-xl"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[0.8125rem] font-semibold">Restaurant Logo</p>
              <p className="text-[0.75rem] text-muted-foreground">
                Shown beside your name everywhere on the customer app.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void pickLogo(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                {draft.image ? "Replace logo" : "Upload logo"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Restaurant Name" htmlFor="rname" required>
              <TextInput
                id="rname"
                value={draft.name}
                maxLength={60}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Contact Number" htmlFor="rphone">
              <TextInput
                id="rphone"
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="9876543210"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="rdesc">
            <TextArea
              id="rdesc"
              rows={2}
              maxLength={200}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="North Indian and Chinese, cooked to order."
            />
          </Field>

          <Field label="Address" htmlFor="raddr">
            <TextArea
              id="raddr"
              rows={2}
              value={draft.addressLine}
              onChange={(e) => set("addressLine", e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" htmlFor="rcity">
              <TextInput
                id="rcity"
                value={draft.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <Field label="Pincode" htmlFor="rpin">
              <TextInput
                id="rpin"
                value={draft.pincode}
                onChange={(e) => set("pincode", e.target.value)}
              />
            </Field>
            <Field
              label="Working Hours"
              htmlFor="rhours"
              hint="e.g. 10:00 AM - 11:00 PM"
            >
              <TextInput
                id="rhours"
                value={draft.openingHours}
                onChange={(e) => set("openingHours", e.target.value)}
                placeholder="10:00 AM - 11:00 PM"
              />
            </Field>
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="text-[0.8125rem] font-semibold">Payout Account</p>
            <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
              Where Reditoe sends your settlements. Leave blank to keep what&apos;s
              on file.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Bank Name" htmlFor="bname">
                <TextInput
                  id="bname"
                  value={draft.bankName}
                  onChange={(e) => set("bankName", e.target.value)}
                  placeholder="HDFC Bank"
                />
              </Field>
              <Field label="Account Holder" htmlFor="bholder">
                <TextInput
                  id="bholder"
                  value={draft.accountHolderName}
                  onChange={(e) => set("accountHolderName", e.target.value)}
                />
              </Field>
              <Field label="Account Number" htmlFor="bacc">
                <TextInput
                  id="bacc"
                  value={draft.accountNumber}
                  onChange={(e) => set("accountNumber", e.target.value)}
                  placeholder="Leave blank to keep the current one"
                />
              </Field>
              <Field label="IFSC Code" htmlFor="bifsc">
                <TextInput
                  id="bifsc"
                  value={draft.ifscCode}
                  onChange={(e) => set("ifscCode", e.target.value)}
                  placeholder="HDFC0001234"
                />
              </Field>
              <Field label="UPI ID" htmlFor="bupi" className="sm:col-span-2">
                <TextInput
                  id="bupi"
                  value={draft.upiId}
                  onChange={(e) => set("upiId", e.target.value)}
                  placeholder="restaurant@okaxis"
                />
              </Field>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[0.8125rem] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || uploading}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
