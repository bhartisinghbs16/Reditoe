import React from "react";
import { Alert } from "react-native";
import { Button } from "@/components/ui";
import { useStore } from "@/lib/store";

/**
 * "Pickup Done" - the restaurant's one-tap record that the delivery partner
 * has taken the order. Replaces the old pickup-verification screen: the server
 * moves the order to out-for-delivery and tells the customer, the rider and
 * the admin console.
 */
export function PickupDoneButton({ orderId, className = "" }: { orderId: string; className?: string }) {
  const { markPickedUp } = useStore();
  const [busy, setBusy] = React.useState(false);

  const confirm = () => {
    Alert.alert("Pickup done?", "Confirm the delivery partner has collected this order.", [
      { text: "Not yet", style: "cancel" },
      {
        text: "Pickup Done",
        onPress: async () => {
          setBusy(true);
          try {
            await markPickedUp(orderId);
          } catch (reason: any) {
            Alert.alert("Couldn't record pickup", reason?.message ?? "Please try again.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Button
      label={busy ? "Updating…" : "Pickup Done"}
      icon="checkmark-done-outline"
      accent="ok"
      size="sm"
      disabled={busy}
      className={className}
      onPress={confirm}
    />
  );
}

/**
 * Asks before turning an order away, and records why.
 *
 * One mis-tap on Reject used to cancel a customer's order outright, with no
 * way back and no reason on file. Three buttons is all Android's alert holds,
 * so the two common reasons are offered and "Keep order" backs out.
 */
export function confirmReject(
  advance: (id: string, stage: "cancelled", reason?: string) => void,
  orderId: string
) {
  Alert.alert("Reject this order?", "The customer will be told it was cancelled. This can't be undone.", [
    { text: "Keep order", style: "cancel" },
    { text: "Item unavailable", style: "destructive", onPress: () => advance(orderId, "cancelled", "Item unavailable") },
    { text: "Too busy", style: "destructive", onPress: () => advance(orderId, "cancelled", "Restaurant is too busy") },
  ]);
}
