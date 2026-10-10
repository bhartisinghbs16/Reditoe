"use client";

import { TaxonomyPage } from "@/components/common/taxonomy-page";
import { useCuisines } from "@/lib/queries";
import { useListState } from "@/lib/use-list-state";

export default function CuisinesPage() {
  const list = useListState({}, 25);
  const cuisines = useCuisines(list.params);

  return (
    <TaxonomyPage
      title="Cuisines"
      description="The cuisine tags restaurants and menu items are filed under."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Restaurants", href: "/restaurants" },
        { label: "Cuisines" },
      ]}
      noun="cuisine"
      usageLabel="Restaurants"
      query={cuisines}
      list={list}
    />
  );
}
