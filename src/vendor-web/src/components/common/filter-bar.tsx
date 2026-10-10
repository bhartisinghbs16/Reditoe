"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The reference's list toolbar: one wide search box with Filter and Sort
 * sitting beside it, then a strip of tabs underneath. Every list screen —
 * orders, menu, offers — uses the same three pieces in the same order.
 */
export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {children}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-[15rem] flex-1", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-border bg-card pr-3 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-primary/15"
      />
    </div>
  );
}

export interface FilterOption {
  label: string;
  value: string;
}

/** Labelled dropdown — the reference's Report Type / Date Range / Compare row. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 flex-1", className)}>
      {label && (
        <label className="mb-1.5 block text-[0.8125rem] text-muted-foreground">
          {label}
        </label>
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export interface TabOption {
  label: string;
  value: string;
  count?: number;
}

/**
 * Rounded category chips. The selected chip goes white with a red border and
 * red label — the reference never fills a chip solid, so a long strip of them
 * doesn't turn into a block of colour.
 */
export function ChipTabs({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: TabOption[];
  className?: string;
}) {
  return (
    <div
      className={cn("scrollbar-slim flex gap-2 overflow-x-auto pb-1", className)}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn("chip", active ? "chip-on" : "chip-off")}
          >
            {option.label}
            {option.count !== undefined && ` (${option.count})`}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The underlined tab strip the reference uses above a list of orders or
 * transactions — the active tab is red with a red rule beneath it.
 */
export function UnderlineTabs({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: TabOption[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "scrollbar-slim flex gap-1 overflow-x-auto border-b border-border",
        className
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-4 py-3 text-[0.8125rem] whitespace-nowrap transition-colors",
              active
                ? "border-primary font-semibold text-primary"
                : "border-transparent font-medium text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
            {option.count !== undefined && ` (${option.count})`}
          </button>
        );
      })}
    </div>
  );
}
