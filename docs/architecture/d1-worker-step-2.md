# CenPaya D1 Worker — Step 2

## Source schema checked

Based on the private `cenpaya-db-export.zip` supplied for this project (exported 2026-11-21):
- 79 tables, 146 indexes, 3 views, 68 triggers. The 79 includes six `_bak_20261121_*` backup/snapshot tables; the live application schema also contains the new chat and platform tables.
- 51 recorded migrations (latest: `platform_and_chat_tables`, version 51).
- The export contains 13 users, 28 marketplace categories, one listing, and the migration/sync records; backup tables preserve snapshots of selected core tables.
- The export's `users` table has no password hash column. `user_sessions` and `otp_codes` exist, so password authentication cannot safely be completed without a schema change.

## Changes in this integration branch

- Adds migration 52 for D1-owned password hashes, password update timestamps, and Google OAuth provider identities/PKCE state.
- Adds migration 53 for persisted privacy, tagging/mentioning, and notification preferences.
- Adds migration 54 for chat themes, disappearing messages, typed media/shared-post messages, read receipts, support read state, and feed post preferences.
- Adds migration 55 for per-field profile visibility and report targets for users, chat messages, and communities.
- Adds a D1 Worker with registration, email OTP verification/resend, D1 password sign-in/reset, Google OAuth callback/session creation, session revocation, profile read/update, personal details, follow lists and counts, friend requests, post reactions/comments/bookmarks/shares/archive, personalized feed visibility, privacy and notification preferences, blocks, marketplace categories/search/listings and seller listing management, direct and group chat sharing, media metadata/chat settings/forwarding, notifications, report-reason/report submission routes, legal document acceptance, and support conversations.
- Routes the frontend search page through the Cloudflare AI Search integration and adds optional KV public-cache and Upstash Redis rate-limit adapters.
- Keeps financial truth in Supabase. The D1 Worker does not create wallets, debit balances, settle orders, release escrow, activate boosts, or mark monetary referrals paid.
- Marketplace listing creation starts in `draft`; publication/moderation remains a separate controlled workflow.
- Uses the existing D1 views `public_profiles` and `public_marketplace_search` and existing tables/columns from the export.

## Required deployment configuration

- Apply canonical migrations 52, 53, 54, and 55 in order after checking the live `cenpaya_migrations` tracker. The supplied export is at version 51; apply only missing migrations and never replay an already-recorded version. The exported schema already has unique indexes for username, email, and phone.
- Set `ALLOWED_ORIGINS` to the exact CenPaya frontend origins.
- Set `OTP_PEPPER` as a Worker secret.
- Configure Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`) and register the exact callback URI with Google.
- Bind the existing Cloudflare AI Search/Workers AI binding as `AI` and set `AI_SEARCH_NAME` to the existing index/project name.
- Optionally bind the rebuildable public-data KV namespace as `CACHE` and configure Upstash Redis REST URL/token for rate limiting.
- Bind `OTP_DELIVERY` to the Cenpaya API email-delivery Worker that owns Resend and Brevo credentials. See `d1-worker-integrations.md` for the contract.
- Bind `OTP_DELIVERY` to the approved email/SMS delivery Worker. The auth registration and verification endpoints fail closed when that binding is unavailable; they do not pretend an OTP was sent.
- Existing accounts have a NULL `password_hash` after migration and need to use password setup/reset before password sign-in.

Migrations 52, 53, 54, and 55 are committed but have **not** been applied to the live D1 database. The Worker is not deployed; no live account or database data was changed.

## Deliberately not claimed as complete

This is the first schema-aligned API slice, not the entire application migration. Remaining D1 route families include marketplace inquiry conversations/reviews/favorites, R2 media upload/storage, moderation/admin workflows, push delivery, saved searches/collections, and the authenticated Supabase-to-D1 sync inbox/outbox processor. The current frontend's group-share path is supported through existing group chat threads; a full community-management API is not yet implemented. The remaining route families must be added against the exact schema and existing triggers. The Supabase Worker remains responsible for all money-changing operations. Administrative security audit logs and financial ledger records are retained; they are not the removed user-facing activity history.
