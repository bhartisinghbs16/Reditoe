import crypto from 'crypto';

const getRazorpayAuth = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials not configured');
  }
  return Buffer.from(`${keyId}:${keySecret}`).toString('base64');
};

const RAZORPAY_BASE = 'https://api.razorpay.com/v1';

export const createRazorpayContact = async (vendor) => {
  const auth = getRazorpayAuth();
  const response = await fetch(`${RAZORPAY_BASE}/contacts`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: vendor.name || 'Vendor',
      email: vendor.email ||
        `${vendor._id}@vendor.reditoe.com`,
      contact: vendor.phone || '9999999999',
      type: 'vendor',
      reference_id: vendor._id.toString(),
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data?.error?.description ||
      'Failed to create Razorpay contact'
    );
  }
  return data;
};

export const createFundAccount = async (
  contactId,
  bankDetails
) => {
  const auth = getRazorpayAuth();
  const response = await fetch(
    `${RAZORPAY_BASE}/fund_accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: {
          name: bankDetails.accountHolderName,
          ifsc: bankDetails.ifsc,
          account_number: bankDetails.accountNumber,
        },
      }),
    });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data?.error?.description ||
      'Failed to create fund account'
    );
  }
  return data;
};

export const processRazorpayPayout = async ({
  fundAccountId,
  amount,
  vendorId,
  withdrawalId,
}) => {
  const auth = getRazorpayAuth();
  const accountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER;

  if (!accountNumber) {
    throw new Error(
      'RAZORPAY_ACCOUNT_NUMBER not configured'
    );
  }

  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${withdrawalId}-${Date.now()}`)
    .digest('hex')
    .substring(0, 36);

  const amountInPaise = Math.round(amount * 100);

  const response = await fetch(
    `${RAZORPAY_BASE}/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'X-Payout-Idempotency': idempotencyKey,
      },
      body: JSON.stringify({
        account_number: accountNumber,
        fund_account_id: fundAccountId,
        amount: amountInPaise,
        currency: 'INR',
        mode: 'IMPS',
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: withdrawalId.toString(),
        narration: `Vendor payout - ${vendorId}`,
      }),
    });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data?.error?.description ||
      'Payout creation failed'
    );
  }
  return data;
};
