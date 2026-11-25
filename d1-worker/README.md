# Cenpaya D1 Worker database

The supplied export (2026-11-21) records 51 applied migrations and a live schema of 73 application tables, 3 views, 146 explicit indexes, and 68 triggers. The archive also contains user/profile/listing records; those data files are not committed here.

Canonical migrations 52–55 reconcile the Worker with the 2026-11-21 export and frontend requirements:
- **52** adds `users.password_hash`, `password_updated_at`, and the OAuth PKCE state/identity tables.
- **53** adds persisted tagging/mentioning/default-post visibility and SMS/order notification preferences.
- **54** adds per-member chat themes and disappearing-message settings, typed chat media/shared-post fields and read receipts, support read timestamps, and per-post feed preferences.
- **55** adds per-field profile-detail visibility and dedicated user, chat-message, and community report tables.
- **56** adds post background/feeling metadata, tagged-user relationships, and safe notification links; post images use the export's existing `post_media` table.
- **63** adds per-support-agent ticket read cursors so unread counts and read state are private to each agent.
- **64** adds individual staff task assignments, status tracking, due dates, and creator/assignee ownership.
- **65** adds a separate staff-workspace identity projection so Staff Members do not need elevated customer or support-agent roles in the D1 user table.
- **66** adds an auditable report-review history for Owner/Super Admin report moderation decisions.
- **67** adds the synchronized country-configuration projection used by D1 registration/profile flows. Supabase remains the source of truth for financial prices and payment readiness; the D1 Worker accepts country metadata only through its authenticated internal sync endpoint.
- Registration stores gender, date of birth, preferred language, and terms acceptance in existing `users` columns; no separate onboarding table is required.

The export's views (`public_profiles`, `public_marketplace_search`, `stale_unverified_otps`) are present in the snapshot and used by the Worker. Backup tables are archival copies, not live application tables.

Do not import the export's CSV/JSON/SQL row data into Git. It includes personal user data. This is the single canonical D1 migration directory for both the Worker and the main application. Wrangler is configured to read it through `migrations_dir = "../database/d1/migrations"`. Do not add parallel migration files under `d1-worker/migrations/`. Apply migrations 52–67 in order only after verifying the target D1 migration tracker. The supplied export is at version 51; do not apply these incremental migrations to an empty database, and do not reapply migrations if the live tracker has already advanced. See [the Cloudflare country configuration rollout](../docs/CLOUDFLARE_COUNTRY_CONFIGURATION_ROLLOUT.md) for the safe deployment sequence.

## Worker module layout and internal services

The Worker entry point in `src/index.ts` now delegates security primitives to `src/security.ts`, account/session verification and OTP helpers to `src/auth.ts`, session creation to `src/sessions.ts`, and Google OAuth flows to `src/oauth.ts`. Shared request and environment types live in `src/types.ts`. `src/index.ts` is now a small 61-line entry point for CORS, health checks, and route dispatch. Authentication endpoints live in `src/auth-routes.ts`; protected service-to-service endpoints (identity assertions, replay protection, rate limits, admin overview, and idempotency) live in `src/internal.ts`; profile/country routes live in `src/profiles.ts`; follows, friend requests, post reactions/comments/bookmarks/shares, privacy, account details and notification preferences live in `src/social.ts`; marketplace/feed/listing routes live in `src/marketplace.ts`; direct/group chat, chat settings, reporting, notifications and support routes live in `src/community.ts`; post-media signing and post hydration live in `src/media.ts`; Google OAuth remains in `src/oauth.ts`; session storage remains in `src/sessions.ts`; and AI Search lives in `src/search.ts`.

The D1 Worker implements three private service-binding endpoints used by the Supabase financial Worker:

- `POST /internal/v1/identity/assert`: requires the shared `D1_INTERNAL_CALL_SECRET` header and a valid D1 bearer session. It returns a signed HS256 identity assertion with a 120-second lifetime and a unique `jti`.
- `POST /internal/v1/identity/consume`: atomically records each verified assertion `jti` in the existing rate-limit table; a repeated `jti` receives HTTP 409.
- `POST /internal/v1/rate-limit/consume`: requires the same internal secret and accepts only a valid user UUID plus one of `topup`, `withdrawal`, `marketplace_checkout`, or `payment_status`. It enforces 5 top-up, 3 withdrawal, 5 marketplace checkout, or 30 payment-status requests per user per 60 seconds.

Configure `D1_INTERNAL_CALL_SECRET` and `D1_TO_SUPABASE_HMAC_SECRET` as Worker secrets. They must match the corresponding secrets on the Supabase Worker. Never commit secret values. The Supabase Worker uses the existing `D1_IDENTITY` service binding to reach these routes; do not expose the internal secret to browser clients.

Post, chat, and marketplace upload endpoints use the optional private `MEDIA_BUCKET` R2 binding and `MEDIA_URL_SIGNING_SECRET`; uploads fail closed with HTTP 503 until the existing bucket is bound. The media URL signer issues short-lived URLs and the post/chat/marketplace read handlers refresh them from stored object keys.

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


## Country configuration rollout

The D1 country projection is migration 0067. Supabase is the source of truth for country configuration, financial prices, fees, and payment readiness. The D1 Worker accepts updates only through the private `/internal/v1/countries/sync` endpoint. See [the Cloudflare country configuration rollout](../docs/CLOUDFLARE_COUNTRY_CONFIGURATION_ROLLOUT.md) before applying migrations or deploying either Worker.
