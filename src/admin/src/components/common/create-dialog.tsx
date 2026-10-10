"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The form behind a "New …" button.
 *
 * Five pages listed records they had no way to create: the button was there,
 * with no handler behind it, so the page looked finished and nothing
 * happened. The endpoints all existed. This is the one form they share, so
 * adding the next one is a field list rather than another dialog.
 *
 * The server's own message is what a failure shows. These endpoints explain
 * themselves ("Code, discount type, discount value, and expiry date are
 * required"), and replacing that with a generic apology would throw away the
 * only thing that tells the admin what to fix.
 */

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "date" | "datetime-local" | "select";
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Shown under the field, for anything the label cannot carry. */
  hint?: string;
};

export function CreateDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial = {},
  submitLabel = "Create",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FieldSpec[];
  initial?: Record<string, string>;
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
}) {
  const [values, setValues] = React.useState<Record<string, string>>(initial);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // A second opening starts clean rather than holding the last attempt.
  React.useEffect(() => {
    if (open) {
      setValues(initial);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (name: string, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  const missing = fields.filter(
    (field) => field.required && !String(values[field.name] ?? "").trim()
  );

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "That could not be saved."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}

        <div className="space-y-3">
          {fields.map((field) => {
            const id = `create-${field.name}`;
            const value = values[field.name] ?? "";
            return (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={id}>
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>

                {field.type === "select" ? (
                  <Select value={value} onValueChange={(next) => set(field.name, next)}>
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue placeholder={field.placeholder ?? "Choose one"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options ?? []).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === "textarea" ? (
                  <Textarea
                    id={id}
                    value={value}
                    placeholder={field.placeholder}
                    onChange={(event) => set(field.name, event.target.value)}
                  />
                ) : (
                  <Input
                    id={id}
                    type={field.type ?? "text"}
                    value={value}
                    placeholder={field.placeholder}
                    onChange={(event) => set(field.name, event.target.value)}
                  />
                )}

                {field.hint && (
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || missing.length > 0}>
            {saving ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
