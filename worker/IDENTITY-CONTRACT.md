# CenPaya D1 → Supabase Worker identity contract

**Status:** proposed implementation contract for the existing D1 Worker and Supabase Worker. It does not deploy either Worker, change D1, or modify the live Supabase database.

## Authority boundaries

- D1 is the authority for account identity, login, sessions, account status, bans, and non-financial roles.
- Supabase remains the authority for financial records and financial authorization.
- The browser never supplies a trusted user ID, account role, staff role, or permission.
- The Supabase Worker does not implement login, password handling, OTP, email verification, OAuth, or Supabase Auth.
- A D1 role such as `admin` is not sufficient to authorize financial administration. Existing Supabase `admin_permissions`, `account_controls`, and database authorization functions remain authoritative for financial admin actions.

## Request flow

1. The browser calls a financial endpoint on the Supabase Worker and sends its existing D1 session token as `Authorization: Bearer <D1-session-token>`.
2. The Supabase Worker calls the D1 Worker through a Cloudflare service binding named `D1_IDENTITY`. It sends the bearer token only over that private Worker-to-Worker request and authenticates the internal call with `D1_INTERNAL_CALL_SECRET`.
3. The D1 Worker validates the session using the existing `user_sessions.session_token_hash` lookup. It must also require an active, non-banned, non-deleted D1 user. It does not accept a user ID or role from the request body.
4. The D1 Worker returns a signed, short-lived identity assertion. The assertion is not the browser's session and is never returned to the browser.
5. The Supabase Worker verifies the assertion, checks that its subject is a valid UUID and that the corresponding existing `public.users` financial identity exists, then creates a short-lived Supabase-compatible user JWT.
6. The Supabase Worker calls Supabase REST using the anon/publishable API key plus that user-scoped JWT. RLS and existing SQL functions therefore see the correct `auth.uid()`.

If any step fails, reject the request. Do not fall back to a service-role key or anonymous database access.

## Internal identity assertion

Use compact JWT format, signed with **HS256 / HMAC-SHA-256** using Web Crypto.

- D1 signing secret: `D1_TO_SUPABASE_HMAC_SECRET` (Cloudflare secret on D1 Worker).
- Supabase verification secret: same value, `D1_TO_SUPABASE_HMAC_SECRET` (Cloudflare secret on Supabase Worker).
- Internal-call secret: `D1_INTERNAL_CALL_SECRET` (same secret configured on both Workers; it authorizes only the service-binding introspection request and is distinct from the assertion-signing secret).
- Header: `{ "alg": "HS256", "typ": "JWT" }`.
- Required claims:
  - `iss`: `cenpaya-d1-worker`
  - `aud`: `cenpaya-supabase-worker`
  - `sub`: stable D1 user UUID
  - `iat`: issued-at Unix seconds
  - `exp`: expiry Unix seconds, no more than 30 seconds after `iat`
  - `jti`: fresh cryptographically random identifier for this assertion
- No role, permission, email, phone, profile, password, OTP, or raw D1 session token is placed in the assertion.
- Reject wrong algorithm, malformed tokens, bad signatures, wrong issuer/audience, invalid UUID subjects, future `iat`, expired tokens, and lifetimes longer than 30 seconds.
- Do not log authorization headers, session tokens, assertion strings, or secrets.

The D1 internal endpoint is `POST /internal/v1/identity/assert`. It is called through the service binding, requires the internal-call secret, reads the D1 session from the Authorization bearer header, and returns only the signed assertion. It must not be treated as a public browser API.

## Supabase user JWT

After verifying the D1 assertion and confirming the matching financial user record exists, the Supabase Worker creates a second compact JWT for the Supabase PostgREST request.

- Sign with the Supabase project's currently accepted JWT signing key. If the project uses the legacy HS256 JWT secret, use that secret; if it uses asymmetric signing keys, use the corresponding supported private signing key and algorithm. Do not assume or rotate the project's signing configuration as part of this Worker change.
- Header algorithm must match the configured Supabase signing key.
- Required claims: `aud: "authenticated"`, `role: "authenticated"`, `sub: <verified UUID>`, `iat`, `exp` (maximum 60 seconds), and `iss: "supabase"`.
- Do not copy a D1 role into Supabase JWT claims. The database's existing financial permission tables and functions decide whether the user can perform an admin operation.
- Send `apikey: SUPABASE_ANON_KEY` and `Authorization: Bearer <short-lived-user-jwt>` to Supabase. Never use the service-role key for user requests.

## Stable user ID requirement

The D1 user UUID must be the same stable UUID already referenced by the financial records and `public.users.id`. The Supabase Worker must fail closed if the subject is not a valid UUID or no matching `public.users` row exists.

Do not auto-create a Supabase user, insert a shadow identity, copy the D1 profile, or silently map users by email/phone. Existing cross-database ID mismatches must be reconciled through a separately reviewed migration/mapping plan before those accounts can use financial endpoints.

## Financial authorization

- Normal user operations use the verified `auth.uid()` and existing RLS/database rules.
- Financial admin RPCs must execute under the same verified user identity. Existing database functions such as `is_super_admin()` / `is_owner()` check Supabase financial permission records; preserve those checks.
- A D1 `role = admin`, `owner`, or `super_admin` claim must never bypass Supabase permission tables.
- Do not remove `auth.uid()` checks from existing RPCs or weaken RLS to make the Worker work.
- Do not accept caller-supplied `user_id` for self-service wallet, top-up, withdrawal, or order actions. Derive the actor from the verified assertion.
- Webhooks are a separate machine-to-machine path: verify each provider's signature, amount, currency, reference, and idempotency before changing financial state. They do not use a user identity assertion.

## Required Cloudflare bindings and secrets

**Supabase Worker**
- Service binding `D1_IDENTITY` → service `cenpaya-d1-worker`.
- Secret `D1_INTERNAL_CALL_SECRET`.
- Secret `D1_TO_SUPABASE_HMAC_SECRET`.
- Secret `SUPABASE_JWT_SECRET` or the project's configured signing-key material.
- Variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and exact allowed frontend origin(s).

**D1 Worker**
- Secret `D1_INTERNAL_CALL_SECRET`.
- Secret `D1_TO_SUPABASE_HMAC_SECRET`.

Keep all secret values out of Git, browser bundles, D1 rows, logs, and Wrangler config files. Configure them using Cloudflare Worker secrets.

## Acceptance tests before enabling financial routes

1. Valid active D1 session yields a valid assertion for the correct UUID.
2. Missing, expired, revoked, banned, deleted, or inactive D1 session is rejected.
3. Wrong internal-call secret is rejected.
4. Invalid signature, algorithm, issuer, audience, subject, `iat`, or `exp` is rejected.
5. A D1 user with an admin role but no active Supabase financial permission cannot call financial admin RPCs.
6. A Supabase user with an active financial permission can call only the operations allowed by existing database functions.
7. A D1 UUID without a matching `public.users.id` is rejected; no auto-provisioning occurs.
8. User JWT expires within 60 seconds and RLS observes the expected `auth.uid()`.
9. No request path uses the Supabase service-role key.
10. No auth/signup migrations, Supabase Auth flows, or Supabase Edge Functions are introduced.

This contract is documentation only until the D1 Worker service binding, internal assertion endpoint, Supabase JWT signing-key compatibility, and tests are implemented and reviewed.
