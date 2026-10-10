import { Platform } from "react-native";

/**
 * Taking the money.
 *
 * The checkout screen used to show a full payment picker - UPI, cards, net
 * banking, wallets, EMI - and then place the order without charging anybody.
 * The order was created with its payment still pending, so no money was lost,
 * but no money was collected either: every "online" order was really a pay
 * later order wearing a UPI label.
 *
 * This opens Razorpay's own checkout. The server decides the amount and hands
 * back the payment it created; nothing here is trusted to say what is owed,
 * because anything this file could claim, a customer could claim too.
 *
 * Razorpay's checkout is a browser script. On the web builds - which is what
 * the demo links serve - that is exactly right. A native build needs
 * react-native-razorpay instead, so on native this reports that it is
 * unavailable and the caller falls back to placing the order unpaid rather
 * than stranding the customer on a dead button.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface PaymentIntent {
  keyId: string;
  razorpayOrderId: string;
  /** In paise, as Razorpay counts it. */
  amount: number;
  currency: string;
}

export interface PaymentResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface PayerDetails {
  name?: string;
  email?: string;
  contact?: string;
}

/**
 * The rails the checkout can send someone down.
 *
 * These are Razorpay's own method names, so they can be handed to its
 * checkout as-is. `wallet` here means a third-party wallet (Paytm, Amazon
 * Pay) - Reditoe Money is settled on our side and never reaches the gateway.
 */
export type PaymentRail = "upi" | "card" | "netbanking" | "wallet";

/** Thrown when the customer closes the payment sheet without paying. */
export class PaymentCancelled extends Error {
  constructor() {
    super("Payment was cancelled.");
    this.name = "PaymentCancelled";
  }
}

/** Thrown when this build has no way to show a payment sheet at all. */
export class PaymentUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentUnavailable";
  }
}

export const canPayOnline = () => Platform.OS === "web";

let scriptLoad: Promise<void> | null = null;

/**
 * Razorpay's script is fetched from their servers, so a customer behind a
 * blocked network gets a clear failure here rather than a checkout that never
 * opens. The promise is cached so returning to checkout does not refetch it.
 */
function loadCheckoutScript(): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(
      new PaymentUnavailable("Online payment needs a browser.")
    );
  }

  if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
    return Promise.resolve();
  }

  if (!scriptLoad) {
    scriptLoad = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // Cleared so a later attempt on a working connection can retry.
        scriptLoad = null;
        reject(
          new PaymentUnavailable(
            "Could not reach the payment provider. Check your connection and try again."
          )
        );
      };
      document.body.appendChild(script);
    });
  }

  return scriptLoad;
}

/**
 * Opens the payment sheet and settles when the customer has paid, cancelled,
 * or failed. The result is handed straight to the server to verify - it is
 * not evidence of payment on its own, only Razorpay's signature is, and only
 * the server holds the key that can check it.
 */
export async function payWithRazorpay(
  intent: PaymentIntent,
  payer: PayerDetails = {},
  rail?: PaymentRail
): Promise<PaymentResult> {
  if (!canPayOnline()) {
    throw new PaymentUnavailable(
      "This build cannot take card or UPI payments. Please choose Cash on Delivery."
    );
  }

  await loadCheckoutScript();

  const Razorpay = (window as unknown as { Razorpay?: new (o: unknown) => { open(): void } })
    .Razorpay;
  if (!Razorpay) {
    throw new PaymentUnavailable("The payment provider did not load.");
  }

  return new Promise<PaymentResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const checkout = new Razorpay({
      key: intent.keyId,
      order_id: intent.razorpayOrderId,
      amount: intent.amount,
      currency: intent.currency,
      name: "Reditoe",
      description: "Food order",
      prefill: {
        name: payer.name ?? "",
        email: payer.email ?? "",
        contact: payer.contact ?? "",
        // Opens the sheet already on the rail the customer chose.
        ...(rail ? { method: rail } : {}),
      },
      /*
       * Show only the rail they picked.
       *
       * The customer chose a payment method on our checkout screen and then
       * Razorpay opened listing every method again, so they picked twice and
       * could leave on a different one than the screen said. Turning the
       * default blocks off and sequencing the single chosen rail means UPI
       * opens UPI, card opens card, and nothing else is offered.
       *
       * Card details are collected by Razorpay inside its own sheet, never by
       * this app - it must stay that way, or the card number passes through
       * our code and the platform falls in scope for PCI-DSS.
       */
      ...(rail
        ? {
            config: {
              display: {
                blocks: {
                  chosen: {
                    name:
                      rail === "upi"
                        ? "Pay by UPI"
                        : rail === "card"
                          ? "Pay by card"
                          : rail === "netbanking"
                            ? "Pay by netbanking"
                            : "Pay by wallet",
                    instruments: [{ method: rail }],
                  },
                },
                sequence: ["block.chosen"],
                preferences: { show_default_blocks: false },
              },
            },
          }
        : {}),
      theme: { color: "#E23744" },
      handler: (response: PaymentResult) => finish(() => resolve(response)),
      modal: {
        escape: true,
        backdropclose: false,
        ondismiss: () => finish(() => reject(new PaymentCancelled())),
      },
    }) as unknown as {
      open(): void;
      on?(event: string, cb: (e: { error?: { description?: string } }) => void): void;
    };

    // A declined card reports here rather than through the handler; without
    // this the sheet closes and the promise waits for ever.
    checkout.on?.("payment.failed", (event) =>
      finish(() =>
        reject(
          new Error(
            event?.error?.description ?? "The payment did not go through."
          )
        )
      )
    );

    checkout.open();
  });
}
