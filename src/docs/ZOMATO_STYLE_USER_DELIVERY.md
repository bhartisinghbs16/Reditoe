# User + Delivery Partner food-delivery UX

This release keeps the existing Reditoe architecture and strengthens the two customer-facing delivery journeys without copying proprietary Zomato assets or code.

## User app
- Location-aware restaurant discovery: only serviceable restaurants are shown.
- Restaurant → menu → cart → checkout → payment/COD.
- Order timeline with restaurant preparation, rider assignment, pickup and delivery states.
- Live rider map, ETA, remaining distance, rider card, call and in-app chat.
- Repeated tracking refresh while an order is active.

## Delivery partner app
- Online/offline duty switch backed by the rider API.
- New-order offer with accept/reject and countdown.
- Current-order dashboard and order history.
- Pickup and drop contacts with call/message actions where supported.
- One-tap navigation to the current stop, plus map-app fallback.
- Pickup and delivery verification flows.
- Live location reporting while on duty.
- Earnings, payouts and order history.

## End-to-end flow
User places order → vendor accepts/prepares → rider receives offer → rider accepts → rider navigates to restaurant → pickup verification → rider navigates to customer → delivery verification → order delivered → earnings updated.
