"use client";

import * as React from "react";
import {
  Download,
  EyeOff,
  Grid2x2,
  Lightbulb,
  Pencil,
  Plus,
  SquareCheck,
  Tags,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageActions } from "@/components/common/page-actions";
import { StatTile } from "@/components/common/stat-card";
import { DataTable, TablePagination, type Column } from "@/components/common/data-table";
import { ChipTabs, SearchField, Toolbar } from "@/components/common/filter-bar";
import { FilterMenu, SortMenu } from "@/components/common/list-controls";
import { StatusBadge, VegMark } from "@/components/common/status-badge";
import { FoodThumb } from "@/components/common/food-thumb";
import { TipsBanner } from "@/components/common/promo-banner";
import { MenuItemDialog } from "@/components/menu/menu-item-dialog";
import { CategoryDialog } from "@/components/menu/category-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { currency, number as formatNumber } from "@/lib/format";
import { downloadCsv, stampedName, toCsv } from "@/lib/csv";
import { deleteMenuItem, type MenuItem } from "@/lib/vendor-api";
import { useVendor } from "@/lib/store";

type SortKey = "name" | "price-asc" | "price-desc" | "recent";
type Availability = "all" | "available" | "hidden";
type Diet = "all" | "veg" | "non-veg";

const SORTS = [
  { value: "name" as const, label: "Name (A–Z)" },
  { value: "price-asc" as const, label: "Price: low to high" },
  { value: "price-desc" as const, label: "Price: high to low" },
  { value: "recent" as const, label: "Recently added" },
];

export default function MenuPage() {
  const { menu, categories, toggleAvailability, loadingMenu } = useVendor();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [availability, setAvailability] = React.useState<Availability>("all");
  const [diet, setDiet] = React.useState<Diet>("all");
  const [sort, setSort] = React.useState<SortKey>("name");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const [editing, setEditing] = React.useState<MenuItem | undefined>();
  const [formOpen, setFormOpen] = React.useState(false);
  const [categoriesOpen, setCategoriesOpen] = React.useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => deleteMenuItem(id),
    onSuccess: () => {
      toast.success("Item removed");
      queryClient.invalidateQueries({ queryKey: ["menu"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete"),
  });

  // Prefer the catalogue's own category records; fall back to whatever the
  // items themselves claim, so the chips still work on a fresh account.
  const chips = React.useMemo(() => {
    if (categories.length > 0) {
      return categories.map((c) => ({
        label: c.name,
        value: c.name,
        count: menu.filter((item) => item.category === c.name).length,
      }));
    }
    const counts = new Map<string, number>();
    for (const item of menu) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => ({
      label,
      value: label,
      count,
    }));
  }, [categories, menu]);

  const filtered = React.useMemo(() => {
    const rows = menu.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (availability === "available" && !item.available) return false;
      if (availability === "hidden" && item.available) return false;
      if (diet === "veg" && !item.veg) return false;
      if (diet === "non-veg" && item.veg) return false;
      if (!search) return true;
      const needle = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle)
      );
    });

    const sorted = [...rows];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    // "recent" keeps the API's own order, which is newest-first.
    return sorted;
  }, [menu, search, category, availability, diet, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const activeCount = menu.filter((item) => item.available).length;
  const filterCount = (availability !== "all" ? 1 : 0) + (diet !== "all" ? 1 : 0);

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (item: MenuItem) => {
    setEditing(item);
    setFormOpen(true);
  };

  const exportCsv = () => {
    downloadCsv(
      stampedName("menu"),
      toCsv(
        [
          { header: "Name", value: (r: MenuItem) => r.name },
          { header: "Category", value: (r: MenuItem) => r.category },
          { header: "Price", value: (r: MenuItem) => r.price },
          { header: "Food type", value: (r: MenuItem) => (r.veg ? "Veg" : "Non-veg") },
          { header: "Prep minutes", value: (r: MenuItem) => r.prepMinutes },
          { header: "Status", value: (r: MenuItem) => (r.available ? "Active" : "Inactive") },
          { header: "Description", value: (r: MenuItem) => r.description },
        ],
        filtered
      )
    );
    toast.success(`Exported ${filtered.length} item${filtered.length === 1 ? "" : "s"}`);
  };

  const columns: Column<MenuItem>[] = [
    {
      id: "item",
      header: "Item Details",
      cell: (item) => (
        <button
          type="button"
          onClick={() => openEdit(item)}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <span className="relative shrink-0">
            <FoodThumb src={item.image} name={item.name} size={56} />
            {/* The veg mark rides the corner of the photo, as the reference
                prints it — it has to be readable before the name is. */}
            <VegMark
              veg={item.veg}
              className="absolute -top-1 -right-1 border-[2px] bg-card"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{item.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {item.category}
              {item.description ? ` • ${item.description}` : ""}
            </span>
          </span>
        </button>
      ),
    },
    {
      id: "price",
      header: "Price",
      align: "center",
      cell: (item) => (
        <span data-numeric className="font-bold">
          {currency(item.price)}
        </span>
      ),
    },
    {
      id: "prep",
      header: "Prep Time",
      align: "center",
      hideBelow: "lg",
      cell: (item) => (
        <span data-numeric className="text-muted-foreground">
          {item.prepMinutes > 0 ? `${item.prepMinutes} mins` : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      align: "center",
      cell: (item) => (
        <StatusBadge status={item.available ? "active" : "inactive"} />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      align: "center",
      cell: (item) => (
        <div className="flex items-center justify-center gap-2">
          <Switch
            checked={item.available}
            onCheckedChange={(next) => toggleAvailability(item.id, next)}
            aria-label={`${item.name} availability`}
          />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`Edit ${item.name}`}
            onClick={() => openEdit(item)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${item.name}`}
            className="text-red-600 hover:bg-red-50 hover:text-red-600"
            onClick={() => {
              if (window.confirm(`Remove "${item.name}" from your menu?`)) {
                remove.mutate(item.id);
              }
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageActions>
        <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="size-4" />
          Export
        </Button>
        <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
          <Tags className="size-4" />
          Categories
        </Button>
        <Button onClick={openAdd}>
          <Plus className="size-4" />
          Add New Item
        </Button>
      </PageActions>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={UtensilsCrossed}
          tone="red"
          value={formatNumber(menu.length)}
          label="Total Items"
          caption="All menu items"
        />
        <StatTile
          icon={SquareCheck}
          tone="green"
          value={formatNumber(activeCount)}
          label="Active Items"
          caption="Visible to customers"
        />
        <StatTile
          icon={EyeOff}
          tone="amber"
          value={formatNumber(menu.length - activeCount)}
          label="Inactive Items"
          caption="Hidden from menu"
        />
        <StatTile
          icon={Grid2x2}
          tone="violet"
          value={formatNumber(categories.length)}
          label="Categories"
          caption="Menu categories"
        />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(item) => item.id}
          loading={loadingMenu}
          emptyTitle={menu.length === 0 ? "No items on the menu" : "No items match"}
          emptyDescription={
            menu.length === 0
              ? "Add your first dish and it will show up here."
              : "Try a different search or clear the filters."
          }
          emptyAction={
            menu.length === 0 ? (
              <Button onClick={openAdd}>
                <Plus className="size-4" />
                Add New Item
              </Button>
            ) : undefined
          }
          toolbar={
            <div className="space-y-3">
              <Toolbar>
                <SearchField
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setPage(1);
                  }}
                  placeholder="Search menu items…"
                />
                <FilterMenu
                  activeCount={filterCount}
                  onReset={() => {
                    setAvailability("all");
                    setDiet("all");
                    setPage(1);
                  }}
                  groups={[
                    {
                      key: "availability",
                      label: "Availability",
                      value: availability,
                      onChange: (value) => {
                        setAvailability(value as Availability);
                        setPage(1);
                      },
                      options: [
                        { value: "all", label: "All" },
                        { value: "available", label: "Active" },
                        { value: "hidden", label: "Inactive" },
                      ],
                    },
                    {
                      key: "diet",
                      label: "Food type",
                      value: diet,
                      onChange: (value) => {
                        setDiet(value as Diet);
                        setPage(1);
                      },
                      options: [
                        { value: "all", label: "All" },
                        { value: "veg", label: "Veg" },
                        { value: "non-veg", label: "Non-veg" },
                      ],
                    },
                  ]}
                />
                <SortMenu value={sort} onChange={setSort} options={SORTS} />
              </Toolbar>
              <ChipTabs
                value={category}
                onChange={(value) => {
                  setCategory(value);
                  setPage(1);
                }}
                options={[
                  { label: "All Items", value: "all", count: menu.length },
                  ...chips,
                ]}
              />
            </div>
          }
        />
      </div>

      {filtered.length > 0 && (
        <div className="surface mt-4">
          <TablePagination
            className="border-t-0"
            page={currentPage}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}

      <TipsBanner
        className="mt-4"
        icon={Lightbulb}
        tone="amber"
        title="Menu Tips"
        tips={[
          "Keep your menu updated for a better customer experience",
          "Use high quality images to showcase your food",
          "Mark popular items to increase visibility and sales",
        ]}
      />

      <MenuItemDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editing}
        categories={categories}
      />
      <CategoryDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={categories}
      />
    </>
  );
}
