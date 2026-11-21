# Cenpaya D1 Worker database

The supplied export (2026-11-21) records 51 applied migrations and a live schema of 73 application tables, 3 views, 146 explicit indexes, and 68 triggers. The archive also contains user/profile/listing records; those data files are not committed here.

Migration 52, `migrations/0052_oauth_worker_identity_support.sql`, reconciles the Worker with the export:
- Adds `users.password_hash`, required by the existing password registration/login code but absent from the exported `users` table.
- Adds `oauth_states` and `oauth_identities`, required by the Google OAuth routes but absent from the export.
- Registration stores gender, date of birth, preferred language, and terms acceptance in existing `users` columns; the absent `user_onboarding_details` table is no longer referenced.

The export's views (`public_profiles`, `public_marketplace_search`, `stale_unverified_otps`) are present in the snapshot and used by the Worker. Backup tables are archival copies, not live application tables.

Do not import the export's CSV/JSON/SQL row data into Git. It includes personal user data. Apply migration 52 only when the target D1 migration tracker is at version 51.

## Worker module layout and internal services

The Worker entry point in `src/index.ts` now delegates security primitives to `src/security.ts`, account/session verification and OTP helpers to `src/auth.ts`, session creation to `src/sessions.ts`, and Google OAuth flows to `src/oauth.ts`. Shared request and environment types live in `src/types.ts`. Existing route behavior remains in the entry point while it is progressively separated into domain route modules.

The D1 Worker implements two private service-binding endpoints used by the Supabase financial Worker:

- `POST /internal/v1/identity/assert`: requires the shared `D1_INTERNAL_CALL_SECRET` header and a valid D1 bearer session. It returns a signed HS256 identity assertion with a 120-second lifetime and a unique `jti`.
- `POST /internal/v1/rate-limit/consume`: requires the same internal secret and accepts only a valid user UUID plus `topup` or `withdrawal`. It enforces 5 top-up or 3 withdrawal initiation attempts per user per 60 seconds.

Configure `D1_INTERNAL_CALL_SECRET` and `D1_TO_SUPABASE_HMAC_SECRET` as Worker secrets. They must match the corresponding secrets on the Supabase Worker. Never commit secret values. The Supabase Worker uses the existing `D1_IDENTITY` service binding to reach these routes; do not expose the internal secret to browser clients.

The rate limiter uses Upstash Redis when configured and the existing D1 `rate_limits` table as its fallback. Monitor fallback usage under sustained traffic because the D1 fallback adds database writes to request handling.
