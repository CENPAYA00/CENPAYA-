# CenPaya — Application Architecture

## Overview
CenPaya is a Pan-African commerce and fintech application for the CEMAC region. The frontend is a React single-page application, built with Vite and delivered as a Progressive Web App (PWA).

## Monorepo organization

This repository is the single source tree for the frontend and its backend projects. Existing deployment-sensitive paths are intentionally preserved:

- `src/`, `public/`, and the root Vite configuration form the frontend application (the repository root is the frontend package).
- `d1-worker/` is the Cloudflare D1 Worker package. Its own `package.json`, `tsconfig.json`, and `wrangler.toml` remain together.
- `database/d1/` contains the D1 schema reference and incremental migrations used by the D1 Worker.
- `supabase/` retains the standard Supabase CLI layout, including `functions/`, `migrations/`, and `config.toml`.
- `video-processor/` contains the separate video processing service.
- `.github/workflows/` contains repository CI workflows.

The root package exposes convenience commands for the D1 Worker: `npm run d1:dev`, `npm run d1:typecheck`, `npm run d1:test`, and `npm run d1:build`. These delegate to the worker's existing package scripts. Run the frontend with the existing root commands (`npm run dev`, `npm run build`, and `npm run preview`).

Do not relocate the frontend, Worker entry points, Supabase CLI directories, migration directories, or workflow files as part of routine organization. Their current paths are referenced by build, deployment, and migration configuration. Any future physical move must update and verify every dependent config and workflow in the same change.

## Backend ownership

CenPaya uses two backend data systems with deliberately separate responsibilities:

- **Cloudflare D1 through the Cloudflare Worker:** user identity and authentication, email/phone verification, user profiles, marketplace listings and services, social/feed content, chat, notifications, and other general application data.
- **Supabase:** all financial records and operations (wallets, deposits, withdrawals, checkout, escrow, ledger, financial orders/transactions), referrals and referral earnings, boosts, subscriptions/memberships, payment methods, platform API vault, and the complete admin/super-admin control plane (admin identity mapping, roles, permissions, staff access, audit logs, platform settings, feature/region controls, and administrative actions).

The frontend must not use Supabase Auth as the source of user identity. It obtains the signed-in user's identity from the D1 Worker. Financial requests must use the approved financial API/data access path and must not assume that a D1 user ID automatically satisfies Supabase RLS policies.

Do not duplicate ownership of a data domain across D1 and Supabase. If a workflow spans both systems, keep the financial record authoritative in Supabase and use D1 only for its non-financial presentation, identity, or notification data.

## Technology stack

- React 18 + TypeScript
- Vite 5
- React Router DOM
- TanStack Query
- Cloudflare Worker API backed by D1 for non-financial features
- Supabase for financial data and operations
- Tailwind CSS + PostCSS
- vite-plugin-pwa for installability and static asset caching

## Application entry and routing

`src/main.tsx` mounts the application and its providers. `src/App.tsx` defines the route tree and lazy-loaded pages.

The route tree and actual feature inventory in `src/` are authoritative. This document intentionally describes backend ownership rather than listing every page.

## API and security rules

1. D1 Worker is the authority for user identity and non-financial data.
2. Supabase is reserved for financial data; do not move auth, OTP, profile, chat, or general application records into Supabase.
3. Never expose service-role credentials or database secrets in frontend code.
4. Do not trust a user ID supplied by the browser. The receiving backend must derive identity from a verified session/token.
5. Do not assume Supabase auth.uid() represents a D1-authenticated user. Cross-system financial access requires an explicitly designed, verified server-to-server identity bridge.
6. Do not cache authenticated API responses in the service worker. Public static assets and public images may be cached.
7. Keep financial writes authoritative and auditable; do not create a second financial ledger in D1.

## PWA caching

The service worker may cache versioned static assets and public images. It must not cache D1 or Supabase API responses, authenticated profile data, chat messages, wallet balances, payment records, or other private user data.

## D1 migrations

D1 migrations are incremental and must be applied in order to the intended database. Check the D1 migration tracker before applying a migration. Never import exported user rows, credentials, or backup tables as part of a schema migration.

## Frontend environment

Copy `.env.example` to `.env.local` and provide the public D1 API URL, Supabase project URL and anon key, Supabase Worker URL, and VAPID public key. Never place a Supabase service-role key or any private server credential in a Vite `VITE_*` variable.
