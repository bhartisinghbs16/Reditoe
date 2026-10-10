import React from "react";
import { ActivityIndicator, Modal, View } from "react-native";
import { WebView } from "react-native-webview";
import type { PaymentIntent, PaymentRail, PaymentResult, PayerDetails } from "@/lib/payments";
import { colors } from "@/lib/theme";

/**
 * Razorpay's checkout, on a phone.
 *
 * Razorpay ships a browser script and a native SDK. The script is what the web
 * build uses; a native build has no document to attach it to, so this puts it
 * in a WebView instead and listens for the result. That avoids a native module
 * - which would mean a custom development client, and no more testing in Expo
 * Go - for a screen that is a payment form and nothing more.
 *
 * The receipt that comes back is not proof of payment. It is handed to the
 * server, which holds the key that can tell a real signature from an invented
 * one, and which is the only party that can mark the order paid.
 */

interface Props {
  /** The payment to collect, or null when there is nothing to collect. */
  intent: PaymentIntent | null;
  payer: PayerDetails;
  /** Open the sheet on this rail alone, rather than listing every method. */
  rail?: PaymentRail;
  onSuccess: (receipt: PaymentResult) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

type Message =
  | { type: "success"; data: PaymentResult }
  | { type: "cancel" }
  | { type: "failed"; message?: string };

/**
 * Razorpay's options, as a page that opens the sheet as soon as it loads.
 *
 * `</` is escaped on the way in: a name or an email address containing it
 * would otherwise close the script tag early and leave a blank screen.
 */
function checkoutPage(intent: PaymentIntent, payer: PayerDetails, rail?: PaymentRail): string {
  const options = {
    key: intent.keyId,
    order_id: intent.razorpayOrderId,
    amount: intent.amount,
    currency: intent.currency,
    name: "Reditoe Food Delivery",
    description: "Secure payment for your food order",
    prefill: {
      name: payer.name ?? "",
      email: payer.email ?? "",
      contact: payer.contact ?? "",
      // Opens on the rail the customer already chose on the checkout screen.
      ...(rail ? { method: rail } : {}),
    },
    /*
     * Only the chosen rail is offered. The customer picked a method on our
     * screen and then this sheet listed them all over again, so they chose
     * twice and could end up paying by something the screen did not say.
     *
     * Card details are typed into Razorpay's own sheet, never into this app.
     * That is deliberate: routing a card number through our code would put
     * the platform in scope for PCI-DSS.
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
  };

  const json = JSON.stringify(options).replace(/</g, "\\u003c");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>html,body{margin:0;height:100%;background:#fff}</style>
  </head>
  <body>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      function send(message) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }

      try {
        if (typeof Razorpay === "undefined") {
          send({ type: "failed", message: "Could not reach the payment provider." });
        } else {
          var options = ${json};
          options.handler = function (response) {
            send({ type: "success", data: response });
          };
          options.modal = {
            escape: true,
            backdropclose: false,
            ondismiss: function () { send({ type: "cancel" }); }
          };

          var checkout = new Razorpay(options);
          checkout.on("payment.failed", function (event) {
            send({
              type: "failed",
              message: (event && event.error && event.error.description) || "The payment did not go through."
            });
          });
          checkout.open();
        }
      } catch (error) {
        send({ type: "failed", message: String(error && error.message ? error.message : error) });
      }
    </script>
  </body>
</html>`;
}

export function RazorpayCheckout({
  intent,
  payer,
  rail,
  onSuccess,
  onCancel,
  onError,
}: Props) {
  /**
   * Whatever happens first wins. Razorpay reports a dismissal after a failure
   * as well, and without this the screen would be told the customer cancelled
   * a payment it had already reported as declined.
   */
  const settled = React.useRef(false);

  React.useEffect(() => {
    if (intent) settled.current = false;
  }, [intent]);

  const once = (fn: () => void) => {
    if (settled.current) return;
    settled.current = true;
    fn();
  };

  if (!intent) return null;

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => once(onCancel)}
      presentationStyle="fullScreen"
    >
      <View className="flex-1 bg-surface">
        <WebView
          source={{
            html: checkoutPage(intent, payer, rail),
            // Razorpay refuses to open from about:blank, which is what a bare
            // html source is served as.
            baseUrl: "https://checkout.razorpay.com",
          }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          // UPI apps and bank pages are opened by the sheet itself.
          setSupportMultipleWindows={false}
          startInLoadingState
          renderLoading={() => (
            <View className="flex-1 items-center justify-center bg-surface">
              <ActivityIndicator size="large" color={colors.brand[600]} />
            </View>
          )}
          onError={() =>
            once(() => onError("Could not open the payment page."))
          }
          onMessage={(event) => {
            let message: Message;
            try {
              message = JSON.parse(event.nativeEvent.data) as Message;
            } catch {
              return;
            }

            if (message.type === "success") once(() => onSuccess(message.data));
            else if (message.type === "cancel") once(onCancel);
            else
              once(() =>
                onError(message.message ?? "The payment did not go through.")
              );
          }}
        />
      </View>
    </Modal>
  );
}
