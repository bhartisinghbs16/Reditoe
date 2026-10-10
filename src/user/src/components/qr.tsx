import React from "react";
import { View } from "react-native";
import QRCodeSvg from "react-native-qrcode-svg";

/**
 * A scannable QR code.
 *
 * This used to draw a QR-*shaped* picture — three finder patterns and a field
 * of modules hashed from the order reference. That was honest while the
 * backend had no payload to encode, and it is exactly wrong now that it does:
 * the rider's scanner would read nothing, and the customer would be holding up
 * a code that cannot work while believing it does.
 *
 * It now encodes the real payload the delivery-verification endpoint expects.
 */

export function QrCode({
  value,
  size = 176,
  color = "#111111",
}: {
  value: string;
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityLabel="Delivery verification code"
    >
      <QRCodeSvg
        value={value || " "}
        size={size}
        color={color}
        backgroundColor="transparent"
        // Handover codes are read at arm's length in a doorway, often on a
        // cracked screen. The higher correction level costs density and buys a
        // scan that works the first time.
        ecl="M"
      />
    </View>
  );
}
