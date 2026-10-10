import React from "react";
import { api } from "@/lib/api";

/**
 * The order's real pickup code, from the server.
 *
 * This used to invent one with Math.random and count it down on a local
 * five-minute clock — a code the backend had never heard of, so the rider
 * entering it faithfully would always be told it was wrong. The code is minted
 * with the order and lives until the pickup is verified; there is nothing to
 * expire client-side and nothing to regenerate, so `refresh` re-reads rather
 * than re-rolls.
 */
export function usePickupCode(orderId: string | undefined) {
  const [code, setCode] = React.useState<string | null>(null);
  const [qr, setQr] = React.useState<string | null>(null);
  const [verified, setVerified] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{
        verified: boolean;
        code?: string;
        qr?: string;
      }>(`/vendor/orders/${orderId}/pickup-code`);
      setVerified(Boolean(data.verified));
      setCode(data.code ?? null);
      setQr(data.qr ?? null);
    } catch (reason: any) {
      setError(reason?.message ?? "Could not load the pickup code.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { code, qr, verified, error, loading, refresh: load };
}

