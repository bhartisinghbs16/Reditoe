# Per-user Cash on Delivery (COD)

COD is controlled per customer by an administrator.

## Rules
- New customers have `codEnabled: false` by default.
- Admin opens Admin > Customers > customer > Edit and enables **Allow cash on delivery** for the selected customer.
- The User app receives `codEnabled` from `/api/auth/me` (and login/session responses).
- The User checkout adds the Cash on Delivery method only when `codEnabled === true`.
- The backend independently enforces the rule when creating an order. Sending `paymentMethod: "cod"` from a client that is not enabled returns HTTP 403 with `cod_not_allowed`.
- Disabling COD in Admin immediately prevents new COD orders for that customer, even if an older app session still has the COD option visible.

This is intentionally not a role-wide permission: enabling COD for one customer does not enable it for other customers.
