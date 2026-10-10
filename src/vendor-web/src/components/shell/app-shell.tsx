"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  LogOut,
  Maximize2,
  Minimize2,
  Menu as MenuIcon,
  Megaphone,
  RefreshCw,
  Settings as SettingsIcon,
  Store,
  TriangleAlert,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isActive, navigation, pageMetaFor, type NavItem } from "@/lib/nav";
import { useAuth, useAuthRedirect } from "@/lib/auth";
import { ApplicationGate } from "@/components/shell/application-gate";
import { initials } from "@/lib/format";
import { useVendor } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ── Brand ──────────────────────────────────────────────────────────────── */

/**
 * The Reditoe lockup as the reference draws it: the red wordmark, the legal
 * name beneath it, and the strapline ruled off on both sides.
 */
function BrandLockup({ compact }: { compact?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col items-center leading-none">
      <span className="text-[1.375rem] font-extrabold tracking-tight text-primary">
        Reditoe
      </span>
      {!compact && (
        <>
          <span className="mt-0.5 text-[0.6875rem] font-bold tracking-[0.14em] text-foreground">
            INDIA LLP
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <span className="h-px w-3 bg-primary/50" />
            <span className="text-[0.5625rem] font-semibold tracking-[0.08em] text-primary italic">
              Ready To Eat
            </span>
            <span className="h-px w-3 bg-primary/50" />
          </span>
        </>
      )}
    </span>
  );
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { liveCount } = useVendor();
  const hasChildren = Boolean(item.children?.length);
  const branchActive = isActive(pathname, item.href);

  const [open, setOpen] = React.useState(branchActive);
  const [wasActive, setWasActive] = React.useState(branchActive);
  if (branchActive !== wasActive) {
    setWasActive(branchActive);
    if (branchActive) setOpen(true);
  }

  const Icon = item.icon;
  const badge = item.badge === "orders" ? liveCount : 0;

  // The reference marks the current section with a red-tinted pill — the icon,
  // the label and the background all turn brand red together.
  const rowClass = cn(
    "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[0.8125rem] transition-colors",
    branchActive
      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
      : "font-medium text-sidebar-foreground hover:bg-muted"
  );

  const row = (
    <>
      {Icon && <Icon className="size-[1.125rem] shrink-0" />}
      <span className="truncate">{item.label}</span>
      {badge > 0 && (
        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-bold text-primary-foreground tabular-nums">
          {badge}
        </span>
      )}
    </>
  );

  if (!hasChildren) {
    return (
      <Link href={item.href} onClick={onNavigate} className={rowClass}>
        {row}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={rowClass}
      >
        {row}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            badge > 0 ? "ml-1.5" : "ml-auto",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-0.5 ml-[1.65rem] flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
            {item.children!.map((child) => {
              const childActive = pathname === child.href;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onNavigate}
                  className={cn(
                    "relative rounded-md py-1.5 pr-2 pl-2.5 text-[0.8125rem] transition-colors",
                    childActive
                      ? "font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1/2 -left-px h-4 w-0.5 -translate-y-1/2 rounded-full",
                      childActive ? "bg-primary" : "bg-transparent"
                    )}
                  />
                  {child.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The upsell card pinned to the foot of the reference sidebar. It is the one
 * piece of marketing in the console, so it gets the only tinted panel here.
 */
function PromoteCard() {
  return (
    <div className="m-3 rounded-xl border border-primary/15 bg-primary/5 p-4 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Megaphone className="size-5" />
      </span>
      <p className="mt-2.5 text-[0.8125rem] font-bold">Get more orders!</p>
      <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
        Share your restaurant and earn more visibility on Reditoe.
      </p>
      <Link
        href="/offers"
        className="mt-3 flex h-8 w-full items-center justify-center rounded-lg bg-primary text-[0.75rem] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Promote Now
      </Link>
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-[4.5rem] shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
        <MenuIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 justify-center"
        >
          <BrandLockup />
        </Link>
      </div>

      <nav className="scrollbar-slim flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-0.5">
          {navigation.map((item) => (
            <NavRow key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>

      <PromoteCard />
    </div>
  );
}

/* ── Topbar ─────────────────────────────────────────────────────────────── */

/**
 * The open/closed switch lives in the account menu rather than a settings page:
 * it is the most consequential control a vendor has, and it needs to be
 * reachable from wherever they happen to be standing.
 */
function AccountMenu() {
  const { profile, storeOpen, setStoreOpen } = useVendor();
  const { user, signOut } = useAuth();

  const name = profile?.name ?? user?.name ?? "Your restaurant";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg py-1 pr-1.5 pl-1 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50">
        <Avatar className="size-8">
          {profile?.image && <AvatarImage src={profile.image} alt="" />}
          <AvatarFallback className="bg-primary/10 text-[0.6875rem] font-semibold text-primary">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-[0.8125rem] leading-tight font-semibold">
            {name.replace(" Restaurant", "")}
          </span>
          <span className="block truncate text-[0.6875rem] leading-tight text-muted-foreground">
            Restaurant
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">
            {user?.email ?? profile?.phone ?? "—"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <span className="text-sm">
            Store status
            <span
              className={cn(
                "ml-1.5 text-xs font-semibold",
                storeOpen ? "text-emerald-600" : "text-muted-foreground"
              )}
            >
              {storeOpen ? "Open" : "Closed"}
            </span>
          </span>
          <Switch
            checked={storeOpen}
            onCheckedChange={setStoreOpen}
            aria-label="Store open"
          />
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/store">
            <Store className="size-4" />
            Restaurant Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={signOut}>
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { liveCount, storeOpen } = useVendor();
  const meta = pageMetaFor(pathname);
  const [fullscreen, setFullscreen] = React.useState(false);

  // Mirrors the browser's own state, so leaving fullscreen with Esc doesn't
  // leave the button claiming otherwise.
  React.useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // Some browsers refuse without a user gesture they recognise; the
        // console is perfectly usable windowed, so this is not worth a toast.
      });
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-[4.5rem] shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted lg:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon className="size-5" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.3125rem] leading-tight font-bold tracking-tight">
          {meta.title}
        </h1>
        <p className="truncate text-[0.8125rem] text-muted-foreground">
          {meta.description}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!storeOpen && (
          <span className="mr-1 hidden rounded-full bg-muted px-2.5 py-1 text-[0.6875rem] font-semibold text-muted-foreground sm:inline">
            Store closed
          </span>
        )}

        {/* The bell is a shortcut to the orders that need a decision — the
            only notification this console actually has. */}
        <button
          type="button"
          onClick={() => router.push("/orders")}
          className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={
            liveCount > 0
              ? `${liveCount} order${liveCount === 1 ? "" : "s"} need attention`
              : "No orders need attention"
          }
        >
          <Bell className="size-[1.15rem]" />
          {liveCount > 0 && (
            <span className="absolute top-1 right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.5625rem] font-bold text-primary-foreground tabular-nums">
              {liveCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="hidden size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
          aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}
        >
          {fullscreen ? (
            <Minimize2 className="size-[1.05rem]" />
          ) : (
            <Maximize2 className="size-[1.05rem]" />
          )}
        </button>

        <span className="mx-1 hidden h-7 w-px bg-border sm:block" />

        <AccountMenu />
      </div>
    </header>
  );
}

/* ── API state ──────────────────────────────────────────────────────────── */

/**
 * One banner for "the console is talking to a backend that isn't answering".
 * It lives in the shell so a vendor sees the same explanation on whichever
 * page they happen to be on, instead of each screen inventing an empty state
 * that looks like "you have no orders".
 */
function ApiBanner() {
  const { error, refetch } = useVendor();
  if (!error) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
      <TriangleAlert className="size-5 shrink-0 text-red-600" />
      <p className="min-w-0 flex-1 text-sm text-red-700 dark:text-red-200">
        {error.message}
      </p>
      <button
        type="button"
        onClick={refetch}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-card px-3 text-[0.8125rem] font-semibold text-red-600 transition-colors hover:bg-red-50"
      >
        <RefreshCw className="size-3.5" />
        Retry
      </button>
    </div>
  );
}

/* ── Shell ──────────────────────────────────────────────────────────────── */

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const { status, onLogin } = useAuthRedirect();

  // Nothing decisive until the stored token has been checked — rendering the
  // console or the login form early flashes the wrong one at the vendor.
  if (status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <span className="text-3xl font-extrabold tracking-tight text-primary">
          Reditoe
        </span>
      </div>
    );
  }

  // The login screen brings its own layout; and while the redirect to it is in
  // flight there is nothing worth painting.
  if (onLogin) return <>{children}</>;
  if (status === "anonymous") return null;

  return (
    /* Signed in, but not necessarily approved. The gate shows where the
       application stands instead of a dashboard for a restaurant that is not
       live yet, and lets it through untouched once it is. */
    <ApplicationGate>
    <div className="flex min-h-svh bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[16.5rem] border-r border-sidebar-border lg:block">
        <SidebarNav />
      </aside>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[16.5rem] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[16.5rem]">
        <Topbar onOpenSidebar={() => setDrawerOpen(true)} />
        <main className="flex-1 px-4 py-5 lg:px-6">
          <div className="mx-auto w-full max-w-[92rem]">
            <ApiBanner />
            {children}
          </div>
        </main>
      </div>
    </div>
    </ApplicationGate>
  );
}
