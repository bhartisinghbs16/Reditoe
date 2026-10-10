"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  loadToken,
  login as apiLogin,
  sendOtp as apiSendOtp,
  verifyOtp as apiVerifyOtp,
  logout as apiLogout,
  register as apiRegister,
  request,
} from "@/lib/api";
import { registerForPush, unregisterForPush } from "@/lib/push";

/**
 * Who is signed in.
 *
 * The token lives in AsyncStorage, so a restart resumes the session rather than
 * bouncing the partner back to Login. `restoring` is true until that check has
 * finished — the root layout waits on it so no screen renders against an
 * unknown session.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  riderId?: string;
  isOnline?: boolean;
}

interface SessionValue {
  user: SessionUser | null;
  restoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Asks the server to send a one-time code to an email or mobile number. */
  requestOtp: (emailOrPhone: string) => Promise<void>;
  /** Exchanges that code for a session. */
  signInWithOtp: (emailOrPhone: string, otp: string) => Promise<void>;
  signUp: (input: {
    name: string;
    email: string;
    password: string;
    phone: string;
    referralCode?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [restoring, setRestoring] = useState(true);

  // A stored token only proves we *had* a session; ask the server whether it is
  // still good rather than trusting it and failing on the first real call.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await loadToken();
        if (!token) return;

        const { profile } = await request<{ profile: any }>("/rider/profile");
        if (cancelled) return;

        setUser({
          id: profile?.id ?? profile?._id ?? "",
          name: profile?.name ?? "",
          email: profile?.email ?? "",
          phone: profile?.phone,
          riderId: profile?.riderId,
        });
      } catch (error) {
        // Expired or revoked — drop it so the app shows Login cleanly.
        if (error instanceof ApiError && error.isAuthError) await apiLogout();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: account } = await apiLogin(email, password);
    setUser({
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      riderId: account.riderId,
      isOnline: account.isOnline,
    });
  }, []);

  const requestOtp = useCallback(async (emailOrPhone: string) => {
    await apiSendOtp(emailOrPhone);
  }, []);

  // The same shaping as signIn: one place decides what a session looks like.
  const signInWithOtp = useCallback(async (emailOrPhone: string, otp: string) => {
    const { user: account } = await apiVerifyOtp(emailOrPhone, otp);
    setUser({
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      riderId: account.riderId,
      isOnline: account.isOnline,
    });
  }, []);

  const signUp = useCallback<SessionValue["signUp"]>(async (input) => {
    const { user: account } = await apiRegister(input);
    setUser({
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      riderId: account.riderId,
      isOnline: account.isOnline,
    });
  }, []);

  const signOut = useCallback(async () => {
    // First, so this phone stops being offered this rider's work the moment
    // they sign out of it.
    await unregisterForPush();
    await apiLogout();
    setUser(null);
  }, []);

  /*
   * Tell the server where to send this rider's order requests.
   *
   * On the user rather than on each sign-in path, so a restored session
   * registers too — the token can change on its own (reinstall, restore,
   * Play Services refresh), and a stale one reaches nobody.
   */
  useEffect(() => {
    if (!user) return;
    void registerForPush();
  }, [user]);

  const value = useMemo<SessionValue>(
    () => ({ user, restoring, signIn, requestOtp, signInWithOtp, signUp, signOut }),
    [user, restoring, signIn, requestOtp, signInWithOtp, signUp, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
