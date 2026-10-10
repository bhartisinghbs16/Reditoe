"use client";

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  fetchCategories,
  fetchMenu,
  fetchOrders,
  fetchRestaurant,
  fetchStats,
  setMenuItemAvailability,
  setRestaurantOpen,
  updateOrderStatus,
  ORDER_STAGES,
  type MenuCategory,
  type MenuItem,
  type Order,
  type OrderStage,
  type OrderStatus,
  type Restaurant,
  type VendorStats,
} from "@/lib/vendor-api";

/**
 * The single place screens read from.
 *
 * Everything comes off the API now; everything derived — today's figures,
 * stage counts — is still computed here rather than stored, so no two screens
 * can disagree about the same number.
 *
 * Mutations write through the API and then invalidate, rather than editing a
 * local copy: the backend runs a state machine on order transitions, and a
 * screen that guessed the next state would eventually disagree with it.
 */

interface StoreValue {
  orders: Order[];
  menu: MenuItem[];
  categories: MenuCategory[];
  profile: Restaurant | null;
  stats: VendorStats | null;

  /**
   * First-load flags, one per resource rather than one for the lot: a screen
   * that only needs the menu must not blank itself because the order board is
   * refetching in the background.
   */
  loading: boolean;
  loadingOrders: boolean;
  loadingMenu: boolean;
  loadingProfile: boolean;
  /** Set when the API could not be reached or refused the request. */
  error: ApiError | null;
  refetch: () => void;

  advance: (orderId: string, status: OrderStatus) => void;
  advancing: string | null;
  toggleAvailability: (id: string, next: boolean) => void;

  storeOpen: boolean;
  setStoreOpen: (open: boolean) => void;

  today: {
    orders: number;
    revenue: number;
    averageOrder: number;
    itemsSold: number;
    cancelled: number;
  };
  stageCounts: Record<OrderStage, number>;
  /** Orders the vendor still has to touch — drives the sidebar and topbar. */
  liveCount: number;
}

const StoreContext = React.createContext<StoreValue | null>(null);

export function useVendor() {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useVendor must be used inside <VendorProvider>");
  return ctx;
}

/** First real error across the core queries, if any. */
function firstError(...queries: UseQueryResult<unknown, Error>[]) {
  for (const query of queries) {
    if (query.error instanceof ApiError) return query.error;
  }
  return null;
}

export function VendorProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const enabled = status === "authenticated";
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    enabled,
    // A kitchen screen that is a minute stale is a kitchen screen that is
    // wrong; the board is the one thing worth polling.
    refetchInterval: 20_000,
  });
  const menuQuery = useQuery({ queryKey: ["menu"], queryFn: fetchMenu, enabled });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    enabled,
  });
  const restaurantQuery = useQuery({
    queryKey: ["restaurant"],
    queryFn: fetchRestaurant,
    enabled,
  });
  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    enabled,
    refetchInterval: 60_000,
  });

  const orders = React.useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const menu = React.useMemo(() => menuQuery.data ?? [], [menuQuery.data]);
  const categories = React.useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  );
  const profile = restaurantQuery.data ?? null;
  const stats = statsQuery.data ?? null;

  /* ── Mutations ────────────────────────────────────────────────────────── */

  const advanceMutation = useMutation({
    mutationFn: ({ orderId, status: next }: { orderId: string; status: OrderStatus }) =>
      updateOrderStatus(orderId, next),
    onSuccess: (_result, variables) => {
      toast.success(`Order moved to ${variables.status}`);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not update the order");
    },
  });

  const availabilityMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      setMenuItemAvailability(id, next),
    // Flip the switch immediately, roll back if the server disagrees — a
    // toggle that waits for a round trip feels broken.
    onMutate: async ({ id, next }) => {
      await queryClient.cancelQueries({ queryKey: ["menu"] });
      const previous = queryClient.getQueryData<MenuItem[]>(["menu"]);
      queryClient.setQueryData<MenuItem[]>(["menu"], (current) =>
        (current ?? []).map((item) =>
          item.id === id ? { ...item, available: next } : item
        )
      );
      return { previous };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["menu"], context.previous);
      toast.error(error.message || "Could not update the item");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["menu"] });
    },
  });

  const openMutation = useMutation({
    mutationFn: (open: boolean) => setRestaurantOpen(open),
    onMutate: async (open) => {
      await queryClient.cancelQueries({ queryKey: ["restaurant"] });
      const previous = queryClient.getQueryData<Restaurant>(["restaurant"]);
      queryClient.setQueryData<Restaurant>(["restaurant"], (current) =>
        current ? { ...current, isOpen: open } : current
      );
      return { previous };
    },
    onSuccess: (_result, open) => {
      toast.success(open ? "Store is open" : "Store is closed");
    },
    onError: (error: Error, _open, context) => {
      if (context?.previous)
        queryClient.setQueryData(["restaurant"], context.previous);
      toast.error(error.message || "Could not change the store status");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  /* ── Derived ──────────────────────────────────────────────────────────── */

  const today = React.useMemo(() => {
    // A cancelled order is not revenue, and shouldn't dilute the average.
    const billed = orders.filter((order) => order.stage !== "cancelled");
    const revenue = billed.reduce((sum, order) => sum + order.total, 0);
    const itemsSold = billed.reduce((sum, order) => sum + order.itemCount, 0);
    return {
      orders: billed.length,
      revenue,
      averageOrder: billed.length > 0 ? Math.round(revenue / billed.length) : 0,
      itemsSold,
      cancelled: orders.length - billed.length,
    };
  }, [orders]);

  const stageCounts = React.useMemo(() => {
    const counts = Object.fromEntries(
      ORDER_STAGES.map((stage) => [stage, 0])
    ) as Record<OrderStage, number>;
    for (const order of orders) counts[order.stage] += 1;
    return counts;
  }, [orders]);

  const refetch = React.useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  const value = React.useMemo<StoreValue>(
    () => ({
      orders,
      menu,
      categories,
      profile,
      stats,
      loading:
        enabled &&
        (ordersQuery.isPending ||
          menuQuery.isPending ||
          restaurantQuery.isPending ||
          statsQuery.isPending),
      loadingOrders: enabled && ordersQuery.isPending,
      loadingMenu: enabled && menuQuery.isPending,
      loadingProfile: enabled && restaurantQuery.isPending,
      error: firstError(ordersQuery, menuQuery, restaurantQuery, statsQuery),
      refetch,
      advance: (orderId, status) => advanceMutation.mutate({ orderId, status }),
      advancing: advanceMutation.isPending
        ? advanceMutation.variables.orderId
        : null,
      toggleAvailability: (id, next) => availabilityMutation.mutate({ id, next }),
      storeOpen: profile?.isOpen ?? true,
      setStoreOpen: (open) => openMutation.mutate(open),
      today,
      stageCounts,
      liveCount:
        stageCounts.new + stageCounts.preparing + stageCounts.ready,
    }),
    [
      orders,
      menu,
      categories,
      profile,
      stats,
      enabled,
      ordersQuery,
      menuQuery,
      restaurantQuery,
      statsQuery,
      refetch,
      advanceMutation,
      availabilityMutation,
      openMutation,
      today,
      stageCounts,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
