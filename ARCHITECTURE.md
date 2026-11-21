# CenPaya — Application Architecture

## Overview
CenPaya is a Pan-African commerce and fintech application for the CEMAC region. The frontend is a React single-page application, built with Vite and delivered as a Progressive Web App (PWA).

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

src/main.tsx mounts the application and its providers. src/App.tsx defines the route tree and lazy-loaded pages.

The route tree and actual feature inventory in src/ are authoritative. This document intentionally describes backend ownership rather than listing every page.

## Repository layout

- src/ — frontend application, UI, hooks, API clients, and feature logic.
- database/d1/ — D1 schema reference and incremental SQL migrations.
- public/ — public static assets.
- vite.config.ts — Vite and PWA build configuration.
- sw.js — push notification service worker entry.
- tailwind.config.js — design tokens and Tailwind configuration.
- rls_policies.sql — legacy Supabase policy reference; review before applying to any database.

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
