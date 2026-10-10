"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  ApiError,
  clearToken,
  getToken,
  setAuthFailureHandler,
  setToken,
} from "@/lib/api";
import {
  fetchMe,
  login as loginRequest,
  register as registerRequest,
  type VendorSignUpDraft,
  type VendorUser,
} from "@/lib/vendor-api";

/**
 * Who is signed in.
 *
 * The token lives in localStorage, so the first render on the client has to
 * happen before we know — `status` stays "loading" until the stored token has
 * been checked against the API, and the shell shows nothing decisive until it
 * resolves. Anything else flashes the login screen at a signed-in vendor.
 */

type Status = "loading" | "authenticated" | "anonymous";

interface AuthValue {
  status: Status;
  user: VendorUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves true when the account was created, false when it already existed. */
  signUp: (draft: VendorSignUpDraft) => Promise<boolean>;
  signOut: () => void;
}

const AuthContext = React.createContext<AuthValue | null>(null);

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<Status>("loading");
  const [user, setUser] = React.useState<VendorUser | null>(null);

  // Validate the stored token once on boot. A token that no longer works is
  // cleared here rather than left to fail on the first data request.
  React.useEffect(() => {
    let cancelled = false;

    // `status` has to start as "loading" so the server and the client agree on
    // the first paint — localStorage doesn't exist during SSR. That means the
    // no-token case resolves in a microtask rather than synchronously here.
    if (!getToken()) {
      Promise.resolve().then(() => {
        if (!cancelled) setStatus("anonymous");
      });
      return () => {
        cancelled = true;
      };
    }

    fetchMe()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Offline is not signed out — keep the session and let the screens
        // show their own "cannot reach the API" state.
        if (error instanceof ApiError && error.isOffline) {
          setStatus("authenticated");
          return;
        }
        clearToken();
        setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const body = await loginRequest(email, password);
    const token = body.token;
    const account = body.data?.user;

    if (!token) throw new ApiError("The server did not return a token.", 500);
    if (account && account.role !== "vendor") {
      throw new ApiError(
        `This is the vendor console — ${account.email} is signed up as "${account.role}".`,
        403
      );
    }

    setToken(token);
    setUser(account ?? null);
    setStatus("authenticated");
  }, []);

  const signUp = React.useCallback(async (draft: VendorSignUpDraft) => {
    const body = await registerRequest(draft);
    const token = body.token;
    const account = body.data?.user ?? body.user ?? null;

    if (!token) throw new ApiError("The server did not return a token.", 500);

    setToken(token);
    setUser(account);
    setStatus("authenticated");

    // The API signs in an existing vendor rather than refusing, so the caller
    // can tell them they already had an account instead of implying one was
    // just created.
    return !body.alreadyRegistered;
  }, []);

  const signOut = React.useCallback(() => {
    clearToken();
    setUser(null);
    setStatus("anonymous");
  }, []);

  /**
   * Any call coming back unauthenticated ends the session here.
   *
   * Without this the check happened only at boot, so a token that stopped
   * working while the console was open surfaced as a raw API error on whatever
   * the vendor pressed next — "the user belonging to this token does not
   * exist" on the Accept button, with no way forward but a manual reload. The
   * redirect below then carries them to sign-in.
   */
  React.useEffect(() => {
    setAuthFailureHandler(() => {
      setUser(null);
      setStatus("anonymous");
      toast.error("Your session has ended. Please sign in again.");
    });
    return () => setAuthFailureHandler(null);
  }, []);

  const value = React.useMemo<AuthValue>(
    () => ({ status, user, signIn, signUp, signOut }),
    [status, user, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Sends anonymous visitors to the login screen, and signed-in vendors away
 * from it. Rendered by the shell so every route is covered by one rule.
 */
export function useAuthRedirect() {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Signup is as public as login. Leaving it out sent anonymous visitors
  // straight back to /login the moment they opened it.
  // Resetting a password is as public as signing in — leaving it out sent
  // anyone who could not sign in straight back to the screen they were stuck on.
  const onAuthRoute =
    pathname === "/login" || pathname === "/signup" || pathname === "/forgot-password";

  React.useEffect(() => {
    if (status === "loading") return;
    if (status === "anonymous" && !onAuthRoute) router.replace("/login");
    if (status === "authenticated" && onAuthRoute) router.replace("/dashboard");
  }, [status, onAuthRoute, router]);

  return { status, onLogin: onAuthRoute };
}
