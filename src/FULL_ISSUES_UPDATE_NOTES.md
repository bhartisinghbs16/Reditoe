# Reditoe requested issues – update notes (2026-10-01)

This package is based on the latest supplied Reditoe ZIP. Targeted source changes in this pass:

1. Dynamic delivery pricing: existing backend order creation calculates restaurant-to-drop distance and applies the configured base/per-km pricing, max radius and fee breakdown. Keep Admin pricing settings as the single source of truth; verify using a connected MongoDB + Maps key.
2. User order history: the existing user store fetches authenticated server order history; this ZIP retains that implementation. Needs runtime validation against the deployment API/account because no credentials/database are available here.
3. Wallet: existing wallet screen/API and checkout wallet deduction are retained. Backend remains authoritative for eligible usage; runtime payment/refund tests require a test account/database.
4. Cross-role registration uniqueness: multiple existing registration paths perform global checks, but the whole codebase still needs integration tests across User/Vendor/Rider endpoints and a DB migration/index review before claiming complete enforcement.
5. Rider dispatch: fixed the acceptance race by using an atomic conditional database update so two simultaneous accept requests cannot both claim the same pending order. Existing websocket broadcast/dispatch architecture retained. Timeout escalation to the next candidate still requires end-to-end test with online rider sockets.
6. Admin live rider map: existing live-rider map, tracking routes and websocket implementation retained; cannot validate real-time map without active backend, socket server, location permissions and online devices.
7–8. Rider status flow: existing delivery order screen/API retained; must verify state transitions and websocket refresh in running apps.
9. Rider earnings: assignment payload now explicitly includes `riderEarnings` equal to the order delivery fee, and removes a hard-coded fake customer phone. The main request UI should render this field as its primary amount; inspect/verify the installed app screen after building.
10. Pickup/drop locations: assignment formatter now calculates actual straight-line distance when both coordinate sets exist (instead of a hard-coded `2.5 km`) and supports more address fields. Routing distance can differ from straight-line distance.
11. API key shown after auth: no intentional API key display was found during this pass; must reproduce on device to identify the exact screen/toast.
12. 10 km serviceability: existing serviceability service and user API query coordinates are retained; needs live GPS/manual address integration test with actual restaurant coordinates.

## Validation performed
- `node --check` passed for the two edited backend service files.
- This is not a full runtime/E2E certification. Dependency installs, credentials, live database, Razorpay test configuration, Maps key and connected Android devices were not available in this environment.
