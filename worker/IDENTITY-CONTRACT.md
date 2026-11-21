# CenPaya D1 → Supabase Worker identity contract

**Status:** Supabase Worker-side verification and token minting are implemented in this branch. The D1 assertion endpoint is not implemented in the inspected D1 Worker branch; end-to-end identity is therefore not yet deployable. This document does not authorize changes to the D1 branch or the live Supabase database.

## Authority boundaries

- D1 is the authority for account identity, login, sessions, account status, bans, and non-financial roles.
- Supabase remains the authority for financial records and financial authorization.
- The browser never supplies a trusted user ID, account role, staff role, or permission.
- The Supabase Worker does not implement login, password handling, OTP, email verification, OAuth, or Supabase Auth.
- A D1 role such as `admin` is not sufficient to authorize financial administration. Existing Supabase financial permission tables and database authorization functions remain authoritative.

## Request flow

1. The browser calls a financial endpoint on the Supabase Worker and sends its existing D1 session token as `Authorization: Bearer <D1-session-token>`.
2. The Supabase Worker calls the D1 Worker through the Cloudflare service binding `D1_IDENTITY`. It sends the bearer token only over that private Worker-to-Worker request and authenticates the internal call with `D1_INTERNAL_CALL_SECRET`.
3. The D1 Worker validates the session using the existing `user_sessions.session_token_hash` lookup. It must also require an active, non-banned, non-deleted D1 user. It does not accept a user ID or role from the request body.
4. The D1 Worker returns a signed, short-lived identity assertion in JSON as `{ "assertion": "<JWT>" }`. The assertion is not the browser's session and is never returned to the browser.
5. The Supabase Worker verifies the assertion, checks that its subject is a valid UUID, creates a short-lived Supabase-compatible user JWT, and confirms that the same UUID exists in the existing `public.users` table using that user JWT.
6. The Supabase Worker calls Supabase REST using the anon/publishable API key plus that user-scoped JWT. RLS and existing SQL functions therefore see the correct `auth.uid()`.

If any step fails, reject the request. Do not fall back to a service-role key or anonymous database access.

## Internal identity assertion

Use compact JWT format, signed with **HS256 / HMAC-SHA-256** using Web Crypto.

- D1 signing secret: `D1_TO_SUPABASE_HMAC_SECRET`.
- Supabase verification secret: the same `D1_TO_SUPABASE_HMAC_SECRET`.
- Internal-call secret: `D1_INTERNAL_CALL_SECRET`, distinct from the assertion-signing secret.
- Header: `{ "alg": "HS256", "typ": "JWT" }`.
- Required claims:
  - `iss`: `cenpaya-d1-worker`
  - `aud`: `cenpaya-supabase-worker`
  - `sub`: stable D1 user UUID
  - `iat`: issued-at Unix seconds
  - `exp`: expiry Unix seconds, no more than 30 seconds after `iat`
  - `jti`: fresh cryptographically random identifier
- No role, permission, email, phone, profile, password, OTP, or raw D1 session token is placed in the assertion.
- Supabase Worker rejects wrong algorithm, malformed tokens, bad signatures, wrong issuer/audience, invalid UUID subjects, future `iat`, expired tokens, and lifetimes longer than 30 seconds.
- Do not log authorization headers, session tokens, assertion strings, or secrets.

The D1 internal endpoint must be `POST /internal/v1/identity/assert`. It is called through the service binding, requires `X-CenPaya-Internal-Secret`, reads the D1 session from the Authorization bearer header, and returns only the signed assertion. It must not be treated as a public browser API.

## Supabase user JWT

The Supabase Worker supports the active project's configured **HS256**, **RS256**, or **ES256** signing algorithm.

- HS256 uses the project's active legacy JWT secret in Cloudflare secret `SUPABASE_JWT_SECRET`.
- RS256 or ES256 uses the matching active private JWK in Cloudflare secret `SUPABASE_JWT_PRIVATE_JWK`; configure `SUPABASE_JWT_KID` when required by the active signing key.
- Configure `SUPABASE_JWT_ALGORITHM` to exactly match the active Supabase signing key. Do not guess, rotate, or replace the project's signing configuration.
- Required claims: `aud: "authenticated"`, `role: "authenticated"`, `sub: <verified UUID>`, `iat`, `exp` (60 seconds), and `iss: "supabase"`.
- Do not copy a D1 role into Supabase JWT claims. Database financial permissions decide whether a user can perform admin operations.
- Send `apikey: SUPABASE_ANON_KEY` and `Authorization: Bearer <short-lived-user-jwt>` to Supabase. Never use a service-role key for user requests.

The active algorithm and corresponding private signing material must be verified/configured by the project owner in Supabase and Cloudflare. The Supabase management connection used for this work does not expose the project's private JWT signing key.

## Stable user ID requirement

The D1 user UUID must be the same stable UUID already referenced by financial records and `public.users.id`. The Supabase Worker fails closed if the subject is not a valid UUID or no matching `public.users` row exists.

Do not auto-create a Supabase user, insert a shadow identity, copy the D1 profile, or silently map users by email/phone. Existing cross-database ID mismatches must be reconciled through a separately reviewed mapping plan.

## Financial authorization

- Normal user operations use the verified `auth.uid()` and existing RLS/database rules.
- Financial admin RPCs execute under the same verified user identity. Existing database functions such as `is_super_admin()` / `is_owner()` remain authoritative.
- A D1 role claim must never bypass Supabase permission tables.
- Do not remove `auth.uid()` checks from existing RPCs or weaken RLS.
- Do not accept caller-supplied actor IDs for self-service wallet or order actions. Derive the actor from the verified assertion.
- Payment webhooks are separate machine-to-machine flows and must verify each provider's signature, amount, currency, reference, and idempotency before changing financial state.

## Required Cloudflare bindings and secrets

**Supabase Worker**
- Service binding `D1_IDENTITY` → service `cenpaya-d1-worker`.
- Secrets `D1_INTERNAL_CALL_SECRET`, `D1_TO_SUPABASE_HMAC_SECRET`, and the active Supabase JWT signing material.
- Variables `SUPABASE_URL`, `SUPABASE_JWT_ALGORITHM`, `SUPABASE_ANON_KEY`, and exact allowed frontend origins.

**D1 Worker**
- Secrets `D1_INTERNAL_CALL_SECRET` and `D1_TO_SUPABASE_HMAC_SECRET`.
- Private route `POST /internal/v1/identity/assert`.

Keep all secret values out of Git, browser bundles, D1 rows, logs, and Wrangler config files.

## Acceptance tests before enabling production traffic

1. Valid active D1 session yields a valid assertion for the correct UUID.
2. Missing, expired, revoked, banned, deleted, or inactive D1 session is rejected.
3. Wrong internal-call secret is rejected.
4. Invalid signature, algorithm, issuer, audience, subject, `iat`, or `exp` is rejected.
5. A D1 user with an admin role but no active Supabase financial permission cannot call financial admin RPCs.
6. A Supabase user with an active financial permission can call only the operations allowed by existing database functions.
7. A D1 UUID without a matching `public.users.id` is rejected; no auto-provisioning occurs.
8. User JWT expires within 60 seconds and RLS observes the expected `auth.uid()`.
9. No request path uses the Supabase service-role key.
10. No Supabase Auth flows, auth/signup migrations, or Supabase Edge Functions are introduced.

The Supabase Worker-side code and unit tests are present in this branch. The D1 endpoint, real cross-database ID match, active Supabase signing-key configuration, Cloudflare secret setup, and live end-to-end verification remain external prerequisites. This Supabase-only change does not modify the D1 branch or production Supabase schema/data.
