import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

/**
 * Name + secondary line with an avatar. The single pattern used wherever a
 * person or business identifies a row (customers, riders, restaurants).
 */
export function IdentityCell({
  name,
  secondary,
  image,
  fallbackClassName,
  square,
  className,
}: {
  name: string | null | undefined;
  secondary?: React.ReactNode;
  image?: string | null;
  fallbackClassName?: string;
  /** Businesses read better as a rounded square than a circle. */
  square?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar className={cn("size-8 shrink-0", square && "rounded-lg")}>
        {image && <AvatarImage src={image} alt="" className={cn(square && "rounded-lg")} />}
        <AvatarFallback
          className={cn(
            "bg-muted text-[0.6875rem] font-semibold text-muted-foreground",
            square && "rounded-lg",
            fallbackClassName
          )}
        >
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate font-medium">{name ?? "—"}</div>
        {secondary !== undefined && (
          <div className="truncate text-xs text-muted-foreground">{secondary}</div>
        )}
      </div>
    </div>
  );
}

/** Primary value with a muted supporting line underneath. */
export function StackedCell({
  primary,
  secondary,
  className,
  numeric,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <div className={cn("min-w-0", className)} data-numeric={numeric || undefined}>
      <div className="truncate font-medium">{primary}</div>
      {secondary !== undefined && (
        <div className="truncate text-xs text-muted-foreground">{secondary}</div>
      )}
    </div>
  );
}

export function MutedCell({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
