/**
 * CSV export.
 *
 * The backend has no report endpoint, so the export buttons build the file
 * from what the screen is already showing. That keeps the download honest:
 * it contains exactly the rows the vendor filtered to, and nothing they were
 * never shown.
 */

/** Escapes a cell per RFC 4180 — quotes doubled, field wrapped when needed. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  columns: Array<{ header: string; value: (row: never) => unknown }>,
  rows: readonly unknown[]
): string {
  const head = columns.map((column) => cell(column.header)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => cell(column.value(row as never))).join(",")
  );
  return [head, ...body].join("\r\n");
}

export function downloadCsv(filename: string, contents: string) {
  // The BOM keeps Excel from mangling the rupee sign and any Indic text.
  const blob = new Blob(["﻿", contents], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Stamps a filename with today's date so repeated exports don't collide. */
export function stampedName(base: string) {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `${base}-${date}.csv`;
}
