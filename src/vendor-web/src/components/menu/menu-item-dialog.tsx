"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  TextInput,
  TextArea,
  ChoiceGroup,
} from "@/components/common/form-field";
import { FoodThumb } from "@/components/common/food-thumb";
import { cn } from "@/lib/utils";
import {
  createMenuItem,
  fetchCuisines,
  deleteMenuItem,
  updateMenuItem,
  uploadMenuImage,
  type MenuAddon,
  type MenuCategory,
  type MenuItem,
  type MenuItemDraft,
} from "@/lib/vendor-api";

const FOOD_TYPES: Array<{ value: MenuItemDraft["foodType"]; label: string; tone: string }> = [
  { value: "veg", label: "Veg", tone: "bg-emerald-600" },
  { value: "non-veg", label: "Non-Veg", tone: "bg-red-600" },
  { value: "egg", label: "Egg", tone: "bg-amber-500" },
];

const EMPTY: MenuItemDraft = {
  name: "",
  price: 0,
  description: "",
  category: "",
  cuisine: "",
  foodType: "veg",
  preparationTime: 0,
  isAvailable: true,
  image: "",
  discountType: "none",
  discountValue: 0,
  addons: [],
};

/**
 * Add / edit a dish.
 *
 * One dialog for both: the backend takes the same body on POST and PATCH, and
 * a vendor editing a price shouldn't meet a different form than the one they
 * created the dish in.
 */
export function MenuItemDialog({
  open,
  onOpenChange,
  item,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent when adding. */
  item?: MenuItem;
  categories: MenuCategory[];
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<MenuItemDraft>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Cuisines are a small, rarely-changing list, so one fetch per dialog is
  // cheaper than threading them through the store for this single field.
  const cuisinesQuery = useQuery({
    queryKey: ["cuisines"],
    queryFn: fetchCuisines,
    staleTime: 5 * 60 * 1000,
  });
  const cuisines: string[] = cuisinesQuery.data ?? [];

  /**
   * Shows what the customer will actually pay, so a discount is checked
   * against a number rather than trusted as a percentage. A discount larger
   * than the price is called out here rather than silently clamped to zero by
   * the API.
   */
  const discountHint = React.useMemo(() => {
    const price = Number(draft.price) || 0;
    const value = Number(draft.discountValue) || 0;
    if (!value || !draft.discountType || draft.discountType === "none") return undefined;
    const off = draft.discountType === "percent" ? (price * value) / 100 : value;
    if (off > price) return "That is more than the price — customers would pay ₹0.";
    return `Customers pay ₹${Math.round((price - off) * 100) / 100}`;
  }, [draft.price, draft.discountType, draft.discountValue]);

  /**
   * Says what the window means, so a vendor entering 22:00-02:00 sees that it
   * is read as crossing midnight rather than as a mistake.
   */
  const windowHint = React.useMemo(() => {
    const from = draft.availableFrom?.trim();
    const to = draft.availableTo?.trim();
    if (!from && !to) return "Available all day.";
    if (!from || !to) return "Set both times, or clear both for all day.";
    return from <= to
      ? `Orderable between ${from} and ${to}.`
      : `Orderable from ${from} through midnight until ${to}.`;
  }, [draft.availableFrom, draft.availableTo]);

  const addAddon = () =>
    setDraft((d) => ({ ...d, addons: [...(d.addons ?? []), { name: "", price: 0 }] }));

  const updateAddon = (index: number, patch: Partial<MenuAddon>) =>
    setDraft((d) => ({
      ...d,
      addons: (d.addons ?? []).map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));

  const removeAddon = (index: number) =>
    setDraft((d) => ({ ...d, addons: (d.addons ?? []).filter((_, i) => i !== index) }));
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Reload the form whenever the dialog opens on a different dish.
  const key = `${open}:${item?.id ?? "new"}`;
  const [loadedKey, setLoadedKey] = React.useState(key);
  if (key !== loadedKey) {
    setLoadedKey(key);
    setErrors({});
    setDraft(
      item
        ? {
            name: item.name,
            price: item.price,
            description: item.description,
            category: item.category,
            foodType: item.veg ? "veg" : "non-veg",
            preparationTime: item.prepMinutes,
            isAvailable: item.available,
            image: item.image ?? "",
          }
        : EMPTY
    );
  }

  const done = (message: string) => {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: ["menu"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    onOpenChange(false);
  };

  const save = useMutation({
    mutationFn: (body: MenuItemDraft) =>
      item ? updateMenuItem(item.id, body) : createMenuItem(body),
    onSuccess: () => done(item ? "Item updated" : "Item added to your menu"),
    onError: (error: Error) => toast.error(error.message || "Could not save the item"),
  });

  const remove = useMutation({
    mutationFn: () => deleteMenuItem(item!.id),
    onSuccess: () => done("Item removed"),
    onError: (error: Error) => toast.error(error.message || "Could not delete the item"),
  });

  const pickImage = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadMenuImage(file);
      if (!url) throw new Error("The server did not return an image URL");
      setDraft((d) => ({ ...d, image: url }));
      toast.success("Photo uploaded");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upload the photo"
      );
    } finally {
      setUploading(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // Mirrors the server's own checks so the vendor is told before the trip.
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = "Give the dish a name.";
    if (!(draft.price > 0)) next.price = "Price must be more than ₹0.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    save.mutate({ ...draft, name: draft.name.trim() });
  };

  const busy = save.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Menu Item" : "Add New Item"}</DialogTitle>
          <DialogDescription>
            {item
              ? "Changes go live on the customer app straight away."
              : "Add a dish to your menu. Name and price are all that's required."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Photo */}
          <div className="flex items-start gap-4">
            <FoodThumb src={draft.image} name={draft.name || "?"} size={96} />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[0.8125rem] font-semibold">Item Photo</p>
              <p className="text-[0.75rem] text-muted-foreground">
                JPG, PNG or WEBP. A clear photo of the plated dish sells it.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/jpg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void pickImage(file);
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
                  {draft.image ? "Replace photo" : "Upload photo"}
                </Button>
                {draft.image && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraft((d) => ({ ...d, image: "" }))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Item Name" htmlFor="name" required error={errors.name}>
              <TextInput
                id="name"
                value={draft.name}
                maxLength={80}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Paneer Butter Masala"
              />
            </Field>

            <Field label="Price (₹)" htmlFor="price" required error={errors.price}>
              <TextInput
                id="price"
                type="number"
                min={0}
                step="1"
                value={draft.price || ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, price: Number(e.target.value) || 0 }))
                }
                placeholder="220"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="description">
            <TextArea
              id="description"
              rows={3}
              maxLength={200}
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="Cottage cheese cubes in a creamy tomato gravy."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" hint="Groups the dish on the customer menu.">
              {categories.length > 0 ? (
                <Select
                  value={draft.category || "none"}
                  onValueChange={(value) =>
                    setDraft((d) => ({ ...d, category: value === "none" ? "" : value }))
                  }
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Uncategorised" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorised</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <TextInput
                  value={draft.category}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, category: e.target.value }))
                  }
                  placeholder="Main Course"
                />
              )}
            </Field>

            <Field label="Cuisine" hint="What kind of food this dish is.">
              <Select
                value={draft.cuisine || "none"}
                onValueChange={(value) =>
                  setDraft((d) => ({ ...d, cuisine: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger><SelectValue placeholder="Choose a cuisine" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No cuisine</SelectItem>
                  {cuisines.map((cuisine) => (
                    <SelectItem key={cuisine} value={cuisine}>
                      {cuisine}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Prep Time (mins)" htmlFor="prep">
              <TextInput
                id="prep"
                type="number"
                min={0}
                value={draft.preparationTime || ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    preparationTime: Number(e.target.value) || 0,
                  }))
                }
                placeholder="20"
              />
            </Field>
          </div>

          {/* Discount. Kept beside the price it applies to, and showing the
              resulting figure so a vendor sees what the customer will pay
              rather than working it out from a percentage. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Discount" hint="Off the list price above.">
              <Select
                value={draft.discountType ?? "none"}
                onValueChange={(value) =>
                  setDraft((d) => ({
                    ...d,
                    discountType: value as "none" | "percent" | "flat",
                    discountValue: value === "none" ? 0 : d.discountValue,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No discount</SelectItem>
                  <SelectItem value="percent">Percentage off</SelectItem>
                  <SelectItem value="flat">Flat amount off</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={draft.discountType === "percent" ? "Percent off" : "Amount off (₹)"}
              htmlFor="discountValue"
              hint={discountHint}
              error={errors.discountValue}
            >
              <TextInput
                id="discountValue"
                type="number"
                min={0}
                disabled={!draft.discountType || draft.discountType === "none"}
                value={draft.discountValue || ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, discountValue: Number(e.target.value) || 0 }))
                }
                placeholder={draft.discountType === "percent" ? "10" : "20"}
              />
            </Field>
          </div>

          {/* Add-ons: extras a customer can attach to the dish. */}
          <Field label="Add-ons" hint="Extras a customer can add — cheese, a drink, a side.">
            <div className="space-y-2">
              {(draft.addons ?? []).map((addon, index) => (
                <div key={index} className="flex items-center gap-2">
                  <TextInput
                    aria-label={`Add-on ${index + 1} name`}
                    value={addon.name}
                    onChange={(e) => updateAddon(index, { name: e.target.value })}
                    placeholder="Extra cheese"
                  />
                  <TextInput
                    aria-label={`Add-on ${index + 1} price`}
                    type="number"
                    min={0}
                    className="w-28 shrink-0"
                    value={addon.price || ""}
                    onChange={(e) => updateAddon(index, { price: Number(e.target.value) || 0 })}
                    placeholder="30"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAddon(index)}
                    aria-label={`Remove add-on ${index + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addAddon}>
                Add an add-on
              </Button>
            </div>
          </Field>

          {/* Availability window. Two fields rather than one, because a
              vendor thinks in "we serve breakfast 7 to 11", not in a single
              string someone has to parse. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Available from"
              htmlFor="availableFrom"
              hint="Leave both blank for all day."
            >
              <TextInput
                id="availableFrom"
                type="time"
                value={draft.availableFrom ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, availableFrom: e.target.value }))}
              />
            </Field>
            <Field label="Available to" htmlFor="availableTo" hint={windowHint}>
              <TextInput
                id="availableTo"
                type="time"
                value={draft.availableTo ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, availableTo: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Food Type" required>
            <ChoiceGroup
              value={draft.foodType}
              onChange={(foodType) => setDraft((d) => ({ ...d, foodType }))}
              options={FOOD_TYPES}
              className="grid-cols-3"
            />
          </Field>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold">Item Status</p>
              <p className="text-[0.75rem] text-muted-foreground">
                {draft.isAvailable
                  ? "Visible to customers and orderable."
                  : "Hidden from the customer menu."}
              </p>
            </div>
            <Switch
              checked={draft.isAvailable}
              onCheckedChange={(isAvailable) =>
                setDraft((d) => ({ ...d, isAvailable }))
              }
              aria-label="Item is available"
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {item ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(`Remove "${item.name}" from your menu?`)
                  ) {
                    remove.mutate();
                  }
                }}
                className={cn("border-red-300 text-red-600 hover:bg-red-50")}
              >
                {remove.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Delete
              </Button>
            ) : (
              <span />
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || uploading}>
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                {item ? "Save Changes" : "Add Item"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
