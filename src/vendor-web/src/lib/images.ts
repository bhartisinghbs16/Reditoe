/**
 * Photography.
 *
 * The reference screens put a real photo of the dish on every menu row and
 * every top-seller entry, so the console does too. Keys describe what the
 * photograph actually shows — the sample menu in `data.ts` is written to match
 * this list, not the other way round.
 *
 * Same Unsplash IDs the customer app uses, so a dish looks identical wherever
 * it appears. Swap for your own asset URLs when the real catalogue lands.
 */

const UNSPLASH = "https://images.unsplash.com/photo-";

/** key = verified contents of the photograph. */
const IDS = {
  /** Two brass bowls of chicken biryani. */
  biryani: "1563379091339-03b21ab4a4f8",
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
  /** Chocolate layer cake slice. */
  cake: "1578985545062-69928b1d9587",
  /** Glass of iced tea with lemon. */
  icedTea: "1499638673689-79a0b5115d87",
  /** Dining room of a warmly lit restaurant. */
  storefront: "1517248135467-4c7edcad34c4",
} as const;

export type PhotoKey = keyof typeof IDS;

export function img(key: PhotoKey, width = 200) {
  return `${UNSPLASH}${IDS[key]}?auto=format&fit=crop&w=${width}&q=72`;
}
