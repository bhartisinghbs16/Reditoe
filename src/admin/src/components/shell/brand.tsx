import { cn } from "@/lib/utils";

/**
 * Product mark — a red scooter glyph, matching the reference's logo. Swap the
 * whole component for the supplied artwork when it arrives.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-primary text-white shadow-sm",
        className
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-5">
        <circle
          cx="12"
          cy="12"
          r="7"
          stroke="currentColor"
          strokeWidth="1.8"
          opacity="0.55"
        />
        <path
          d="M5 15.5c2.6-1.6 4.6-1.6 7 0s4.4 1.6 7 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="12" cy="9" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}

export function BrandLockup({
  className,
  subtitle = "Admin Panel",
}: {
  className?: string;
  subtitle?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[0.95rem] font-semibold tracking-tight text-white">
          Reditoe
        </div>
        <div className="truncate text-[0.7rem] font-medium text-white/55">
          {subtitle}
        </div>
      </div>
    </div>
  );
}
