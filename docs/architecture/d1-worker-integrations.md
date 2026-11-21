# CenPaya D1 integrations

This document describes the D1 Worker integration contracts added on
`integration/main-d1-supabase-monolith`. No Cloudflare Worker has been deployed
and no D1 migration has been applied by these commits.

## Google Sign-In

The frontend Google button now starts OAuth at
`GET /api/auth/google/start`. The D1 Worker uses Authorization Code + PKCE,
validates the returned Google identity with Google's token-info endpoint, links
a verified Google email to an existing D1 account when present, otherwise
creates a D1 user, records the provider identity, and issues a D1 session.
The session token is returned to the frontend in the URL fragment, not a query
parameter, then stored by the frontend D1 API client.

Apply migrations 53 and 54 before enabling the OAuth and D1 email-registration routes. Configure these Worker
variables/secrets:

- `GOOGLE_CLIENT_ID` — Google OAuth client ID.
- `GOOGLE_CLIENT_SECRET` — secret; never expose to the browser.
- `GOOGLE_REDIRECT_URI` — exact callback URL:
  `https://<D1-WORKER-HOST>/api/auth/google/callback`.
- `FRONTEND_URL` — canonical frontend origin.
- `ALLOWED_ORIGINS` — comma-separated exact frontend origins; must include
  `FRONTEND_URL`.
- Register the exact `GOOGLE_REDIRECT_URI` in Google Cloud Console.

The Worker callback does not use Supabase Auth. Existing Supabase-authenticated
email/password flows elsewhere in the application are not all migrated yet;
this change is the Google OAuth slice and should not be mistaken for full
application auth cutover.

## Cloudflare AI Search

The D1 Worker calls the Cloudflare AI Search/AutoRAG interface through the
Workers AI binding named `AI`, using
`env.AI.autorag(AI_SEARCH_NAME).search(...)`. Configure the existing AI binding
on the D1 Worker and set `AI_SEARCH_NAME` to the exact already-created AI Search
index/project name in Cloudflare. Do not create a second index if the current
CenPaya index is the one intended for the app.

The frontend search page now calls `GET /api/search?q=...&type=post|listing|service`
and gets normalized entity results from the Worker. The AI Search index must
include each indexed entity's stable D1 entity ID and kind/type in its metadata
(`id`/ `entity_id`, and `kind`/ `entity_type`/ `type`). The Worker returns
only results carrying a stable ID so the UI can open the matching CenPaya page.
D1 remains authoritative; the index is a retrieval layer, not a data store.

## Cloudflare KV

The Worker optionally uses a KV namespace binding named `CACHE` for
rebuildable public profile data, supported-country lists, and short-lived search
results. Cache misses and KV errors fall back to D1/AI Search. Do not use this
binding for OTP validation, sessions, permissions, or financial data. Bind the
existing CenPaya KV namespace to the D1 Worker as `CACHE`; no namespace ID is
invented in this repository.

## Upstash Redis

Upstash Redis is optional. When both `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` are configured, the Worker uses Redis atomic
`INCR`/expiry for rate limiting. If Redis is not configured or unavailable,
the Worker falls back to its existing D1 rate-limit table. Redis is never used
for durable users, sessions, OTP validation, wallets, payments, or ledgers.

Store the REST token as a Cloudflare Worker secret. The REST URL may be a
Worker variable.

## Resend and Brevo email delivery

Email registration, OTP verification/resend, login, and password reset now use D1 endpoints. The D1 Worker does not contain Resend or Brevo credentials. OTP delivery uses
the existing `OTP_DELIVERY` service binding contract:

`POST https://otp-delivery.internal/send`

JSON body: `{ channel, destination, code, purpose }`.

Bind `OTP_DELIVERY` to the existing CenPaya API/email-delivery Worker where
Resend and Brevo credentials already live. That API Worker is responsible for
provider selection, sending verification/password-reset emails, and returning
a 2xx response only after accepting the message. Keep Resend API keys, Brevo
API keys, sender IDs, and sender addresses in that Worker’s Cloudflare secrets
or variables; do not copy them to the D1 Worker or frontend. The D1 Worker
continues to store and validate OTP hashes in D1.

The connected CenPaya API Worker source/configuration is not part of this
repository path, so this integration documents and consumes its established
service-binding contract rather than inventing a new public API route or
claiming its provider adapter has been changed.

## Deployment order

1. Confirm the exact Google callback URI and Cloudflare binding names.
2. Apply D1 migrations 53 and 54 after review.
3. Configure Google OAuth variables/secrets and the existing AI/KV/service
   bindings on the D1 Worker.
4. Confirm the CenPaya API Worker is bound as `OTP_DELIVERY` and its existing
   Resend/Brevo delivery handler implements the documented internal contract.
5. Configure `VITE_D1_API_URL` in the frontend build environment.
6. Run Worker typecheck/build and frontend CI; only then consider deployment.

The D1 Worker and migrations remain undeployed/unapplied until explicitly
approved.
