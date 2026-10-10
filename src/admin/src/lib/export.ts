import { api } from "@/lib/api";

/**
 * Downloading a list as a spreadsheet.
 *
 * The Export buttons across the console were labels with no handler behind
 * them - the client reported every one of them as broken, and they were.
 *
 * Everything is pulled page by page rather than exported from what happens to
 * be on screen: somebody exporting their customers means all of them, and a
 * file holding only the twenty rows they could see is worse than no file,
 * because nothing about it says it is incomplete.
 */

/** One field of the exported row: a heading, and how to read it. */
export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const cell = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  /**
   * A comma, a quote or a newline inside a value would otherwise shift every
   * column after it. Excel's own convention: wrap it, and double the quotes.
   */
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const head = columns.map((c) => cell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => cell(c.value(row))).join(","));
  return [head, ...body].join("\r\n");
}

/** Hands the browser a file. Nothing is uploaded anywhere. */
export function downloadCsv(filename: string, csv: string) {
  // The BOM is what makes Excel read UTF-8 rather than mangling ₹ and Telugu
  // names into symbols.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** A date stamp in the filename, so yesterday's export is not overwritten. */
export const stampedName = (base: string) =>
  `${base}-${new Date().toISOString().slice(0, 10)}.csv`;

/**
 * Reads every page of a list endpoint.
 *
 * Capped at 100 pages: an export is a convenience, and a console that
 * silently makes ten thousand requests because a filter was wrong is not one.
 * The cap is reported to the caller rather than hidden.
 */
export async function fetchAll<T>(
  path: string,
  key: string,
  query: Record<string, string | number | undefined> = {},
  pageSize = 200
): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = [];
  const MAX_PAGES = 100;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await api.list<T>(path, key, { ...query, page, limit: pageSize });
    const batch = result?.items ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, complete: true };
  }

  return { rows, complete: false };
}
