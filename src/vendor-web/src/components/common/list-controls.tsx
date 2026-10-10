"use client";

import * as React from "react";
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  ListFilter,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DATE_RANGES,
  PERIODS,
  periodLabel,
  rangeLabel,
  type DateRange,
  type Period,
} from "@/lib/date-range";

/**
 * The Filter and Sort controls the reference draws beside every search box.
 *
 * They open real popovers rather than sitting there decoratively: a control
 * that looks pressable and does nothing is worse than no control at all.
 */

const triggerClass =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted data-[state=open]:border-primary/50";

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

export function SortMenu<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SortOption<T>[];
}) {
  const active = options.find((option) => option.value === value);

  return (
    <Popover>
      <PopoverTrigger className={triggerClass}>
        <ArrowUpDown className="size-4 text-muted-foreground" />
        Sort
        {active && (
          <span className="text-[0.75rem] text-muted-foreground">
            · {active.label}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition-colors hover:bg-muted",
              option.value === value && "font-semibold text-primary"
            )}
          >
            <Check
              className={cn(
                "size-3.5 shrink-0",
                option.value === value ? "opacity-100" : "opacity-0"
              )}
            />
            {option.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The bordered date pill the reference floats top-right. Unlike the earlier
 * decorative version, this one actually scopes the panels beneath it.
 */
export function DateRangeMenu({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (value: DateRange) => void;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[0.8125rem] font-medium transition-colors hover:bg-muted data-[state=open]:border-primary/50",
          className
        )}
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        {rangeLabel(value)}
        <ChevronDown className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        {DATE_RANGES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition-colors hover:bg-muted",
              option.value === value && "font-semibold text-primary"
            )}
          >
            <Check
              className={cn(
                "size-3.5 shrink-0",
                option.value === value ? "opacity-100" : "opacity-0"
              )}
            />
            {option.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The compact "Daily / Weekly / Monthly" control the reference parks in the
 * top-right of a chart panel. It switches which series `/vendor/stats`
 * already returned — no extra request, and no decoration.
 */
export function PeriodSelect({
  value,
  onChange,
  className,
}: {
  value: Period;
  onChange: (value: Period) => void;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[0.75rem] font-medium transition-colors hover:bg-muted data-[state=open]:border-primary/50",
          className
        )}
      >
        {periodLabel(value)}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-36 p-1">
        {PERIODS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] transition-colors hover:bg-muted",
              option.value === value && "font-semibold text-primary"
            )}
          >
            <Check
              className={cn(
                "size-3.5 shrink-0",
                option.value === value ? "opacity-100" : "opacity-0"
              )}
            />
            {option.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export interface FilterGroup<T extends string> {
  key: string;
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

/**
 * A popover of single-choice groups, with a count of how many are narrowing
 * the list and one button to clear them.
 */
export function FilterMenu({
  groups,
  onReset,
  activeCount,
}: {
  groups: Array<FilterGroup<string>>;
  onReset: () => void;
  activeCount: number;
}) {
  return (
    <Popover>
      <PopoverTrigger className={triggerClass}>
        <ListFilter className="size-4 text-muted-foreground" />
        Filter
        {activeCount > 0 && (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.625rem] font-bold text-primary-foreground tabular-nums">
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="mb-1.5 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((option) => {
                const active = option.value === group.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => group.onChange(option.value)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[0.75rem] font-medium transition-colors",
                      active
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={activeCount === 0}
          onClick={onReset}
        >
          Clear filters
        </Button>
      </PopoverContent>
    </Popover>
  );
}
