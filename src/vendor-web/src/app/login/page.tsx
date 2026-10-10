"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, LockKeyhole, Mail, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError, API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { signIn, status } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not sign in. Please try again."
      );
      setBusy(false);
    }
  };

  // The redirect to /dashboard is the shell's job; until it fires, keep the
  // button spinning rather than flashing the form again.
  const pending = busy || status === "authenticated";

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center leading-none">
          <span className="text-3xl font-extrabold tracking-tight text-primary">
            Reditoe
          </span>
          <span className="mt-1 text-xs font-bold tracking-[0.14em] text-foreground">
            INDIA LLP
          </span>
          <span className="mt-1.5 flex items-center gap-1.5">
            <span className="h-px w-4 bg-primary/50" />
            <span className="text-[0.625rem] font-semibold tracking-[0.08em] text-primary italic">
              Ready To Eat
            </span>
            <span className="h-px w-4 bg-primary/50" />
          </span>
        </div>

        <div className="surface p-6">
          <h1 className="text-lg font-bold tracking-tight">Vendor sign in</h1>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">
            Manage your orders, menu and payouts.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@restaurant.com"
                  className="h-10 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-primary/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-10 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-primary/15"
                />
              </div>
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[0.8125rem] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Sign in
            </Button>

            <Link
              href="/forgot-password"
              className="block text-center text-[0.8125rem] font-medium text-primary hover:underline"
            >
              Forgot your password?
            </Link>
          </form>

          <p className="mt-4 text-center text-[0.8125rem] text-muted-foreground">
            New here?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              List your restaurant
            </Link>
          </p>
        </div>

        <p className="mt-4 text-center text-[0.6875rem] text-muted-foreground">
          API: {API_BASE_URL}
        </p>
      </div>
    </div>
  );
}
