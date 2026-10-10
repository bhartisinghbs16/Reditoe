import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/shell/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <BrandMark />
      <p className="mt-6 text-sm font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        404
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
        That route doesn&apos;t exist in the console. It may have been moved, or the
        link is out of date.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/support">Contact support</Link>
        </Button>
      </div>
    </div>
  );
}
