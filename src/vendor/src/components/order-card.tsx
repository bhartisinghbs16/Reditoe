import React from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Badge, Button, Card, Divider, Txt, colors } from "@/components/ui";
import { Photo } from "@/components/photo";
import { ago, minutesSince, money, time } from "@/lib/format";
import { img } from "@/lib/images";
import { categoryTint, stageStyle, tints } from "@/lib/theme";
import { NEXT_STAGE, orderTotals, useStore, type VendorOrder } from "@/lib/store";

/**
 * The order card of the reference Orders screen.
 *
 * Anatomy, top to bottom: a stage-coloured rail down the left edge, a header
 * carrying the stage chip / age / order id / placed-at, then three blocks —
 * who ordered, what they ordered, and what it is worth plus the action the
 * stage allows.
 *
 * The reference lays those three side by side on its wide canvas. Below 720dp
 * there isn't room for three columns of readable text, so the same blocks
 * stack in the same order, separated by the same hairlines.
 */

function CustomerBlock({ order }: { order: VendorOrder }) {
  return (
    <View className="gap-2.5 p-3.5">
      <View className="flex-row items-start gap-2">
        <Ionicons name="person-outline" size={15} color={colors.ink.muted} />
        <View className="min-w-0 flex-1">
          <Txt size="sm" weight="semibold" numberOfLines={1}>
            {order.customer}
          </Txt>
          <Txt size="tiny" tone="muted">
            {order.phone}
          </Txt>
        </View>
      </View>
      <View className="flex-row items-start gap-2">
        <Ionicons name="location-outline" size={15} color={colors.ink.muted} />
        <Txt size="tiny" tone="muted" className="flex-1" numberOfLines={2}>
          {order.address}
        </Txt>
      </View>
    </View>
  );
}

function ItemsBlock({ order }: { order: VendorOrder }) {
  const count = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <View className="p-3.5">
      {order.lines.map((line, index) => (
        <View key={index} className="flex-row items-center gap-2.5 py-1">
          <Photo
            uri={line.image}
            width={30}
            height={30}
            radius={7}
            tint={categoryTint(index)}
          />
          <View className="min-w-0 flex-1">
            <Txt size="sm" numberOfLines={1}>
              {line.name}
            </Txt>
            {line.note && (
              <Txt size="micro" tone="warn" numberOfLines={1}>
                Note: {line.note}
              </Txt>
            )}
          </View>
          <Txt size="tiny" tone="muted">
            x{line.quantity}
          </Txt>
        </View>
      ))}
      <Divider className="my-2" />
      <View className="flex-row items-center justify-between">
        <Txt size="tiny" tone="muted">
          Total Items
        </Txt>
        <Txt size="tiny" weight="semibold">
          {count}
        </Txt>
      </View>
    </View>
  );
}

/** A tinted note above the action — prep time, rider, delivered, reason. */
function StageNote({ order }: { order: VendorOrder }) {
  if (order.stage === "preparing") {
    return (
      <View style={{ backgroundColor: tints.amber.bg }} className="rounded-tile px-3 py-2">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="time-outline" size={13} color={tints.amber.fg} />
          <Txt size="micro" weight="semibold" style={{ color: tints.amber.fg }}>
            Prep. Time
          </Txt>
        </View>
        <Txt size="tiny" weight="semibold" className="mt-0.5">
          {order.prepMinutes} mins
        </Txt>
      </View>
    );
  }

  if (order.stage === "ready") {
    return (
      <View style={{ backgroundColor: tints.blue.bg }} className="rounded-tile px-3 py-2">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="checkmark-circle-outline" size={13} color={tints.blue.fg} />
          <Txt size="micro" weight="semibold" style={{ color: tints.blue.fg }}>
            Ready for Pickup
          </Txt>
        </View>
        <Txt size="tiny" tone="muted" className="mt-0.5">
          Waiting for the delivery partner
        </Txt>
      </View>
    );
  }

  if (order.stage === "picked") {
    return (
      <View style={{ backgroundColor: tints.violet.bg }} className="rounded-tile px-3 py-2">
        <Txt size="micro" weight="semibold" style={{ color: tints.violet.fg }}>
          Delivery Partner
        </Txt>
        <Txt size="tiny" weight="semibold" className="mt-0.5" numberOfLines={1}>
          {order.rider?.name ?? "Assigning…"}
        </Txt>
        {order.rider && (
          <Txt size="micro" tone="muted">
            {order.rider.phone}
          </Txt>
        )}
      </View>
    );
  }

  if (order.stage === "cancelled") {
    return (
      <View className="gap-1">
        <View
          style={{ backgroundColor: tints.red.bg }}
          className="flex-row items-center gap-1.5 rounded-tile px-3 py-2"
        >
          <Ionicons name="close-circle" size={14} color={tints.red.fg} />
          <Txt size="tiny" weight="semibold" style={{ color: tints.red.fg }}>
            Cancelled
          </Txt>
        </View>
        {order.cancelReason && (
          <Txt size="micro" tone="muted">
            Reason: {order.cancelReason}
          </Txt>
        )}
      </View>
    );
  }

  return null;
}

function MoneyBlock({ order }: { order: VendorOrder }) {
  const { advance } = useStore();
  const router = useRouter();
  const next = NEXT_STAGE[order.stage];
  const cod = order.payment === "COD";

  return (
    <View className="gap-2.5 p-3.5">
      {/* The grand total, so the card and the detail screen agree. */}
      <Txt size="lg" weight="bold">
        {money(orderTotals(order).total)}
      </Txt>

      <View className="flex-row items-center gap-1.5">
        <Ionicons
          name={cod ? "cash-outline" : "card-outline"}
          size={14}
          color={cod ? colors.info.default : colors.ok.default}
        />
        <Txt size="tiny" weight="semibold" tone={cod ? "info" : "ok"}>
          {cod ? "COD" : `${order.payment} Payment`}
        </Txt>
      </View>

      <StageNote order={order} />

      {/*
        Side by side, as the client's reference draws them, and Accept
        filled rather than outlined - it is the action a kitchen takes on
        nearly every order, and two identical outlines gave a rejection the
        same weight as an acceptance.
      */}
      {order.stage === "new" && (
        <View className="flex-row gap-2">
          <Button
            label="Reject Order"
            icon="close-circle-outline"
            variant="outline"
            accent="brand"
            size="sm"
            className="flex-1"
            onPress={() => advance(order.id, "cancelled")}
          />
          <Button
            label="Accept Order"
            icon="checkmark"
            accent="ok"
            size="sm"
            className="flex-[1.2]"
            onPress={() => advance(order.id, "preparing")}
          />
        </View>
      )}

      {/* A ready order is handed over through the verification screen, not by
          tapping "done" — the six-digit code is the handover record. */}
      {order.stage === "ready" && (
        <Button
          label="Verify Pickup"
          icon="qr-code-outline"
          variant="outline"
          accent="indigo"
          size="sm"
          onPress={() => router.push(`/pickup?id=${order.id}`)}
        />
      )}

      {next && order.stage !== "new" && order.stage !== "ready" && (
        <Button
          label={next.label}
          variant="outline"
          accent="indigo"
          size="sm"
          onPress={() => advance(order.id, next.to)}
        />
      )}

      {/* A "Track Order" button used to sit here with no handler, and there
          is no tracking screen in this app to open. Where the order has got
          to is its own detail screen, which "View Details" below opens. */}

      {(order.stage === "picked" || order.stage === "cancelled") && (
        <Button
          label="View Details"
          icon="eye-outline"
          variant="plain"
          size="sm"
          onPress={() => router.push(`/order/${order.id}`)}
        />
      )}
    </View>
  );
}

export function OrderCard({ order, className = "" }: { order: VendorOrder; className?: string }) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const wide = width >= 720;
  const stage = stageStyle[order.stage];

  // A new order sitting too long is the thing a vendor most needs to see.
  const overdue = order.stage === "new" && minutesSince(order.placedAt) >= 5;

  return (
    <Card className={`overflow-hidden ${className}`}>
      <View style={{ backgroundColor: stage.rail }} className="absolute bottom-0 left-0 top-0 w-1" />

      <View className="pl-1">
        {/* The header opens the order — the whole card can't be pressable
            because the action buttons inside it have their own handlers. */}
        <Pressable
          onPress={() => router.push(`/order/${order.id}`)}
          accessibilityLabel={`Open order ${order.id}`}
          className="flex-row items-center gap-2 px-3.5 py-3 active:opacity-70"
        >
          <Badge label={stage.short} tone={badgeTone(order.stage)} />
          <Txt size="micro" tone="muted">
            {ago(order.placedAt)}
          </Txt>
          <Txt size="base" weight="bold" numberOfLines={1} className="flex-1">
            #{order.reference}
          </Txt>
          <Txt size="micro" tone="muted">
            Today, {time(order.placedAt)}
          </Txt>
          <Ionicons name="chevron-forward" size={14} color={colors.ink.faint} />
        </Pressable>

        <Divider />

        {wide ? (
          <View className="flex-row">
            <View className="flex-1 border-r border-line">
              <CustomerBlock order={order} />
            </View>
            <View className="flex-1 border-r border-line">
              <ItemsBlock order={order} />
            </View>
            <View className="flex-1">
              <MoneyBlock order={order} />
            </View>
          </View>
        ) : (
          <>
            <CustomerBlock order={order} />
            <Divider />
            <ItemsBlock order={order} />
            <Divider />
            <MoneyBlock order={order} />
          </>
        )}

        {overdue && (
          <View className="flex-row items-center gap-2 bg-bad-soft px-3.5 py-2">
            <Ionicons name="alert-circle" size={14} color={colors.bad.default} />
            <Txt size="micro" weight="semibold" className="flex-1 text-bad-ink">
              Waiting {minutesSince(order.placedAt)} mins — accept or the customer may cancel
            </Txt>
          </View>
        )}
      </View>
    </Card>
  );
}

function badgeTone(stage: VendorOrder["stage"]) {
  return (
    {
      new: "ok",
      preparing: "warn",
      ready: "info",
      picked: "indigo",
      delivered: "ok",
      cancelled: "bad",
    } as const
  )[stage];
}
