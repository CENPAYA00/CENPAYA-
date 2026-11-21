# Supabase database migrations

These migrations are committed to the existing `migration/supabase-worker-api` branch. They are **not automatically applied by a Worker deployment** and have not been applied to the live Supabase project by ChatGPT.

Apply them in numeric order in the Supabase SQL Editor, after reviewing the SQL:

1. `0001_secure_financial_worker_operations.sql` — adds the restricted Worker payment operations, idempotent top-up/withdrawal records, provider-attempt metadata, and secure gateway-credential retrieval used by the Worker. Live-database inspection confirmed these RPCs are currently missing.
2. `0002_attach_order_escrow_hold.sql` — attaches the existing `public.hold_escrow_on_order_insert()` function to `public.orders`. Live-database inspection confirmed the function exists but no trigger invokes it. The existing `trg_cenpaya_product_order_fee` trigger already calculates seller-specific fees before insert.

Do not enable marketplace wallet checkout until migration 0002 is applied and a controlled test confirms that one order insert debits the buyer wallet and writes exactly one escrow ledger entry. Do not enable top-ups, withdrawals, or mobile-money membership initiation until migration 0001 is applied and provider credentials can be retrieved through the Worker.
