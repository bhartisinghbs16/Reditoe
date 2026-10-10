import type { Campaign } from "@/lib/types";

/**
 * A campaign flattened for display.
 *
 * The API stores budget, metrics and dates nested, and the status upper-cased.
 * The screens want plain numbers and a lower-cased status to compare against.
 * Mapping once here keeps that translation in a single place rather than at
 * every field on every screen — and makes it obvious which figures the API
 * actually supplies and which it does not.
 */
export interface CampaignView {
  _id: string;
  name?: string;
  description?: string;
  /** Delivery channel, as stored — PUSH_NOTIFICATION, BANNER, EMAIL… */
  type?: string;
  /** Lower-cased so the screens' comparisons and filters line up. */
  status?: string;
  objective?: string;
  budget?: number;
  spent?: number;
  startDate?: string;
  endDate?: string;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * The create wizard writes the campaign's purpose into the description as
 * "Objective: …", because the model has no field for it. Read back here so the
 * screen can show what was entered instead of an em-dash.
 */
function readObjective(description?: string) {
  if (!description) return undefined;
  const match = description.match(/^Objective:\s*(.+)$/m);
  return match?.[1]?.trim() || undefined;
}

export function campaignView(campaign: Campaign): CampaignView {
  const metrics = campaign.metrics ?? {};
  return {
    _id: campaign._id,
    name: campaign.name,
    description: campaign.description,
    type: campaign.type ?? campaign.campaignType,
    status: campaign.status ? String(campaign.status).toLowerCase() : undefined,
    objective: readObjective(campaign.description),
    budget: campaign.budget?.total,
    spent: campaign.budget?.spent,
    // A scheduled campaign has a date; one sent immediately is dated from when
    // it went live. Neither is a "start date" the API stores as such.
    startDate: campaign.schedule?.scheduledAt ?? campaign.activatedAt,
    endDate: campaign.completedAt,
    // Reach is what actually arrived, not what was aimed at.
    impressions: metrics.deliveredCount ?? metrics.sentCount,
    clicks: metrics.clickCount,
    conversions: metrics.conversionCount,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}
