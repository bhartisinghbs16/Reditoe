import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Marks a panel whose numbers are sample data rather than measurements.
 *
 * This backend has no vendor endpoint for reviews, coupons or the analytics
 * breakdowns, so those panels still read fixtures. Saying so on the panel is
 * the difference between a placeholder and a lie: a vendor must never plan
 * around a figure the platform never sent.
 */
export function FixtureNote({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-md bg-muted/70 px-2 py-1.5 text-[0.6875rem] text-muted-foreground",
        className
      )}
    >
      <Info className="mt-px size-3 shrink-0" />
      <span className="text-pretty">{children}</span>
    </p>
  );
}
