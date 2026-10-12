# OTP-only sign-in (customer, vendor, delivery partner)

The customer app, the vendor app, the vendor web console and the delivery-partner
app sign in **one way**: a mobile number and a 6-digit code texted to it. There is
no password anywhere in those four. (The admin console keeps its own password
login at `/api/admin/login`; it is not part of this.)

## The flow

```
mobile number ──► POST /auth/send-otp ──► SMS ──► code ──► POST /auth/verify-otp
                                                              │
                          number has an account ◄─────────────┴─────────────► nobody has it
                          { isNewUser:false, token, user }              { isNewUser:true, phoneProof }
                                  │                                                   │
                            signed in                                  app's sign-up page, number locked
                                                                       and shown as verified
                                                                                      │
                                                          customer: POST /auth/register   (multipart)
                                                          vendor:   POST /vendor/register
                                                          partner:  POST /rider/register
                                                                      │  each carries phoneProof
                                                                      ▼
                                                                   account created
```

The same two endpoints serve all three apps; the app says which one it is with
`role` (`user` | `vendor` | `rider`). A number registered under one role is refused
(403 `wrong_app`) on the others, and admin accounts cannot be opened from any of them.

## Endpoints

| | Body | Answers |
|---|---|---|
| `POST /api/auth/send-otp` | `{ phone, role }` | `{ message, data: { phone, expiresInSeconds, resendAfterSeconds }, devOtp? }` |
| `POST /api/auth/verify-otp` | `{ phone, otp, role }` | signed in: `{ isNewUser:false, token, data:{ user } }` · new number: `{ isNewUser:true, phone, phoneProof }` |
| `POST /api/auth/register` | multipart: `name, email, phone, phoneProof, dateOfBirth, profilePhoto` (+ `referralCode`) | `201 { token, data:{ user } }` |

`send-otp` answers the same whether or not the number has an account; whether it
does is for the person who proves they hold it to find out.

`/auth/register` (customers) requires all of: full name, email, date of birth
(`YYYY-MM-DD` or `DD/MM/YYYY`), a profile photo, and the proof. Vendor and partner
registration are unchanged apart from the password: both still need `phoneProof`,
and the email's own `emailProof`.

## What protects the code

* generated with `crypto.randomInt`, stored **hashed** (`LoginOtp`), valid 5 minutes, single use
* one code per number per 30 s; at most 5 per number per hour
* 5 wrong guesses lock a code until a new one is requested — counted atomically, so a burst of parallel guesses cannot exceed it
* per-network limits on `send-otp`, `verify-otp` and `register` (the API-wide limiter skips `/auth`)
* the code is only ever returned in the response (`devOtp`) outside production, or with `ALLOW_DEBUG_OTP=true`. It is **not** decided from request headers.
* a number is the account's identity, so no profile form can change it (`PUT /auth/profile`, `completeProfile`, the vendor profile all leave it alone)

## Removed

`POST /auth/login`, `/auth/google` and `/auth/set-password` answer **410** with a
reason. `/auth/verify-account` and `/auth/resend-verification` are gone. The
password-reset endpoints (`/auth/forgot-password`, `/verify-forgot-otp`,
`/reset-password`) remain only because the **admin console's** forgot-password page
calls them.

## Deploying

* **Customer app: a new native build is required.** The profile photo uses
  `expo-image-picker`, a native module (plugin added to `app.json`). It cannot be
  shipped over the air. Bump the app version so the OTA runtime matches the new build.
* The three apps and the backend should go out together: an older app build that
  still posts a password gets a clear 410 message. An older build that already
  signed in by OTP with a phone number keeps working for existing accounts.
* Production needs MSG91 (or Twilio) configured, or `send-otp` answers 503.
  Delivery-partner and vendor texts use `MSG91_TEMPLATE_ID_RIDER` / `_VENDOR`.
* The exported web builds checked in under `admin/public/{app,merchant,partner}` are
  the old password screens until they are rebuilt.

## Tests

```bash
cd backend && npm run test:auth   # 39 integration tests on an in-memory MongoDB, SMS stubbed
cd user    && npm run test:api    # retry / fallback behaviour of the customer app's API client
```
