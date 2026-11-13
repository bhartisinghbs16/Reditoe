# Play Store submission pack

Apps: Customer `com.reditoe.app` (v1.0.18, code 26), Vendor `com.reditoe.vendor` (v1.0.10, code 18), Delivery Partner `com.reditoe.deliverypartner` (v1.0.10, code 18).

## 1. Server settings to add before the new builds go out

| Variable | What for |
|---|---|
| `RAZORPAY_WEBHOOK_SECRET` | The secret typed in Razorpay Dashboard > Webhooks. Without it the payment safety net answers 503 and Razorpay keeps retrying. |
| `REVIEWER_LOGINS` | `user:<mobile>,vendor:<mobile>,rider:<mobile>` - the three Google reviewer numbers. |
| `REVIEWER_OTP` | Six digits those numbers accept. Delete it after approval to switch the logins off. |
| `FILE_SIGNING_SECRET` | Optional. Signs ID-document links; falls back to `JWT_SECRET`. |
| `ALLOWED_ORIGINS` | Exact addresses of the admin console and web apps, comma separated. Until set, browsers from any site may call the API (native apps are unaffected either way). |

Razorpay Dashboard > Webhooks: URL `https://<api host>/api/webhooks/razorpay`, events `payment.captured` and `order.paid`, secret = `RAZORPAY_WEBHOOK_SECRET`.

Create the reviewer accounts (dry run first; `backend/.env` is the live database):

```
node src/backend/scripts/seed-reviewer-accounts.mjs --user <mobile> --vendor <mobile> --rider <mobile>
node src/backend/scripts/seed-reviewer-accounts.mjs --user <mobile> --vendor <mobile> --rider <mobile> --apply
```

Give the vendor reviewer something to review: `seed-test-restaurant.mjs --vendor <vendor mobile> ...` (see its header). Use numbers nobody owns.

## 2. Play Console > App access

Say "All or some functionality is restricted". Instructions for each app: *Sign in with the mobile number below. Tap "Send code" and enter the six-digit code below. No SMS is sent for this number.* Add the number and code from section 1. Customer app reviewer is in Lucknow (Madiyaon) so the Test Kitchen is orderable; cash on delivery works for the account the seed script was given.

## 3. Store listing links

- Privacy policy: `https://www.reditoe.com/privacy.html`
- Account deletion page (Data safety > "Delete account URL"): `https://www.reditoe.com/delete-account.html`
- Deployed website pages must be republished so `delete-account.html` is live before you submit.

## 4. Data safety answers

Data is encrypted in transit: **Yes** (HTTPS). Users can request deletion: **Yes** (in app and on the web page). Data is never sold. Sharing = "Yes" only for the service providers named below, which is exempt from the "sharing" label when it is only to process on our behalf.

### Customer app
| Type | Collected | Purpose | Notes |
|---|---|---|---|
| Name, phone number, email | Yes | Account, app functionality | Required |
| Address (saved delivery addresses) | Yes | App functionality | Optional to save |
| Approximate and precise location | Yes | App functionality (nearby restaurants, delivery) | Only while the app is open; not stored as a trail |
| Photos | Yes (profile picture, optional) | Account | Picked by the user |
| Purchase history (orders) | Yes | App functionality, support | |
| Payment info | **No** - card/UPI is entered on Razorpay's page; we only receive paid/failed | | |
| Device or other IDs (push token, device id) | Yes | Notifications, security | |
| App interactions/crash logs | No | | |

### Vendor app
Name, phone, email, restaurant address, **precise location of the restaurant** (set once), identity and business documents (FSSAI, GST, PAN, cancelled cheque), bank account details (for payouts), order history, push token. Documents are private; only the owner and Reditoe staff can open them.

### Delivery Partner app
Name, phone, email, photo, **precise location while on duty / delivering**, identity documents (Aadhaar, PAN, driving licence, vehicle papers), bank details (payouts), emergency contact, order history, push token. Location is also collected in the background while on duty (see section 6).

## 5. Permissions declarations

| App | Permission | Why |
|---|---|---|
| Customer | Location (fine/coarse) | Show restaurants that deliver to the user, fill in the delivery address, show distance |
| Customer | Camera/photos (picker) | Profile picture; no microphone |
| Vendor | Location | Record the restaurant's position once |
| Delivery | Location (fine/coarse, background) | Offer nearby jobs, show customers the rider's position, including while minimised on duty |
| Delivery | Camera | Scan pickup and delivery QR codes |
| Delivery | Microphone | **Not requested** (removed, and blocked in the manifest) |

Only the Delivery app requests background location (section 6). The in-app prominent disclosure appears before the system prompt in all three.

## 6. Background location (delivery app only)

Built. While a rider is on duty the app runs an Android foreground service (visible "you are on duty" notification) that keeps sending the position when minimised; it stops when they go off duty or log out. Before the system "Allow all the time" step the rider sees an in-app disclosure explaining this. The manifest now has `ACCESS_BACKGROUND_LOCATION` and `FOREGROUND_SERVICE_LOCATION`.

Play Console needs, for the Delivery Partner app only:
- Permissions declaration > Background location: purpose "Offer nearby delivery jobs and let customers track their order while the rider is on duty, including when the app is minimised."
- A short screen recording (about 30 seconds) showing: going on duty, the in-app disclosure, the system prompt, the notification, and the app minimised. Record it on the new build.
- Data safety (Delivery): location is collected, precise, "App functionality", collection is not optional while on duty.
- Foreground service declaration: type "location", same recording.

## 7. Before you build

1. Customer app: version is now 1.0.18 (it uses `runtimeVersion: appVersion`, so an OTA for 1.0.17 must not reach binaries that lack `expo-secure-store`). Vendor and Delivery use the fingerprint policy.
2. New native module (`expo-secure-store`) and the removed microphone permission mean **a new store build for each app**; OTA alone will not carry them.
3. Existing signed-in users stay signed in: the first launch moves the token from plain storage into the phone's secure storage.
4. Google API key restrictions (item 19): restrict each key by package name and the **SHA-1 of the Play App Signing key** (Play Console > App integrity). Package names are above.

## 8. Known gaps

- Aadhaar and bank numbers are still stored as plain text in MongoDB (item 8 not done): several payout paths read them, so they need a tested migration - see the dev report.
- Admin two-step login exists; each admin must switch it on from their account settings in the console. The new password rule (12+ characters, mixed) applies to every admin password change and reset.
- `xlsx` (bulk import) and `nodemailer` still report advisories with no safe in-place upgrade.
