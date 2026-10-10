import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The row of controls the reference floats between the topbar and the first
 * card — a date range on the dashboard, an export button on analytics.
 *
 * The page *title* is not here: the reference prints it in the topbar, and the
 * shell resolves it from the route.
 */
export function PageActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center justify-end gap-2",
        className
      )}
    >
      {children}
    </div>
  );
}

