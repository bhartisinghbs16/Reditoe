export const formatAddress = (address) => {
  if (!address) return 'Address not available';

  if (typeof address === 'string') {
    return address;
  }

  if (typeof address === 'object') {
    const parts = [
      address.label,
      address.addressLine1,
      address.addressLine2,
      address.street,
      address.area,
      address.landmark,
      address.city,
      address.state,
      address.zipCode || address.postalCode,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : 'Address not available';
  }

  return 'Address not available';
};

export const calculateDistance = (order, restaurant = null) => {
  const restaurantDoc = restaurant || (order?.restaurantId && typeof order.restaurantId === 'object' ? order.restaurantId : null);
  const from = restaurantDoc?.address?.coordinates || restaurantDoc?.location?.coordinates || {};
  const to = order?.deliveryAddress?.coordinates || order?.deliveryAddress?.location?.coordinates || order?.deliveryAddress?.coordinates || {};
  const lat1 = Number(from.latitude ?? from.lat ?? (Array.isArray(from) ? from[1] : NaN));
  const lon1 = Number(from.longitude ?? from.lng ?? (Array.isArray(from) ? from[0] : NaN));
  const lat2 = Number(to.latitude ?? to.lat ?? (Array.isArray(to) ? to[1] : NaN));
  const lon2 = Number(to.longitude ?? to.lng ?? (Array.isArray(to) ? to[0] : NaN));
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const rad = (n) => (n * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return `${(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1)} km`;
};

export const formatOrderAssignmentOrderData = (
  order,
  {
    restaurant = null,
    riderCount = 0,
    dispatchedAt = new Date(),
    expiresAt = new Date(Date.now() + 300000),
  } = {}
) => {
  const restaurantDoc = restaurant || (
    order?.restaurantId && typeof order.restaurantId === 'object'
      ? order.restaurantId
      : null
  );
  const restaurantCoordinates = restaurantDoc?.address?.coordinates;
  const restaurantLatitude = Number(restaurantCoordinates?.latitude);
  const restaurantLongitude = Number(restaurantCoordinates?.longitude);
  const hasRestaurantCoordinates =
    Number.isFinite(restaurantLatitude) && Number.isFinite(restaurantLongitude);

  return {
    _id: order._id.toString(),
    id: order._id.toString(),
    orderId: order.orderNumber || `ORD${order._id.toString().slice(-6)}`,
    restaurantName: restaurantDoc?.name || 'Restaurant',
    restaurantAddress: formatAddress(restaurantDoc?.address),
    restaurantLatitude: hasRestaurantCoordinates ? restaurantLatitude : null,
    restaurantLongitude: hasRestaurantCoordinates ? restaurantLongitude : null,
    customerName: order.customerName || order.userId?.name || 'Customer',
    customerPhone: order.customerPhone || order.userId?.phone || null,
    customerAddress: formatAddress(order.deliveryAddress),
    amount: order.total || 0,
    foodAmount: order.subtotal || 0,           // food-only total shown to rider
    itemCount: Array.isArray(order.items) ? order.items.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0,
    deliveryFee: order.deliveryFee || 0,
    distance: calculateDistance(order, restaurantDoc),
    riderEarnings: Number(order.deliveryFee || 0),
    paymentMethod: order.paymentMethod || 'cod',
    createdAt: order.createdAt,
    expiresAt,
    dispatchedAt,
    dispatchStartedAt: order.dispatchStartedAt || dispatchedAt,
    dispatchExpiresAt: order.dispatchExpiresAt || expiresAt,
    candidateRiderIds: Array.isArray(order.candidateRiderIds)
      ? order.candidateRiderIds.map((id) => String(id))
      : [],
    riderCount,
  };
};
