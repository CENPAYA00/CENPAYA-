# CenPaya

CenPaya is a CEMAC-focused commerce and fintech application maintained in a single repository.

## Repository layout

- `src/` and `public/`: frontend application and static assets (the repository root is the frontend package).
- `d1-worker/`: Cloudflare D1 Worker package, including its Wrangler configuration and tests.
- `database/d1/`: D1 schema reference and migrations.
- `supabase/`: Supabase CLI project, Edge Functions, and migrations.
- `video-processor/`: video processing service.
- `.github/workflows/`: CI workflows.

Existing paths are kept stable because Vite, Wrangler, Supabase CLI, migrations, and CI depend on them. See ARCHITECTURE.md before changing project boundaries or moving deployment-sensitive files.

## Backend split

- **Cloudflare Worker + D1:** authentication, verification, profiles, marketplace, social content, chat, notifications, and general application data.
- **Supabase:** all financial operations, referrals, boosts, subscriptions, platform API vault, and the complete admin/super-admin control plane, including roles, permissions, staff access, audit, platform settings, and administrative actions.

The D1 Worker is the source of user identity. Supabase Auth is not used for application login or email/phone verification. Keep authenticated API responses out of PWA caches.

## Local commands

Frontend: `npm run dev`, `npm run build`, and `npm run preview`.

D1 Worker convenience commands from the repository root:

- `npm run d1:dev`
- `npm run d1:typecheck`
- `npm run d1:test`
- `npm run d1:build` (Wrangler dry-run build; does not deploy)

These delegate to the scripts in `d1-worker/package.json`. Copy `.env.example` to `.env.local` and set the required frontend URLs and public keys. Never add Supabase service-role credentials to frontend environment variables.
