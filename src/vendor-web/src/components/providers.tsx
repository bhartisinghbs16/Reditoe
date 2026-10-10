"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { VendorProvider } from "@/lib/store";

/**
 * One client for the app. Created inside a ref so a Fast Refresh or a second
 * render doesn't hand the tree a fresh cache and refetch everything.
 */
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // A 401 will not become a 200 by asking again — the shell signs the
          // vendor out instead. Anything else gets two more tries.
          if (error instanceof ApiError && (error.isAuthError || error.status >= 400 && error.status < 500)) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeClient);

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <VendorProvider>{children}</VendorProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
