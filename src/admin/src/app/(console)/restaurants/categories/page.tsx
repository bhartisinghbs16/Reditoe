"use client";

import { TaxonomyPage } from "@/components/common/taxonomy-page";
import { useCategories } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";

export default function RestaurantCategoriesPage() {
  const list = useListState({}, 25);
  const categories = useCategories(list.params);

  return (
    <TaxonomyPage
      title="Restaurant categories"
      description="Groupings customers browse by — fast food, healthy, desserts and so on."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Restaurants", href: "/restaurants" },
        { label: "Categories" },
      ]}
      noun="category"
      usageLabel="Restaurants"
      query={categories}
      list={list}
    />
  );
}
