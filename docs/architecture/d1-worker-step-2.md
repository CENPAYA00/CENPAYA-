# CenPaya D1 Worker — Step 2

## Source schema checked

Based on the private `cenpaya-db-export.zip` supplied for this project (exported 2026-11-21):
- 79 tables, 146 indexes, 3 views, 68 triggers. The 79 includes six `_bak_20261121_*` backup/snapshot tables; the live application schema also contains the new chat and platform tables.
- 51 recorded migrations (latest: `platform_and_chat_tables`, version 51).
- The export contains 13 users, 28 marketplace categories, one listing, and the migration/sync records; backup tables preserve snapshots of selected core tables.
- The export's `users` table has no password hash column. `user_sessions` and `otp_codes` exist, so password authentication cannot safely be completed without a schema change.

## Changes in this integration branch

- Adds migration 52 for D1-owned password hashes, password update timestamps, and unique account-identifier indexes.
- Adds a D1 Worker with registration, OTP verification, password sign-in, session revocation, profile read/update, public feed read/post creation, marketplace category/search/listing creation, direct messaging, notifications, and support ticket list/create.
- Keeps financial truth in Supabase. The D1 Worker does not create wallets, debit balances, settle orders, release escrow, activate boosts, or mark monetary referrals paid.
- Marketplace listing creation starts in `draft`; publication/moderation remains a separate controlled workflow.
- Uses the existing D1 views `public_profiles` and `public_marketplace_search` and existing tables/columns from the export.

## Required deployment configuration

- Apply `d1-worker/migrations/00052_d1_password_auth.sql` to D1 only after checking the live database has no duplicate usernames, emails, or phone numbers.
- Set `ALLOWED_ORIGINS` to the exact CenPaya frontend origins.
- Set `OTP_PEPPER` as a Worker secret.
- Bind `OTP_DELIVERY` to the approved email/SMS delivery Worker. The auth registration and verification endpoints fail closed when that binding is unavailable; they do not pretend an OTP was sent.
- Existing accounts have a NULL `password_hash` after migration and need to use password setup/reset before password sign-in.

The migration file is committed but has **not** been applied to the live D1 database. The Worker is not deployed; no live account or database data was changed.

## Deliberately not claimed as complete

This is the first schema-aligned API slice, not the entire application migration. Remaining D1 route families include follows/friendships, marketplace inquiry conversations/reviews/favorites, media upload/storage, moderation/admin, device push delivery, saved searches/collections, legal acceptance, and the authenticated Supabase-to-D1 sync inbox/outbox processor. Communities, social groups, standalone Pages, group conversations, and the user-facing activity-history feature have been removed from the product scope; no new routes should be added for them. They must be added against the exact schema and existing triggers. The Supabase Worker remains responsible for all money-changing operations. Administrative security audit logs and financial ledger records are retained; they are not the removed user-facing activity history.
