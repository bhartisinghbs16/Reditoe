"use client";

import { useState } from "react";
import { TaxonomyPage } from "@/components/common/taxonomy-page";
import { CreateDialog } from "@/components/common/create-dialog";
import { useCategories, useCreateCategory } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";

export default function MenuCategoriesPage() {
  const list = useListState({ scope: "menu" }, 25);
  const categories = useCategories(list.params);
  const createCategory = useCreateCategory();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <TaxonomyPage
      title="Menu categories"
      description="Sections a restaurant's menu is split into — starters, mains, desserts."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Menu", href: "/menu" },
        { label: "Categories" },
      ]}
      noun="category"
      usageLabel="Items"
      query={categories}
      list={list}
      onAdd={() => setCreating(true)}
    />

      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        title="Add category"
        description="Added to every restaurant, so their menus can use it."
        fields={[
          {
            name: "name",
            label: "Category name",
            required: true,
            placeholder: "Desserts",
          },
        ]}
        onSubmit={(values) => createCategory.mutateAsync({ name: values.name.trim() })}
      />
    </>
  );
}
