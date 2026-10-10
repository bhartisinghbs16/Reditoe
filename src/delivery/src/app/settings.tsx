import React from "react";
import { Linking, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  Divider,
  LinkRow,
  NoteBar,
  Panel,
  Screen,
  Toggle,
  Txt,
} from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { useStore } from "@/lib/store";

/**
 * Settings.
 *
 * The reference names this screen on the Profile menu — "App language,
 * Notifications, Privacy" — without drawing it, so it is built from those three
 * headings using the reference's row and note vocabulary.
 */

/** Where the rider's notification choices are kept between launches. */
const PREFS_KEY = "reditoe.rider.settings";

/** The published policies, which is what these rows should open. */
const PRIVACY_URL = "https://www.reditoe.com/privacy.html";
const TERMS_URL = "https://www.reditoe.com/terms.html";

export default function Settings() {
  const router = useRouter();
  const { rider } = useStore();

  /*
   * The switches remember what they were set to.
   *
   * They were plain component state, so every one of them snapped back to its
   * default the moment the screen was left - a rider who turned offer alerts
   * off found them on again next time they looked. Kept on the device because
   * that is where the notification behaviour they control lives.
   */
  const [prefs, setPrefs] = React.useState({
    orderAlerts: true,
    payoutAlerts: true,
    offers: false,
    shareLocation: true,
  });

  React.useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (raw) setPrefs((current) => ({ ...current, ...JSON.parse(raw) }));
      })
      .catch(() => {
        // A preference that cannot be read is not worth an error on screen;
        // the defaults are sensible.
      });
  }, []);

  const setPref = (key: keyof typeof prefs) => (value: boolean) => {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  return (
    <Screen>
      <ScreenHeader title="Settings" trailing="none" />

      <View className="gap-3.5 px-4 pt-3.5">
        <Panel title="Notifications" bodyClassName="pb-2">
          <LinkRow
            icon="notifications-outline"
            tint="amber"
            title="New Order Alerts"
            detail="Sound and vibration for every new offer"
            right={<Toggle value={prefs.orderAlerts} onValueChange={setPref("orderAlerts")} />}
          />
          <Divider className="ml-16" />
          <LinkRow
            icon="wallet-outline"
            tint="green"
            title="Payout Updates"
            detail="When a settlement is sent to your bank"
            right={<Toggle value={prefs.payoutAlerts} onValueChange={setPref("payoutAlerts")} />}
          />
          <Divider className="ml-16" />
          <LinkRow
            icon="gift-outline"
            tint="orange"
            title="Offers & Incentives"
            detail="Bonus campaigns and fuel cashback"
            right={<Toggle value={prefs.offers} onValueChange={setPref("offers")} />}
          />
        </Panel>

        <Panel title="Privacy" bodyClassName="pb-2">
          <LinkRow
            icon="location-outline"
            tint="blue"
            title="Share Live Location"
            detail="Only while you are on duty"
            right={<Toggle value={prefs.shareLocation} onValueChange={setPref("shareLocation")} />}
          />
          <Divider className="ml-16" />
          <LinkRow
            icon="document-text-outline"
            tint="slate"
            onPress={() => Linking.openURL(PRIVACY_URL)}
            title="Privacy Policy"
            detail="How Reditoe handles your data"
          />
          <Divider className="ml-16" />
          <LinkRow
            icon="shield-outline"
            tint="slate"
            onPress={() => Linking.openURL(TERMS_URL)}
            title="Terms & Conditions"
            detail="Partner agreement"
          />
        </Panel>

        <NoteBar
          tone="green"
          icon="shield-checkmark"
          title="Your location is only shared while you are online."
          detail="It stops the moment you go offline, and is never shared with customers after a delivery."
        />

        <Txt size="tiny" tone="faint" className="text-center">
          App Version {rider.appVersion}
        </Txt>
      </View>
    </Screen>
  );
}
