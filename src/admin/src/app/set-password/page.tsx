"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandMark } from "@/components/shell/brand";
import { API_BASE_URL } from "@/lib/api";

/**
 * Where a vendor lands from the invitation email to choose their password.
 *
 * Deliberately outside the console shell and outside the session: whoever
 * opens this is not signed in and cannot be — the token in the URL is the only
 * credential, which is why it is single-use and expires. It is served from the
 * platform origin so one link works for the whole product.
 *
 * The token is checked before the form is drawn, so an expired link says so
 * instead of taking a password and then refusing it.
 */

/** Mirrors the server's rule, so the page can say no before the round trip. */
function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(password)) return "Include at least one letter.";
  if (!/\d/.test(password)) return "Include at least one number.";
  return null;
}

interface Invitee {
  email?: string;
  name?: string;
  role?: string;
}

export default function SetPasswordPage() {
  return (
    // useSearchParams needs a Suspense boundary in the app router.
    <React.Suspense fallback={<Centered>Loading…</Centered>}>
      <SetPassword />
    </React.Suspense>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function SetPassword() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [checking, setChecking] = React.useState(true);
  const [invitee, setInvitee] = React.useState<Invitee | null>(null);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  // Check the link before drawing the form.
  React.useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLinkError("This link is missing its token. Open the link from your email again.");
      setChecking(false);
      return;
    }
    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/invite/${encodeURIComponent(token)}`, {
          headers: { Accept: "application/json", "ngrok-skip-browser-warning": "1" },
        });
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || !body?.valid) {
          setLinkError(body?.message ?? "This link is no longer valid.");
        } else {
          setInvitee(body.data ?? {});
        }
      } catch {
        if (!cancelled) setLinkError("Could not reach the server. Check your connection and retry.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const localProblem =
    password && confirm && password !== confirm
      ? "The two passwords do not match."
      : password
        ? passwordProblem(password)
        : null;

  const ready = Boolean(password && confirm && !localProblem) && !submitting;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/invite/set-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "ngrok-skip-browser-warning": "1",
        },
        body: JSON.stringify({ token, password, confirmPassword: confirm }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.message ?? "Could not set your password.");
        return;
      }
      setDone(true);
      toast.success("Password set");
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_minmax(0,28rem)]">
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
            <div className="font-semibold tracking-tight">Reditoe</div>
            <div className="text-xs text-white/70">Vendor Console</div>
          </div>
        </div>

        <div className="relative max-w-md text-white">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Choose a password, and the account is yours.
          </h2>
          <p className="mt-3 text-sm/relaxed text-white/75 text-pretty">
            Nobody at Reditoe can see it — not even the administrator who set your
            restaurant up.
          </p>
        </div>

        <p className="relative text-xs text-white/60">
          You will sign in with your email address.
        </p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <BrandMark />
          </div>

          {checking ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking your link…
            </p>
          ) : linkError ? (
            <>
              <h1 className="mt-6 text-2xl font-semibold tracking-tight lg:mt-0">
                This link doesn&apos;t work
              </h1>
              <Alert variant="destructive" className="mt-5">
                <TriangleAlert className="size-4" />
                <AlertDescription>{linkError}</AlertDescription>
              </Alert>
              <p className="mt-4 text-sm text-muted-foreground">
                Links expire after seven days and can only be used once. Ask your
                Reditoe contact to send a new one.
              </p>
              <Button asChild variant="outline" className="mt-5 w-full">
                <Link href="/login">Back to sign in</Link>
              </Button>
            </>
          ) : done ? (
            <>
              <div className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="size-6" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">
                Password set
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in with <span className="font-medium">{invitee?.email}</span> and
                the password you just chose.
              </p>
              <Button className="mt-6 w-full" onClick={() => router.push("/login")}>
                Go to sign in
              </Button>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-2xl font-semibold tracking-tight lg:mt-0">
                Set your password
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                for <span className="font-medium text-foreground">{invitee?.email}</span>
              </p>

              {error && (
                <Alert variant="destructive" className="mt-5">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={reveal ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setReveal((on) => !on)}
                      aria-label={reveal ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type={reveal ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Type it again"
                    className="h-10"
                  />
                </div>

                {/* Says what is wrong while it is being typed, rather than on submit. */}
                {localProblem && (
                  <p className="text-[0.8125rem] text-destructive">{localProblem}</p>
                )}

                <Button type="submit" disabled={!ready} className="w-full">
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LockKeyhole className="size-4" />
                  )}
                  Set password
                </Button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
