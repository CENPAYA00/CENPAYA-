# Supabase database migrations

These migrations are committed to the existing `migration/supabase-worker-api` branch. They are **not automatically applied by a Worker deployment**. Migrations 0001, 0002, and 0003 have now been applied to the connected live Supabase project.

Apply them in numeric order in the Supabase SQL Editor, after reviewing the SQL:

1. `0001_secure_financial_worker_operations.sql` — adds the restricted Worker payment operations, idempotent top-up/withdrawal records, provider-attempt metadata, and secure gateway-credential retrieval used by the Worker. The migration is installed in the live project. It uses the existing `authenticated` role plus a short-lived signed `app_metadata.cenpaya_payment_worker` claim; it does not create a custom Postgres role.
2. `0002_attach_order_escrow_hold.sql` — attaches the existing `public.hold_escrow_on_order_insert()` function to `public.orders`. Live-database inspection confirmed the function exists but no trigger invokes it. The existing `trg_cenpaya_product_order_fee` trigger already calculates seller-specific fees before insert.
3. `0003_wallet_status_and_withdrawal_finalizer.sql` — installs `get_wallet_topup_status(uuid)` and `finalize_withdrawal_from_gateway(uuid,text,text,text,text)`. These two RPCs are installed in the live project and verified. The finalizer is restricted to short-lived Worker-signed JWTs carrying the private `app_metadata.cenpaya_payment_worker` claim; it does not require creating a custom Postgres role.

Do not test marketplace wallet checkout with real money. Use a dedicated test account and controlled test balance before launch. Top-ups and withdrawals remain dependent on correctly configured gateway credentials and end-to-end provider verification.
