import {
  Activity,
  BadgePercent,
  BarChart3,
  Bike,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  Gauge,
  Headset,
  Image as ImageIcon,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessageSquareWarning,
  Percent,
  Receipt,
  FileText,
  MapPin,
  Scale,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  UserRound,
  UsersRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  children?: NavItem[];
  /** Rendered as a small chip on the right of the row. */
  badge?: "live";
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        label: "Orders",
        href: "/orders",
        icon: ShoppingBag,
        children: [
          { label: "All Orders", href: "/orders" },
          { label: "Live Tracking", href: "/orders/live", badge: "live" },
          { label: "Order Analytics", href: "/orders/analytics" },
          { label: "Returns & Refunds", href: "/orders/refunds" },
        ],
      },
      {
        label: "Customers",
        href: "/customers",
        icon: UsersRound,
        children: [
          { label: "All Customers", href: "/customers" },
          { label: "Customer Groups", href: "/customers/groups" },
          { label: "Customer Analytics", href: "/customers/analytics" },
        ],
      },
      {
        label: "Restaurants",
        href: "/restaurants",
        icon: Store,
        children: [
          { label: "All Restaurants", href: "/restaurants" },
          { label: "Add Restaurant", href: "/restaurants/new" },
          { label: "Categories", href: "/restaurants/categories" },
          { label: "Cuisines", href: "/restaurants/cuisines" },
          { label: "KYC & Documents", href: "/restaurants/kyc" },
          { label: "Performance", href: "/restaurants/performance" },
        ],
      },
      {
        label: "Serviceability",
        href: "/serviceability",
        icon: MapPin,
      },
      {
        label: "Delivery Partners",
        href: "/partners",
        icon: Bike,
        children: [
          { label: "All Partners", href: "/partners" },
          { label: "Live Map", href: "/partners/live" },
          { label: "Add Partner", href: "/partners/new" },
          { label: "Documents", href: "/partners/documents" },
          { label: "Performance", href: "/partners/performance" },
          { label: "Earnings", href: "/partners/earnings" },
          { label: "Withdrawals", href: "/partners/withdrawals" },
        ],
      },
      {
        label: "Menu Management",
        href: "/menu",
        icon: UtensilsCrossed,
        children: [
          { label: "Menu Items", href: "/menu" },
          { label: "Categories", href: "/menu/categories" },
          { label: "Combos & Add-ons", href: "/menu/combos" },
        ],
      },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Overview", href: "/finance", icon: Gauge },
      { label: "Transactions", href: "/finance/transactions", icon: CreditCard },
      { label: "Settlements", href: "/finance/settlements", icon: Scale },
      { label: "Vendor Payouts", href: "/finance/payouts", icon: Wallet },
      { label: "Commission & Fees", href: "/finance/commission", icon: Percent },
      { label: "Invoices", href: "/finance/invoices", icon: Receipt },
      { label: "GST Management", href: "/finance/gst", icon: FileText },
      { label: "Wallets", href: "/finance/wallets", icon: Landmark },
    ],
  },
  {
    title: "Marketing",
    items: [
      { label: "Offers & Coupons", href: "/marketing/offers", icon: BadgePercent },
      { label: "Campaigns", href: "/marketing/campaigns", icon: Megaphone },
      { label: "Push Notifications", href: "/marketing/notifications", icon: Send },
      { label: "Banners", href: "/marketing/banners", icon: ImageIcon },
      { label: "Referrals", href: "/marketing/referrals", icon: UsersRound },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Reports", href: "/reports", icon: FileSpreadsheet },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Reviews & Ratings", href: "/reviews", icon: Star },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Support Tickets", href: "/support", icon: Headset },
      { label: "Disputes", href: "/support/disputes", icon: MessageSquareWarning },
      { label: "Tasks", href: "/support/tasks", icon: ClipboardList },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Users & Roles", href: "/system/roles", icon: ShieldCheck },
      { label: "Settings", href: "/system/settings", icon: Settings },
      { label: "Activity Logs", href: "/system/activity", icon: Activity },
    ],
  },
];

/** Flat index used by breadcrumbs, the command palette and page titles. */
export interface FlatNavEntry {
  label: string;
  href: string;
  section: string;
  parent?: string;
  icon?: LucideIcon;
}

export const flatNavigation: FlatNavEntry[] = navigation.flatMap((section) =>
  section.items.flatMap((item) => {
    const self: FlatNavEntry = {
      label: item.label,
      href: item.href,
      section: section.title,
      icon: item.icon,
    };
    const children = (item.children ?? [])
      // The first child usually duplicates the parent href.
      .filter((child) => child.href !== item.href)
      .map<FlatNavEntry>((child) => ({
        label: child.label,
        href: child.href,
        section: section.title,
        parent: item.label,
        icon: item.icon,
      }));
    return [self, ...children];
  })
);

/** Extra destinations that are reachable but not in the sidebar. */
export const auxiliaryRoutes: FlatNavEntry[] = [
  { label: "Your profile", href: "/system/profile", section: "System", icon: UserRound },
  { label: "Alerts inbox", href: "/notifications", section: "System", icon: LifeBuoy },
];

/**
 * Longest-prefix match, so `/orders/RT-1024` still highlights "Orders".
 * `/` alone must never match everything.
 */
export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
