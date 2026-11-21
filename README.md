# CenPaya

CenPaya is a CEMAC-focused commerce and fintech application.

## Backend split

- **Cloudflare Worker + D1:** authentication, verification, profiles, marketplace, social content, chat, notifications, and general application data.
- **Supabase:** all financial operations, referrals, boosts, subscriptions, platform API vault, and the complete admin/super-admin control plane, including roles, permissions, staff access, audit, platform settings, and administrative actions.

The D1 Worker is the source of user identity. Supabase Auth is not used for application login or email/phone verification. Keep authenticated API responses out of PWA caches.

See ARCHITECTURE.md for the ownership and security rules. D1 schema notes and migrations are in database/d1/.
