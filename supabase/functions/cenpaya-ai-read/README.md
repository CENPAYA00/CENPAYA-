# CenPaya AI read-only Supabase bridge

This function is an internal server-to-server endpoint called only by the authenticated D1 Worker. It does not accept Supabase Auth sessions or arbitrary table/query requests.

## Required Supabase Function secrets

- `D1_TO_SUPABASE_HMAC_SECRET`: same 32+ byte secret configured on the D1 Worker.
- `D1_INTERNAL_CALL_SECRET`: same internal-call secret configured on the D1 Worker.
- `D1_WORKER_URL`: HTTPS base URL of the D1 Worker.

Supabase supplies `SUPABASE_URL` automatically. The function uses `SUPABASE_SECRET_KEYS.default` when present, and falls back to the legacy `SUPABASE_SERVICE_ROLE_KEY`. The server key remains inside the Edge Function and is never sent to the D1 Worker or frontend.

## Supported read intents

- `wallet`: the signed-in member's wallet and currency balances.
- `transactions`: the member's own payment ledger and wallet history.
- `marketplace_orders`: orders where the member is the buyer or seller.
- `service_orders`: freelance orders where the member is the buyer or seller.
- `subscriptions`: the member's memberships and subscription payment history.
- `support_tickets`: the member's tickets and their ticket messages.
- `profile`: a limited set of the member's own account-status fields.

The function uses fixed table/column allowlists, fixed read intents, owner filters, bounded result counts, GET-only database requests, short-lived signed D1 identity assertions, and one-time assertion consumption through the D1 Worker. It performs no business-data writes or financial actions.

## Deployment is intentionally separate

This source and `supabase/config.toml` are committed for review. Deploy the function only when the user authorizes deployment and the required secrets and Worker URL are configured. Do not put any Supabase secret key in Git, Worker variables, or frontend code.
