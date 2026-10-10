"use client";

import * as React from "react";
import { FilterSelect } from "@/components/common/filter-bar";
import { useKnownLocations } from "@/lib/queries";

/**
 * State and city filters, offered wherever a list has a place attached.
 *
 * The options come from the data, so the dropdowns can never offer a city
 * with nothing in it or miss one that has orders. Choosing a state narrows
 * nothing on its own - the two are independent filters, because a platform
 * operating in one state would otherwise show a state list of one.
 */
export function LocationFilters({
  state,
  city,
  onState,
  onCity,
}: {
  state: string;
  city: string;
  onState: (value: string) => void;
  onCity: (value: string) => void;
}) {
  const { data } = useKnownLocations();

  const states = data?.states ?? [];
  const cities = data?.cities ?? [];

  // Nothing to filter by yet: a pair of empty dropdowns is furniture.
  if (states.length === 0 && cities.length === 0) return null;

  return (
    <>
      {states.length > 0 && (
        <FilterSelect
          value={state}
          onChange={onState}
          options={states.map((name) => ({ value: name, label: name }))}
          placeholder="All states"
          allLabel="All states"
        />
      )}
      {cities.length > 0 && (
        <FilterSelect
          value={city}
          onChange={onCity}
          options={cities.map((name) => ({ value: name, label: name }))}
          placeholder="All cities"
          allLabel="All cities"
        />
      )}
    </>
  );
}
