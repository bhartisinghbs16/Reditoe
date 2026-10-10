"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadCsv, fetchAll, stampedName, toCsv, type ExportColumn } from "@/lib/export";

/**
 * Turns a list into a spreadsheet the owner can open.
 *
 * Every list in the console had an Export button with nothing behind it. This
 * is the one implementation they all share, so a fourth list gets a working
 * export by passing its columns rather than by someone writing this again.
 *
 * The current filters are carried into the export, because a person who has
 * narrowed a list to one city and then presses Export means that city.
 */
export function ExportButton<T>({
  path,
  listKey,
  columns,
  filename,
  query,
  label = "Export",
}: {
  /** API path of the list, e.g. "/admin/customers". */
  path: string;
  /** Name of the array inside the response, e.g. "users". */
  listKey: string;
  columns: ExportColumn<T>[];
  /** Base of the downloaded filename; the date is added. */
  filename: string;
  query?: Record<string, string | number | undefined>;
  label?: string;
}) {
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const { rows, complete } = await fetchAll<T>(path, listKey, query ?? {});

      if (rows.length === 0) {
        toast.message("Nothing to export", {
          description: "No rows match the current filters.",
        });
        return;
      }

      downloadCsv(stampedName(filename), toCsv(rows, columns));

      // Said out loud rather than hidden: a truncated export that looks
      // complete is how a business ends up acting on half its data.
      toast.success(
        complete
          ? `Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`
          : `Exported the first ${rows.length} rows — the list was too long to export in full`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export this list");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="lg" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      {busy ? "Preparing…" : label}
    </Button>
  );
}
