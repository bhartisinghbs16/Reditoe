import { useCallback } from "react";
import { useRouter } from "expo-router";

/**
 * Back that cannot dead-end. A screen reached by `replace` (sign-up after the
 * code check, or a cold start into a deep link) has no history, and a bare
 * `router.back()` there does nothing. Falls back to the root, where the
 * session gate sends a signed-out vendor on to Login.
 */
export function useSafeBack() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);
}
