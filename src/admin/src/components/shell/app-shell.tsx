"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSession } from "@/components/providers";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette, useCommandPalette } from "@/components/shell/command-palette";
import { BrandMark } from "@/components/shell/brand";
import { hueForRoute } from "@/lib/accent";
import { cn } from "@/lib/utils";

function BootScreen() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3">
      <BrandMark className="animate-pulse" />
      <p className="text-sm text-muted-foreground">Loading console…</p>
    </div>
  );
}

/** Very light top wash per area — tint, not colour-fill. */
const WASH: Record<string, string> = {
  indigo: "from-indigo-100/60",
  violet: "from-violet-100/60",
  emerald: "from-emerald-100/60",
  amber: "from-amber-100/60",
  sky: "from-sky-100/60",
  rose: "from-rose-100/60",
  teal: "from-teal-100/60",
  fuchsia: "from-fuchsia-100/60",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const palette = useCommandPalette();

  React.useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return <BootScreen />;

  return (
    <div className="flex min-h-svh">
      {/* Desktop sidebar — fixed so long tables scroll independently. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[14rem] border-r border-sidebar-border lg:block">
        <SidebarNav />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[14rem] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[14rem]">
        <Topbar
          onOpenSidebar={() => setDrawerOpen(true)}
          onOpenSearch={() => palette.setOpen(true)}
        />
        <main className="relative flex-1 px-4 py-4 lg:px-5 lg:py-5">
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b to-transparent",
              WASH[hueForRoute(pathname)] ?? WASH.indigo,
              "dark:opacity-[0.07]"
            )}
          />
          <div className="relative mx-auto w-full max-w-[110rem]">{children}</div>
        </main>
      </div>

      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
    </div>
  );
}
