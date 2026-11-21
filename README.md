# CenPaya

CenPaya is a CEMAC-focused commerce and fintech application.

## Backend split

- **Cloudflare Worker + D1:** authentication, verification, profiles, marketplace, social features, chat, notifications, support, reports, and general application configuration.
- **Supabase:** financial records and operations, including wallets, deposits, withdrawals, checkout, escrow, ledger, transactions, subscriptions, boosts, and financial administration.

The D1 Worker is the source of user identity. Supabase Auth is not used for application login or email/phone verification. Keep authenticated API responses out of PWA caches.

See ARCHITECTURE.md for the ownership and security rules. D1 schema notes and migrations are in database/d1/.
