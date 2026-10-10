"use client";

import * as React from "react";
import { Info, Plus, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCreateMenuItem, useUpdateMenuItem } from "@/lib/queries";
import type { MenuItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Add New Menu Item — the reference's right-hand drawer: basic information,
 * pricing, availability and the image drop, with a required-field gate on
 * Save.
 *
 * Discount is computed from selling price against MRP rather than typed, so
 * the three numbers can't contradict each other.
 */

const NAME_LIMIT = 100;
const DESCRIPTION_LIMIT = 300;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[0.8125rem] font-semibold text-primary">{children}</h3>
  );
}

function Required() {
  return <span className="text-primary"> *</span>;
}

/**
 * Add a menu item, or change one.
 *
 * Pass `item` to edit it: the sheet fills from that item and saves over it
 * instead of creating another. The rows had an edit button that did nothing,
 * so a price or a description could be typed once when the item was created
 * and never corrected.
 *
 * `trigger` replaces the default "Add Menu Item" button, so a row can open the
 * same sheet from its own pencil.
 */
export function AddMenuItemSheet({
  restaurantId,
  categories,
  cuisines,
  item,
  trigger,
}: {
  restaurantId: string;
  /** Offered as the category list; the menu's own categories. */
  categories: string[];
  cuisines: string[];
  item?: MenuItem;
  trigger?: React.ReactNode;
}) {
  const create = useCreateMenuItem();
  const update = useUpdateMenuItem();
  const editing = Boolean(item);
  const [open, setOpen] = React.useState(false);

  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [cuisine, setCuisine] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isVeg, setIsVeg] = React.useState("veg");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagDraft, setTagDraft] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [mrp, setMrp] = React.useState("");
  const [chargeCustomisation, setChargeCustomisation] = React.useState(false);
  const [active, setActive] = React.useState(true);
  const [availability, setAvailability] = React.useState("available");

  const sellingPrice = Number(price) || 0;
  const listPrice = Number(mrp) || 0;
  const discount =
    listPrice > 0 && sellingPrice > 0 && listPrice > sellingPrice
      ? Math.round(((listPrice - sellingPrice) / listPrice) * 100)
      : null;

  const complete =
    name.trim() !== "" &&
    category !== "" &&
    cuisine !== "" &&
    description.trim() !== "" &&
    sellingPrice > 0;

  function reset() {
    setName("");
    setCategory("");
    setCuisine("");
    setDescription("");
    setIsVeg("veg");
    setTags([]);
    setTagDraft("");
    setPrice("");
    setMrp("");
    setChargeCustomisation(false);
    setActive(true);
    setAvailability("available");
  }

  function addTag() {
    const value = tagDraft.trim();
    if (!value || tags.includes(value)) return;
    setTags([...tags, value]);
    setTagDraft("");
  }

  /*
   * Fill from the item being edited each time the sheet opens, so a change
   * that was abandoned is not still sitting in the form the next time.
   */
  React.useEffect(() => {
    if (!open || !item) return;
    setName(item.name ?? "");
    setCategory(item.category ?? "");
    setCuisine(item.cuisine ?? "");
    setDescription(item.description ?? "");
    setIsVeg(item.isVeg === false ? "nonveg" : "veg");
    setPrice(item.price != null ? String(item.price) : "");
    setMrp(item.originalPrice != null ? String(item.originalPrice) : "");
    setActive(item.isActive !== false);
    setAvailability(item.isAvailable === false ? "unavailable" : "available");
  }, [open, item]);

  async function save() {
    const draft = {
      restaurantId,
      name: name.trim(),
      category,
      cuisine,
      description: description.trim(),
      isVeg: isVeg === "veg",
      price: sellingPrice,
      originalPrice: listPrice > sellingPrice ? listPrice : undefined,
      isActive: active,
      isAvailable: availability === "available",
    };

    try {
      if (item?._id) {
        await update.mutateAsync({ id: item._id, ...draft });
        toast.success(`${name.trim()} updated`);
      } else {
        await create.mutateAsync(draft);
        toast.success(`${name.trim()} added to the menu`);
        reset();
      }
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the item");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button size="lg">
            <Plus className="size-4" />
            Add Menu Item
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit Menu Item" : "Add New Menu Item"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          <section className="space-y-3">
            <SectionTitle>Basic Information</SectionTitle>

            <div className="space-y-1.5">
              <Label htmlFor="item-name">
                Item Name
                <Required />
              </Label>
              <Input
                id="item-name"
                value={name}
                maxLength={NAME_LIMIT}
                placeholder="Enter item name"
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-right text-[0.6875rem] text-muted-foreground">
                {name.length}/{NAME_LIMIT}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="item-category">
                  Category
                  <Required />
                </Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="item-category" className="w-full">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-cuisine">
                  Cuisine
                  <Required />
                </Label>
                <Select value={cuisine} onValueChange={setCuisine}>
                  <SelectTrigger id="item-cuisine" className="w-full">
                    <SelectValue placeholder="Select Cuisine" />
                  </SelectTrigger>
                  <SelectContent>
                    {cuisines.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-description">
                Description
                <Required />
              </Label>
              <Textarea
                id="item-description"
                rows={3}
                value={description}
                maxLength={DESCRIPTION_LIMIT}
                placeholder="Enter item description"
                onChange={(event) => setDescription(event.target.value)}
              />
              <p className="text-right text-[0.6875rem] text-muted-foreground">
                {description.length}/{DESCRIPTION_LIMIT}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Item Type</Label>
              <RadioGroup
                value={isVeg}
                onValueChange={setIsVeg}
                className="flex flex-wrap gap-5"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="veg"
                    id="item-veg"
                    className="border-emerald-600 text-emerald-600"
                  />
                  <Label htmlFor="item-veg" className="font-normal">
                    Veg
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="nonveg"
                    id="item-nonveg"
                    className="border-rose-600 text-rose-600"
                  />
                  <Label htmlFor="item-nonveg" className="font-normal">
                    Non-Veg
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-tags">Tags (Optional)</Label>
              <Input
                id="item-tags"
                value={tagDraft}
                placeholder="Add tags and press enter"
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        aria-label={`Remove ${tag}`}
                        onClick={() => setTags(tags.filter((entry) => entry !== tag))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle>Pricing</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-price">
                  Selling Price (₹)
                  <Required />
                </Label>
                <Input
                  id="item-price"
                  type="number"
                  min={0}
                  value={price}
                  placeholder="e.g. 199"
                  onChange={(event) => setPrice(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-mrp">MRP (₹)</Label>
                <Input
                  id="item-mrp"
                  type="number"
                  min={0}
                  value={mrp}
                  placeholder="e.g. 249"
                  onChange={(event) => setMrp(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-discount">Discount (%)</Label>
                <Input
                  id="item-discount"
                  readOnly
                  value={discount === null ? "" : `${discount}%`}
                  placeholder="—"
                  className="bg-muted/50"
                />
              </div>
            </div>
            {listPrice > 0 && sellingPrice > listPrice && (
              <p className="text-[0.75rem] text-danger-foreground">
                Selling price is above the MRP.
              </p>
            )}

            <div className="flex items-start gap-2">
              <Checkbox
                id="item-customisation"
                checked={chargeCustomisation}
                onCheckedChange={(value) => setChargeCustomisation(value === true)}
                className="mt-0.5"
              />
              <Label htmlFor="item-customisation" className="font-normal">
                Charge Extra for Customization
                <Info className="ml-1 inline size-3 text-muted-foreground" />
              </Label>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle>Availability</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="item-active">Status</Label>
                <div className="flex items-center gap-2">
                  <Switch id="item-active" checked={active} onCheckedChange={setActive} />
                  <span className="text-[0.8125rem]">
                    {active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Availability</Label>
                <RadioGroup
                  value={availability}
                  onValueChange={setAvailability}
                  className="flex flex-wrap gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="available" id="item-available" />
                    <Label htmlFor="item-available" className="font-normal">
                      Available
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="unavailable" id="item-unavailable" />
                    <Label htmlFor="item-unavailable" className="font-normal">
                      Unavailable
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>Item Image</SectionTitle>
            {/*
              No upload endpoint exists yet, so this states what it will accept
              rather than pretending to take a file and dropping it.
            */}
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-6 text-center"
              )}
            >
              <UploadCloud className="size-5 text-muted-foreground" />
              <span className="text-[0.8125rem] font-medium">Upload Image</span>
              <span className="text-[0.6875rem] text-muted-foreground">
                JPG, PNG (max. 2MB)
              </span>
              <span className="mt-1 text-[0.6875rem] text-muted-foreground">
                Image upload isn&apos;t wired to the API yet.
              </span>
            </div>
          </section>
        </div>

        <SheetFooter className="flex-row justify-end">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={!complete || create.isPending || update.isPending}
            onClick={save}
          >
            {create.isPending || update.isPending ? "Saving…" : "Save Item"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
