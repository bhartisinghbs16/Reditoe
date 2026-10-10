"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LifeBuoy } from "lucide-react";
import { isActive, navigation, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { BrandLockup } from "@/components/shell/brand";

function LiveChip() {
  return (
    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-success-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-success-foreground">
      <span className="size-1.5 rounded-full bg-success" />
      Live
    </span>
  );
}

function ChildRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "relative flex items-center gap-2 rounded-md py-[0.3rem] pr-2 pl-3 text-xs transition-colors",
        active
          ? "font-medium text-white"
          : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 left-0 h-3.5 w-0.5 -translate-y-1/2 rounded-full transition-colors",
          active ? "bg-primary" : "bg-transparent"
        )}
      />
      <span className="truncate">{item.label}</span>
      {item.badge === "live" && <LiveChip />}
    </Link>
  );
}

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const hasChildren = Boolean(item.children?.length);
  const branchActive = isActive(pathname, item.href);

  // Open when you're inside the branch, but still user-controllable after that.
  // Adjusted during render rather than in an effect, so entering a branch
  // doesn't cost a second render pass.
  const [open, setOpen] = React.useState(branchActive);
  const [wasActive, setWasActive] = React.useState(branchActive);
  if (branchActive !== wasActive) {
    setWasActive(branchActive);
    if (branchActive) setOpen(true);
  }

  const Icon = item.icon;

  if (!hasChildren) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "group flex items-center gap-2 rounded-md py-[0.4rem] px-2.5 text-[0.8125rem] transition-colors",
          branchActive
            ? "bg-primary font-medium text-white shadow-sm"
            : "text-sidebar-foreground hover:bg-white/5 hover:text-white"
        )}
      >
        {Icon && <Icon className="size-4 shrink-0" />}
        <span className="truncate">{item.label}</span>
        {item.badge === "live" && <LiveChip />}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2.5 py-[0.4rem] text-[0.8125rem] transition-colors",
          branchActive
            ? "bg-primary font-medium text-white shadow-sm"
            : "text-sidebar-foreground hover:bg-white/5 hover:text-white"
        )}
      >
        {Icon && <Icon className="size-4 shrink-0" />}
        <span className="truncate">{item.label}</span>
        <ChevronRight
          className={cn(
            "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-90"
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
          <div className="mt-0.5 ml-[1.15rem] flex flex-col gap-px border-l border-white/10 pl-2">
            {item.children!.map((child) => (
              <ChildRow
                key={child.href}
                item={child}
                onNavigate={onNavigate}
                active={
                  // An exact match only — otherwise "All Orders" (/orders) would
                  // stay lit while you're on /orders/refunds.
                  pathname === child.href
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * `onNavigate` closes the mobile drawer. It fires from the links themselves —
 * doing it in an effect keyed on the pathname would also fire on mount, which
 * is exactly when the drawer opens, slamming it shut again.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 shrink-0 items-center border-b border-white/10 px-3">
        <Link href="/dashboard" onClick={onNavigate} className="min-w-0">
          <BrandLockup />
        </Link>
      </div>

      <nav className="scrollbar-slim flex-1 overflow-y-auto px-2 py-2">
        {navigation.map((section, index) => (
          <div key={section.title} className={cn(index > 0 && "mt-3")}>
            <div className="label-eyebrow px-3 pb-2 text-white/35">
              {section.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavRow key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Help card, as the reference places at the foot of the sidebar. */}
      <div className="shrink-0 p-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-white/70" />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-white">Need Help?</p>
              <p className="text-[0.6875rem] text-white/50">Contact Support</p>
            </div>
          </div>
          <Link
            href="/support"
            onClick={onNavigate}
            className="mt-2 flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary text-[0.8125rem] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <LifeBuoy className="size-3.5" />
            Create Ticket
          </Link>
        </div>
      </div>
    </div>
  );
}
