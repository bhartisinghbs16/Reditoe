import type { PhotoKey } from "@/lib/images";
import { accents, type AccentKey } from "@/lib/theme";

/**
 * Sample catalogue, written to match the client's reference screens — the same
 * restaurants, dishes, prices, coupon codes, addresses and order history the
 * mockups show, so the app reads as a copy of them rather than a lookalike.
 *
 * The app reads through `lib/store.tsx`, so swapping this for live API calls is
 * a one-file change. Fixed data (not random) so screens are stable to review.
 *
 * Two departures from the mockups, both deliberate: the reference's sample data
 * names real chains and a competitor's wallet, which we shouldn't ship inside
 * the client's product, so those carry Reditoe or in-house names here. Photos
 * come from the verified list in `images.ts`; items with no honest match (soft
 * drinks) carry an emoji and fall back to a tinted plate.
 */

export interface Category {
  id: string;
  name: string;
  emoji: string;
  photo: PhotoKey;
  accent: AccentKey;
}

export interface Restaurant {
  /**
   * Pictures for the card: the restaurant's own first, then its food.
   *
   * Empty when nothing has been uploaded, in which case the card shows the
   * single image it always did rather than an empty carousel.
   */
  gallery?: string[];
  id: string;
  name: string;
  cuisines: string[];
  rating: number;
  ratingCount: number;
  etaMinutes: [number, number];
  deliveryFee: number;
  priceForTwo: number;
  /** Short form for the tile badge, e.g. "20% OFF". */
  offerBadge?: string;
  /** Long form for the card line, e.g. "20% OFF up to ₹100". */
  offer?: string;
  area: string;
  distanceKm: number;
  veg: boolean;
  imageUrl?: string;
  photo: PhotoKey;
  promoted?: boolean;
  closesAt?: string;
  packagingFee: number;
  freeDeliveryAbove: number;
}

export interface Portion {
  id: string;
  name: string;
  serves: string;
  price: number;
  /**
   * The modifier group this portion belongs to on the API, so the order can
   * name the choice the customer made. Absent on the seeded catalogue, which
   * has no server-side groups behind it.
   */
  groupId?: string;
  /** The portion the vendor marked as the default; preselected on the dish. */
  isDefault?: boolean;
}

export interface Extra {
  id: string;
  name: string;
  price: number;
  /** Set when the extra is a modifier option rather than a plain add-on. */
  groupId?: string;
}

export interface Dish {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  rating: number;
  ratingCount: number;
  veg: boolean;
  category: string;
  tag?: "Bestseller" | "Popular" | "New";
  /**
   * A real photo uploaded by the vendor. Takes precedence over `photo`, which
   * is only a stock stand-in chosen by keyword - showing that instead of the
   * dish someone actually photographed means the customer sees a picture of
   * different food.
   */
  imageUrl?: string;
  /** Omitted where the verified photo set has no honest match. */
  photo?: PhotoKey;
  emoji?: string;
  portions?: Portion[];
  extras?: Extra[];
  pairsWith?: string[];
}

/** "Make it a perfect meal!" — the combo strip on the restaurant screen. */
export interface Combo {
  id: string;
  restaurantId: string;
  name: string;
  contents: string;
  price: number;
  originalPrice: number;
  dishIds: string[];
}

export interface Offer {
  id: string;
  code: string;
  /** Big figure on the coupon stub, e.g. "₹100" or "15%". */
  figure: string;
  /** Word above it, e.g. "FLAT" or "FREE". */
  lead: string;
  /** Word below it, e.g. "OFF" or "DELIVERY". */
  trail: string;
  title: string;
  detail: string;
  minOrder: number;
  maxDiscount?: number;
  kind: "flat" | "percent" | "delivery";
  value: number;
  expiresOn: string;
  accent: AccentKey;
  group: "Restaurants" | "Delivery" | "Wallet" | "Bank Offers" | "Specials";
}

/* ── Catalogue ──────────────────────────────────────────────────────────── */

export const categories: Category[] = [
  { id: "pizza", name: "Pizza", emoji: "🍕", photo: "pizza", accent: "pink" },
  { id: "burgers", name: "Burgers", emoji: "🍔", photo: "burger", accent: "amber" },
  { id: "biryani", name: "Biryani", emoji: "🍛", photo: "biryani", accent: "orange" },
  { id: "chinese", name: "Chinese", emoji: "🍜", photo: "chinese", accent: "green" },
  { id: "desserts", name: "Desserts", emoji: "🍰", photo: "cake", accent: "purple" },
  { id: "southindian", name: "South Indian", emoji: "🥘", photo: "idli", accent: "teal" },
  { id: "thali", name: "Thali", emoji: "🍽️", photo: "thali", accent: "blue" },
  { id: "snacks", name: "Snacks", emoji: "🥟", photo: "samosa", accent: "red" },
];

export const restaurants: Restaurant[] = [
  {
    id: "r1",
    photo: "curryBread",
    name: "Spice Nest Kitchen",
    cuisines: ["North Indian", "Chinese", "Biryani"],
    rating: 4.4,
    ratingCount: 1240,
    etaMinutes: [30, 40],
    deliveryFee: 40,
    priceForTwo: 600,
    offerBadge: "20% OFF",
    offer: "20% OFF up to ₹100",
    area: "Srinivas Nagar",
    distanceKm: 1.2,
    veg: false,
    promoted: true,
    closesAt: "11:30 PM",
    packagingFee: 10,
    freeDeliveryAbove: 149,
  },
  {
    id: "r2",
    photo: "pizza",
    name: "Pizza Express",
    cuisines: ["Pizza", "Italian"],
    rating: 4.2,
    ratingCount: 980,
    etaMinutes: [25, 35],
    deliveryFee: 50,
    priceForTwo: 450,
    offerBadge: "15% OFF",
    offer: "15% OFF up to ₹75",
    area: "MR Palli",
    distanceKm: 2.3,
    veg: false,
    closesAt: "11:00 PM",
    packagingFee: 15,
    freeDeliveryAbove: 199,
  },
  {
    id: "r3",
    photo: "riceMeat",
    name: "Biryani House",
    cuisines: ["Biryani", "Mughlai"],
    rating: 4.3,
    ratingCount: 2130,
    etaMinutes: [30, 40],
    deliveryFee: 60,
    priceForTwo: 500,
    offerBadge: "10% OFF",
    offer: "10% OFF up to ₹60",
    area: "Leela Mahal",
    distanceKm: 1.8,
    veg: false,
    closesAt: "12:00 AM",
    packagingFee: 10,
    freeDeliveryAbove: 199,
  },
  {
    id: "r4",
    photo: "noodles",
    name: "Sushi Hub",
    cuisines: ["Asian", "Chinese"],
    rating: 4.1,
    ratingCount: 640,
    etaMinutes: [30, 40],
    deliveryFee: 60,
    priceForTwo: 700,
    offerBadge: "20% OFF",
    offer: "20% OFF up to ₹120",
    area: "Tirupati East",
    distanceKm: 3.1,
    veg: false,
    closesAt: "10:30 PM",
    packagingFee: 20,
    freeDeliveryAbove: 249,
  },
  {
    id: "r5",
    photo: "burger",
    name: "Burger Point",
    cuisines: ["Burgers", "Fast Food"],
    rating: 4.3,
    ratingCount: 1580,
    etaMinutes: [25, 30],
    deliveryFee: 40,
    priceForTwo: 400,
    offerBadge: "20% OFF",
    offer: "20% OFF up to ₹100",
    area: "Air Bypass Road",
    distanceKm: 1.8,
    veg: false,
    closesAt: "11:30 PM",
    packagingFee: 10,
    freeDeliveryAbove: 199,
  },
  {
    id: "r6",
    photo: "idli",
    name: "South Tiffins",
    cuisines: ["South Indian"],
    rating: 4.3,
    ratingCount: 3410,
    etaMinutes: [20, 25],
    deliveryFee: 0,
    priceForTwo: 250,
    offerBadge: "FREE DEL",
    offer: "Free delivery above ₹149",
    area: "Jayanagar",
    distanceKm: 1.5,
    veg: true,
    closesAt: "10:00 PM",
    packagingFee: 10,
    freeDeliveryAbove: 149,
  },
  {
    id: "r7",
    photo: "cake",
    name: "Sweet Corner",
    cuisines: ["Desserts", "Bakery"],
    rating: 4.6,
    ratingCount: 2890,
    etaMinutes: [22, 30],
    deliveryFee: 30,
    priceForTwo: 300,
    offerBadge: "10% OFF",
    offer: "10% OFF on all desserts",
    area: "Korlagunta",
    distanceKm: 2.6,
    veg: true,
    closesAt: "11:00 PM",
    packagingFee: 10,
    freeDeliveryAbove: 199,
  },
  {
    id: "r8",
    photo: "thali",
    name: "Sai Andhra Mess",
    cuisines: ["Andhra", "Thali"],
    rating: 4.2,
    ratingCount: 1120,
    etaMinutes: [25, 35],
    deliveryFee: 40,
    priceForTwo: 350,
    area: "Tirupati Bus Stand",
    distanceKm: 2.9,
    veg: false,
    closesAt: "10:30 PM",
    packagingFee: 10,
    freeDeliveryAbove: 199,
  },
];

const biryaniExtras: Extra[] = [
  { id: "e1", name: "Extra Chicken Piece", price: 60 },
  { id: "e2", name: "Raita", price: 30 },
  { id: "e3", name: "Salad", price: 20 },
  { id: "e4", name: "Biryani Gravy (150ml)", price: 40 },
];

const curryExtras: Extra[] = [
  { id: "e5", name: "Extra Gravy", price: 40 },
  { id: "e2", name: "Raita", price: 30 },
  { id: "e3", name: "Salad", price: 20 },
  { id: "e6", name: "Butter Roti", price: 25 },
];

export const dishes: Dish[] = [
  {
    id: "d1",
    photo: "biryani",
    restaurantId: "r1",
    name: "Chicken Biryani",
    description: "Aromatic basmati rice cooked with tender chicken and spices.",
    price: 220,
    rating: 4.4,
    ratingCount: 1240,
    veg: false,
    category: "Biryani",
    tag: "Bestseller",
    portions: [
      { id: "p1", name: "Regular", serves: "Serves 1", price: 220 },
      { id: "p2", name: "Large", serves: "Serves 2", price: 320 },
      { id: "p3", name: "Family Pack", serves: "Serves 4", price: 599 },
    ],
    extras: biryaniExtras,
    pairsWith: ["d11", "d13", "d12", "d14"],
  },
  {
    id: "d2",
    photo: "curryBread",
    restaurantId: "r1",
    name: "Paneer Butter Masala",
    description: "Cottage cheese cooked in rich & creamy tomato gravy.",
    price: 180,
    rating: 4.5,
    ratingCount: 860,
    veg: true,
    category: "Main Course",
    tag: "Popular",
    portions: [
      { id: "p1", name: "Regular", serves: "Serves 1", price: 180 },
      { id: "p2", name: "Large", serves: "Serves 2", price: 280 },
    ],
    extras: curryExtras,
    pairsWith: ["d10", "d11", "d13"],
  },
  {
    id: "d3",
    photo: "noodles",
    restaurantId: "r1",
    name: "Veg Hakka Noodles",
    description: "Stir fried noodles with fresh veggies & our special sauces.",
    price: 150,
    rating: 4.3,
    ratingCount: 780,
    veg: true,
    category: "Chinese",
    tag: "Bestseller",
    extras: curryExtras,
    pairsWith: ["d4", "d13"],
  },
  {
    id: "d4",
    photo: "samosa",
    restaurantId: "r1",
    name: "Veg Manchurian",
    description: "Crispy veggie balls tossed in spicy manchurian sauce.",
    price: 160,
    rating: 4.2,
    ratingCount: 540,
    veg: true,
    category: "Starters",
    pairsWith: ["d3"],
  },
  {
    id: "d5",
    photo: "riceMeat",
    restaurantId: "r1",
    name: "Mutton Biryani",
    description: "Flavorful mutton pieces cooked with long grain basmati rice & spices.",
    price: 280,
    rating: 4.6,
    ratingCount: 910,
    veg: false,
    category: "Biryani",
    tag: "Bestseller",
    portions: [
      { id: "p1", name: "Regular", serves: "Serves 1", price: 280 },
      { id: "p2", name: "Large", serves: "Serves 2", price: 420 },
    ],
    extras: biryaniExtras,
    pairsWith: ["d11", "d13"],
  },
  {
    id: "d6",
    photo: "meatTomato",
    restaurantId: "r1",
    name: "Butter Chicken",
    description: "Tandoori chicken cooked in rich & creamy tomato gravy.",
    price: 260,
    rating: 4.5,
    ratingCount: 1120,
    veg: false,
    category: "Main Course",
    tag: "Popular",
    extras: curryExtras,
    pairsWith: ["d10", "d11"],
  },
  {
    id: "d7",
    photo: "cake",
    restaurantId: "r7",
    name: "Chocolate Cake",
    description: "Layered chocolate sponge with a rich ganache finish.",
    price: 130,
    rating: 4.2,
    ratingCount: 660,
    veg: true,
    category: "Desserts",
    tag: "Popular",
  },
  {
    id: "d8",
    photo: "pizza",
    restaurantId: "r2",
    name: "Farmhouse Pizza",
    description: "Onion, capsicum, tomato & mushroom on a hand-tossed base.",
    price: 299,
    rating: 4.3,
    ratingCount: 1480,
    veg: true,
    category: "Pizza",
    tag: "Bestseller",
  },
  {
    id: "d9",
    photo: "burger",
    restaurantId: "r5",
    name: "Double Cheese Burger",
    description: "Two grilled patties, double cheese, lettuce & house sauce.",
    price: 199,
    rating: 4.4,
    ratingCount: 980,
    veg: false,
    category: "Burgers",
    tag: "Bestseller",
  },
  {
    id: "d10",
    photo: "buns",
    restaurantId: "r1",
    name: "Garlic Naan",
    description: "Tandoor-baked naan brushed with garlic butter.",
    price: 40,
    rating: 4.6,
    ratingCount: 2100,
    veg: true,
    category: "Breads",
  },
  {
    id: "d11",
    photo: "thali",
    restaurantId: "r1",
    name: "Raita",
    description: "Whisked curd with onion, cucumber and roasted cumin.",
    price: 30,
    rating: 4.4,
    ratingCount: 410,
    veg: true,
    category: "Sides",
  },
  {
    id: "d12",
    emoji: "🥤",
    restaurantId: "r1",
    name: "Cola (250ml)",
    description: "Chilled soft drink, 250ml can.",
    price: 40,
    rating: 4.1,
    ratingCount: 220,
    veg: true,
    category: "Beverages",
  },
  {
    id: "d13",
    photo: "pancakes",
    restaurantId: "r1",
    name: "Gulab Jamun (2 pcs)",
    description: "Warm milk dumplings soaked in cardamom syrup.",
    price: 50,
    rating: 4.7,
    ratingCount: 1580,
    veg: true,
    category: "Desserts",
  },
  {
    id: "d14",
    photo: "saladBowl",
    restaurantId: "r1",
    name: "Salad",
    description: "Cucumber, onion, carrot and lemon.",
    price: 20,
    rating: 4.0,
    ratingCount: 180,
    veg: true,
    category: "Sides",
  },
  {
    id: "d15",
    photo: "idli",
    restaurantId: "r6",
    name: "Idli Sambar (3 pcs)",
    description: "Steamed rice cakes with sambar and coconut chutney.",
    price: 129,
    rating: 4.6,
    ratingCount: 3400,
    veg: true,
    category: "South Indian",
    tag: "Bestseller",
  },
];

/** Menu tab order on the restaurant screen, as the reference lists it. */
export const menuTabs = [
  "Recommended",
  "Bestsellers",
  "Biryani",
  "Combos",
  "Starters",
  "Main Course",
  "Chinese",
  "Breads",
  "Desserts",
] as const;

export const combos: Combo[] = [
  {
    id: "c1",
    restaurantId: "r1",
    name: "Biryani Combo",
    contents: "1 Chicken Biryani + 1 Raita + 1 Cola",
    price: 249,
    originalPrice: 299,
    dishIds: ["d1", "d11", "d12"],
  },
];

/* ── Offers ─────────────────────────────────────────────────────────────── */

export const offers: Offer[] = [
  {
    id: "o1",
    code: "REDITOE100",
    figure: "₹100",
    lead: "FLAT",
    trail: "OFF",
    title: "FLAT ₹100 OFF",
    detail: "On orders above ₹299",
    minOrder: 299,
    kind: "flat",
    value: 100,
    expiresOn: "2026-10-31",
    accent: "red",
    group: "Restaurants",
  },
  {
    id: "o2",
    code: "REDITOE200",
    figure: "₹200",
    lead: "FLAT",
    trail: "OFF",
    title: "FLAT ₹200 OFF",
    detail: "On orders above ₹599",
    minOrder: 599,
    kind: "flat",
    value: 200,
    expiresOn: "2026-10-31",
    accent: "green",
    group: "Restaurants",
  },
  {
    id: "o3",
    code: "SAVE15",
    figure: "15%",
    lead: "",
    trail: "OFF",
    title: "15% OFF up to ₹150",
    detail: "On orders above ₹399",
    minOrder: 399,
    maxDiscount: 150,
    kind: "percent",
    value: 15,
    expiresOn: "2026-09-25",
    accent: "purple",
    group: "Bank Offers",
  },
  {
    id: "o4",
    code: "FREEDEL",
    figure: "FREE",
    lead: "",
    trail: "DELIVERY",
    title: "FREE DELIVERY",
    detail: "On orders above ₹199",
    minOrder: 199,
    kind: "delivery",
    value: 0,
    expiresOn: "2026-09-20",
    accent: "amber",
    group: "Delivery",
  },
  {
    id: "o5",
    code: "RED20",
    figure: "20%",
    lead: "FLAT",
    trail: "OFF",
    title: "FLAT 20% OFF",
    detail: "Up to ₹120 on orders above ₹299",
    minOrder: 299,
    maxDiscount: 120,
    kind: "percent",
    value: 20,
    expiresOn: "2026-09-30",
    accent: "red",
    group: "Restaurants",
  },
  {
    id: "o6",
    code: "WALLET50",
    figure: "₹50",
    lead: "FLAT",
    trail: "CASHBACK",
    title: "₹50 cashback to Wallet",
    detail: "Pay with Reditoe Wallet on orders above ₹249",
    minOrder: 249,
    kind: "flat",
    value: 50,
    expiresOn: "2026-09-15",
    accent: "blue",
    group: "Wallet",
  },
];

export const offerGroups = [
  { id: "all", label: "All Offers", icon: "pricetags", accent: "red" },
  { id: "Restaurants", label: "Restaurants", icon: "storefront-outline", accent: "green" },
  { id: "Delivery", label: "Delivery", icon: "bicycle", accent: "purple" },
  { id: "Wallet", label: "Wallet", icon: "wallet", accent: "amber" },
  { id: "Bank Offers", label: "Bank Offers", icon: "card", accent: "blue" },
  { id: "Specials", label: "Specials", icon: "star", accent: "amber" },
] as const;

/** The hero coupon on the Offers screen. */
export const megaOffer = {
  code: "REDITOE250",
  headline: "Get up to ₹250 OFF",
  sub: "on your next order",
  kicker: "MEGA SAVINGS!",
};

export const offerSteps = [
  { label: "Add items to cart", icon: "basket-outline", accent: "green" },
  { label: "Choose offer & Tap Apply", icon: "pricetag-outline", accent: "amber" },
  { label: "Amount will be updated", icon: "card-outline", accent: "blue" },
  { label: "Place your order", icon: "bag-handle-outline", accent: "red" },
] as const;

/* ── Customer ───────────────────────────────────────────────────────────── */

export type AddressType = "Home" | "Work" | "Other" | "Hostel";

export interface Address {
  id: string;
  label: string;
  type: AddressType;
  receiver: string;
  phone: string;
  line: string;
  city: string;
  isDefault: boolean;
  /**
   * Where the door actually is.
   *
   * The rider's route and the customer's tracking map both need a point, not
   * a line of text. Optional because an address typed on the address screen
   * has none until it is located.
   */
  latitude?: number;
  longitude?: number;
}

export const addresses: Address[] = [
  {
    id: "a1",
    label: "Home",
    type: "Home",
    receiver: "Mohan Kumar",
    phone: "+91 91234 56789",
    line: "2nd Cross, Srinivas Nagar, Near Srinivas Park",
    city: "Tirupati - 517501, Andhra Pradesh",
    isDefault: true,
    latitude: 13.6357,
    longitude: 79.4192,
  },
  {
    id: "a2",
    label: "Work",
    type: "Work",
    receiver: "Mohan Kumar",
    phone: "+91 91234 56789",
    line: "Reditoe India LLP, 4th Floor, MR Palli Road",
    city: "Tirupati - 517501, Andhra Pradesh",
    isDefault: false,
  },
  {
    id: "a3",
    label: "Parents Home",
    type: "Other",
    receiver: "Mohan Kumar",
    phone: "+91 98765 43210",
    line: "12-5-96/2, Leela Mahal Road",
    city: "Tirupati - 517502, Andhra Pradesh",
    isDefault: false,
  },
  {
    id: "a4",
    label: "Hostel Address",
    type: "Hostel",
    receiver: "Mohan Kumar",
    phone: "+91 99887 66554",
    line: "SV University Boys Hostel, Room No. 214",
    city: "Tirupati - 517502, Andhra Pradesh",
    isDefault: false,
  },
];

export const addressTypeStyle: Record<
  AddressType,
  { icon: "home" | "briefcase" | "heart" | "business"; accent: AccentKey }
> = {
  Home: { icon: "home", accent: "red" },
  Work: { icon: "briefcase", accent: "amber" },
  Other: { icon: "heart", accent: "purple" },
  Hostel: { icon: "business", accent: "green" },
};

export const customer = {
  name: "Mohan Kumar",
  phone: "+91 91234 56789",
  email: "mohan.kumar@email.com",
  verified: true,
  rating: 4.6,
  walletBalance: 250,
  reditoeMoney: 0,
  orderCount: 128,
  favouriteCount: 12,
  couponCount: 8,
  memberSince: "2025-05-16",
};

export const membership = {
  name: "Reditoe Plus",
  active: true,
  plan: "Monthly Plan",
  memberSince: "16 May 2025",
  validTill: "16 Jun 2026",
  autoRenewal: true,
  tagline: "Enjoy FREE delivery & exclusive offers",
};

/* ── Wallet, payments and refunds ───────────────────────────────────────── */

export interface WalletTxn {
  id: string;
  title: string;
  detail: string;
  amount: number;
  at: string;
  icon: "wallet" | "bag-handle" | "business" | "gift";
  accent: AccentKey;
}

export const walletTransactions: WalletTxn[] = [
  {
    id: "w1",
    title: "Added to Wallet",
    detail: "UPI · mohan@ibl",
    amount: 250,
    at: "Today, 10:23 AM",
    icon: "wallet",
    accent: "green",
  },
  {
    id: "w2",
    title: "Used for Order",
    detail: "Order ID: #RT1234567890",
    amount: -187,
    at: "Today, 10:23 AM",
    icon: "bag-handle",
    accent: "blue",
  },
  {
    id: "w3",
    title: "Added to Wallet",
    detail: "UPI · mohan@oksbi",
    amount: 300,
    at: "15 Jul 2026, 7:45 PM",
    icon: "wallet",
    accent: "green",
  },
  {
    id: "w4",
    title: "Sent to Bank",
    detail: "HDFC Bank — 1234",
    amount: -500,
    at: "12 Jul 2026, 1:30 PM",
    icon: "business",
    accent: "purple",
  },
  {
    id: "w5",
    title: "Cashback Received",
    detail: "From Reditoe Offers",
    amount: 50,
    at: "10 Jul 2026, 9:10 AM",
    icon: "gift",
    accent: "amber",
  },
];

export const savedBank = { name: "HDFC Bank — 1234", masked: "XXXXXXXX1234" };

export interface PaymentMethod {
  id: string;
  kind: "UPI" | "Card" | "Wallet";
  name: string;
  detail: string;
  brand: string;
  badge?: string;
  badgeTone?: "ok" | "brand";
}

export const paymentMethods: PaymentMethod[] = [
  {
    id: "pm1",
    kind: "UPI",
    name: "mohan@ibl",
    detail: "UPI ID",
    brand: "UPI",
    badge: "Primary",
    badgeTone: "ok",
  },
  {
    id: "pm2",
    kind: "Card",
    name: "HDFC Bank Credit Card",
    detail: "•••• 1234",
    brand: "VISA",
    badge: "Default",
    badgeTone: "brand",
  },
  {
    id: "pm3",
    kind: "Card",
    name: "Kotak Bank Debit Card",
    detail: "•••• 5678",
    brand: "MC",
  },
  {
    id: "pm4",
    kind: "Wallet",
    name: "Reditoe Wallet",
    detail: "Balance: ₹250.00",
    brand: "₹",
  },
];

export const savedUpiIds = [
  { id: "u1", handle: "mohan@ibl", bank: "Indian Bank", accent: "purple" as AccentKey },
  { id: "u2", handle: "mohan@okicici", bank: "ICICI Bank", accent: "amber" as AccentKey },
];

export const upiApps = ["GPay", "PhonePe", "Paytm", "BHIM"];

export interface PaymentRecord {
  id: string;
  title: string;
  orderId: string;
  at: string;
  amount: number;
  status: "Paid" | "Refunded";
}

export const recentPayments: PaymentRecord[] = [
  {
    id: "p1",
    title: "Order at Spice Nest Kitchen",
    orderId: "#RT1234567890",
    at: "16 Jul 2026, 10:23 AM",
    amount: 487,
    status: "Paid",
  },
  {
    id: "p2",
    title: "Order at Pizza Express",
    orderId: "#RT9876543210",
    at: "15 Jul 2026, 07:30 PM",
    amount: 299,
    status: "Paid",
  },
  {
    id: "p3",
    title: "Order at Burger Point",
    orderId: "#RT5647382910",
    at: "15 Jul 2026, 01:15 PM",
    amount: 350,
    status: "Paid",
  },
  {
    id: "p4",
    title: "Refund from South Tiffins",
    orderId: "#RT1928374650",
    at: "14 Jul 2026, 11:20 AM",
    amount: 120,
    status: "Refunded",
  },
  {
    id: "p5",
    title: "Refund from Sai Andhra Mess",
    orderId: "#RT1122334455",
    at: "12 Jul 2026, 09:30 PM",
    amount: 410,
    status: "Refunded",
  },
];

export const refundReasons = [
  { id: "rr1", label: "Food Not\nDelivered", icon: "bicycle-outline", accent: "red" },
  { id: "rr2", label: "Food Quality\nIssue", icon: "restaurant-outline", accent: "orange" },
  { id: "rr3", label: "Missing Items", icon: "bag-remove-outline", accent: "amber" },
  { id: "rr4", label: "Wrong Item\nDelivered", icon: "swap-horizontal-outline", accent: "blue" },
  { id: "rr5", label: "Other Issue", icon: "refresh-circle-outline", accent: "green" },
] as const;

export interface RefundRequest {
  id: string;
  orderId: string;
  restaurantId: string;
  placedAt: string;
  reason: string;
  amount: number;
  status: "Refund In Progress" | "Refund Completed" | "Request Received";
  note: string;
}

export const refundRequests: RefundRequest[] = [
  {
    id: "rf1",
    orderId: "#RT1234567890",
    restaurantId: "r1",
    placedAt: "16 Jul 2026, 10:23 AM",
    reason: "Food Quality Issue",
    amount: 249,
    status: "Refund In Progress",
    note: "Expected resolution: 17 Jul 2026",
  },
  {
    id: "rf2",
    orderId: "#RT9876543210",
    restaurantId: "r2",
    placedAt: "15 Jul 2026, 07:30 PM",
    reason: "Wrong Item Delivered",
    amount: 299,
    status: "Refund Completed",
    note: "Refunded on: 15 Jul 2026",
  },
  {
    id: "rf3",
    orderId: "#RT5647382910",
    restaurantId: "r5",
    placedAt: "12 Jul 2026, 01:15 PM",
    reason: "Missing Items",
    amount: 187,
    status: "Request Received",
    note: "Expected resolution: 13 Jul 2026",
  },
];

/* ── Reditoe Plus ───────────────────────────────────────────────────────── */

export const plusBenefits = [
  {
    id: "b1",
    title: "Unlimited FREE Delivery",
    detail: "No delivery fee on all orders, every time.",
    tag: "Unlimited",
    icon: "bicycle",
    accent: "green" as AccentKey,
  },
  {
    id: "b2",
    title: "Exclusive Discounts",
    detail: "Save more with member exclusive discounts.",
    tag: "Up to 20% OFF",
    icon: "pricetag",
    accent: "purple" as AccentKey,
  },
  {
    id: "b3",
    title: "Extra Coupons Every Month",
    detail: "Get new coupons added every month.",
    tag: "Extra Savings",
    icon: "ticket",
    accent: "amber" as AccentKey,
  },
  {
    id: "b4",
    title: "Wallet Rewards",
    detail: "Earn cashback in Reditoe Wallet on every order.",
    tag: "Up to 5% Cashback",
    icon: "wallet",
    accent: "blue" as AccentKey,
  },
  {
    id: "b5",
    title: "Priority Support",
    detail: "Get priority help from our support team 24/7.",
    tag: "24/7 Priority",
    icon: "headset",
    accent: "red" as AccentKey,
  },
  {
    id: "b6",
    title: "Early Access",
    detail: "Be the first to try new features and offers.",
    tag: "Early Access",
    icon: "sparkles",
    accent: "orange" as AccentKey,
  },
  {
    id: "b7",
    title: "Group Order Benefits",
    detail: "Extra savings on group orders & treats.",
    tag: "Group Deals",
    icon: "people",
    accent: "green" as AccentKey,
  },
  {
    id: "b8",
    title: "Birthday Surprises",
    detail: "Special birthday offers & surprises just for you.",
    tag: "Birthday Bonus",
    icon: "gift",
    accent: "pink" as AccentKey,
  },
] as const;

export const plusSavings = [
  { id: "s1", figure: "₹1,250+", label: "Saved on delivery charges", icon: "bicycle", accent: "green" },
  { id: "s2", figure: "₹980+", label: "Saved on restaurant discounts", icon: "pricetag", accent: "purple" },
  { id: "s3", figure: "₹560+", label: "Saved on coupons & offers", icon: "ticket", accent: "amber" },
  { id: "s4", figure: "₹350+", label: "Earned as wallet rewards", icon: "wallet", accent: "blue" },
] as const;

export const plusSteps = [
  { id: "st1", title: "1. Join Plus", detail: "Activate your Reditoe Plus membership", icon: "ribbon", accent: "purple" },
  { id: "st2", title: "2. Order", detail: "Place your favorite orders", icon: "bag-handle", accent: "red" },
  { id: "st3", title: "3. Enjoy Benefits", detail: "Get free delivery, discounts & exclusive offers", icon: "pricetag", accent: "green" },
  { id: "st4", title: "4. Save More", detail: "Save more on every order you place", icon: "wallet", accent: "amber" },
] as const;

export const plusComparison = [
  { label: "Delivery Charges", regular: "₹40 per order", plus: "FREE" },
  { label: "Restaurant Discounts", regular: "Up to 10% OFF", plus: "Up to 20% OFF" },
  { label: "Exclusive Coupons", regular: "Limited", plus: "Unlimited" },
  { label: "Customer Support", regular: "Standard", plus: "Priority (24/7)" },
  { label: "New Feature Access", regular: "Later", plus: "Early Access" },
];

export const plusFaqs = [
  "What is Reditoe Plus?",
  "What are the benefits of Reditoe Plus?",
  "How do I activate Reditoe Plus membership?",
  "Is Reditoe Plus membership refundable?",
  "How do I cancel my membership?",
];

export const plusReviews = [
  { id: "pr1", name: "Rohit Sharma", quote: "Free delivery on every order is a game changer! Totally worth it." },
  { id: "pr2", name: "Anjali Mehta", quote: "Got amazing discounts at my favorite restaurants. Love being a Plus member!" },
  { id: "pr3", name: "Vikram Patel", quote: "Customer support is super quick and helpful. Great experience!" },
];

/** "Member Only Combos" — the rail on the combos screen. */
export const memberCombos = [
  { id: "mc1", name: "Burger Combo", photo: "burger" as PhotoKey, badge: "Save 20%", price: "Starting at ₹199", tag: "20% OFF", accent: "red" as AccentKey },
  { id: "mc2", name: "Pizza Party", photo: "pizza" as PhotoKey, badge: "Save 15%", price: "Starting at ₹249", tag: "15% OFF", accent: "red" as AccentKey },
  { id: "mc3", name: "Biryani Special", photo: "biryani" as PhotoKey, badge: "Free Cola", price: "Free Cola (300ml)", tag: "On orders above ₹249", accent: "purple" as AccentKey },
  { id: "mc4", name: "Sweet Treat", photo: "cake" as PhotoKey, badge: "Save 10%", price: "10% OFF", tag: "On all desserts", accent: "red" as AccentKey },
];

/** "Why Choose Reditoe Plus?" — the reassurance strip on the features screen. */
export const plusReasons = [
  { id: "w1", label: "Secure & Safe\nTransactions", icon: "shield-checkmark" as const, accent: "green" as AccentKey },
  { id: "w2", label: "No Hidden\nCharges", icon: "settings" as const, accent: "purple" as AccentKey },
  { id: "w3", label: "Easy Cancel\nAnytime", icon: "time" as const, accent: "amber" as AccentKey },
  { id: "w4", label: "Pause Anytime\nHassle-free", icon: "pause" as const, accent: "blue" as AccentKey },
  { id: "w5", label: "Best Value for\nFood Lovers", icon: "pricetag" as const, accent: "red" as AccentKey },
];

/** "How Reditoe Plus adds more value!" — the five-across strip. */
export const plusValuePoints = [
  { id: "v1", title: "Unlimited\nFREE Delivery", detail: "On all orders, every time", icon: "bicycle" as const, accent: "red" as AccentKey },
  { id: "v2", title: "Exclusive\nDiscounts", detail: "Save more on your favorites", icon: "pricetag" as const, accent: "purple" as AccentKey },
  { id: "v3", title: "Extra Coupons\nEvery Month", detail: "Member-only coupons & offers", icon: "ticket" as const, accent: "amber" as AccentKey },
  { id: "v4", title: "Wallet Rewards", detail: "Earn cashback on every order", icon: "wallet" as const, accent: "green" as AccentKey },
  { id: "v5", title: "Priority Support", detail: "24/7 priority assistance", icon: "headset" as const, accent: "blue" as AccentKey },
];

/** The Plus screens, so each one can link to the others. */
export const plusScreens = [
  { href: "/plus", label: "Benefits" },
  { href: "/plus/offers", label: "Member Offers" },
  { href: "/plus/more-benefits", label: "More Benefits" },
  { href: "/plus/combos", label: "Combos & Savings" },
  { href: "/plus/membership", label: "Membership" },
  { href: "/plus/features", label: "Features" },
] as const;

export const memberOffers = [
  { id: "mo1", restaurantId: "r2", badge: "20% OFF", title: "Up to 20% OFF", detail: "on all orders", validTill: "31 Jul" },
  { id: "mo2", restaurantId: "r5", badge: "15% OFF", title: "15% OFF", detail: "on minimum ₹199", validTill: "28 Jul" },
  { id: "mo3", restaurantId: "r3", badge: "FREE ITEM", title: "Free Cola (300ml)", detail: "on orders above ₹249", validTill: "30 Jul" },
  { id: "mo4", restaurantId: "r7", badge: "10% OFF", title: "10% OFF", detail: "on all desserts", validTill: "27 Jul" },
];

/* ── Delivery ───────────────────────────────────────────────────────────── */

export const deliveryPartner = {
  name: "Ramesh Kumar",
  rating: 4.8,
  ratingCount: 512,
  phone: "+91 98765 43210",
  vehicle: "Bike",
  plate: "AP39 AB 1234",
};

export const trustPoints = [
  { icon: "bicycle-outline", title: "Fast Delivery", detail: "at your door" },
  { icon: "bag-handle-outline", title: "No Minimum", detail: "Order" },
  { icon: "shield-checkmark-outline", title: "Safe & Hygienic", detail: "Food" },
  { icon: "headset-outline", title: "24/7 Customer", detail: "Support" },
] as const;

export const exploreTiles = [
  { id: "x1", title: "Top Rated", detail: "Best of the Best", icon: "trophy", accent: "amber" },
  { id: "x2", title: "Pure Veg", detail: "100% Veg Options", icon: "leaf", accent: "green" },
  { id: "x3", title: "Near Me", detail: "Restaurants near you", icon: "location", accent: "blue" },
  { id: "x4", title: "Newly Added", detail: "New on Reditoe", icon: "sparkles", accent: "orange" },
] as const;

/* ── Lookups ────────────────────────────────────────────────────────────── */

export const restaurantById = (id: string) => restaurants.find((r) => r.id === id);

export const dishById = (id: string) => dishes.find((d) => d.id === id);

export const dishesForRestaurant = (restaurantId: string) =>
  dishes.filter((d) => d.restaurantId === restaurantId);

export const combosForRestaurant = (restaurantId: string) =>
  combos.filter((c) => c.restaurantId === restaurantId);

export const popularDishes = () => dishes.filter((d) => d.tag).slice(0, 6);

export const accentFor = (key: AccentKey) => accents[key];
