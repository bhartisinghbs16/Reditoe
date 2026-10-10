import React from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Divider, Txt } from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { useStore } from "@/lib/store";

/**
 * Where this restaurant's payouts are sent.
 *
 * Bank Details on the More menu opened Restaurant Information, so there was
 * no way to check the account money was being settled into.
 *
 * Read-only on purpose. Changing where a payout lands is how a payout gets
 * diverted, so it goes through support rather than a form in the app.
 */
function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View className="flex-row items-center justify-between px-3 py-3">
      <Txt size="sm" tone="muted">
        {label}
      </Txt>
      <Txt size="sm" weight="semibold">
        {value?.trim() && value !== "—" ? value : "Not provided"}
      </Txt>
    </View>
  );
}

export default function BankDetails() {
  const { payments } = useStore();
  const { bank } = payments;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-surface">
      <ScreenHeader title="Bank Details" />
      <ScrollView contentContainerClassName="pb-10">
        <Card className="mx-4 mt-3 overflow-hidden">
          <Row label="Bank" value={bank.name} />
          <Divider />
          <Row label="Account" value={bank.account} />
          <Divider />
          <Row label="IFSC" value={bank.ifsc} />
        </Card>

        <Txt size="tiny" tone="muted" className="mx-4 mt-3">
          Payouts are settled to this account. To change it, contact Reditoe
          support — bank details are not editable in the app.
        </Txt>
      </ScrollView>
    </SafeAreaView>
  );
}
