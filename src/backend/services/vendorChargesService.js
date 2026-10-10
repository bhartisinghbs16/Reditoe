/**
 * What a vendor is paid for an order, and what was taken out of it.
 *
 * Every charge belongs to the vendor it is charged to. One restaurant may be
 * on a promotional commission while another pays full, one may have packing
 * waived - so the terms are read from that restaurant's own record rather
 * than from a platform-wide setting, and changing one vendor's terms cannot
 * move another's money.
 *
 * GST sits on top of each charge rather than inside it. A vendor checking a
 * statement wants to see the commission and the tax on that commission as two
 * lines, not one number they have to work backwards from.
 *
 * The breakdown is returned alongside the figure, because a payout a vendor
 * cannot check is a payout they will dispute.
 */

const round = (n) => Number(Number(n || 0).toFixed(2));

/** A percentage-or-flat charge, resolved against the food total. */
const resolve = (charge, foodTotal) => {
  if (!charge?.enabled) return { value: 0, gst: 0, label: '' };
  const value =
    charge.mode === 'fixed'
      ? round(charge.amount)
      : round((foodTotal * Number(charge.percentage ?? 0)) / 100);
  const gst = charge.gstEnabled ? round((value * Number(charge.gstPercentage ?? 0)) / 100) : 0;
  const label = charge.mode === 'fixed' ? 'flat' : `${charge.percentage}%`;
  return { value, gst, label };
};

/**
 * A restaurant's terms.
 *
 * `charges.configured` decides who is in charge. Mongoose writes defaults into
 * the charges block of every document, including ones saved long before that
 * block existed, so the figures alone cannot say whether an admin chose them.
 * Until somebody sets terms for this restaurant, the older commissionPercent
 * and the platform's tax settings still govern - otherwise a vendor negotiated
 * to 15% quietly drops to the default 10% the day this ships.
 */
export const chargesFor = (restaurant, platform = {}) => {
  const c = restaurant?.charges ?? {};
  const configured = c.configured === true;

  if (!configured) {
    return {
      configured: false,
      commission: {
        enabled: true,
        mode: 'percentage',
        percentage: Number(restaurant?.commissionPercent ?? platform.commissionPercent ?? 10),
        amount: 0,
        gstEnabled: false,
        gstPercentage: 0,
      },
      convenience: { enabled: false, mode: 'fixed', percentage: 0, amount: 0, gstEnabled: false, gstPercentage: 0 },
      // Packing was never charged GST before terms existed; keep it that way.
      packing: { enabled: false, amount: Number(restaurant?.dailyPackagingFee ?? 0), gstEnabled: false, gstPercentage: 0 },
      gst: { enabled: platform.gstEnabled !== false, percentage: Number(platform.gstPercent ?? 5) },
    };
  }

  const commission = c.commission ?? {};
  const convenience = c.convenience ?? {};
  const packing = c.packing ?? {};

  return {
    configured: true,
    commission: {
      enabled: commission.enabled !== false,
      mode: commission.mode === 'fixed' ? 'fixed' : 'percentage',
      percentage: Number(commission.percentage ?? 10),
      amount: Number(commission.amount ?? 0),
      gstEnabled: commission.gstEnabled !== false,
      gstPercentage: Number(commission.gstPercentage ?? 18),
    },
    convenience: {
      enabled: convenience.enabled === true,
      mode: convenience.mode === 'percentage' ? 'percentage' : 'fixed',
      percentage: Number(convenience.percentage ?? 0),
      amount: Number(convenience.amount ?? 0),
      gstEnabled: convenience.gstEnabled !== false,
      gstPercentage: Number(convenience.gstPercentage ?? 18),
    },
    packing: {
      enabled: packing.enabled === true,
      amount: Number(packing.amount ?? restaurant?.dailyPackagingFee ?? 0),
      // Older terms kept the packing GST switch in its own block.
      gstEnabled: packing.gstEnabled ?? c.packingGst?.enabled ?? false,
      gstPercentage: Number(packing.gstPercentage ?? c.packingGst?.percentage ?? 18),
    },
    gst: {
      enabled: c.gst?.enabled !== false,
      percentage: Number(c.gst?.percentage ?? 5),
    },
  };
};

/**
 * Works out the vendor's share of one order.
 *
 * `discountBorneByVendor` is the part of any coupon the vendor is funding.
 * A promotion the vendor created is theirs to pay for; one the platform
 * created is the platform's, and must not come out of the vendor's money -
 * which is the distinction that decides who is out of pocket at the end of
 * the week.
 */
export const settleOrder = ({ restaurant, order, discountBorneByVendor = 0, platform = {} }) => {
  const terms = chargesFor(restaurant, platform);
  const foodTotal = round(order?.subtotal ?? 0);

  const commission = resolve(terms.commission, foodTotal);
  const convenience = resolve(terms.convenience, foodTotal);

  const foodGst = terms.gst.enabled ? round((foodTotal * terms.gst.percentage) / 100) : 0;

  /**
   * Packing is what the customer actually paid on this order, not what the
   * vendor's terms say to charge today. The terms are next week's price; the
   * order is the receipt. Paying a vendor the current figure for a sale made
   * at the old one hands them money nobody collected.
   */
  const packing = round(order?.packagingFee ?? 0);
  const packingGst =
    packing > 0 && terms.packing.gstEnabled
      ? round((packing * terms.packing.gstPercentage) / 100)
      : 0;

  const vendorDiscount = round(discountBorneByVendor);

  /**
   * Packing is money the vendor collected on top of the food, so it is added
   * back; every tax is passed to the authority and is not theirs to keep.
   */
  const payout = round(
    foodTotal +
      packing -
      commission.value -
      commission.gst -
      convenience.value -
      convenience.gst -
      foodGst -
      packingGst -
      vendorDiscount
  );

  const money = (n) => Number(n);

  return {
    foodTotal,
    payout: Math.max(0, payout),
    deductions: {
      commission: commission.value,
      commissionGst: commission.gst,
      convenience: convenience.value,
      convenienceGst: convenience.gst,
      gst: foodGst,
      packing: -packing,
      packingGst,
      vendorFundedDiscount: vendorDiscount,
    },
    // What the vendor sees on their statement, in the order they read it.
    lines: [
      { label: 'Item total', value: money(foodTotal) },
      ...(packing ? [{ label: 'Packing charge collected', value: money(packing) }] : []),
      ...(commission.value
        ? [{ label: `Reditoe commission (${commission.label})`, value: money(-commission.value) }]
        : []),
      ...(commission.gst
        ? [
            {
              label: `GST on commission (${terms.commission.gstPercentage}%)`,
              value: money(-commission.gst),
            },
          ]
        : []),
      ...(convenience.value
        ? [{ label: `Convenience fee (${convenience.label})`, value: money(-convenience.value) }]
        : []),
      ...(convenience.gst
        ? [
            {
              label: `GST on convenience fee (${terms.convenience.gstPercentage}%)`,
              value: money(-convenience.gst),
            },
          ]
        : []),
      ...(foodGst ? [{ label: `GST (${terms.gst.percentage}%)`, value: money(-foodGst) }] : []),
      ...(packingGst
        ? [
            {
              label: `GST on packing (${terms.packing.gstPercentage}%)`,
              value: money(-packingGst),
            },
          ]
        : []),
      ...(vendorDiscount ? [{ label: 'Your promotion', value: money(-vendorDiscount) }] : []),
    ],
    terms,
  };
};

export default { chargesFor, settleOrder };
