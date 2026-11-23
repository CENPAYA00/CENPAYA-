# Cenpaya main-branch database ownership audit

**Audit target:** `main`  
**Audited commit:** `346b407425113d376944fa17781bd17cf06ec165`  
**Purpose:** map the existing frontend's Supabase dependencies before implementing the D1 + Supabase monolith. This is an audit only; application code and database data have not been changed.

## 1. Current state observed in main

- The frontend is a Vite/React application. Root `package.json` has `@supabase/supabase-js` and Vite scripts, but no D1 binding, Worker API client, Wrangler configuration, or D1 database client.
- `src/lib/supabase.ts` creates a browser Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- GitHub code search found direct Supabase usage in at least **55 files for table access**, **54 files for RPC calls**, **31 files for Auth**, **10 files for Storage**, **8 files for Edge Function invocation**, and **4 files for Realtime channels**. These are distinct matching files, not counts of individual calls.
- The frontend currently performs both reads and writes directly against Supabase. This means the intended D1 ownership has not yet been implemented in main.
- The current main branch contains no discovered D1 Worker/API binding or D1 database access.

## 2. Target ownership rules

### Supabase-only: financial source of truth

Keep the authoritative financial state and every operation that can move, reserve, release, refund, or report money in Supabase, accessed through the Supabase Worker:

- Wallet balances and wallet mutations.
- Payments, top-ups, withdrawals, payment-provider initiation and callbacks.
- Orders where they represent paid transactions, escrow, settlement, refunds, disputes that freeze/release funds, and service-order payment lifecycle.
- Financial ledger, platform gains, fees, commissions, subscription charges and monetary referral rewards/withdrawals.
- Payment-provider credentials, payment-method configuration, financial pricing/fee settings and financial admin operations.
- Financial reporting and reconciliation.

The browser must not be allowed to calculate or directly update a balance. Every money-changing action must be an authenticated, validated, idempotent server-side operation with an audit trail.

### D1-only: identity and non-financial application data

Use D1 through the D1 Worker for the non-financial application domain:

- User identity/profile data, onboarding, account preferences, privacy/security settings and account lifecycle.
- Authentication, sessions, OTP/email/phone verification and password-reset flows, in line with the stated requirement that Supabase Auth must not own Cenpaya authentication.
- Roles and non-financial staff permissions.
- Social posts, comments, reactions, shares, bookmarks/saved posts, follows, blocks, friend requests, feed and activity.
- Groups, communities, memberships, invitations, polls and group messages.
- Direct chat, chat participants, message state and notification records/preferences.
- Marketplace catalogue and non-financial content: listings, services, packages, categories, reviews, favorites, seller/profile content and moderation.
- Support tickets, ticket conversations, content reports and non-financial moderation/admin workflows.
- Platform preferences and feature flags that are not financial configuration.

D1 must not become a second authority for wallet balances, payment status, escrow status or settlement. Where D1 needs to display a financial result, it should use a clearly read-only projection updated from verified Supabase events.

### D1 + Supabase: explicit cross-database workflows

These operations need a coordinated workflow, not two independent writes from the browser:

1. **Checkout:** read the listing/service/package and seller details from D1; ask the Supabase Worker to create the financial order/payment/escrow record; then publish a verified event for a D1 order projection.
2. **Order and service lifecycle:** D1 owns catalogue, requirements, conversations and non-financial delivery content; Supabase owns payment, escrow, refund, dispute hold and settlement decisions. A D1 projection may display the verified financial status.
3. **Boosts and paid promotion:** D1 owns the post/listing being promoted; Supabase owns boost pricing, eligibility checks, charge and payment confirmation. Only a verified payment event may activate the D1 promotion.
4. **Referrals:** D1 may own the referral relationship/invitation and user-facing referral content; Supabase owns monetary reward calculation, wallet credit and payout. The exact split must be matched to the current schema before implementation.
5. **User identity in financial workflows:** D1 owns the account identity. Supabase financial records reference the stable user ID and retain only the financial fields needed for payment/payout processing. Do not copy the entire user profile into Supabase.
6. **Admin:** D1 owns staff identity, roles and content/support permissions; Supabase separately enforces authorization for financial admin operations. A D1 role alone must never authorize a financial mutation.
7. **Account deletion/deactivation:** coordinate D1 identity/content lifecycle with financial retention, open orders, disputes and ledger obligations. Do not cascade-delete financial audit records.
8. **Event synchronization:** use the D1 export's existing inbox/outbox/projection pattern where applicable. Events need signature/authentication, idempotency keys, replay protection, retries and observable failure handling. Supabase remains authoritative for all financial event outcomes.

## 3. Existing Supabase dependencies and their destination

### Authentication and account identity → D1 Worker

Current Auth usage appears in:

- `src/App.tsx`
- `src/lib/cache.ts`
- `src/pages/Login.tsx`
- `src/pages/Signup.tsx`
- `src/pages/ForgotPassword.tsx`
- `src/pages/VerifyOtp.tsx`
- `src/pages/SettingsSecurity.tsx`
- `src/pages/SettingsAccount.tsx`
- `src/pages/CompleteProfile.tsx`
- `src/pages/Groups.tsx`
- `src/pages/Referrals.tsx`
- `src/pages/Wallet.tsx`
- `src/pages/WalletTopup.tsx`
- `src/pages/Withdraw.tsx`
- `src/pages/OrderDetail.tsx`
- `src/pages/ChatThread.tsx`
- `src/pages/MyPosts.tsx`
- `src/pages/SellerProfile.tsx`
- `src/components/Layout.tsx`
- `src/components/Sidebar.tsx`
- `src/components/AdminLayout.tsx`
- `src/components/StaffLayout.tsx`
- `src/components/GoogleButton.tsx`
- `src/components/PostFollowButton.tsx`
- `src/components/ProfileFollowButton.tsx`
- `src/utils/follows.ts`
- `src/utils/getMyWallet.ts`
- `src/utils/getMyReferralDashboard.ts`
- `src/hooks/useActivityLog.ts`
- `src/hooks/useChatThread.ts`

This includes `getSession`, `getUser`, sign-in, sign-up, sign-out, OAuth, password reset/update, and auth-state listener usage. Replace with D1 Worker authentication/session APIs and a shared client-side session abstraction. Do not simply remove these calls before the D1 auth routes exist.

The OTP Edge Function calls in `src/pages/Signup.tsx`, `src/pages/VerifyOtp.tsx`, and `src/pages/SettingsVerification.tsx` belong with D1 identity/verification. Payment Edge Function calls do not: they belong with the Supabase Worker.

### Social, profile, community, chat and support data → D1 Worker

The following current direct table access/RPC usage belongs in the D1 application API, subject to the financial exceptions above:

- Social/feed: `src/pages/Home.tsx`, `src/pages/PostView.tsx`, `src/pages/CreatePost.tsx`, `src/pages/MyPosts.tsx`, `src/pages/ArchivedPosts.tsx`, `src/hooks/useArchivedPosts.ts`, `src/pages/Saved.tsx`, `src/pages/Search.tsx`, `src/pages/Follow.tsx`, `src/pages/ProfileFollowers.tsx`, `src/pages/ProfileFollowing.tsx`, `src/pages/Profile.tsx`, `src/pages/SellerProfile.tsx`, `src/components/FeedPostCard.tsx`, `src/components/ShareSheet.tsx`, `src/components/PostFollowButton.tsx`, `src/components/ProfileFollowButton.tsx`, `src/lib/socialApi.ts`, `src/lib/activityLog.ts`, `src/hooks/useActivityLog.ts`, `src/hooks/usePostPrivacy.ts`, `src/utils/follows.ts`.
- Groups/communities: `src/pages/Groups.tsx`, `src/pages/GroupDetail.tsx`, `src/pages/GroupDetailExtras.tsx`, `src/pages/Communities.tsx`, `src/pages/CommunityDetail.tsx`, `src/pages/JoinGroupByLink.tsx`.
- Chat/notifications: `src/pages/Chat.tsx`, `src/pages/ChatThread.tsx`, `src/hooks/useChatThread.ts`, `src/hooks/useDemoAutoReply.ts`, `src/hooks/useMessageAlerts.ts`, `src/components/Layout.tsx`, `src/pages/Notifications.tsx`.
- Support/staff: `src/pages/SupportDashboard.tsx`, `src/pages/ContactSupport.tsx`, `src/pages/ContactThread.tsx`, `src/pages/ContactAdmin.tsx`, `src/pages/StaffPanel.tsx`, `src/pages/StaffTicketThread.tsx`, `src/pages/StaffReports.tsx`, `src/pages/admin/AdminInbox.tsx`, `src/pages/admin/AdminTicketThread.tsx`.
- Account settings/profile: `src/pages/Settings.tsx`, `src/pages/SettingsPersonal.tsx`, `src/pages/SettingsDetails.tsx`, `src/pages/SettingsPrivacy.tsx`, `src/pages/SettingsNotifications.tsx`, `src/pages/SettingsBlocking.tsx`, `src/pages/SettingsAccount.tsx`, `src/pages/CompleteProfile.tsx`.

Relevant current Supabase RPC names identified by code search include `get_feed`, `get_home_feed`, `toggle_save_post`, `track_post_share`, `get_followers`, `get_following`, `get_suggestions`, `get_friend_requests`, `toggle_block`, `tag_user_on_post`, `create_group`, `delete_my_account`, `list_my_groups`, `list_group_messages`, `send_group_message`, `share_group_to_social`, `join_group_by_invite_link`, `create_group_poll`, `set_group_member_role`, `list_my_communities`, `create_community`, `get_community`, `create_new_direct_chat`, `set_chat_disappearing`, `forward_message`, `get_my_personal_details`, `update_personal_details`, `update_my_profile`, `complete_onboarding`, `update_notification_prefs`, `submit_report`, `admin_list_reports`, `admin_resolve_report`, `staff_my_profile`, `staff_list_tickets`, `get_ticket_thread`, `mark_ticket_read`, `admin_list_tickets`, `admin_list_invitations`, `admin_revoke_invitation`, `accept_staff_invitation`, `admin_grant_permission`, `admin_assign_role`, `admin_has_password`, `admin_set_password`, `admin_verify_password`, and `setting` only where the setting is non-financial. Verify exact existing function behavior and authorization before porting.

### Marketplace catalogue and content → D1 Worker

Current Supabase reads/writes for `listings`, `services`, `service_packages`, catalogue categories, reviews, favorites, seller profiles and listing moderation should move to D1. Relevant frontend files include:

- `src/pages/Market.tsx`, `src/pages/ListingDetail.tsx`, `src/pages/MyListings.tsx`, `src/pages/CreateListing.tsx`, `src/pages/Services.tsx`, `src/pages/CreateService.tsx`, `src/pages/ServiceDetail.tsx`, `src/pages/Profile.tsx`, `src/pages/SellerProfile.tsx`, `src/pages/Checkout.tsx`, `src/pages/ServiceOrder.tsx`, `src/pages/MyOrders.tsx`, `src/pages/Boosted.tsx`, `src/components/BoostModal.tsx`, `src/components/InlineBoostBar.tsx`, `src/pages/admin/AdminUsers.tsx`, `src/pages/admin/AdminFeatures.tsx`, `src/pages/SuperAdminDashboard.tsx`.

Important exception: order creation, payment, escrow and settlement are Supabase financial operations. Catalogue lookup is D1. Do not move the financial part of checkout to D1.

### Financial data and operations → Supabase Worker

Keep these operations in the financial API and remove direct browser database mutations:

- Wallet reads/mutations and escrow summary: `src/pages/Wallet.tsx`, `src/pages/WalletTopup.tsx`, `src/pages/Withdraw.tsx`, `src/pages/ReferralWithdraw.tsx`, `src/pages/Referrals.tsx`, `src/pages/Checkout.tsx`, `src/pages/ServiceOrder.tsx`, `src/pages/admin/AdminFinance.tsx`.
- Order/payment/escrow/service-order actions: `src/pages/Checkout.tsx`, `src/pages/OrderDetail.tsx`, `src/pages/ServiceOrder.tsx`, `src/pages/MyOrders.tsx`, `src/pages/admin/AdminEscrow.tsx`, `src/pages/admin/AdminLedger.tsx`, `src/pages/admin/AdminFinance.tsx`.
- Financial admin/configuration/reporting: `src/pages/admin/AdminFinance.tsx`, `src/pages/admin/AdminPaymentMethods.tsx`, `src/pages/admin/AdminRegions.tsx`, `src/pages/admin/AdminVault.tsx`, `src/pages/SuperAdminDashboard.tsx`, `src/pages/admin/AdminUsers.tsx` (only the financial fields/operations; profile and role management belongs to D1).

Financial RPCs identified include `mark_user_subscribed`, `request_referral_withdrawal`, `create_service_order`, `submit_service_delivery`, `approve_service_delivery`, `open_service_dispute`, `seller_mark_delivered`, `buyer_mark_received`, `transition_escrow`, `list_boost_tiers`, `get_boost_eligibility`, `admin_available_gains`, `admin_gains_breakdown`, `admin_money_circulation_full`, `admin_list_open_escrows`, `admin_escrow_action`, `admin_list_ledger`, `admin_toggle_payment_method`, `admin_add_payment_method`, `admin_set_gateway_credentials`, `admin_remove_gateway_credentials`, `admin_set_app_setting`, and financial `setting` lookups. These remain server-side financial operations.

Payment Edge Function calls that must be replaced by Supabase Worker endpoints include `initiate-payment`, `initiate-withdrawal`, and `initiate-service-payment` in `src/pages/WalletTopup.tsx`, `src/pages/Withdraw.tsx`, `src/pages/Checkout.tsx`, `src/pages/ServiceOrder.tsx`, and `src/utils/payForSubscription.ts`.

**High-priority unsafe pattern found:** `src/utils/payForSubscription.ts` reads a wallet balance, directly updates `wallets.available_funds` from the browser, then calls `mark_user_subscribed`. This must become one atomic server-side Supabase Worker operation; the browser must never debit a wallet itself.

Other direct financial writes that need server-side ownership include the direct `orders` insert in `src/pages/Checkout.tsx` and the `order_disputes` insert followed by an escrow transition in `src/pages/OrderDetail.tsx`. They should become validated, atomic Worker workflows, not separate browser requests.

### Cross-domain records requiring an explicit contract

- `users`: current code mixes profile/identity fields (D1) with phone/mobile-money, country, subscription and role fields used by financial flows. Split ownership by field; keep one stable user ID. Do not maintain two writable copies of the whole user row.
- `referrals`: separate relationship/invitation state from reward balances and payouts.
- `supported_countries`: used by payment and profile flows. Decide one canonical directory owner and expose only the payment eligibility/configuration needed by Supabase.
- `app_settings`: separate financial fee/provider settings (Supabase) from general application settings (D1).
- `orders` / `service_orders`: financial order and escrow state belongs to Supabase; D1 may hold only non-authoritative read projections and user-facing non-financial context.
- `boosts`: content target belongs to D1; tier pricing, eligibility and charge belong to Supabase.
- `notifications`: D1 owns application notifications; financial events should create notifications only after verified Supabase events.
- `activity_log`: D1 owns ordinary product activity; sensitive financial audit events remain in Supabase.
- `public_profiles`: D1 read model for identity/profile presentation, not a separate financial authority.

## 4. Storage and realtime are separate infrastructure decisions

- Supabase Storage is currently used by `src/pages/GroupDetail.tsx`, `src/pages/CreateService.tsx`, `src/pages/OrderDetail.tsx`, `src/pages/CreateListing.tsx`, `src/pages/CreatePost.tsx`, `src/pages/Profile.tsx`, `src/hooks/useChatThread.ts`, `src/pages/ChatThread.tsx`, `src/pages/ServiceOrder.tsx`, and `src/pages/Boosted.tsx`.
- Most uploads are non-financial content media and should be assigned to the chosen D1-side object-storage/API design. Delivery/escrow proof is financial evidence and needs a retention/access policy coordinated with Supabase. D1 itself is a database, not object storage; do not assume a D1 binding stores files.
- Supabase Realtime is used by `src/hooks/useMessageAlerts.ts`, `src/pages/Chat.tsx`, `src/components/Layout.tsx`, and `src/pages/ChatThread.tsx`. Moving chat/notifications to D1 requires a replacement realtime transport (for example a Worker/WebSocket or Durable Object design) or an explicitly accepted polling approach. D1 alone does not provide Supabase Realtime-equivalent subscriptions.

## 5. Implementation sequence after this audit

1. Define the API contracts and stable identity/session model shared by the two Workers.
2. Implement D1 identity/auth and non-financial routes before removing Supabase Auth from the frontend.
3. Implement/complete Supabase Worker financial endpoints before removing direct financial Supabase calls.
4. Implement signed, idempotent cross-database events and D1 projections.
5. Migrate frontend call sites by domain, then remove the browser Supabase client where no direct use remains.
6. Replace storage and realtime dependencies according to the decisions above.
7. Add tests for authorization boundaries, duplicate/replayed events, concurrency, wallet invariants, escrow transitions, RLS/service credentials, and D1/Supabase failure recovery.
8. Run typecheck/build/tests and inspect the complete diff before opening the PR to `main`.

## 6. Guardrails

- Do not change the existing UI, routes, wording or product behavior as part of the database split unless a change is required for correctness/security.
- Do not add unrelated services or features.
- Never expose Supabase service-role credentials in the frontend or D1 Worker.
- Never let D1 write financial truth or let a browser send a trusted user ID/amount without server-side authorization and validation.
- Do not remove existing auth/payment flows until their replacement endpoints are implemented and tested.
- Keep `main` untouched until the integration PR is reviewed and approved.

**Audit limitation:** this document maps the Supabase access patterns visible in the main-branch frontend and assigns intended ownership using the stated Cenpaya architecture and the D1 schema context supplied by the user. It does not claim that the target Worker routes already exist, that every RPC has been fully ported, or that live database state has been changed. Exact table columns, function bodies, triggers, and policies must be checked before each migration.


## Product-scope update (integration branch)

After the original main-branch audit, the product owner removed Communities, Social Groups, standalone Pages, and the user-facing Activity Log from Cenpaya's product scope. Their frontend pages, navigation entries, personal activity logging calls, and routes have been removed in the integration branch. Group conversation creation is also excluded; one-to-one chat remains. Existing database tables/records are intentionally retained pending a separate data-retention and dependency review. Administrative security audit logs and financial ledger records remain required and are not part of this removal.
