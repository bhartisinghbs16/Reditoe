/**
 * The four stages a customer is told their order is in.
 *
 * The server works these out (`stage` on the tracking feed) from the same
 * status the vendor, delivery and admin apps all write, and that is what the
 * Live Tracking screen follows. `stageFromStatus` is only what to say in the
 * moment before the feed has answered, or for a finished order that is not
 * being polled any more.
 *
 * The tracker used to be a list keyed on the raw status string. Any status the
 * list did not name - 'Ready', the whole time a rider is on the way to the
 * restaurant - matched nothing and left the screen on its first stop, and the
 * stop labelled "Picked Up" was in fact the kitchen's 'Processing'.
 */

export type OrderStage = "preparing" | "picked_up" | "on_the_way" | "completed";

/** An order that will go no further; not a stop on the tracker. */
export type TrackedStage = OrderStage | "cancelled";

export const ORDER_STAGES: {
  key: OrderStage;
  label: string;
  icon: "restaurant-outline" | "bag-check-outline" | "bicycle-outline" | "checkmark-circle-outline";
}[] = [
  { key: "preparing", label: "Preparing", icon: "restaurant-outline" },
  { key: "picked_up", label: "Picked Up", icon: "bag-check-outline" },
  { key: "on_the_way", label: "On the Way", icon: "bicycle-outline" },
  { key: "completed", label: "Completed", icon: "checkmark-circle-outline" },
];

const KNOWN: ReadonlySet<string> = new Set([
  "preparing",
  "picked_up",
  "on_the_way",
  "completed",
  "cancelled",
]);

/** The server's stage, if it sent one this app understands. */
export function asStage(value: unknown): TrackedStage | null {
  return typeof value === "string" && KNOWN.has(value) ? (value as TrackedStage) : null;
}

/**
 * A stage from the order's status alone.
 *
 * 'OnWay' is the one status that spans two stages (just collected, and under
 * way), and the status cannot say which - so it reads as "Picked Up", the
 * earlier of the two, until the tracking feed has the rider's position and can.
 */
export function stageFromStatus(status?: string): TrackedStage {
  switch (status) {
    case "Delivered":
      return "completed";
    case "Cancelled":
    case "Refunded":
      return "cancelled";
    case "OnWay":
      return "picked_up";
    default:
      return "preparing";
  }
}

/** Where the stage sits on the tracker; -1 when nothing on it is reached. */
export function stageIndex(stage: TrackedStage): number {
  return ORDER_STAGES.findIndex((s) => s.key === stage);
}
