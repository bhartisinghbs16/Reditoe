import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONES, type Tone } from "@/lib/accent";

/**
 * The wide call-to-action the reference closes almost every screen with: a
 * tinted strip, an illustrated glyph, a bold line of copy and the action.
 *
 * It is deliberately the loudest thing on a page and always the last — a
 * vendor who has finished reading their numbers is the one worth selling to.
 */
export function PromoBanner({
  icon: Icon,
  title,
  description,
  tone = "amber",
  actions,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: Tone;
  actions?: React.ReactNode;
  className?: string;
}) {
  const style = TONES[tone];

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:gap-5",
        style.soft,
        className
      )}
    >
      <span className={cn("icon-circle size-12 bg-card", style.text)}>
        <Icon className="size-6" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-bold">{title}</p>
        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground text-pretty">
          {description}
        </p>
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/**
 * The same strip carrying a checklist instead of a sentence — the reference's
 * "Menu Tips" / "Tips to improve your sales" block.
 */
export function TipsBanner({
  icon: Icon,
  title,
  tips,
  tone = "amber",
  actions,
  className,
}: {
  icon: LucideIcon;
  title: string;
  tips: string[];
  tone?: Tone;
  actions?: React.ReactNode;
  className?: string;
}) {
  const style = TONES[tone];

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:gap-5",
        style.soft,
        className
      )}
    >
      <span className={cn("icon-circle size-12 shrink-0 bg-card", style.text)}>
        <Icon className="size-6" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-bold">{title}</p>
        <ul className="mt-2 space-y-1.5">
          {tips.map((tip) => (
            <li
              key={tip}
              className="flex items-start gap-2 text-[0.8125rem] text-muted-foreground"
            >
              <Check className={cn("mt-0.5 size-3.5 shrink-0", style.text)} />
              <span className="text-pretty">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-start gap-2">{actions}</div>
      )}
    </div>
  );
}
