"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Bell,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/components/providers";
import { initials } from "@/lib/format";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="text-muted-foreground"
    >
      {/* Both icons render; CSS picks one. Deciding in JS would need a mounted
          flag to avoid a hydration mismatch, and that costs an extra render. */}
      <Moon className="size-[1.15rem] dark:hidden" />
      <Sun className="hidden size-[1.15rem] dark:block" />
    </Button>
  );
}

export function Topbar({
  onOpenSidebar,
  onOpenSearch,
  notificationCount = 0,
}: {
  onOpenSidebar: () => void;
  onOpenSearch: () => void;
  notificationCount?: number;
}) {
  const { user, signOut } = useSession();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md lg:px-6">
      <Button
        variant="ghost"
        size="icon-lg"
        className="lg:hidden"
        aria-label="Open navigation"
        onClick={onOpenSidebar}
      >
        <Menu className="size-5" />
      </Button>

      {/* Search opens the palette rather than being a real input — one search
          surface, reachable by click or ⌘K. */}
      {/* min-w-0 is load-bearing: a flex item defaults to min-width:auto, so
          without it this button refuses to shrink below its placeholder text
          and pushes the whole page wider than a phone viewport. */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="group flex h-9 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:bg-muted/50"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">
          <span className="sm:hidden">Search…</span>
          <span className="hidden sm:inline">
            Search orders, customers, restaurants…
          </span>
        </span>
        <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground sm:inline-flex">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-0.5">
        <ThemeToggle />

        <Button
          asChild
          variant="ghost"
          size="icon-lg"
          className="relative text-muted-foreground"
        >
          <Link href="/notifications" aria-label="Notifications">
            <Bell className="size-[1.15rem]" />
            {notificationCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] leading-4 font-semibold text-white">
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            )}
          </Link>
        </Button>

        <div className="mx-1.5 h-6 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-muted"
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white">
                  {initials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[0.8125rem] font-medium">
                  {user?.name ?? "Administrator"}
                </span>
                <span className="block text-[0.6875rem] text-muted-foreground capitalize">
                  {user?.role ?? "admin"}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="text-sm font-medium">{user?.name ?? "Administrator"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {user?.email ?? "—"}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/system/profile">
                <UserRound className="size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/system/settings">
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={signOut}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
