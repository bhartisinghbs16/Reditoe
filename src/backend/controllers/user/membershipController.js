import Membership from '../../models/Membership.js';

/**
 * Reditoe Plus, for the customer app's six Plus screens.
 *
 * The benefit, comparison and FAQ copy lives here rather than in the client so
 * marketing can change it without shipping an app build.
 */

const BENEFITS = [
  { key: 'free_delivery', title: 'Unlimited FREE Delivery', detail: 'No delivery fee on all orders, every time.', tag: 'Unlimited', icon: 'bicycle' },
  { key: 'discounts', title: 'Exclusive Discounts', detail: 'Save more with member exclusive discounts.', tag: 'Up to 20% OFF', icon: 'pricetag' },
  { key: 'coupons', title: 'Extra Coupons Every Month', detail: 'Get new coupons added every month.', tag: 'Extra Savings', icon: 'ticket' },
  { key: 'cashback', title: 'Wallet Rewards', detail: 'Earn cashback in Reditoe Wallet on every order.', tag: 'Up to 5% Cashback', icon: 'wallet' },
  { key: 'support', title: 'Priority Support', detail: 'Get priority help from our support team 24/7.', tag: '24/7 Priority', icon: 'headset' },
  { key: 'early_access', title: 'Early Access', detail: 'Be the first to try new features and offers.', tag: 'Early Access', icon: 'sparkles' },
  { key: 'group', title: 'Group Order Benefits', detail: 'Extra savings on group orders & treats.', tag: 'Group Deals', icon: 'people' },
  { key: 'birthday', title: 'Birthday Surprises', detail: 'Special birthday offers & surprises just for you.', tag: 'Birthday Bonus', icon: 'gift' },
];

const COMPARISON = [
  { label: 'Delivery Charges', regular: '₹40 per order', plus: 'FREE' },
  { label: 'Restaurant Discounts', regular: 'Up to 10% OFF', plus: 'Up to 20% OFF' },
  { label: 'Exclusive Coupons', regular: 'Limited', plus: 'Unlimited' },
  { label: 'Customer Support', regular: 'Standard', plus: 'Priority (24/7)' },
  { label: 'New Feature Access', regular: 'Later', plus: 'Early Access' },
];

const FAQS = [
  'What is Reditoe Plus?',
  'What are the benefits of Reditoe Plus?',
  'How do I activate Reditoe Plus membership?',
  'Is Reditoe Plus membership refundable?',
  'How do I cancel my membership?',
];

const PLANS = [
  { plan: 'monthly', planLabel: 'Monthly Plan', price: 99, months: 1 },
  { plan: 'quarterly', planLabel: 'Quarterly Plan', price: 249, months: 3 },
  { plan: 'yearly', planLabel: 'Yearly Plan', price: 899, months: 12 },
];

const monthsFromNow = (months) => {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date;
};

/** The client wants one flat shape whether or not a membership exists. */
const present = (membership) => {
  if (!membership) {
    return {
      active: false,
      plan: null,
      planLabel: null,
      startedAt: null,
      validTill: null,
      autoRenewal: false,
      savings: { delivery: 0, discounts: 0, coupons: 0, cashback: 0, total: 0 },
    };
  }

  const savings = membership.savings || {};
  return {
    id: membership._id,
    active: membership.status === 'active' && membership.validTill > new Date(),
    status: membership.status,
    plan: membership.plan,
    planLabel: membership.planLabel,
    startedAt: membership.startedAt,
    validTill: membership.validTill,
    autoRenewal: membership.autoRenewal,
    price: membership.price,
    savings: {
      delivery: savings.delivery || 0,
      discounts: savings.discounts || 0,
      coupons: savings.coupons || 0,
      cashback: savings.cashback || 0,
      total:
        (savings.delivery || 0) +
        (savings.discounts || 0) +
        (savings.coupons || 0) +
        (savings.cashback || 0),
    },
  };
};

/** GET /api/membership — the signed-in customer's Plus status. */
export const getMembership = async (req, res) => {
  try {
    const membership = await Membership.findOne({ userId: req.user._id }).sort({
      createdAt: -1,
    });

    res.json({
      status: 'success',
      data: {
        membership: present(membership),
        benefits: BENEFITS,
        comparison: COMPARISON,
        faqs: FAQS,
        plans: PLANS,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/** GET /api/membership/plans — public, so the app can show plans before login. */
export const getPlans = async (_req, res) => {
  res.json({
    status: 'success',
    data: { plans: PLANS, benefits: BENEFITS, comparison: COMPARISON, faqs: FAQS },
  });
};

/** POST /api/membership/subscribe — start or extend Plus. */
export const subscribe = async (req, res) => {
  try {
    const { plan = 'monthly' } = req.body;
    const chosen = PLANS.find((p) => p.plan === plan);
    if (!chosen) {
      return res.status(400).json({
        status: 'error',
        message: `Unknown plan '${plan}'. Choose one of: ${PLANS.map((p) => p.plan).join(', ')}`,
      });
    }

    const existing = await Membership.findOne({
      userId: req.user._id,
      status: 'active',
    });

    // Subscribing while active extends rather than starting a second one.
    if (existing && existing.validTill > new Date()) {
      const extended = new Date(existing.validTill);
      extended.setMonth(extended.getMonth() + chosen.months);
      existing.validTill = extended;
      existing.plan = chosen.plan;
      existing.planLabel = chosen.planLabel;
      existing.price = chosen.price;
      await existing.save();
      return res.json({ status: 'success', data: { membership: present(existing) } });
    }

    const membership = await Membership.findOneAndUpdate(
      { userId: req.user._id },
      {
        userId: req.user._id,
        plan: chosen.plan,
        planLabel: chosen.planLabel,
        price: chosen.price,
        status: 'active',
        startedAt: new Date(),
        validTill: monthsFromNow(chosen.months),
        autoRenewal: true,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ status: 'success', data: { membership: present(membership) } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/** PATCH /api/membership — cancel, pause, resume or flip auto-renewal. */
export const updateMembership = async (req, res) => {
  try {
    const { status, autoRenewal } = req.body;
    const membership = await Membership.findOne({ userId: req.user._id }).sort({
      createdAt: -1,
    });

    if (!membership) {
      return res
        .status(404)
        .json({ status: 'error', message: 'No membership found for this account' });
    }

    if (status !== undefined) {
      const allowed = ['active', 'cancelled', 'paused'];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: `status must be one of: ${allowed.join(', ')}`,
        });
      }
      membership.status = status;
    }
    if (autoRenewal !== undefined) membership.autoRenewal = Boolean(autoRenewal);

    await membership.save();
    res.json({ status: 'success', data: { membership: present(membership) } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};
