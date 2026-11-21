# CenPaya D1 Worker — Step 2

## Source schema checked

Based on the private `cenpaya-d1-export-2026-11-20.zip` supplied for this project:
- 63 tables, 147 indexes, 3 views, 51 triggers.
- 46 recorded migrations (latest: `chat_integrity_triggers_and_indexes`, version 46).
- 89 rows across five non-empty tables; SQLite integrity check passed and the export reports zero foreign-key violations.
- The export's `users` table has no password hash column. `user_sessions` and `otp_codes` exist, so password authentication cannot safely be completed without a schema change.

## Changes in this integration branch

- Adds migration 47 for D1-owned password hashes, password update timestamps, and unique account-identifier indexes.
- Adds a D1 Worker with registration, OTP verification, password sign-in, session revocation, profile read/update, public feed read/post creation, marketplace category/search/listing creation, notifications, and support ticket list/create.
- Keeps financial truth in Supabase. The D1 Worker does not create wallets, debit balances, settle orders, release escrow, activate boosts, or mark monetary referrals paid.
- Marketplace listing creation starts in `draft`; publication/moderation remains a separate controlled workflow.
- Uses the existing D1 views `public_profiles` and `public_marketplace_search` and existing tables/columns from the export.

## Required deployment configuration

- Apply `d1-worker/migrations/00047_d1_password_auth.sql` to D1 only after checking the live database has no duplicate usernames, emails, or phone numbers.
- Set `ALLOWED_ORIGINS` to the exact CenPaya frontend origins.
- Set `OTP_PEPPER` as a Worker secret.
- Bind `OTP_DELIVERY` to the approved email/SMS delivery Worker. The auth registration and verification endpoints fail closed when that binding is unavailable; they do not pretend an OTP was sent.
- Existing accounts have a NULL `password_hash` after migration and need to use password setup/reset before password sign-in.

## Deliberately not claimed as complete

This is the first schema-aligned API slice, not the entire application migration. Remaining D1 route families include full chat/conversations, communities and polls, follows/friendships, media upload/storage, moderation/admin, device push delivery, saved searches/collections, and the authenticated Supabase-to-D1 sync inbox/outbox processor. They must be added against the exact schema and existing triggers. The Supabase Worker remains responsible for all money-changing operations.
