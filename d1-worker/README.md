# Cenpaya D1 Worker database

The supplied export (2026-11-21) records 51 applied migrations and a live schema of 73 application tables, 3 views, 146 explicit indexes, and 68 triggers. The archive also contains user/profile/listing records; those data files are not committed here.

Migration 52, `migrations/0052_oauth_worker_identity_support.sql`, reconciles the Worker with the export:
- Adds `users.password_hash`, required by the existing password registration/login code but absent from the exported `users` table.
- Adds `oauth_states` and `oauth_identities`, required by the Google OAuth routes but absent from the export.
- Registration stores gender, date of birth, preferred language, and terms acceptance in existing `users` columns; the absent `user_onboarding_details` table is no longer referenced.

The export's views (`public_profiles`, `public_marketplace_search`, `stale_unverified_otps`) are present in the snapshot and used by the Worker. Backup tables are archival copies, not live application tables.

Do not import the export's CSV/JSON/SQL row data into Git. It includes personal user data. Apply migration 52 only when the target D1 migration tracker is at version 51.

## Worker module layout and internal services

The Worker entry point in `src/index.ts` now delegates security primitives to `src/security.ts`, account/session verification and OTP helpers to `src/auth.ts`, session creation to `src/sessions.ts`, and Google OAuth flows to `src/oauth.ts`. Shared request and environment types live in `src/types.ts`. The entry point delegates profile/country routes to `src/profiles.ts`, marketplace/feed/listing routes to `src/marketplace.ts`, messaging/notifications/support routes to `src/community.ts`, and AI Search to `src/search.ts`. `src/index.ts` now focuses on CORS, session/authentication, internal security endpoints, and route dispatch.

The D1 Worker implements three private service-binding endpoints used by the Supabase financial Worker:

- `POST /internal/v1/identity/assert`: requires the shared `D1_INTERNAL_CALL_SECRET` header and a valid D1 bearer session. It returns a signed HS256 identity assertion with a 120-second lifetime and a unique `jti`.
- `POST /internal/v1/identity/consume`: atomically records each verified assertion `jti` in the existing rate-limit table; a repeated `jti` receives HTTP 409.
- `POST /internal/v1/rate-limit/consume`: requires the same internal secret and accepts only a valid user UUID plus one of `topup`, `withdrawal`, `marketplace_checkout`, or `payment_status`. It enforces 5 top-up, 3 withdrawal, 5 marketplace checkout, or 30 payment-status requests per user per 60 seconds.

Configure `D1_INTERNAL_CALL_SECRET` and `D1_TO_SUPABASE_HMAC_SECRET` as Worker secrets. They must match the corresponding secrets on the Supabase Worker. Never commit secret values. The Supabase Worker uses the existing `D1_IDENTITY` service binding to reach these routes; do not expose the internal secret to browser clients.

The rate limiter uses Upstash Redis when configured and the existing D1 `rate_limits` table as its fallback. It fails closed when the D1-backed consumer cannot complete the limit decision. The D1 fallback now uses a single atomic `INSERT ... ON CONFLICT ... RETURNING count` operation, avoiding a separate read-after-write race. Monitor fallback usage under sustained traffic because the D1 fallback still adds database writes to request handling.

## Browser session security

Browser login, OTP verification, and password-reset completion issue the `cenpaya_session` cookie with `HttpOnly; Secure; SameSite=None`. D1 CORS allows credentials only for the exact configured `ALLOWED_ORIGINS`. The frontend no longer persists D1 bearer tokens in `localStorage`; login, OTP verification, password reset, and Google OAuth set the long-lived HttpOnly refresh cookie. `POST /api/auth/refresh` issues a separate 15-minute bearer token that is retained in memory only. D1 API requests can fall back to the refresh cookie when the in-memory token expires. Logout revokes the refresh session and clears the cookie.

Use HTTPS and configure the frontend and D1 Worker on compatible custom domains. If the Worker is on a third-party `workers.dev` origin, browser third-party-cookie restrictions may block the cookie; validate the deployed domain arrangement before enabling this flow in production.

The Supabase Worker calls the D1 identity service binding with a verified in-memory bearer token. The browser never receives the internal HMAC secret or the Supabase signing key.

Private `POST /internal/v1/idempotency/consume` also accepts only the shared internal secret and currently provides one-time consumption for marketplace order idempotency keys.

## Local verification

From `d1-worker/`:

```sh
npm install
npm run typecheck
npm test
npm run build
```

The test command compiles the security module and runs the built-in Node tests for identity assertion signing, claim contents, expiry, signature validity, and internal-secret comparison. The Wrangler build is a dry run; it does not deploy.
