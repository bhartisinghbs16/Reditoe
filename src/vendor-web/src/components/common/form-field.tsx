import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A labelled control with room for a hint and an error.
 *
 * The reference draws every form the same way — label above, 44px control,
 * a red asterisk on anything required — so the shape lives here rather than
 * being re-typed on each screen.
 */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[0.8125rem] font-semibold">
        {label}
        {required && <span className="text-primary">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[0.75rem] font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-[0.75rem] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** The bordered control the reference uses for every text input. */
export const controlClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60";

export function TextInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return <input {...props} className={cn(controlClass, className)} />;
}

export function TextArea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cn(controlClass, "h-auto py-2 leading-relaxed", className)}
    />
  );
}

/**
 * A row of mutually exclusive tiles — the reference's Veg / Non-Veg / Egg
 * selector, and the same shape reused for any short enum.
 */
export function ChoiceGroup<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; tone?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)} role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-[0.8125rem] font-medium transition-colors",
              active
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40"
            )}
          >
            {option.tone && (
              <span
                aria-hidden
                className={cn("size-2.5 rounded-full", option.tone)}
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
