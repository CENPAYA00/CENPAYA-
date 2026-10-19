# CenPaya — Frontend Architecture

## Overview
CenPaya is a Pan-African commerce/fintech single-page application for the CEMAC region (buy, sell, grow with escrow protection). It is a client-side React app with PWA support, served via Vite.

## Tech Stack
- **Runtime / framework:** React 18.3.1 + TypeScript 5.5.2
- **Build tool:** Vite 5.3.1
- **Routing:** React Router DOM 6.24.0 (BrowserRouter, lazy + Suspense code-split pages)
- **Server state:** TanStack Query v5 (queryClient with 5 min staleTime, refetchOnWindowFocus disabled)
- **Virtual scrolling:** TanStack React Virtual v3
- **Backend client:** Supabase JS v2 (see `src/lib/supabase.ts`)
- **Icons:** lucide-react
- **Styling:** Tailwind CSS 3.4.4 + PostCSS + Autoprefixer (custom brand palette in `tailwind.config.js`, darkMode via `class`)
- **PWA:** vite-plugin-pwa (autoUpdate, manifest, workbox runtime caching incl. Supabase API + images)
- **Service worker:** `sw.js` at project root

## Entry Point & Providers (`src/main.tsx`)
ReactDOM renders `<App />` wrapped (inner to outer) in:
1. `React.StrictMode`
2. `QueryClientProvider` (TanStack Query)
3. `LightGuard` (component)
4. `ThemeProvider` (dark/light theme, class-based)
5. `I18nProvider` (internationalization)
6. `SoundProvider` (sound effects)
7. `NotifyHost` + `installNotify()` (global notification system, replaces browser `alert`)

## Router (`src/App.tsx`)
Uses `BrowserRouter` with `Routes`/`Route`. All pages are lazy-loaded via `React.lazy` + `Suspense` with a green loading fallback.

Three layout shells:
- **Public (no layout):** `/`, `/signup`, `/forgot-password`, `/legal/:slug`, `/onboarding`, `/verify-otp`
- **`Layout` (user app):** home, market, checkout, wallet, profile, listings, posts, chat, settings, groups, communities, notifications, etc.
- **`StaffLayout`:** `/staff`, `/staff/tickets/:id`, `/staff/reports`
- **`AdminLayout`:** `/admin` super-admin dashboard + staff, inbox, ledger, payments, vault, finance, features, users, reports, security, audit, permissions, regions

Page files live in `src/pages/` (flat) plus `src/pages/admin/`.

## Directory Structure (`src/`)
```
src/
├── main.tsx              # App entry + providers
├── index.css             # Global / Tailwind base styles
├── App.tsx               # Router + lazy page imports
├── vite-env.d.ts
│
├── pages/                # Route components (lazy-loaded in App.tsx)
│   ├── Home.tsx, Market.tsx, Checkout.tsx, Wallet.tsx, ...
│   ├── Settings.tsx + Settings*.tsx (settings sub-pages)
│   ├── admin/            # Super-admin pages
│   └── ...
│
├── components/           # Reusable UI components
│   ├── Layout.tsx, AdminLayout.tsx, StaffLayout.tsx
│   ├── FeedPostCard.tsx, ListingDetail.tsx, Chat.tsx, ...
│   └── ...
│
├── contexts/             # React context providers
│   ├── theme.tsx, i18n.tsx, sound.tsx
│
├── hooks/                # Custom React hooks
│   ├── useChatThread.ts, usePostPrivacy.ts, useVoiceRecorder.ts, ...
│
├── lib/                  # Utility libraries / service modules
│   ├── supabase.ts, notify.ts, push.ts, sounds.ts, cache.ts, ...
│   └── socialApi.ts
│
├── utils/                # Pure helper functions
│   ├── compressImage.ts, getMyWallet.ts, searchMarketplace.ts, ...
│
├── types/                # TypeScript type definitions
│   ├── UserProfile.ts, Listing.ts, ChatMessage.ts, Wallet.ts, ...
│
├── constants/            # Static constants
│   ├── activityActions.ts, policies.ts, supportCategories.ts
│
└── ...
```

## Public Assets
- `index.html` — HTML entry, mounts `#root`, loads `/src/main.tsx`, theme-color `#0F5132`, PWA meta tags
- `public/icons/` — PWA icons (192, 512, maskable)
- `sw.js` — service worker
- `vite.config.ts` — Vite + PWA plugin config
- `tailwind.config.js` — Tailwind config (brand colors, Inter font, 22px card radius)
- `postcss.config.js` — PostCSS config
- `tsconfig.json` — TypeScript config

## Key Conventions Observed
- Pages are code-split with `React.lazy` and registered in `src/App.tsx`.
- Styling is Tailwind with custom `brand`, `darkbg`, `offwhite`, `navy`, `ink`, `mute`, `chip`, `gold`, `danger` colors.
- Notifications go through `lib/notify.ts` (not `window.alert`).
- TypeScript strict types live in `src/types/`.
- Database/backend logic is in `src/lib/supabase.ts` and `src/lib/socialApi.ts` (out of scope per request).
