"use client";

import * as React from "react";

export interface ListState {
  page: number;
  limit: number;
  search: string;
  filters: Record<string, string>;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setSearch: (search: string) => void;
  setFilter: (key: string, value: string) => void;
  reset: () => void;
  /** Debounced search + filters + paging, ready to hand to a list hook. */
  params: Record<string, string | number>;
}

/**
 * Filter/paging state for a list screen. Search is debounced and any change to
 * a filter returns to page 1 — otherwise you land on an empty page 7.
 */
export function useListState(
  initialFilters: Record<string, string> = {},
  initialLimit = 25
): ListState {
  const [page, setPageState] = React.useState(1);
  const [limit, setLimitState] = React.useState(initialLimit);
  const [search, setSearchState] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [filters, setFilters] = React.useState(initialFilters);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      // Debounced search lands on page 1 — otherwise a narrower result set
      // leaves you stranded on an empty page 7.
      setPageState(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Every mutation that changes the result set resets paging at the call site,
  // rather than in an effect that would fire a second render each time.
  const setFilter = React.useCallback((key: string, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPageState(1);
  }, []);

  const setLimit = React.useCallback((next: number) => {
    setLimitState(next);
    setPageState(1);
  }, []);

  const initialFiltersRef = React.useRef(initialFilters);
  const reset = React.useCallback(() => {
    setSearchState("");
    setDebouncedSearch("");
    setFilters(initialFiltersRef.current);
    setPageState(1);
  }, []);

  const params = React.useMemo(() => {
    const next: Record<string, string | number> = { page, limit };
    if (debouncedSearch) next.search = debouncedSearch;
    for (const [key, value] of Object.entries(filters)) {
      if (value) next[key] = value;
    }
    return next;
  }, [page, limit, debouncedSearch, filters]);

  return {
    page,
    limit,
    search,
    filters,
    setPage: setPageState,
    setLimit,
    setSearch: setSearchState,
    setFilter,
    reset,
    params,
  };
}
