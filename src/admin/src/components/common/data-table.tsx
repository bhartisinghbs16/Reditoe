"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { number as formatNumber } from "@/lib/format";

export interface Column<T> {
  /** Stable identity for the column; also the default header label source. */
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Applied to both the header cell and the body cells. */
  className?: string;
  /** Hides the column below the given breakpoint. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  /**
   * Pins the column to the right edge while the table scrolls. Applied
   * automatically to a column with id "actions" — a row menu you have to
   * scroll sideways to reach may as well not be there.
   */
  sticky?: boolean;
}

const hideClasses = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
} as const;

const alignClasses = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** Enables the leading checkbox column. */
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Rendered above the table, inside the same surface. */
  toolbar?: React.ReactNode;
  skeletonRows?: number;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  onRowClick,
  emptyTitle = "Nothing to show yet",
  emptyDescription,
  emptyAction,
  selectable,
  selected = [],
  onSelectedChange,
  toolbar,
  skeletonRows = 8,
  className,
}: DataTableProps<T>) {
  const ids = React.useMemo(
    () => rows.map((row, index) => rowKey(row, index)),
    [rows, rowKey]
  );
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
  const someSelected = !allSelected && ids.some((id) => selected.includes(id));

  const toggleAll = () => {
    if (!onSelectedChange) return;
    onSelectedChange(allSelected ? [] : ids);
  };

  const toggleOne = (id: string) => {
    if (!onSelectedChange) return;
    onSelectedChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
    );
  };

  const columnCount = columns.length + (selectable ? 1 : 0);

  const isSticky = (column: Column<T>) => column.sticky ?? column.id === "actions";
  // Sticky cells sit above the scrolling content, so they carry their own
  // background and must repeat the row's hover and selected states.
  const stickyCell =
    "sticky right-0 z-10 bg-card before:absolute before:inset-y-0 before:-left-px before:w-px before:bg-border";

  return (
    <div className={cn("surface overflow-hidden", className)}>
      {toolbar && (
        <div className="border-b border-border p-3 sm:p-4">{toolbar}</div>
      )}

      {error ? (
        <ErrorState description={error.message} onRetry={onRetry} />
      ) : (
        <div className="scrollbar-slim w-full overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {selectable && (
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <Checkbox
                      checked={allSelected || (someSelected && "indeterminate")}
                      onCheckedChange={toggleAll}
                      aria-label="Select all rows"
                    />
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={cn(
                      "px-3 py-2.5 text-[0.6875rem] font-semibold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase",
                      alignClasses[column.align ?? "left"],
                      column.hideBelow && hideClasses[column.hideBelow],
                      isSticky(column) && "sticky right-0 z-10 bg-muted/40",
                      column.className
                    )}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading
                ? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                    <tr key={`skeleton-${rowIndex}`} className="border-b border-border/70">
                      {Array.from({ length: columnCount }).map((__, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-3.5">
                          <Skeleton className="h-4 w-full max-w-32" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((row, index) => {
                    const id = ids[index];
                    const isSelected = selected.includes(id);
                    return (
                      <tr
                        key={id}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        className={cn(
                          "group border-b border-border/70 transition-colors last:border-0",
                          isSelected ? "bg-accent/50" : "hover:bg-muted/50",
                          onRowClick && "cursor-pointer"
                        )}
                      >
                        {selectable && (
                          <td
                            className="px-3 py-3"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOne(id)}
                              aria-label="Select row"
                            />
                          </td>
                        )}
                        {columns.map((column) => (
                          <td
                            key={column.id}
                            className={cn(
                              "px-3 py-3 align-middle",
                              alignClasses[column.align ?? "left"],
                              column.hideBelow && hideClasses[column.hideBelow],
                              isSticky(column) &&
                                cn(
                                  stickyCell,
                                  isSelected
                                    ? "bg-[color-mix(in_oklch,var(--card),var(--accent)_50%)]"
                                    : "group-hover:bg-[color-mix(in_oklch,var(--card),var(--muted)_50%)]"
                                ),
                              column.className
                            )}
                          >
                            {column.cell(row, index)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
            </tbody>
          </table>

          {!loading && rows.length === 0 && (
            <EmptyState
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Pagination ─────────────────────────────────────────────────────────── */

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // A compact window around the current page: 1 … 4 5 6 … 20
  const pages = React.useMemo(() => {
    const window: (number | "gap")[] = [];
    const push = (value: number | "gap") => {
      if (value === "gap" && window[window.length - 1] === "gap") return;
      window.push(value);
    };
    for (let i = 1; i <= pageCount; i++) {
      if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) push(i);
      else push("gap");
    }
    return window;
  }, [page, pageCount]);

  return (
    <div
      className={cn(
        "flex flex-col-reverse items-center justify-between gap-3 border-t border-border px-3 py-3 sm:flex-row sm:px-4",
        className
      )}
    >
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{formatNumber(from)}</span> to{" "}
        <span className="font-medium text-foreground">{formatNumber(to)}</span> of{" "}
        <span className="font-medium text-foreground">{formatNumber(total)}</span> entries
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-xs text-muted-foreground">Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger size="sm" className="w-[4.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>

          {pages.map((entry, index) =>
            entry === "gap" ? (
              <span
                key={`gap-${index}`}
                className="px-1 text-xs text-muted-foreground"
              >
                …
              </span>
            ) : (
              <Button
                key={entry}
                variant={entry === page ? "default" : "ghost"}
                size="icon-sm"
                onClick={() => onPageChange(entry)}
                aria-current={entry === page ? "page" : undefined}
              >
                {entry}
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
