import {
  combos as seedCombos,
  dishes as seedDishes,
  restaurants as seedRestaurants,
  type Combo,
  type Dish,
  type Restaurant,
} from "@/lib/data";

/**
 * The catalogue the screens actually read.
 *
 * It starts as the sample data in `data.ts` and is replaced once the API
 * answers, so the app has something to draw before the first request lands and
 * still works when the backend is down. Everything below reads through these
 * functions rather than importing the seed arrays, so swapping the source is
 * invisible to the screens.
 *
 * Components re-render on `catalogueVersion` from the store, which bumps when
 * this is replaced — a module variable alone would change without telling
 * React about it.
 */

export type CatalogueSource = "fixtures" | "api";

interface CatalogueState {
  restaurants: Restaurant[];
  dishes: Dish[];
  combos: Combo[];
  /** Where the current contents came from, for the connection indicator. */
  source: CatalogueSource;
}

let state: CatalogueState = {
  restaurants: seedRestaurants,
  dishes: seedDishes,
  combos: seedCombos,
  source: "fixtures",
};

export function setCatalogue(next: {
  restaurants: Restaurant[];
  dishes: Dish[];
  combos?: Combo[];
}) {
  state = {
    restaurants: next.restaurants,
    dishes: next.dishes,
    combos: next.combos ?? [],
    source: "api",
  };
}

export function resetCatalogue() {
  state = {
    restaurants: seedRestaurants,
    dishes: seedDishes,
    combos: seedCombos,
    source: "fixtures",
  };
}

export const catalogueSource = () => state.source;

/* ── Reads ──────────────────────────────────────────────────────────────── */

export const getRestaurants = () => state.restaurants;
export const getDishes = () => state.dishes;

export const restaurantById = (id: string) =>
  state.restaurants.find((r) => r.id === id);

export const dishById = (id: string) => state.dishes.find((d) => d.id === id);

export const dishesForRestaurant = (restaurantId: string) =>
  state.dishes.filter((d) => d.restaurantId === restaurantId);

export const combosForRestaurant = (restaurantId: string) =>
  state.combos.filter((c) => c.restaurantId === restaurantId);

export const popularDishes = () => {
  const tagged = state.dishes.filter((d) => d.tag);
  // The API has no "tag" concept yet, so fall back to the first few dishes
  // rather than rendering an empty rail.
  return (tagged.length > 0 ? tagged : state.dishes).slice(0, 6);
};
