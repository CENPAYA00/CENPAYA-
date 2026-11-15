# CenPaya Cloudflare Worker — Supabase API Foundation

This Worker is Stage 1 foundation only. It does not migrate application queries, payments, wallet, subscriptions, or orders. 

Authentication and email verification are handled separately by the Cloudflare Worker/D1 architecture. Do NOT implement Supabase Auth, email verification, or OTP in this branch. 

## Cloudflare configuration required

In **Workers & Pages → cenpaya-supabase → Settings → Variables and Secrets**:

1. Add `CENPAYA_ORIGIN` as a variable containing the exact deployed Pages origin, e.g. `https://<your-pages-project>.pages.dev` (use the real production/custom domain; no wildcard).
2. Add `SUPABASE_URL` as a variable with the existing Supabase project URL (no trailing slash).
3. Add `SUPABASE_SERVICE_ROLE_KEY` as a Worker secret. This is required for the Worker to perform database operations that bypass Row Level Security (RLS) for backend financial logic. Never expose this key to the browser.

Set the existing Worker name to `cenpaya-supabase`. Keep secrets out of Git and do not add a Supabase URL/password to Vite variables. Supabase supplies the connection through its HTTP API using the `@supabase/supabase-js` client.

## Routes

- `GET /healthz`: public liveness check; returns only `{ "status": "ok" }`.
- `GET /api/v1/healthz/db`: public database health check via Supabase; returns only healthy/unavailable.
- Unknown `/api/*` routes return `501` until a stage adds a specific implementation.

Browser CORS requests are allowed only when their Origin exactly matches `CENPAYA_ORIGIN`. Requests without an Origin are allowed for server-to-server use.

## Local checks

From this directory:

```sh
npm install
npm run typecheck
npm run dev
