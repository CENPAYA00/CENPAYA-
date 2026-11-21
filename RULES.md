# CenPaya Frontend Editing Rules

These rules apply to every change in this repository.

## 1. Protect existing work
- Never delete files, folders, routes, pages, components, hooks, libraries, types, migrations, or assets without explicit confirmation.
- Do not overwrite database exports or migration history.
- Keep generated build output out of source changes.

## 2. Respect backend ownership
- Cloudflare Worker + D1 owns authentication, email/phone verification, identity, profiles, marketplace, social/feed content, chat, notifications, and general application data.
- Supabase owns all financial records and operations (wallets, deposits, withdrawals, checkout, escrow, ledger, financial orders/transactions), referrals, boosts, subscriptions/memberships, payment methods, platform API vault, and the complete admin/super-admin control plane (roles, permissions, staff access, audit logs, platform settings, feature/region controls, and administrative actions).
- Admin/super-admin browser screens must not call D1 admin endpoints directly. Supabase may securely broker admin actions on D1-owned application content through a verified server-to-server Worker connection.
- Do not add Supabase Auth as the app's identity provider.
- Do not move non-financial domains back into Supabase or duplicate a domain across both databases.
- A D1 user ID is not automatically a valid Supabase auth.uid(). Any cross-system financial authorization requires a verified server-to-server identity bridge.
- Never put service-role keys, database credentials, or private tokens in frontend code.

## 3. Build and test
- After frontend changes, run npm run build and fix errors before considering the change complete.
- Run npm run dev and verify affected routes and user flows when a local environment is available.
- If tests or a local environment cannot be run, state that limitation clearly; never claim verification that did not happen.

## 4. Keep code maintainable
- Use clear names, small focused components, and existing project conventions.
- Prefer existing Tailwind utilities before adding custom CSS.
- Avoid unnecessary dependencies, duplicated API logic, magic values, and unsafe type assertions.
- Keep TypeScript strict and avoid any unless there is a documented reason.

## 5. Routing and providers
- Add new pages through the existing lazy-loading and route conventions in src/App.tsx.
- Check links and navigation references before changing route paths.
- Do not remove, reorder, or disable providers in src/main.tsx without explicit approval.

## 6. PWA and caching
- Preserve PWA installability, manifest behavior, push notifications, and valid icon references.
- Cache static assets and public images only.
- Never cache authenticated D1 or Supabase API responses, profile data, chat, wallet balances, payments, or other private data in the service worker.
- Check actual asset paths before changing manifest or icon references.

## 7. Database and migrations
- Keep D1 migrations incremental and ordered. Check the migration tracker before proposing or applying one.
- Never commit user rows, database dumps, backup tables, secrets, or personal records.
- Do not deploy or apply database migrations without explicit permission.
- Keep Supabase RLS aligned with the approved financial identity bridge; do not use Supabase auth.uid() as a substitute for D1 identity.

## 8. Scope control
- Make only changes needed for the requested task.
- Do not restructure folders, rename directories, migrate frameworks, or rewrite large subsystems without discussing first.
- Do not modify a separate Worker branch unless explicitly asked.
