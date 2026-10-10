import React from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  Divider,
  IconTile,
  Note,
  SectionHead,
  Txt,
  colors,
} from "@/components/ui";
import { ScreenHeader, HeaderAction } from "@/components/screen-header";
import { RazorpayCheckout } from "@/components/razorpay-checkout";
import {
  PaymentCancelled,
  canPayOnline,
  payWithRazorpay,
  type PaymentIntent,
  type PaymentResult,
} from "@/lib/payments";
import { api } from "@/lib/api";
import { accents } from "@/lib/theme";
import { walletTransactions as sampleTransactions } from "@/lib/data";
import { useStore } from "@/lib/store";

/**
 * "Reditoe Wallet", copied from the reference: the pink balance card, the four
 * quick actions, the Reditoe Money promo and the recent transaction list.
 *
 * Reditoe Money is store credit and is not withdrawable, so there is no
 * send-to-bank form on it.
 */

/** The smallest top-up the server will take. Kept in step with the API. */
const MIN_TOPUP = 100;
const TOPUP_CHOICES = [100, 200, 500, 1000];

export default function WalletScreen() {
  const router = useRouter();
  const { customer, signedIn, wallet, walletTransactions, reloadAuthedData } =
    useStore();

  /*
   * Re-read the wallet every time this screen comes forward.
   *
   * It was loaded once at sign-in and never again, so money added by support
   * while the app sat open simply did not appear - the customer was told a
   * balance that was hours stale.
   */
  useFocusEffect(
    React.useCallback(() => {
      if (signedIn) void reloadAuthedData();
    }, [signedIn, reloadAuthedData])
  );

  /*
   * The signed-in customer's own ledger, even when it is empty.
   *
   * This fell back to the sample ledger whenever the real one had nothing in
   * it, so a customer who had never topped up was shown somebody else's
   * top-ups and cashbacks against their own balance. The samples now stand in
   * only while nobody is signed in, so the screen is not blank before an
   * account exists.
   */
  const balance = wallet?.balance ?? customer.walletBalance;
  const held = wallet?.heldAmount ?? 0;
  const ledger = signedIn
      ? walletTransactions.map((txn) => ({
          id: txn.id,
          title: txn.title,
          // The API ledger carries no icon or category, so credits and debits
          // are styled by direction.
          detail: new Date(txn.at).toLocaleString("en-IN"),
          amount: txn.amount,
          icon: (txn.amount >= 0 ? "wallet" : "business") as "wallet" | "business",
          accent: (txn.amount >= 0 ? "green" : "purple") as "green" | "purple",
          at: new Date(txn.at).toLocaleDateString("en-IN"),
        }))
      : sampleTransactions;

  /*
   * Recent means recent. "View All" and the Transaction History action open
   * the rest rather than doing nothing, which is what they did before.
   */
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? ledger : ledger.slice(0, 5);

  /* ── Adding money ───────────────────────────────────────────────────────
   *
   * The button was wired to nothing at all. It now takes a payment: the
   * server starts one with the gateway, the customer pays, and the balance
   * moves only once Razorpay's signed receipt has been checked.
   */
  const [topUpOpen, setTopUpOpen] = React.useState(false);
  const [topUpAmount, setTopUpAmount] = React.useState("500");
  const [busy, setBusy] = React.useState(false);
  const [sheet, setSheet] = React.useState<PaymentIntent | null>(null);
  const settle = React.useRef<{
    resolve: (r: PaymentResult) => void;
    reject: (e: unknown) => void;
  } | null>(null);

  const finishTopUp = async (receipt: PaymentResult) => {
    await api.verifyWalletTopUp(receipt);
    await reloadAuthedData();
    setTopUpOpen(false);
    Alert.alert("Wallet topped up", "Your balance has been updated.");
  };

  const startTopUp = async () => {
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount < MIN_TOPUP) {
      Alert.alert("Enter an amount", `The smallest top-up is ₹${MIN_TOPUP}.`);
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.createWalletTopUp(amount);
      const intent: PaymentIntent = {
        keyId: data.keyId,
        razorpayOrderId: data.razorpayOrderId,
        amount: data.amount,
        currency: data.currency,
      };
      const payer = {
        name: customer.name,
        email: customer.email,
        contact: customer.phone,
      };

      // The browser builds open Razorpay's own script; the phone gets the
      // same checkout inside a sheet, exactly as the order flow does.
      const receipt = canPayOnline()
        ? await payWithRazorpay(intent, payer)
        : await new Promise<PaymentResult>((resolve, reject) => {
            settle.current = { resolve, reject };
            setSheet(intent);
          });

      await finishTopUp(receipt);
    } catch (error) {
      if (!(error instanceof PaymentCancelled)) {
        Alert.alert(
          "Top-up failed",
          error instanceof Error ? error.message : "Please try again."
        );
      }
    } finally {
      setBusy(false);
      setSheet(null);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader
        title="Reditoe Wallet"
        subtitle="All your wallet transactions"
        right={<HeaderAction icon="help-circle-outline" label="Wallet Help" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
        {/* Balance */}
        <View className="mx-4 mt-1 flex-row items-center gap-3 rounded-card bg-brand-50 p-4">
          <Ionicons name="wallet" size={52} color={colors.brand[600]} />
          <View className="min-w-0 flex-1">
            <Txt size="sm" weight="semibold" tone="soft">
              Available Balance
            </Txt>
            <Txt size="3xl" weight="bold">
              ₹{balance.toFixed(2)}
            </Txt>
            {/* A label for what the balance is, not a link. It carried a
                chevron and no handler, so it read as a way through to
                something that did not exist. */}
            <Txt size="tiny" weight="bold" tone="soft" className="mt-0.5">
              Reditoe Money
            </Txt>
            {/*
              Say it here rather than at checkout. Held money is still in the
              balance above, so finding out it cannot be spent while paying
              for food reads as the app losing it.
            */}
            {held > 0 ? (
              <Txt size="tiny" weight="semibold" tone="warn" className="mt-1">
                ₹{held.toFixed(2)} on hold · ₹{(balance - held).toFixed(2)} usable
              </Txt>
            ) : null}
          </View>

          <View className="items-end gap-2">
            <Pressable
              onPress={() => setTopUpOpen((open) => !open)}
              accessibilityLabel="Add money to your wallet"
              className="flex-row items-center gap-1.5 rounded-tile bg-brand-600 px-4 py-3 active:opacity-90"
            >
              <Ionicons name="add" size={16} color="#ffffff" />
              <Txt size="sm" weight="bold" tone="white">
                Add Money
              </Txt>
            </Pressable>
            <View className="flex-row items-center gap-1">
              <Ionicons name="shield-checkmark" size={12} color={colors.leaf[600]} />
              <Txt size="micro" tone="soft">
                100% Secure Payments
              </Txt>
            </View>
          </View>
        </View>

        {/*
          Quick actions. All three carried no handler at all, so the row was
          three pictures that did nothing when pressed.
        */}
        <Card className="mx-4 mt-4 flex-row py-3">
          {[
            {
              icon: "wallet-outline" as const,
              label: "Add Money",
              accent: "green" as const,
              onPress: () => setTopUpOpen((open) => !open),
            },
            {
              icon: "time-outline" as const,
              label: "Transaction History",
              accent: "purple" as const,
              onPress: () => setShowAll(true),
            },
            {
              icon: "ticket-outline" as const,
              label: "My Coupons",
              accent: "blue" as const,
              onPress: () => router.push("/offers"),
            },
          ].map((action, index) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              accessibilityLabel={action.label}
              className={`flex-1 items-center gap-1.5 px-1 active:opacity-70 ${
                index > 0 ? "border-l border-line" : ""
              }`}
            >
              <IconTile icon={action.icon} tint={accents[action.accent]} size={46} />
              <Txt size="micro" weight="semibold" numberOfLines={2} className="text-center">
                {action.label}
              </Txt>
            </Pressable>
          ))}
        </Card>

        {/* Where the money actually goes in. */}
        {topUpOpen ? (
          <Card className="mx-4 mt-3 p-4">
            <Txt weight="bold">Add money to your wallet</Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              Paid securely through Razorpay. The balance moves once the
              payment is confirmed.
            </Txt>

            <View className="mt-3 flex-row gap-2">
              {TOPUP_CHOICES.map((amount) => {
                const chosen = Number(topUpAmount) === amount;
                return (
                  <Pressable
                    key={amount}
                    onPress={() => setTopUpAmount(String(amount))}
                    className={`flex-1 items-center rounded-tile border py-2.5 active:opacity-70 ${
                      chosen ? "border-brand-600 bg-brand-50" : "border-line bg-surface"
                    }`}
                  >
                    <Txt size="sm" weight="bold" tone={chosen ? "brand" : "default"}>
                      ₹{amount}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>

            <View className="mt-3 flex-row items-center gap-2 rounded-tile border border-line px-3">
              <Txt weight="bold" tone="muted">
                ₹
              </Txt>
              <TextInput
                value={topUpAmount}
                onChangeText={setTopUpAmount}
                keyboardType="number-pad"
                placeholder="Other amount"
                placeholderTextColor={colors.ink.faint}
                accessibilityLabel="Top-up amount"
                className="h-11 flex-1 text-ink-default"
              />
            </View>

            <Pressable
              onPress={startTopUp}
              disabled={busy}
              accessibilityLabel="Pay and add money"
              className={`mt-3 h-12 flex-row items-center justify-center gap-2 rounded-tile bg-brand-600 active:opacity-90 ${
                busy ? "opacity-60" : ""
              }`}
            >
              <Ionicons name="lock-closed" size={15} color="#ffffff" />
              <Txt weight="bold" tone="white">
                {busy ? "Opening payment…" : `Pay ₹${topUpAmount || 0}`}
              </Txt>
            </Pressable>
          </Card>
        ) : null}

        {/* Promo */}
        <Pressable
          onPress={() => router.push("/offers")}
          className="mx-4 mt-4 flex-row items-center gap-3 rounded-card border border-sun-100 bg-sun-50 p-3 active:opacity-80"
        >
          <View className="min-w-0 flex-1">
            <Txt size="lg" weight="bold">
              Get more with Reditoe Money!
            </Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              Add Reditoe Money and unlock exclusive offers
            </Txt>
            <View className="mt-2 flex-row items-center gap-1">
              <Txt size="tiny" weight="bold" tone="brand">
                View Offers
              </Txt>
              <Ionicons name="chevron-forward" size={12} color={colors.brand[600]} />
            </View>
          </View>
          <Ionicons name="gift" size={44} color={colors.sun[500]} />
        </Pressable>

        {/*
          The send-to-bank form used to sit here.
          
          Reditoe Money is store credit - it is earned from refunds, bonuses
          and promotions, and the client's rule is that it is spent on food
          rather than cashed out. A form offering to move it to a bank
          promised something the platform no longer does.
        */}

        {/* Transactions */}
        <Card className="mx-4 mt-4 overflow-hidden">
          <SectionHead
            title="Recent Transactions"
            action={showAll ? "Show less" : "View All"}
            onAction={() => setShowAll((open) => !open)}
            className="px-3 pb-1 pt-3"
          />

          {ledger.length === 0 && (
            <Txt size="sm" tone="muted" className="px-3 pb-3 pt-1">
              No wallet activity yet.
            </Txt>
          )}

          {visible.map((txn, index) => (
            <React.Fragment key={txn.id}>
              {index > 0 && <Divider className="ml-14" />}
              {/* A row, not a link: the ledger the API returns carries no
                  order to open, so the chevron that used to sit on the right
                  promised a detail screen that was never there. */}
              <View className="flex-row items-center gap-3 px-3 py-3">
                <IconTile icon={txn.icon} tint={accents[txn.accent]} size={38} />
                <View className="min-w-0 flex-1">
                  <Txt weight="semibold" numberOfLines={1}>
                    {txn.title}
                  </Txt>
                  <Txt size="tiny" tone="muted" numberOfLines={1}>
                    {txn.detail}
                  </Txt>
                </View>
                <View className="items-end">
                  <Txt size="sm" weight="bold" tone={txn.amount >= 0 ? "ok" : "bad"}>
                    {txn.amount >= 0 ? "+" : "−"} ₹{Math.abs(txn.amount).toFixed(2)}
                  </Txt>
                  <Txt size="micro" tone="muted">
                    {txn.at}
                  </Txt>
                </View>
              </View>
            </React.Fragment>
          ))}
        </Card>

        <View className="mx-4 mt-4">
          <Note
            icon="information-circle"
            tone="info"
            title="Reditoe Money can be used to pay for orders, delivery fees and more."
          />
        </View>
      </ScrollView>

      {/* The phone's payment sheet, as the checkout screen uses. */}
      <RazorpayCheckout
        intent={sheet}
        payer={{ name: customer.name, email: customer.email, contact: customer.phone }}
        onSuccess={(receipt) => settle.current?.resolve(receipt)}
        onCancel={() => settle.current?.reject(new PaymentCancelled())}
        onError={(message) => settle.current?.reject(new Error(message))}
      />
    </SafeAreaView>
  );
}
