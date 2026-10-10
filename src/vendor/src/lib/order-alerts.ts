import * as Notifications from "expo-notifications";

/**
 * Telling the vendor an order has arrived.
 *
 * A kitchen is not watching a phone. Orders appeared only when the app was
 * closed and reopened, and arrived in silence when it was - so the first a
 * vendor knew of an order was a customer ringing to ask where the food was.
 *
 * Two halves: the store polls for new orders, and this makes a noise about
 * the ones it has not announced before. Announced ids are remembered for the
 * life of the process, because a poll returns the same order every few
 * seconds until it is accepted and a bell every few seconds is worse than
 * no bell at all.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    // The point of the exercise: a kitchen has to hear it.
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const announced = new Set<string>();
let permissionAsked = false;

/** Asked once, the first time there is something worth announcing. */
async function ensurePermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (permissionAsked || existing.canAskAgain === false) return false;

  permissionAsked = true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Android needs a channel before a notification can make a sound, and the
 * importance has to be high or the system delivers it silently.
 */
export async function prepareOrderAlerts() {
  try {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "New orders",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 400, 200, 400],
      enableVibrate: true,
    });
  } catch {
    // iOS has no channels, and a failure here only costs the sound.
  }
}

/**
 * Announces orders this process has not announced before.
 *
 * Takes the whole current list rather than a single order, so the caller can
 * hand over whatever the poll returned without tracking what is new itself.
 */
export async function announceNewOrders(
  orders: { id: string; reference: string; total?: number }[]
) {
  const fresh = orders.filter((order) => !announced.has(order.id));
  if (fresh.length === 0) return;

  // Marked before the await: a slow permission prompt must not let the next
  // poll announce the same order a second time.
  fresh.forEach((order) => announced.add(order.id));

  if (!(await ensurePermission())) return;

  for (const order of fresh) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "New order received",
          body: order.total
            ? `Order ${order.reference} — ₹${Math.round(order.total)}`
            : `Order ${order.reference}`,
          sound: "default",
          data: { orderId: order.id },
        },
        // Immediately.
        trigger: null,
      });
    } catch {
      // A refused notification is not a reason to drop the order.
    }
  }
}

/** Forgets what has been announced — used when a different vendor signs in. */
export function resetOrderAlerts() {
  announced.clear();
}
