import { Alert, Share } from "react-native";
import { api } from "@/lib/api";

export type ReferralTarget = "user" | "vendor" | "delivery_partner";

const labels: Record<ReferralTarget, string> = {
  user: "User",
  vendor: "Vendor",
  delivery_partner: "Delivery Partner",
};

export async function shareReferral(targetType: ReferralTarget = "user"): Promise<void> {
  try {
    const invite = await api.createReferralInvite(targetType);
    await Share.share({
      message: `Join Reditoe as a ${labels[targetType]} using my referral code ${invite.code}. Reward on successful referral: ₹${invite.rewardAmount}.
${invite.link}`,
    });
  } catch (error) {
    Alert.alert("Couldn't create referral", error instanceof Error ? error.message : "Please try again.");
  }
}
