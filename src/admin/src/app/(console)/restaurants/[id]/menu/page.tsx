"use client";



import * as React from "react";

import Link from "next/link";

import { useParams } from "next/navigation";

import { toast } from "sonner";
import {

  Copy,

  Download,

  Eye,

  ExternalLink,

  LayoutGrid,

  List,

  MoreVertical,

  Pencil,

  Plus,

  Star,

  Tags,

  Trophy,

  UtensilsCrossed,

} from "lucide-react";

import { PageHeader } from "@/components/common/page-header";

import { Panel } from "@/components/common/panel";

import { StatusBadge } from "@/components/common/status-badge";

import { EmptyState } from "@/components/common/empty-state";

import { FilterSelect, SearchField } from "@/components/common/filter-bar";

import { TablePagination } from "@/components/common/data-table";

import { RestaurantBoundary } from "@/components/restaurants/restaurant-shell";

import { AddMenuItemSheet } from "@/components/restaurants/menu-item-sheet";
import { CreateDialog } from "@/components/common/create-dialog";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Button } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";

import {

  DropdownMenu,

  DropdownMenuContent,

  DropdownMenuItem,

  DropdownMenuTrigger,

} from "@/components/ui/dropdown-menu";

import {

  Dialog,

  DialogContent,

  DialogHeader,

  DialogTitle,

} from "@/components/ui/dialog";

import { useMenuItems, useCategories, useCuisines, useImportMenu, useCreateMenuItem, useSetMenuItemStatus, useDeleteMenuItem, useCreateCategory } from "@/lib/queries";

import { useListState } from "@/lib/use-list-state";

import { currency, initials, number as formatNumber, shortId } from "@/lib/format";

import { restaurantStatus } from "@/components/restaurants/restaurant-shell";

import { cn } from "@/lib/utils";

import type { MenuItem, Restaurant } from "@/lib/types";



/**

 * Menu Management for one restaurant, built to the client's reference screen:

 * the compact identity card beside three catalogue figures, a filter row, then

 * the category sidebar against the item list.

 *

 * Categories come from the items themselves — there is no per-restaurant

 * category endpoint — so the sidebar counts what is actually on the menu.

 */



const STATUS_OPTIONS = [

  { value: "active", label: "Active" },

  { value: "inactive", label: "Inactive" },

];



const AVAILABILITY_OPTIONS = [

  { value: "available", label: "Available" },

  { value: "unavailable", label: "Out of stock" },

];



/** No bestseller flag is stored; a strong rating is the closest real signal. */

const BESTSELLER_RATING = 4.5;



function CatalogueStat({

  icon: Icon,

  tint,

  label,

  value,

  breakdown,

}: {

  icon: typeof UtensilsCrossed;

  tint: string;

  label: string;

  value: React.ReactNode;

  breakdown?: Array<{ label: string; value: React.ReactNode; tone?: string }>;

}) {

  return (

    <div className="surface p-3.5">

      <div className="flex items-start gap-2.5">

        <span

          className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tint)}

        >

          <Icon className="size-[1.05rem]" />

        </span>

        <div className="min-w-0">

          <p className="truncate text-[0.75rem] text-muted-foreground">{label}</p>

          <p data-numeric className="text-lg font-semibold tracking-tight">

            {value}

          </p>

        </div>

      </div>

      {breakdown && breakdown.length > 0 && (

        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-2.5">

          {breakdown.map((entry) => (

            <div key={entry.label}>

              <p className="text-[0.6875rem] text-muted-foreground">{entry.label}</p>

              <p

                className={cn(

                  "text-[0.8125rem] font-semibold tabular-nums",

                  entry.tone

                )}

              >

                {entry.value}

              </p>

            </div>

          ))}

        </div>

      )}

    </div>

  );

}



export default function RestaurantMenuPage() {

  const params = useParams<{ id: string }>();

  return (

    <RestaurantBoundary id={params.id}>

      {(restaurant) => <RestaurantMenu restaurant={restaurant} />}

    </RestaurantBoundary>

  );

}



function RestaurantMenu({ restaurant }: { restaurant: Restaurant }) {

  // The platform taxonomy, so the drawer can offer choices a brand-new

  // restaurant has not used yet.

  const importRef = React.useRef<HTMLInputElement>(null);
  const importMenu = useImportMenu(restaurant._id);
  /* "Add Category" beside the category list had no handler. */
  const [addingCategory, setAddingCategory] = React.useState(false);
  const createCategory = useCreateCategory();



  const [previewOpen, setPreviewOpen] = React.useState(false);

  /**
   * The API validates the whole file before writing anything, so a rejection
   * means nothing changed — the message names the row and the reason, because
   * "import failed" leaves an operator opening the spreadsheet blind.
   */
  async function onPickSheet(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const result = await importMenu.mutateAsync({ file });
      toast.success(
        `Imported ${result.total ?? 0} item${result.total === 1 ? "" : "s"} — ` +
          `${result.created ?? 0} new, ${result.updated ?? 0} updated.`
      );
    } catch (caught) {
      const detail = caught as {
        data?: { rejected?: Array<{ row: number; problems: string[] }> };
      };
      const rejected = detail?.data?.rejected ?? [];
      const first = rejected[0];
      toast.error(
        first
          ? `Row ${first.row}: ${first.problems.join("; ")}${
              rejected.length > 1
                ? ` (and ${rejected.length - 1} more)`
                : ""
            }. Nothing was changed.`
          : caught instanceof Error
            ? caught.message
            : "Could not import that file."
      );
    }
  }

  const allCategories = useCategories({ limit: 100 });

  const allCuisines = useCuisines({ limit: 100 });

  const list = useListState({ status: "", availability: "", category: "" }, 10);

  const items = useMenuItems({ ...list.params, restaurantId: restaurant._id });

  const [layout, setLayout] = React.useState<"list" | "grid">("list");



  const rows = React.useMemo(() => items.data?.items ?? [], [items.data]);



  const categories = React.useMemo(() => {

    const totals = new Map<string, number>();

    for (const item of rows) {

      const name = item.category ?? "Uncategorised";

      totals.set(name, (totals.get(name) ?? 0) + 1);

    }

    return [...totals.entries()]

      .map(([label, count]) => ({ label, count }))

      .sort((a, b) => b.count - a.count);

  }, [rows]);



  const visible = React.useMemo(() => {

    const category = list.filters.category ?? "";

    const status = list.filters.status ?? "";

    const availability = list.filters.availability ?? "";

    return rows.filter((item) => {

      if (category && (item.category ?? "Uncategorised") !== category) return false;

      if (status === "active" && item.isActive === false) return false;

      if (status === "inactive" && item.isActive !== false) return false;

      if (availability === "available" && item.isAvailable === false) return false;

      if (availability === "unavailable" && item.isAvailable !== false) return false;

      return true;

    });

  }, [rows, list.filters]);



  /**

   * The drawer's choices come from the platform's own taxonomy, with whatever

   * this menu already uses merged in.

   *

   * Both lists used to be derived from the existing items alone, which left

   * them empty exactly when they were needed most: a restaurant with no items

   * offered no categories, so there was no way to categorise the first dish.

   * Cuisine was worse — it read a field the menu item schema did not have, so

   * it was empty for every restaurant regardless.

   */

  const categoryNames = React.useMemo(() => {

    const fromTaxonomy = (allCategories.data?.items ?? [])

      .map((entry: { name?: string }) => entry.name)

      .filter(Boolean) as string[];

    const fromMenu = categories.map((entry) => entry.label);

    return [...new Set([...fromTaxonomy, ...fromMenu])].sort();

  }, [allCategories.data, categories]);



  const cuisineNames = React.useMemo(() => {

    const fromTaxonomy = (allCuisines.data?.items ?? [])

      .map((entry: string | { name?: string }) =>
        typeof entry === "string" ? entry : entry?.name
      )

      .filter(Boolean) as string[];

    const fromItems = rows.map((item) => item.cuisine).filter(Boolean) as string[];

    const merged = [...fromTaxonomy, ...fromItems, ...(restaurant.categories ?? [])];

    return [...new Set(merged)].sort();

  }, [allCuisines.data, rows, restaurant.categories]);



  const live = rows.filter((item) => item.isAvailable !== false).length;

  const inactive = rows.length - live;

  const bestsellers = rows.filter(

    (item) => (item.rating ?? 0) >= BESTSELLER_RATING

  ).length;

  const combos = rows.filter((item) =>

    (item.category ?? "").toLowerCase().includes("combo")

  ).length;



  return (

    <>

      <PageHeader

        title="Menu Management"

        description="Manage restaurant menu items, categories, add-ons and availability."

        breadcrumbs={[

          { label: "Dashboard", href: "/dashboard" },

          { label: "Restaurants", href: "/restaurants" },

          { label: "All Restaurants", href: "/restaurants" },

          { label: restaurant.name ?? "Restaurant", href: `/restaurants/${restaurant._id}` },

          { label: "Menu Management" },

        ]}

        actions={

          <>

            <Button asChild variant="outline" size="lg">

              <Link href={`/restaurants/${restaurant._id}`}>

                <ExternalLink className="size-4" />

                View Restaurant

              </Link>

            </Button>

            <input
              ref={importRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onPickSheet}
            />
            <Button
              variant="outline"
              size="lg"
              disabled={importMenu.isPending}
              onClick={() => importRef.current?.click()}
            >
              <Download className="size-4" />
              {importMenu.isPending ? "Importing…" : "Import Menu (XLSX)"}
            </Button>

            <Button

              variant="outline"

              size="lg"

              onClick={() => setPreviewOpen(true)}

            >

              <Eye className="size-4" />

              Preview Menu

            </Button>

            <AddMenuItemSheet

              restaurantId={restaurant._id}

              categories={categoryNames}

              cuisines={cuisineNames}

            />

          </>

        }

      />



      <div className="grid items-start gap-3 lg:grid-cols-2 xl:grid-cols-4">

        <div className="surface flex items-start gap-3 p-3.5">

          <Avatar className="size-14 shrink-0">

            <AvatarImage src={restaurant.image} alt="" />

            <AvatarFallback>{initials(restaurant.name)}</AvatarFallback>

          </Avatar>

          <div className="min-w-0 flex-1">

            <div className="flex flex-wrap items-center gap-2">

              <span className="truncate text-[0.9375rem] font-semibold">

                {restaurant.name ?? "Restaurant"}

              </span>

              <StatusBadge status={restaurantStatus(restaurant)} />

            </div>

            <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">

              {shortId(restaurant._id, "REST")} · FSSAI: —

            </p>

            <p className="mt-1 truncate text-[0.75rem] text-muted-foreground">

              {[...new Set(restaurant.categories ?? [])].slice(0, 2).join(", ") || "—"}

            </p>

            {restaurant.rating && (

              <p className="mt-1 flex items-center gap-1 text-[0.75rem]">

                <Star className="size-3 fill-amber-400 text-amber-400" />

                <span className="font-semibold">{restaurant.rating.toFixed(1)}</span>

              </p>

            )}

          </div>

        </div>



        <CatalogueStat

          icon={UtensilsCrossed}

          tint="bg-amber-50 text-amber-600"

          label="Total Items"

          value={formatNumber(items.data?.total)}

          breakdown={[

            { label: "Available", value: formatNumber(live), tone: "text-emerald-600" },

            {

              label: "Out of stock",

              value: formatNumber(inactive),

              tone: "text-rose-600",

            },

          ]}

        />

        <CatalogueStat

          icon={Tags}

          tint="bg-sky-50 text-sky-600"

          label="Categories"

          value={formatNumber(categories.length)}

          breakdown={[{ label: "Add-ons", value: "—" }]}

        />

        <CatalogueStat

          icon={Trophy}

          tint="bg-violet-50 text-violet-600"

          label="Combo Offers"

          value={formatNumber(combos)}

          breakdown={[{ label: "Bestsellers", value: formatNumber(bestsellers) }]}

        />

      </div>



      <div className="mt-3 flex flex-wrap items-center gap-2">

        <SearchField

          value={list.search}

          onChange={list.setSearch}

          placeholder="Search menu items…"

        />

        <FilterSelect

          value={list.filters.category ?? ""}

          onChange={(value) => list.setFilter("category", value)}

          options={categories.map((entry) => ({

            value: entry.label,

            label: entry.label,

          }))}

          placeholder="All Categories"

          allLabel="All Categories"

        />

        <FilterSelect

          value={list.filters.status ?? ""}

          onChange={(value) => list.setFilter("status", value)}

          options={STATUS_OPTIONS}

          placeholder="All Status"

          allLabel="All Status"

        />

        <FilterSelect

          value={list.filters.availability ?? ""}

          onChange={(value) => list.setFilter("availability", value)}

          options={AVAILABILITY_OPTIONS}

          placeholder="All Availability"

          allLabel="All Availability"

        />

      </div>



      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[16rem_1fr]">

        <Panel

          title="Categories"

          action={

            <Button variant="ghost" size="sm" onClick={() => setAddingCategory(true)}>

              <Plus className="size-3.5" />

              Add Category

            </Button>

          }

          bodyClassName="p-1.5"

        >

          {items.isPending ? (

            <div className="space-y-1.5 p-2">

              {Array.from({ length: 6 }).map((_, i) => (

                <Skeleton key={i} className="h-8 w-full" />

              ))}

            </div>

          ) : categories.length === 0 ? (

            <p className="p-3 text-[0.8125rem] text-muted-foreground">

              No categories on this menu yet.

            </p>

          ) : (

            <ul>

              <li>

                <button

                  type="button"

                  onClick={() => list.setFilter("category", "")}

                  className={cn(

                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[0.8125rem] transition-colors",

                    !list.filters.category

                      ? "bg-primary/8 font-medium text-primary"

                      : "hover:bg-muted/60"

                  )}

                >

                  All Items

                  <span className="tabular-nums">{formatNumber(rows.length)}</span>

                </button>

              </li>

              {categories.map((category) => {

                const active = list.filters.category === category.label;

                return (

                  <li key={category.label}>

                    <button

                      type="button"

                      onClick={() => list.setFilter("category", category.label)}

                      className={cn(

                        "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[0.8125rem] transition-colors",

                        active

                          ? "bg-primary/8 font-medium text-primary"

                          : "hover:bg-muted/60"

                      )}

                    >

                      <span className="truncate">{category.label}</span>

                      <span className="shrink-0 tabular-nums text-muted-foreground">

                        {category.count}

                      </span>

                    </button>

                  </li>

                );

              })}

            </ul>

          )}

          <p className="border-t border-border px-3 py-2 text-[0.75rem] text-muted-foreground">

            Total categories: {categories.length}

          </p>

        </Panel>



        <div>

          <Panel

            title={`Menu Items (${formatNumber(visible.length)})`}

            action={

              <div className="flex items-center gap-1">

                <Button

                  variant={layout === "list" ? "outline" : "ghost"}

                  size="icon-sm"

                  aria-label="List view"

                  aria-pressed={layout === "list"}

                  onClick={() => setLayout("list")}

                >

                  <List className="size-4" />

                </Button>

                <Button

                  variant={layout === "grid" ? "outline" : "ghost"}

                  size="icon-sm"

                  aria-label="Grid view"

                  aria-pressed={layout === "grid"}

                  onClick={() => setLayout("grid")}

                >

                  <LayoutGrid className="size-4" />

                </Button>

              </div>

            }

            flush

          >

            {items.isPending ? (

              <div className="space-y-2 p-4">

                {Array.from({ length: 5 }).map((_, i) => (

                  <Skeleton key={i} className="h-14 w-full" />

                ))}

              </div>

            ) : visible.length === 0 ? (

              <EmptyState

                icon={UtensilsCrossed}

                title="No menu items match these filters"

                description="Try a different category, or clear the availability filter."

              />

            ) : layout === "grid" ? (

              <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">

                {visible.map((item) => (

                  <MenuCard
                        key={item._id}
                        item={item}
                        restaurantId={restaurant._id}
                        categories={categoryNames}
                        cuisines={cuisineNames}
                      />

                ))}

              </div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full min-w-[46rem]">

                  <thead>

                    <tr className="border-b border-border text-[0.6875rem] text-muted-foreground">

                      <th scope="col" className="px-4 py-2.5 text-left font-medium">

                        Item

                      </th>

                      <th scope="col" className="px-3 py-2.5 text-left font-medium">

                        Category

                      </th>

                      <th scope="col" className="px-3 py-2.5 text-right font-medium">

                        Price

                      </th>

                      <th scope="col" className="px-3 py-2.5 text-left font-medium">

                        Status

                      </th>

                      <th scope="col" className="px-3 py-2.5 text-left font-medium">

                        Availability

                      </th>

                      <th scope="col" className="px-4 py-2.5 text-right font-medium">

                        Actions

                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {visible.map((item) => (

                      <MenuRow
                        key={item._id}
                        item={item}
                        restaurantId={restaurant._id}
                        categories={categoryNames}
                        cuisines={cuisineNames}
                      />

                    ))}

                  </tbody>

                </table>

              </div>

            )}

          </Panel>



          <div className="surface mt-3">

            <TablePagination

              page={list.page}

              pageSize={list.limit}

              total={items.data?.total ?? 0}

              onPageChange={list.setPage}

              onPageSizeChange={list.setLimit}

              className="border-t-0"

            />

          </div>

        </div>

      </div>

      {/*

        The menu as a customer would be offered it: active items that are in

        stock, grouped by category. "Preview Menu" did nothing before, so there

        was no way to see what the app actually shows without opening the app.

      */}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>

        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">

          <DialogHeader>

            <DialogTitle>

              {restaurant.name ?? "Menu"} — as customers see it

            </DialogTitle>

          </DialogHeader>

          {(() => {

            const live = (items.data?.items ?? []).filter(

              (item) => item.isActive !== false && item.isAvailable !== false

            );

            if (live.length === 0) {

              return (

                <p className="text-sm text-muted-foreground">

                  Nothing on this menu is live, so customers see an empty menu.

                </p>

              );

            }

            const byCategory = new Map<string, MenuItem[]>();

            for (const item of live) {

              const key = item.category ?? "Uncategorised";

              byCategory.set(key, [...(byCategory.get(key) ?? []), item]);

            }

            return (

              <div className="space-y-4">

                {[...byCategory.entries()].map(([category, group]) => (

                  <section key={category}>

                    <h3 className="mb-2 text-[0.8125rem] font-semibold">{category}</h3>

                    <ul className="space-y-2">

                      {group.map((item) => (

                        <li

                          key={item._id}

                          className="flex items-start justify-between gap-3 border-b border-border/70 pb-2 last:border-0"

                        >

                          <div className="min-w-0">

                            <p className="text-sm font-medium">{item.name}</p>

                            {item.description && (

                              <p className="line-clamp-2 text-xs text-muted-foreground">

                                {item.description}

                              </p>

                            )}

                          </div>

                          <span data-numeric className="shrink-0 text-sm font-medium">

                            {currency(item.price ?? 0)}

                          </span>

                        </li>

                      ))}

                    </ul>

                  </section>

                ))}

              </div>

            );

          })()}

        </DialogContent>

      </Dialog>

      <CreateDialog
        open={addingCategory}
        onOpenChange={setAddingCategory}
        title="Add category"
        description={`A new section on ${restaurant.name ?? "this restaurant"}'s menu.`}
        fields={[
          {
            name: "name",
            label: "Category name",
            required: true,
            placeholder: "Desserts",
          },
        ]}
        onSubmit={(values) =>
          createCategory.mutateAsync({
            name: values.name.trim(),
            restaurantId: restaurant._id,
          })
        }
      />

    </>

  );

}



/** Price with its struck original and the saving, as the reference draws it. */

function Price({ item }: { item: MenuItem }) {

  const off =

    item.originalPrice && item.price && item.originalPrice > item.price

      ? Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)

      : null;

  return (

    <div className="text-right">

      <span className="font-medium tabular-nums">{currency(item.price)}</span>

      {item.originalPrice && off !== null && (

        <>

          <span className="ml-1.5 text-[0.75rem] text-muted-foreground line-through tabular-nums">

            {currency(item.originalPrice)}

          </span>

          <div className="text-[0.6875rem] font-semibold text-emerald-600">

            {off}% OFF

          </div>

        </>

      )}



    </div>

  );

}



function ItemIdentity({ item }: { item: MenuItem }) {

  return (

    <div className="flex min-w-0 items-start gap-2.5">

      <Avatar className="size-11 shrink-0 rounded-md">

        {item.image && (

          <AvatarImage src={item.image} alt="" className="rounded-md object-cover" />

        )}

        <AvatarFallback className="rounded-md bg-muted">

          <UtensilsCrossed className="size-4 text-muted-foreground" />

        </AvatarFallback>

      </Avatar>

      <div className="min-w-0">

        <div className="flex flex-wrap items-center gap-1.5">

          <span

            aria-label={item.isVeg ? "Vegetarian" : "Non-vegetarian"}

            className={cn(

              "flex size-3 shrink-0 items-center justify-center rounded-[3px] border",

              item.isVeg ? "border-emerald-600" : "border-rose-600"

            )}

          >

            <span

              className={cn(

                "size-1.5 rounded-full",

                item.isVeg ? "bg-emerald-600" : "bg-rose-600"

              )}

            />

          </span>

          <span className="truncate text-[0.8125rem] font-medium">

            {item.name ?? "Item"}

          </span>

          {(item.rating ?? 0) >= BESTSELLER_RATING && (

            <StatusBadge tone="warning" dot={false} label="Bestseller" />

          )}

        </div>

        <p className="mt-0.5 line-clamp-2 text-[0.6875rem] text-muted-foreground">

          {item.description}

        </p>

      </div>

    </div>

  );

}



function RowActions({
  item,
  restaurantId,
  categories,
  cuisines,
}: {
  item: MenuItem;
  restaurantId: string;
  categories: string[];
  cuisines: string[];
}) {
  const setStatus = useSetMenuItemStatus();
  const remove = useDeleteMenuItem();
  const duplicate = useCreateMenuItem();
  const outOfStock = item.isAvailable === false;

  return (
    <div className="flex items-center justify-end gap-1.5">
      <AddMenuItemSheet
        restaurantId={restaurantId}
        categories={categories}
        cuisines={cuisines}
        item={item}
        trigger={
          <Button variant="outline" size="icon-sm" aria-label="Edit item">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Duplicate item"
        disabled={duplicate.isPending}
        onClick={() => {
          duplicate.mutate(
            {
              restaurantId,
              name: `${item.name ?? "Item"} (copy)`,
              category: item.category,
              cuisine: item.cuisine,
              description: item.description,
              isVeg: item.isVeg,
              price: item.price,
              originalPrice: item.originalPrice,
              isActive: false,
              isAvailable: false,
            },
            {
              onSuccess: () => toast.success(`${item.name ?? "Item"} duplicated`),
              onError: (error) =>
                toast.error(
                  error instanceof Error ? error.message : "Couldn't duplicate the item"
                ),
            }
          );
        }}
      >
        <Copy className="size-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Item actions">
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              setStatus.mutate(
                { id: item._id, isAvailable: outOfStock },
                {
                  onSuccess: () =>
                    toast.success(
                      outOfStock
                        ? `${item.name ?? "Item"} is back in stock`
                        : `${item.name ?? "Item"} marked out of stock`
                    ),
                  onError: (error) =>
                    toast.error(
                      error instanceof Error ? error.message : "Couldn't change the item"
                    ),
                }
              )
            }
          >
            {outOfStock ? "Mark back in stock" : "Mark out of stock"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              remove.mutate(
                { id: item._id },
                {
                  onSuccess: () => toast.success(`${item.name ?? "Item"} removed`),
                  onError: (error) =>
                    toast.error(
                      error instanceof Error ? error.message : "Couldn't remove the item"
                    ),
                }
              )
            }
          >
            Remove from menu
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}



function MenuRow({
  item,
  restaurantId,
  categories,
  cuisines,
}: {
  item: MenuItem;
  restaurantId: string;
  categories: string[];
  cuisines: string[];
}) {

  return (

    <tr className="border-b border-border/70 last:border-0">

      <td className="px-4 py-3">

        <ItemIdentity item={item} />

      </td>

      <td className="px-3 py-3 text-[0.8125rem]">{item.category ?? "—"}</td>

      <td className="px-3 py-3 text-[0.8125rem]">

        <Price item={item} />

      </td>

      <td className="px-3 py-3">

        <StatusBadge status={item.isActive === false ? "inactive" : "active"} />

      </td>

      <td className="px-3 py-3">

        <StatusBadge

          status={item.isAvailable === false ? "offline" : "online"}

          label={item.isAvailable === false ? "Out of stock" : "Available"}

        />

      </td>

      <td className="px-4 py-3">

        <RowActions
          item={item}
          restaurantId={restaurantId}
          categories={categories}
          cuisines={cuisines}
        />

      </td>

    </tr>

  );

}



function MenuCard({
  item,
  restaurantId,
  categories,
  cuisines,
}: {
  item: MenuItem;
  restaurantId: string;
  categories: string[];
  cuisines: string[];
}) {

  return (

    <div className="rounded-xl border border-border p-3">

      <ItemIdentity item={item} />

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-2.5">

        <div className="flex flex-wrap items-center gap-1.5">

          <StatusBadge status={item.isActive === false ? "inactive" : "active"} />

          <StatusBadge

            status={item.isAvailable === false ? "offline" : "online"}

            label={item.isAvailable === false ? "Out of stock" : "Available"}

          />

        </div>

        <Price item={item} />

      </div>

      <div className="mt-2">

        <RowActions
          item={item}
          restaurantId={restaurantId}
          categories={categories}
          cuisines={cuisines}
        />

      </div>

    </div>

  );

}

