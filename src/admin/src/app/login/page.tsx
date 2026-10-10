"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandMark } from "@/components/shell/brand";
import { useSession } from "@/components/providers";
import { ApiError, TwoFactorRequired, completeTwoFactorLogin, login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { status, setUser } = useSession();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /**
   * Set once the password has been accepted and a code from the admin's
   * authenticator is all that is left. Holding it here rather than routing
   * to a second page keeps the half-finished sign-in in memory only - a
   * refresh drops it and starts again, which is what should happen.
   */
  const [challenge, setChallenge] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");

  // Already signed in (e.g. opened /login in a second tab) — go straight in.
  React.useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = challenge
        ? await completeTwoFactorLogin(challenge, code.trim())
        : await login(email.trim(), password);
      setUser(user);
      toast.success(`Welcome back, ${user.name?.split(" ")[0] ?? "admin"}`);
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof TwoFactorRequired) {
        setChallenge(err.challenge);
        setCode("");
        return;
      }
      const message =
        err instanceof ApiError ? err.message : "Unable to sign in right now.";
      // A challenge only lasts a few minutes; once it has gone the password
      // has to be given again, so the form goes back rather than leaving the
      // admin typing codes at something that will never accept one.
      if (err instanceof ApiError && err.status === 401 && challenge) {
        setChallenge(null);
        setCode("");
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_minmax(0,28rem)]">
      {/* Brand panel — hidden on small screens where the form is the whole job. */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.22), transparent 42%)",
          }}
        />
        <div className="relative flex items-center gap-3 text-white">
          <BrandMark className="bg-white/15 shadow-none backdrop-blur" />
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">Marketplace</div>
            <div className="text-xs text-white/70">Admin Console</div>
          </div>
        </div>

        <div className="relative max-w-md text-white">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Every order, vendor and rider — in one place.
          </h2>
          <p className="mt-3 text-sm/relaxed text-white/75 text-pretty">
            Track live deliveries, approve vendor payouts, run campaigns and keep
            the marketplace healthy from a single console.
          </p>
        </div>

        <dl className="relative grid grid-cols-3 gap-6 text-white">
          {[
            ["Modules", "20+"],
            ["Roles", "Granular"],
            ["Reporting", "Real-time"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-white/60">{label}</dt>
              <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <BrandMark />
          </div>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight lg:mt-0">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administrator access only.
          </p>

          {error && (
            <Alert variant="destructive" className="mt-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {challenge ? (
              /* The password is done; only the code is left. */
              <div className="space-y-1.5">
                <Label htmlFor="code">6-digit code</Label>
                <p className="text-[0.8125rem] text-muted-foreground">
                  Open your authenticator app and enter the code for Reditoe Admin.
                </p>
                <Input
                  id="code"
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="123456"
                  className="h-11 text-center text-lg tracking-[0.4em]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setChallenge(null);
                    setCode("");
                    setError(null);
                  }}
                  className="pt-1 text-[0.8125rem] font-medium text-primary hover:underline"
                >
                  Back to password
                </button>
                <p className="pt-1 text-[0.75rem] text-muted-foreground">
                  Lost your phone? Enter one of your recovery codes instead.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-[0.8125rem] font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            <Button
              type="submit"
              size="lg"
              className="h-10 w-full"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <LockKeyhole className="size-3.5" />
            Sessions expire after 7 days of inactivity.
          </p>
        </div>
      </section>
    </div>
  );
}
