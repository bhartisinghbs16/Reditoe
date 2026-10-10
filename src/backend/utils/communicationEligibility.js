const ALLOWED_USER_RIDER_COMM_STATUSES = new Set([
  'waiting for confirmation',
  'order confirmed',
  'in progress',
  'processing',
  'ready',
  'onway',
  'on_the_way',
  'out_for_delivery',
  'picked_up',
]);

export const canUserContactRider = (orderStatus) => {
  const status = String(orderStatus || '').trim().toLowerCase();
  return ALLOWED_USER_RIDER_COMM_STATUSES.has(status);
};

