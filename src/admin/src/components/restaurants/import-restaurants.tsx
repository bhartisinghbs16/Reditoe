"use client";

import * as React from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, API_BASE_URL, getToken } from "@/lib/api";

/**
 * Adding restaurants from a spreadsheet.
 *
 * The button existed with nothing behind it. Onboarding a city's worth of
 * kitchens one form at a time is the work a spreadsheet is for.
 *
 * Every row is checked before any of them is saved, so a file with a mistake
 * in it is refused whole and says which rows and why. A part-imported list
 * leaves somebody working out which half arrived.
 */

interface Rejection {
  row: number;
  name: string;
  problems: string[];
}

export function ImportRestaurants() {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [rejected, setRejected] = React.useState<Rejection[] | null>(null);
  const input = React.useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  async function template() {
    try {
      // A plain fetch: the response is a spreadsheet, not JSON.
      const response = await fetch(`${API_BASE_URL}/admin/restaurants/import-template`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!response.ok) throw new Error("Could not download the template");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "reditoe-restaurant-import-template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the template");
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setRejected(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api.upload<{
        imported: number;
        skipped: number;
        note?: string;
      }>("/admin/restaurants/import", form);

      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      toast.success(
        `Imported ${result.imported} restaurant${result.imported === 1 ? "" : "s"}` +
          (result.skipped ? ` · ${result.skipped} already existed` : "")
      );
      setOpen(false);
    } catch (error) {
      // The server names the rows it refused; showing them is the whole point.
      const detail = (error as { data?: { rejected?: Rejection[] } })?.data?.rejected;
      if (detail?.length) setRejected(detail);
      toast.error(error instanceof Error ? error.message : "Could not import that file");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <Upload className="size-4" />
          Import Restaurants
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import restaurants from a spreadsheet</DialogTitle>
        </DialogHeader>

        <ol className="ml-4 list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Download the template and fill in one row per restaurant.</li>
          <li>Latitude and longitude are required — without them a restaurant cannot be matched to a customer&apos;s address.</li>
          <li>Upload it. Imported restaurants arrive switched off, awaiting KYC.</li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={template}>
            <Download className="size-3.5" />
            Download template
          </Button>

          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {busy ? "Importing…" : "Choose file"}
          </Button>
        </div>

        {rejected && (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="mb-2 font-medium">
                Nothing was saved. Fix these rows and upload again:
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-[0.8125rem]">
                {rejected.map((row) => (
                  <li key={row.row}>
                    <strong>Row {row.row}</strong> ({row.name}) — {row.problems.join(", ")}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
