# Reditoe — 3 Feature Update

Only the requested three areas were updated. Existing application architecture and unrelated features were left untouched.

## 1. Payment gateway UX
- Existing Razorpay checkout flow retained.
- Secure Razorpay-hosted payment collection remains the source for card/UPI/netbanking/wallet details.
- Checkout branding/description improved for a food-delivery context.
- Payment modal now prevents accidental backdrop dismissal while allowing explicit close.
- Existing payment verification remains server-side.

## 2. Live maps
- Existing Google Maps/react-native-maps implementation retained.
- Customer tracking refresh changed from 5 seconds to 2 seconds for a more live delivery experience.
- Existing rider, restaurant, destination and route rendering remains in place.
- Existing backend LiveTrackingService/WebSocket infrastructure remains compatible.

## 3. Radius-based delivery pricing
- Existing server-side distance pricing remains the source of truth.
- Driving distance is used when Google Distance Matrix is configured; Haversine is the fallback.
- Base radius + per-started-kilometre pricing remains configurable from Admin settings.
- Maximum delivery radius and maximum delivery fee are enforced server-side.
- Checkout bill now displays the measured delivery distance below the delivery fee.

### Default pricing
- Up to 3 km: ₹30 base fee
- Each started km beyond 3 km: +₹10
- Example: 5 km => ₹50
- Admin can change threshold, base fee, per-km fee, maximum radius and maximum fee.

## Validation
- Backend JavaScript syntax checks passed.
- Mobile TypeScript build was not executed because the uploaded source does not include `node_modules`, and external npm registry access was unavailable in this environment.

## Run
Backend: `cd backend && npm install && npm start`
User app: `cd user && npm install && npx expo start`
