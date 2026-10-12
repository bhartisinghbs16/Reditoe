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
  register as registerRequest,
  sendOtp as sendOtpRequest,
  verifyOtp as verifyOtpRequest,
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
  /** Asks the server to text a one-time code to a mobile number. */
  requestOtp: (phone: string) => Promise<{ devOtp?: string; resendAfterSeconds?: number }>;
  /**
   * Checks the code. A number with a vendor account is signed in
   * ("signed-in"); one without comes back as "new", with the number held as
   * verified until the sign-up form has what it needs.
   */
  verifyOtp: (phone: string, otp: string) => Promise<"signed-in" | "new">;
  /**
   * The number that has just been verified and has no account yet, with the
   * proof the server issued for it. Held in memory only: it is good for one
   * account and nothing is gained by it surviving a reload.
   */
  pendingSignup: { phone: string; phoneProof: string } | null;
  /** Gives up on signing up, so the next attempt starts from the number again. */
  cancelSignUp: () => void;
  /** Creates the restaurant and the account on the verified number, and signs in. */
  signUp: (
    details: Omit<VendorSignUpDraft, "phone" | "phoneProof">
  ) => Promise<void>;
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

  const [pendingSignup, setPendingSignup] = React.useState<{
    phone: string;
    phoneProof: string;
  } | null>(null);

  const requestOtp = React.useCallback((phone: string) => sendOtpRequest(phone), []);

  const verifyOtp = React.useCallback(async (phone: string, otp: string) => {
    const result = await verifyOtpRequest(phone, otp);

    if (result.isNewUser) {
      setPendingSignup({ phone: result.phone, phoneProof: result.phoneProof });
      return "new" as const;
    }

    if (result.user && result.user.role !== "vendor") {
      throw new ApiError(
        `This is the vendor console — this number is signed up as "${result.user.role}".`,
        403
      );
    }

    setPendingSignup(null);
    setToken(result.token);
    setUser(result.user);
    setStatus("authenticated");
    return "signed-in" as const;
  }, []);

  const cancelSignUp = React.useCallback(() => setPendingSignup(null), []);

  const signUp = React.useCallback(
    async (details: Omit<VendorSignUpDraft, "phone" | "phoneProof">) => {
      if (!pendingSignup) {
        throw new ApiError("Verify your mobile number first.", 400);
      }
      const body = await registerRequest({ ...details, ...pendingSignup });
      const token = body.token;
      const account = body.data?.user ?? body.user ?? null;

      if (!token) throw new ApiError("The server did not return a token.", 500);

      setPendingSignup(null);
      setToken(token);
      setUser(account);
      setStatus("authenticated");
    },
    [pendingSignup]
  );

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
    () => ({
      status,
      user,
      requestOtp,
      verifyOtp,
      pendingSignup,
      cancelSignUp,
      signUp,
      signOut,
    }),
    [status, user, requestOtp, verifyOtp, pendingSignup, cancelSignUp, signUp, signOut]
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
  const onAuthRoute = pathname === "/login" || pathname === "/signup";

  React.useEffect(() => {
    if (status === "loading") return;
    if (status === "anonymous" && !onAuthRoute) router.replace("/login");
    if (status === "authenticated" && onAuthRoute) router.replace("/dashboard");
  }, [status, onAuthRoute, router]);

  return { status, onLogin: onAuthRoute };
}
