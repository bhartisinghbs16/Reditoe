import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  Home,
  Settings,
  Star,
  Store,
  Tag,
  UtensilsCrossed,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  /** Which live counter, if any, is pinned to the right of the row. */
  badge?: "orders";
  children?: NavItem[];
}

/**
 * Vendor navigation — one flat list, in the reference's order and wording.
 *
 * The reference sidebar has no section headers: a restaurant owner works a
 * handful of screens all day, so everything is one click from anywhere.
 */
export const navigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  {
    label: "Orders",
    href: "/orders",
    icon: ClipboardList,
    badge: "orders",
    children: [
      { label: "Live Orders", href: "/orders" },
      { label: "Order History", href: "/orders/history" },
    ],
  },
  { label: "Menu Management", href: "/menu", icon: UtensilsCrossed },
  { label: "Offers & Coupons", href: "/offers", icon: Tag },
  { label: "Payments", href: "/earnings", icon: CreditCard },
  { label: "Reports & Analytics", href: "/insights", icon: BarChart3 },
  { label: "Reviews", href: "/reviews", icon: Star },
  { label: "Restaurant Profile", href: "/store", icon: Store },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const flatNavigation: NavItem[] = navigation.flatMap((item) => [
  item,
  ...(item.children ?? []),
]);

/** True when `href` is the current route or an ancestor of it. */
export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The title and one-line subtitle the topbar prints for each route.
 *
 * The reference puts the page title in the topbar rather than in the page
 * body, so it lives here — resolved from the route on the server, which keeps
 * it correct on first paint instead of arriving a frame after the content.
 * Longest matching prefix wins.
 */
export const PAGE_META: Record<string, { title: string; description: string }> = {
  "/dashboard": {
    title: "Dashboard",
    description: "Overview of your restaurant performance",
  },
  "/orders": {
    title: "Orders Management",
    description: "Manage and track all restaurant orders",
  },
  "/orders/history": {
    title: "Order History",
    description: "Every order this restaurant has taken",
  },
  "/menu": {
    title: "Menu Management",
    description: "Manage your restaurant menu and items",
  },
  "/offers": {
    title: "Offers & Coupons",
    description: "Create and manage offers to get more orders",
  },
  "/earnings": {
    title: "Payments",
    description: "Track earnings and manage payouts",
  },
  "/insights": {
    title: "Reports & Analytics",
    description: "Track performance and grow your business",
  },
  "/reviews": {
    title: "Reviews & Ratings",
    description: "What customers said, and what you said back",
  },
  "/store": {
    title: "Restaurant Profile",
    description: "Your outlet details, timings and documents",
  },
  "/settings": {
    title: "Settings",
    description: "Manage your restaurant account and preferences",
  },
};

export function pageMetaFor(pathname: string) {
  let best = PAGE_META["/dashboard"];
  let bestLength = -1;
  for (const [href, meta] of Object.entries(PAGE_META)) {
    if (isActive(pathname, href) && href.length > bestLength) {
      best = meta;
      bestLength = href.length;
    }
  }
  return best;
}
