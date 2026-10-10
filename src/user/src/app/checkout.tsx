import React from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  Divider,
  EmptyState,
  IconTile,
  Txt,
  colors,
} from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { BillBreakdown } from "@/components/bill";
import { accents, shadow } from "@/lib/theme";
import { currency } from "@/lib/format";
import { useStore } from "@/lib/store";
import { api, ApiError } from "@/lib/api";
import {
  PaymentCancelled,
  PaymentUnavailable,
  canPayOnline,
  payWithRazorpay,
  type PaymentIntent,
  type PaymentRail,
  type PaymentResult,
} from "@/lib/payments";
import { RazorpayCheckout } from "@/components/razorpay-checkout";

/**
 * The Payment screen, copied from the reference: delivery address, the savings
 * strip, the total payable card, then the payment options as one open-at-a-time
 * list, and the trust strip
 * above a red "Pay Securely" bar.
 */

/**
 * The payment options, as one open-at-a-time list.
 *
 * `id` doubles as the value held in `method`, so `railFor` maps it straight to
 * the rail the gateway opens on. Cash has no rail — nothing is collected here
 * — and is only in the list when the account is allowed it.
 */
const SECTIONS = [
  {
    id: "upi",
    rail: "upi" as const,
    label: "UPI",
    detail: "Google Pay, PhonePe, Paytm & more",
    note: "You will choose your UPI app on the next screen.",
    icon: "phone-portrait-outline" as const,
    accent: "green" as const,
  },
  {
    id: "cards",
    rail: "card" as const,
    label: "Credit / Debit Card",
    detail: "Visa, Mastercard, RuPay & more",
    note: "Card details are entered on the secure payment screen, never in this app.",
    icon: "card-outline" as const,
    accent: "blue" as const,
  },
  {
    id: "netbanking",
    rail: "netbanking" as const,
    label: "Net Banking",
    detail: "All major banks supported",
    note: "You will pick your bank on the next screen.",
    icon: "business-outline" as const,
    accent: "purple" as const,
  },
  {
    id: "wallets",
    rail: "wallet" as const,
    label: "Wallets",
    detail: "Paytm, Amazon Pay & more",
    note: "You will choose your wallet on the next screen.",
    icon: "wallet-outline" as const,
    accent: "amber" as const,
  },
];

/**
 * Cash, for the accounts allowed it.
 *
 * The admin has switched this per customer all along and the order endpoint
 * has always enforced it — but the app was never told which accounts had it,
 * so cash was never offered and turning the switch on appeared to do nothing.
 */
const CASH_SECTION = {
  id: "cash",
  rail: undefined,
  label: "Cash on Delivery",
  detail: "Pay the delivery partner when your order arrives",
  note: "Please keep the exact amount ready if you can.",
  icon: "cash-outline" as const,
  accent: "red" as const,
};

export default function CheckoutScreen() {
  const router = useRouter();
  const {
    lines,
    totals,
    destination,
    placeOrder,
    commitPlacedOrder,
    customer,
    codEnabled,
  } = useStore();

  // Cash joins the list only for accounts the admin has allowed it for.
  const sections = React.useMemo(
    () => (codEnabled ? [...SECTIONS, CASH_SECTION] : SECTIONS),
    [codEnabled]
  );

  /*
   * Defaulted to a hard-coded UPI handle - "mohan@ibl" - which was sample data
   * shown to every customer as though it were their own saved ID.
   */
  const [method, setMethod] = React.useState("upi");
  const [openSection, setOpenSection] = React.useState<string | null>("upi");
  const [useWallet, setUseWallet] = React.useState(false);
  const [placing, setPlacing] = React.useState(false);
  /**
   * Whether an order for this basket now exists on the server.
   *
   * Placing an order empties the basket, which is right - it must not be
   * ordered twice. But this screen showed "Nothing to pay for" the moment the
   * basket went empty, and that happened while the payment sheet was still
   * being opened: the screen replaced itself, taking the sheet with it, and
   * the customer was told there was nothing to pay for an order they had just
   * placed. Once an order exists, this screen stays put until it navigates.
   */
  const [ordered, setOrdered] = React.useState(false);
  /**
   * What the bill said when the order was placed.
   *
   * Read from the basket, which is empty by then, so the figures are kept
   * from the moment they were true. Otherwise the amount on screen falls to
   * zero behind the payment sheet.
   */
  const billAtOrder = React.useRef<typeof totals | null>(null);
  const [billOpen, setBillOpen] = React.useState(false);
  /** The payment the native sheet is showing, if it is showing one. */
  const [sheet, setSheet] = React.useState<PaymentIntent | null>(null);
  const settle = React.useRef<{
    resolve: (receipt: PaymentResult) => void;
    reject: (error: Error) => void;
  } | null>(null);

  /** Closes the sheet and hands the outcome back to whoever is awaiting it. */
  const closeSheet = React.useCallback(
    (outcome: { receipt?: PaymentResult; error?: Error }) => {
      setSheet(null);
      const pending = settle.current;
      settle.current = null;
      if (!pending) return;
      if (outcome.receipt) pending.resolve(outcome.receipt);
      else pending.reject(outcome.error ?? new Error("The payment did not go through."));
    },
    []
  );


  // The frozen bill once there is an order; the live basket before that.
  const bill = billAtOrder.current ?? totals;

  if (lines.length === 0 && !placing && !ordered) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
        <ScreenHeader title="Payment" />
        <EmptyState
          icon="cart-outline"
          title="Nothing to pay for"
          action="Browse restaurants"
          onAction={() => router.replace("/")}
        />
      </SafeAreaView>
    );
  }

  /**
   * A tenth of the order, or the balance if that is smaller. The server is
   * what enforces this; the number here exists so the customer is not
   * surprised at the end by how little of it applied.
   */
  const WALLET_SHARE_OF_ORDER = 0.1;
  const walletCap = Math.floor(
    Math.min(customer.reditoeMoney ?? 0, (bill.toPay ?? 0) * WALLET_SHARE_OF_ORDER)
  );


  /**
   * Which rail the gateway should open on, for the method chosen here.
   *
   * Reditoe Money and EMI return nothing: the first is settled on our side and
   * never reaches the gateway, and the second is a card journey Razorpay
   * arranges itself.
   */
  const railFor = (id: string): PaymentRail | undefined => {
    if (id === "upi") return "upi";
    if (id === "cards") return "card";
    if (id === "netbanking") return "netbanking";
    if (id === "wallets") return "wallet";
    return undefined;
  };

  const methodLabel = () =>
    sections.find((section) => section.id === method)?.label ?? "UPI";

  /**
   * Opens the payment sheet and settles when the customer is done with it.
   *
   * On the web that is Razorpay's script, which needs nothing on screen. On a
   * phone it is the same checkout inside a WebView, which does - so the intent
   * goes into state, the modal renders, and the promise is settled from its
   * callbacks. Either way `onPay` below just awaits a receipt.
   */
  const collectPayment = (intent: PaymentIntent): Promise<PaymentResult> => {
    const payer = {
      name: customer.name,
      email: customer.email,
      contact: customer.phone,
    };

    if (canPayOnline()) return payWithRazorpay(intent, payer, railFor(method));

    return new Promise<PaymentResult>((resolve, reject) => {
      settle.current = { resolve, reject };
      setSheet(intent);
    });
  };

  /**
   * Takes the money, and only then places the order.
   *
   * The order row still has to be written before the payment can be opened,
   * because Razorpay charges against an order id and the amount is read from
   * the order rather than sent from this screen - the customer pays what the
   * platform worked out, not what the app asked for. But the server writes it
   * as "Payment Pending", which no restaurant, rider or admin list shows, and
   * this screen does not treat it as placed either.
   *
   * So the basket stays full and the order stays off the customer's list until
   * the receipt verifies. If the payment is cancelled, declined, or never
   * opens, the pending row is withdrawn and the customer is told plainly that
   * nothing was ordered - they still have their basket and can try again.
   * Previously every one of those endings said "Your order is placed", which
   * was untrue: nobody was cooking it.
   */
  const onPay = async () => {
    setPlacing(true);
    // Held before the basket is emptied, so the sheet and the bottom bar keep
    // showing the amount actually being charged.
    billAtOrder.current = totals;

    let pending: Awaited<ReturnType<typeof placeOrder>> | null = null;
    try {
      /*
       * Cash takes none of the gateway path: there is nothing to collect
       * here, so the order is placed as 'cod' and committed straight away
       * rather than waiting on a receipt that will never come.
       */
      if (method === "cash") {
        // No deferCommit: with nothing to collect there is no receipt to wait
        // for, so placeOrder commits it and clears the basket itself.
        const placed = await placeOrder("cod", "Cash on delivery", {
          useWallet: useWallet && walletCap > 0,
        });
        setOrdered(true);
        router.replace(`/order/${placed.id}?placed=1`);
        return;
      }

      /*
       * The server is told which gateway settles this, not which button the
       * customer pressed. It only knows 'razorpay', 'cashfree', 'wallet' and
       * 'cod', and used to fall back to 'cod' for anything else - so sending
       * the label ("UPI", "Credit / Debit Card") wrote online orders down as
       * cash orders that went to the restaurant with nothing collected. The
       * label the customer chose travels as the payment detail instead.
       */
      pending = await placeOrder("razorpay", methodLabel(), {
        deferCommit: true,
        useWallet: useWallet && walletCap > 0,
      });

      const intent = await api.createPayment(pending.id);
      const receipt = await collectPayment(intent.data);
      await api.verifyPayment({ orderId: pending.id, ...receipt });

      // Paid. Now it is an order: it joins the customer's list and the basket
      // is cleared, in that order so the screen never sees both empty.
      commitPlacedOrder(pending);
      setOrdered(true);
      router.replace(`/order/${pending.id}?placed=1&paid=1`);
    } catch (error) {
      // Withdraw the pending row so it cannot linger as a half-order. Failing
      // to cancel is not worth reporting - the row is already invisible
      // everywhere, and the customer needs to hear about the payment instead.
      if (pending) {
        await api
          .abandonOrder(pending.id)
          .catch(() => {});
      }

      // The basket is intact either way, so its bill goes back to tracking it
      // rather than staying frozen at a failed attempt.
      billAtOrder.current = null;

      if (!pending) {
        Alert.alert(
          "Could not place the order",
          error instanceof Error
            ? error.message
            : "Please check your connection and try again."
        );
        setPlacing(false);
        return;
      }

      const gatewayOff =
        error instanceof ApiError && error.code === "gateway_not_configured";
      const noSheet = error instanceof PaymentUnavailable;
      const cancelled = error instanceof PaymentCancelled;

      const message = gatewayOff
        ? "Online payment is not switched on for this account yet, so the order was not placed. Your basket has been kept."
        : cancelled
          ? "The payment was cancelled, so the order was not placed. Your basket has been kept - you can try again."
          : noSheet
            ? "This build cannot open the payment sheet, so the order was not placed. Your basket has been kept."
            : `The payment did not go through: ${
                error instanceof Error ? error.message : "unknown error"
              }. The order was not placed and your basket has been kept.`;

      Alert.alert("Order not placed", message);
    } finally {
      setPlacing(false);
    }
  };

  const trust = [
    { icon: "shield-checkmark-outline" as const, label: "100% Secure Payments" },
    { icon: "ribbon-outline" as const, label: "PCI DSS Certified" },
    { icon: "person-circle-outline" as const, label: "Your Details are Safe" },
  ];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Payment"
        subtitle="100% Secure Payments"
        subtitleIcon="lock-closed"
        right={<HeaderAction icon="headset-outline" label="Support" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-40">
        {/* Delivering to */}
        <Card className="mx-4 mt-1 flex-row items-start gap-3 p-3">
          <Ionicons name="location" size={22} color={colors.brand[600]} />
          <View className="min-w-0 flex-1">
            <Txt size="tiny" tone="muted">
              Delivering to
            </Txt>
            <View className="flex-row items-center gap-1">
              <Txt weight="bold" numberOfLines={1} className="min-w-0 flex-shrink">
                {destination.label} -{" "}
                {destination.line.split(",").slice(0, 2).join(",")}
              </Txt>
              <Ionicons name="chevron-down" size={14} color={colors.ink.soft} />
            </View>
            <Txt size="tiny" tone="muted" numberOfLines={1}>
              {destination.line.split(",").slice(2).join(",").trim() || destination.city}
            </Txt>
          </View>
          <Pressable onPress={() => router.push("/addresses")} hitSlop={10}>
            <Txt size="sm" weight="bold" tone="brand">
              Change
            </Txt>
          </Pressable>
        </Card>

        {/* Savings + total */}
        <Card className="mx-4 mt-3 overflow-hidden">
          {bill.saved > 0 && (
            <View className="flex-row items-center gap-2 bg-leaf-50 px-3 py-3">
              <Ionicons name="pricetag" size={17} color={colors.leaf[600]} />
              <Txt size="sm" weight="semibold" tone="ok" className="min-w-0 flex-1">
                Yay! You are saving {currency(bill.saved)} on this order
              </Txt>
              <Pressable
                onPress={() => setBillOpen((open) => !open)}
                hitSlop={8}
                className="flex-row items-center gap-0.5"
              >
                <Txt size="tiny" weight="bold" tone="ok">
                  View details
                </Txt>
                <Ionicons
                  name={billOpen ? "chevron-up" : "chevron-down"}
                  size={12}
                  color={colors.leaf[600]}
                />
              </Pressable>
            </View>
          )}

          <View className="flex-row items-center justify-between p-3">
            <View>
              <Txt size="lg" weight="bold">
                Total Payable
              </Txt>
              <Pressable
                onPress={() => setBillOpen((open) => !open)}
                hitSlop={8}
                className="mt-0.5 flex-row items-center gap-1"
              >
                <Txt size="tiny" weight="bold" tone="brand">
                  View bill details
                </Txt>
                <Ionicons
                  name={billOpen ? "chevron-up" : "chevron-down"}
                  size={12}
                  color={colors.brand[600]}
                />
              </Pressable>
            </View>
            <Txt size="2xl" weight="bold">
              {currency(bill.toPay)}
            </Txt>
          </View>

          {billOpen && (
            <View className="border-t border-line px-3 py-3">
              <BillBreakdown totals={bill} />
            </View>
          )}
        </Card>

        <Txt size="tiny" weight="bold" tone="muted" className="mt-6 px-4 tracking-widest">
          ALL PAYMENT OPTIONS
        </Txt>

        {/*
          One section open at a time.
          
          Every method used to be listed at once, and the gateway then listed
          them all over again, so the customer chose twice. Opening a section
          picks that rail; the gateway opens on it and offers nothing else.
        */}
        <Card className="mx-4 mt-2 overflow-hidden">
          {sections.map((section, index) => {
            const open = openSection === section.id;
            const chosen = railFor(method) === section.rail;
            return (
              <React.Fragment key={section.id}>
                {index > 0 && <Divider />}
                <Pressable
                  onPress={() => {
                    setOpenSection(open ? null : section.id);
                    if (!open) setMethod(section.id);
                  }}
                  className="flex-row items-center gap-3 p-3 active:opacity-70"
                >
                  <IconTile icon={section.icon} tint={accents[section.accent]} size={36} />
                  <View className="min-w-0 flex-1">
                    <Txt weight="semibold">{section.label}</Txt>
                    <Txt size="tiny" tone="muted" numberOfLines={1}>
                      {section.detail}
                    </Txt>
                  </View>
                  {chosen && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.brand[600]}
                    />
                  )}
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.ink.faint}
                  />
                </Pressable>

                {open && (
                  <View className="px-3 pb-3">
                    <Txt size="tiny" tone="muted">
                      {section.note}
                    </Txt>
                  </View>
                )}
              </React.Fragment>
            );
          })}

          <Divider />

          {/*
            Reditoe Money applies alongside the payment method rather than
            instead of it. It was offered as a method of its own, so a
            customer with 80 in their wallet had to either pay the whole order
            from it or not use it at all - and the server has always allowed a
            part-payment. The server decides how much of the balance a given
            order may take; this only says the customer wants it used.
          */}
          <Pressable
            onPress={() => setUseWallet((on) => !on)}
            disabled={walletCap <= 0}
            className={`flex-row items-center gap-3 px-3 py-3.5 ${
              walletCap <= 0 ? "opacity-50" : "active:opacity-70"
            }`}
          >
            <IconTile icon="cash-outline" tint={accents.red} size={36} />
            <View className="min-w-0 flex-1">
              <Txt weight="semibold">Use Reditoe Money</Txt>
              <Txt size="tiny" tone="muted" numberOfLines={1}>
                {walletCap > 0
                  ? `Up to ${currency(walletCap)} off this order · balance ${currency(customer.reditoeMoney)}`
                  : `Balance ${currency(customer.reditoeMoney)} · nothing to apply on this order`}
              </Txt>
            </View>
            <Ionicons
              name={useWallet && walletCap > 0 ? "checkbox" : "square-outline"}
              size={22}
              color={
                useWallet && walletCap > 0 ? colors.brand[600] : colors.line.strong
              }
            />
          </Pressable>

        </Card>

        {/* Trust strip */}
        <View className="mx-4 mt-4 flex-row items-center py-2">
          {trust.map((item, index) => (
            <View
              key={item.label}
              className={`flex-1 flex-row items-center justify-center gap-1.5 ${
                index > 0 ? "border-l border-line" : ""
              }`}
            >
              <Ionicons name={item.icon} size={15} color={colors.ink.soft} />
              <Txt size="micro" tone="soft" numberOfLines={1}>
                {item.label}
              </Txt>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Pay bar */}
      <View className="absolute inset-x-0 bottom-0 bg-surface px-4 pb-4 pt-2">
        <View
          style={shadow.raised}
          className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-3"
        >
          <View>
            <Txt size="xl" weight="bold">
              {currency(bill.toPay)}
            </Txt>
            <Pressable
              onPress={() => setBillOpen((open) => !open)}
              hitSlop={8}
              className="flex-row items-center gap-1"
            >
              <Txt size="tiny" weight="bold" tone="brand">
                View bill details
              </Txt>
              <Ionicons
                name={billOpen ? "chevron-down" : "chevron-up"}
                size={12}
                color={colors.brand[600]}
              />
            </Pressable>
          </View>

          {/*
            Says what the money is going out through, next to the button that
            sends it. The screen offered a choice and then never repeated it,
            so it was possible to pay by something other than what was picked
            without noticing.
          */}
          <Pressable
            onPress={onPay}
            disabled={placing}
            className={`h-14 min-w-0 flex-1 items-center justify-center rounded-tile bg-brand-600 ${
              placing ? "opacity-70" : "active:opacity-90"
            }`}
          >
            <Txt size="lg" weight="bold" tone="white">
              {placing ? "Processing…" : `Pay ${currency(bill.toPay)}`}
            </Txt>
            {!placing && (
              <Txt size="micro" tone="white" className="opacity-90">
                via {methodLabel()}
              </Txt>
            )}
          </Pressable>
        </View>
      </View>

      <RazorpayCheckout
        intent={sheet}
        payer={{
          name: customer.name,
          email: customer.email,
          contact: customer.phone,
        }}
        onSuccess={(receipt) => closeSheet({ receipt })}
        onCancel={() => closeSheet({ error: new PaymentCancelled() })}
        onError={(message) => closeSheet({ error: new Error(message) })}
        rail={railFor(method)}
      />
    </SafeAreaView>
  );
}
