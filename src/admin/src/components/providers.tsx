"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, api, clearToken, getToken, type AdminUser } from "@/lib/api";
import { MOCK_ENABLED } from "@/lib/mock-data";

/* ── Session ────────────────────────────────────────────────────────────── */

interface SessionValue {
  user: AdminUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  setUser: (user: AdminUser | null) => void;
  signOut: () => void;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <Providers>");
  return ctx;
}

function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = React.useState<AdminUser | null>(null);
  const [status, setStatus] = React.useState<SessionValue["status"]>("loading");

  const signOut = React.useCallback(() => {
    clearToken();
    setUser(null);
    setStatus("unauthenticated");
    router.replace("/login");
  }, [router]);

  React.useEffect(() => {
    let cancelled = false;

    async function restore() {
      // In fixture mode there is no real credential to check — go straight to
      // the mocked profile so the console can be reviewed without a backend.
      if (!MOCK_ENABLED && !getToken()) {
        setStatus("unauthenticated");
        return;
      }
      try {
        const data = await api.get<{ user: AdminUser } | AdminUser>("/admin/auth/me");
        if (cancelled) return;
        const resolved = "user" in (data as { user?: AdminUser })
          ? (data as { user: AdminUser }).user
          : (data as AdminUser);
        setUser(resolved);
        setStatus("authenticated");
      } catch (error) {
        if (cancelled) return;
        // A bad/expired token means the session is gone; anything else (e.g. the
        // API being down) keeps the token so a refresh can recover.
        if (error instanceof ApiError && error.isAuthError) clearToken();
        setStatus("unauthenticated");
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = React.useMemo<SessionValue>(
    () => ({
      user,
      status,
      setUser: (next) => {
        setUser(next);
        setStatus(next ? "authenticated" : "unauthenticated");
      },
      signOut,
    }),
    [user, status, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/* ── Root providers ─────────────────────────────────────────────────────── */

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.isAuthError) return false;
              return failureCount < 2;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <SessionProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="top-right" richColors closeButton />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
