import React from "react";
import { Linking, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Button,
  Card,
  Divider,
  IconPlate,
  LinkRow,
  NoteBar,
  Panel,
  Screen,
  SearchField,
  Txt,
  colors,
} from "@/components/ui";
import { ScreenHeader } from "@/components/screen-header";
import { PartnerCard } from "@/components/partner-card";
import { useStore } from "@/lib/store";

/**
 * The numbers the client gave for the business. They were 18001234567 and
 * partners@reditoe.in - neither of which exists, so every row in Contact Us
 * either did nothing at all or dialled a number nobody answers.
 */
const SUPPORT_PHONE = "+91 73303 62674";
const SUPPORT_EMAIL = "info@reditoe.com";

/**
 * Help & Support.
 *
 * The reference names this screen on the Profile menu — "FAQs, Contact us,
 * Raise a ticket" — without drawing it, so it is built from those three
 * headings using the reference's own parts.
 */

const FAQS = [
  {
    q: "When will my payout reach my bank?",
    a: "Earnings settle every week. Once processed, the amount reaches your account within 1–2 working days.",
  },
  {
    q: "Why was an order taken away from me?",
    a: "An offer expires after 20 seconds. If it is not accepted in time it goes to the next partner nearby.",
  },
  {
    q: "How is my acceptance rate calculated?",
    a: "It is the share of offers you accepted over the last 100 offers sent to you while online.",
  },
  {
    q: "A document of mine is expiring. What happens?",
    a: "You are warned a month ahead. If it lapses, new offers pause until the replacement is verified.",
  },
];

function Faq({ item, open, onToggle }: { item: (typeof FAQS)[number]; open: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} className="px-4 py-3.5 active:opacity-80">
      <View className="flex-row items-center gap-3">
        <Txt weight="semibold" className="flex-1">
          {item.q}
        </Txt>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.ink.faint}
        />
      </View>
      {open && (
        <Txt size="sm" tone="muted" className="mt-2">
          {item.a}
        </Txt>
      )}
    </Pressable>
  );
}

export default function Support() {
  const router = useRouter();
  const { rider } = useStore();
  const [openFaq, setOpenFaq] = React.useState<number | null>(0);
  const [query, setQuery] = React.useState("");

  const list = FAQS.filter((f) =>
    query.trim() ? f.q.toLowerCase().includes(query.trim().toLowerCase()) : true
  );

  return (
    <Screen>
      <ScreenHeader title="Help & Support" trailing="none" />

      <View className="gap-3.5 px-4 pt-3.5">
        <PartnerCard />

        <Card className="flex-row items-center gap-3 p-4">
          <IconPlate icon="headset" tint="red" size={44} shape="circle" />
          <View className="min-w-0 flex-1">
            <Txt weight="bold">Partner Helpline</Txt>
            <Txt size="tiny" tone="muted" className="mt-0.5">
              Open 24×7 for on-road emergencies and order issues.
            </Txt>
          </View>
          <Button
            label="Call"
            accent="brand"
            size="sm"
            icon="call"
            onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`)}
          />
        </Card>

        <Panel title="Frequently Asked Questions" bodyClassName="pb-2">
          <View className="px-4 pb-2">
            <SearchField
              placeholder="Search help topics"
              value={query}
              onChangeText={setQuery}
            />
          </View>
          {list.map((item, index) => (
            <View key={item.q}>
              {index > 0 && <Divider />}
              <Faq
                item={item}
                open={openFaq === FAQS.indexOf(item)}
                onToggle={() =>
                  setOpenFaq(openFaq === FAQS.indexOf(item) ? null : FAQS.indexOf(item))
                }
              />
            </View>
          ))}
        </Panel>

        <Panel title="Contact Us" bodyClassName="pb-2">
          <LinkRow
            icon="chatbubbles-outline"
            tint="green"
            title="Message Support"
            detail="Send a message and track the reply here"
            onPress={() => router.push("/support/inbox" as never)}
          />
          <Divider className="ml-16" />
          <LinkRow
            icon="mail-outline"
            tint="blue"
            title="Email Us"
            detail={SUPPORT_EMAIL}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          />
          <Divider className="ml-16" />
          <LinkRow
            icon="call-outline"
            tint="violet"
            title="Call Support"
            detail={SUPPORT_PHONE}
            onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`)}
          />
          <Divider className="ml-16" />
          <LinkRow
            icon="alert-circle-outline"
            tint="red"
            title="Report an Emergency"
            titleTone="bad"
            detail="Accident, theft or unsafe customer"
            onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`)}
          />
        </Panel>

        <NoteBar
          tone="blue"
          icon="information-circle"
          title="Have your Partner ID ready"
          detail={`Quoting ${rider.id} lets the team pull up your account without asking for anything else.`}
        />
      </View>
    </Screen>
  );
}
