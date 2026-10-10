import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A dish thumbnail.
 *
 * The catalogue on this backend ships without images, so the fallback is a
 * tinted initial rather than a stock photo — showing a picture of food that
 * isn't the dish is worse than showing no picture at all.
 *
 * Plain <img> rather than next/image: these URLs come from vendor uploads at
 * runtime, so the host isn't known at build time to be allow-listed.
 */
export function FoodThumb({
  src,
  name,
  size = 40,
  className,
  rounded = "rounded-lg",
}: {
  src?: string;
  name: string;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const usable = src && !failed;

  return usable ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-cover", rounded, className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-muted font-semibold text-muted-foreground",
        rounded,
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
