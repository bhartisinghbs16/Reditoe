"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { auxiliaryRoutes, flatNavigation, type FlatNavEntry } from "@/lib/nav";
import { useGlobalSearch } from "@/lib/queries";

const destinations: FlatNavEntry[] = [...flatNavigation, ...auxiliaryRoutes];

const grouped = destinations.reduce<Record<string, FlatNavEntry[]>>((acc, entry) => {
  (acc[entry.section] ??= []).push(entry);
  return acc;
}, {});

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  /**
   * What has been typed, and what the server makes of it.
   *
   * The palette matched its own list of page names and nothing else, while
   * promising to search orders and customers - so an order number returned
   * "No matches" however correct it was. Sections are still matched here,
   * instantly and offline; records come from the server.
   */
  const [query, setQuery] = React.useState("");
  const { data: found, isFetching } = useGlobalSearch(query);
  const hits = found?.results ?? [];

  /**
   * The server answers with admin API paths; the console routes are the same
   * without that prefix.
   */
  const toConsolePath = (url: string) => url.replace(/^\/admin/, "") || "/";

  const go = React.useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Jump to any section of the console"
    >
      <CommandInput
        placeholder="Search orders, vendors, riders, customers…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="scrollbar-slim">
        <CommandEmpty>
          {query.trim().length < 2
            ? "Type at least two characters."
            : isFetching
              ? "Searching…"
              : "No matches."}
        </CommandEmpty>

        {hits.length > 0 && (
          <CommandGroup heading="Records">
            {hits.map((hit) => (
              <CommandItem
                key={`${hit.type}-${hit.id}`}
                /*
                  Everything about the hit is in the value, so cmdk's own
                  filter never hides a result the server chose to return.
                */
                value={`${hit.displayName} ${hit.subText ?? ""} ${hit.id}`}
                onSelect={() => go(toConsolePath(hit.url))}
              >
                <span className="truncate">{hit.displayName}</span>
                {hit.subText && (
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {hit.subText}
                  </span>
                )}
                <span className="ml-2 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.6875rem]">
                  {hit.type}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {Object.entries(grouped).map(([section, entries]) => (
          <CommandGroup key={section} heading={section}>
            {entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <CommandItem
                  key={entry.href}
                  value={`${entry.parent ?? ""} ${entry.label} ${entry.href}`}
                  onSelect={() => go(entry.href)}
                >
                  {Icon && <Icon className="size-4 text-muted-foreground" />}
                  <span>{entry.label}</span>
                  {entry.parent && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {entry.parent}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/** Ctrl/⌘+K anywhere in the shell. */
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}
