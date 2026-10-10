import React from "react";
import { Pressable, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Rating, Txt, colors } from "@/components/ui";
import { useStore } from "@/lib/store";

/**
 * The rider's avatar.
 *
 * The reference ships an illustrated courier here; until that artwork lands a
 * tinted plate with a helmet reads as deliberate rather than as a broken
 * image. The badge in the corner is the reference's green tick, or the camera
 * button on the two profile screens.
 */
export function Avatar({
  size = 64,
  badge = "verified",
  onPress,
}: {
  size?: number;
  badge?: "verified" | "camera" | "none";
  onPress?: () => void;
}) {
  const Wrapper: React.ComponentType<any> = onPress ? Pressable : View;
  const dot = Math.max(18, size * 0.31);

  return (
    <Wrapper onPress={onPress} className={onPress ? "active:opacity-80" : undefined}>
      <View
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="items-center justify-center overflow-hidden bg-brand-50"
      >
        <Ionicons name="bicycle" size={size * 0.5} color={colors.brand[500]} />
      </View>

      {badge !== "none" && (
        <View
          style={{
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: colors.green[600],
          }}
          className="absolute bottom-0 right-0 items-center justify-center border-2 border-white"
        >
          <Ionicons
            name={badge === "camera" ? "camera" : "checkmark"}
            size={dot * 0.55}
            color="#ffffff"
          />
        </View>
      )}
    </Wrapper>
  );
}

/**
 * The partner strip the reference repeats at the top of almost every screen:
 * avatar, name, the green "Verified Partner" chip, the rating and tier line,
 * and the duty pill with the partner id beneath it.
 */
export function PartnerCard({
  greeting,
  card = true,
  cameraBadge,
  chevron,
  onPress,
  className = "",
}: {
  /** "Good Morning! 👋" — shown above the name on the dashboards. */
  greeting?: string;
  /** Off for the dashboard, where the strip sits directly on the page. */
  card?: boolean;
  cameraBadge?: boolean;
  chevron?: boolean;
  onPress?: () => void;
  className?: string;
}) {
  const { rider, online, setOnline } = useStore();

  const body = (
    <View className="flex-row items-center gap-3 p-4">
      <Avatar size={64} badge={cameraBadge ? "camera" : "verified"} />

      <View className="min-w-0 flex-1">
        {greeting && (
          <Txt size="sm" tone="soft" numberOfLines={1}>
            {greeting}
          </Txt>
        )}
        {/* A tick beside the name, rather than a badge repeating the word
            "partner" under it. */}
        <View className="flex-row items-center gap-1.5">
          <Txt size="xl" weight="bold" numberOfLines={1} className="shrink">
            {rider.name}
          </Txt>
          {rider.verified && (
            <Ionicons name="checkmark-circle" size={18} color={colors.green[600]} />
          )}
        </View>

        <View className="mt-1 flex-row flex-wrap items-center gap-x-1.5">
          <Rating value={rider.rating} count={rider.totalOrders} />
          <Txt size="tiny" tone="faint">
            •
          </Txt>
          <Ionicons name="ribbon" size={13} color={colors.info.default} />
          <Txt size="tiny" weight="semibold" tone="info">
            {rider.tier}
          </Txt>
        </View>
      </View>

      <View className="items-end gap-1.5">
        {/*
          A switch, which is what choosing between two states looks like. The
          pill here read as a dropdown, so riders tapped it expecting a list.
        */}
        <View className="flex-row items-center gap-1.5">
          <Txt size="micro" weight="bold" tone={online ? "green" : "muted"}>
            {online ? "Online" : "Offline"}
          </Txt>
          <Switch
            value={online}
            onValueChange={setOnline}
            trackColor={{ false: colors.line.default, true: colors.green[600] }}
            thumbColor="#ffffff"
          />
        </View>
        <Txt size="micro" tone="muted">
          Partner ID
        </Txt>
        <Txt size="tiny" weight="bold">
          {rider.id}
        </Txt>
      </View>

      {chevron && <Ionicons name="chevron-forward" size={18} color={colors.ink.faint} />}
    </View>
  );

  if (!card) return <View className={className}>{body}</View>;

  const Wrapper: React.ComponentType<any> = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} className={onPress ? "active:opacity-90" : undefined}>
      <Card className={className}>{body}</Card>
    </Wrapper>
  );
}


/** Compact partner strip for the pushed screens that only need identity. */
export function PartnerStrip({ className = "" }: { className?: string }) {
  const router = useRouter();
  return <PartnerCard className={className} onPress={() => router.push("/profile")} />;
}
