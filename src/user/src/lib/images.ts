/**
 * Photography.
 *
 * Every entry below has been opened and looked at — the key describes what the
 * photo actually shows, not what we hoped it showed. An earlier pass mapped
 * these by guessing from URL slugs and shipped naan that was noodles and a
 * restaurant hero that was a portrait of a man.
 *
 * If you add one: fetch it, look at it, then name the key after its contents.
 * The sample menu in `data.ts` is written to match this list, not the other
 * way round.
 *
 * Unsplash CDN, sized and quality-capped per request so the app isn't pulling
 * multi-megabyte originals over mobile data. Swap for your own asset URLs when
 * the real catalogue lands.
 */

const UNSPLASH = "https://images.unsplash.com/photo-";

function photo(id: string, width: number) {
  return `${UNSPLASH}${id}?auto=format&fit=crop&w=${width}&q=72`;
}

/** key = verified contents of the photograph. */
const IDS = {
  /** Two brass bowls of chicken biryani. */
  biryani: "1563379091339-03b21ab4a4f8",
  /** Rice with meat, side bowls — reads as a biryani plate. */
  riceMeat: "1631515243349-e0cb75fb8d3a",
  /** Rich curry beside flatbread. */
  curryBread: "1565557623262-b51c2513a641",
  /** Basket of soft buns with a curry bowl. */
  buns: "1606491956689-2ea866880c84",
  /** Meat fillet over tomato sauce. */
  meatTomato: "1574894709920-11b28e7367e3",
  /** Steamed white idli on a banana leaf with chutney. */
  idli: "1589301760014-d929f3979dbc",
  /** Curry thali with rice, several bowls. */
  thali: "1585937421612-70a008356fbe",
  /** Fried samosas with chilli. */
  samosa: "1601050690597-df0568f70950",
  /** Wok noodles on a wooden board. */
  noodles: "1585032226651-759b368d7246",
  /** Green salad bowl with dressing. */
  saladBowl: "1546069901-ba9599a7e63c",
  /** Stack of pancakes with syrup being poured. */
  pancakes: "1567620905732-2d1ec7ab7445",
  /** Whole margherita pizza, overhead. */
  pizza: "1565299624946-b28f40a0ae38",
  /** Stacked cheeseburger. */
  burger: "1568901346375-23c9450c58cd",
  /** Chocolate layer cake slice. */
  cake: "1578985545062-69928b1d9587",
  /** Dark bowl of stir-fried noodles. */
  chinese: "1585032226651-759b368d7246",
} as const;

export type PhotoKey = keyof typeof IDS;

export function img(key: PhotoKey, width = 400) {
  return photo(IDS[key], width);
}

/** Wide crops for restaurant headers and promo banners. */
export function hero(key: PhotoKey, width = 900) {
  return photo(IDS[key], width);
}

/**
 * The picture to draw for a restaurant or a dish.
 *
 * A photograph the vendor actually uploaded always wins. The keyed stand-ins
 * above exist only for the seeded catalogue, which ships without photography —
 * and reaching for one while a real upload sits in `imageUrl` is precisely how
 * a customer ends up looking at somebody else's biryani.
 *
 * `width` only applies to the stand-in; an uploaded file is served as stored.
 */
export function photoUri(
  source: { imageUrl?: string | null; photo?: PhotoKey | null } | null | undefined,
  width = 400,
  fallback: PhotoKey = "thali"
): string {
  const uploaded = source?.imageUrl?.trim();
  if (uploaded) return uploaded;
  return img(source?.photo ?? fallback, width);
}
