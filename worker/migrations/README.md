# Supabase database migrations

These SQL files are reviewed migration artifacts for the existing Supabase project. They are **not automatically applied by the Worker deployment**.

## Marketplace escrow hold trigger

Apply `20261121_attach_order_escrow_hold.sql` in the Supabase SQL Editor before enabling marketplace wallet checkout. Live-database inspection found that:

- `public.cenpaya_product_order_fee` is already attached as a BEFORE INSERT trigger on `public.orders`.
- `public.hold_escrow_on_order_insert()` exists and performs the wallet debit plus escrow ledger entry in the order transaction.
- No trigger was attached to invoke that hold function.

The migration attaches the existing hold function to `public.orders` as a BEFORE INSERT trigger. It does not create or alter user data and is idempotent. Do not enable marketplace wallet checkout until this migration has been applied and a controlled test order confirms the wallet debit and escrow ledger entry occur exactly once.

This migration has been committed to the existing `migration/supabase-worker-api` branch only. It has **not** been applied to the live database by ChatGPT.
