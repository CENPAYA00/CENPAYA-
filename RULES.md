# Frontend Editing Rules

These rules must be followed for every change to frontend code in this repo. They are strict — no exceptions without asking first.

## 1. Never delete files without asking
Do not delete any file, folder, route, page, component, hook, lib, type, or asset without explicit confirmation. If you believe a file is unused, ask before removing it.

## 2. Run the build after every change
After making any change to frontend code, run `npm run build` (which runs `tsc && vite build`) and confirm it completes with zero errors before considering the task done. If the build fails, fix it immediately.

## 3. Run the dev server to verify behavior
Run `npm run dev` and manually navigate to affected routes/pages to confirm they load and behave correctly. Do not rely on the build alone.

## 4. Always use clean, readable code
- Write self-documenting code with clear variable and function names.
- Keep components small and focused; extract repeated UI into reusable components.
- Avoid deeply nested logic and magic strings/numbers.
- Use existing Tailwind utility classes before writing custom CSS.
- Follow the existing code style (Prettier-style formatting, 2-space indentation, double quotes, semicolons).

## 5. Respect the TypeScript type system
- Do not use `any` unless absolutely unavoidable, and if you do, add a comment explaining why.
- Define new types in `src/types/` and import them; do not inline ad-hoc object types across multiple files.
- Keep `tsc` happy — no type errors are allowed in the build output.

## 6. Keep routing changes explicit
- Any new page must be added to `src/App.tsx` with `React.lazy` + a route entry.
- Do not change existing route paths without checking all `Link`/`useNavigate` references first.
- Lazy-loaded pages go in `src/pages/`; shared UI goes in `src/components/`.

## 7. Do not remove or disable providers/wrappers
`src/main.tsx` wraps the app in providers (`QueryClientProvider`, `LightGuard`, `ThemeProvider`, `I18nProvider`, `SoundProvider`, `NotifyHost`). Do not remove, reorder, or disable any of them without asking.

## 8. Preserve PWA and asset references
Do not change `vite.config.ts`, `tailwind.config.js`, `sw.js`, `index.html`, or `public/icons/` references without asking, as these affect the PWA install/build behavior.

## 9. Do not touch database logic unless asked
`src/lib/supabase.ts`, `src/lib/socialApi.ts`, and all files under `src/types/` define the data layer. Do not modify Supabase calls, table names, or type definitions unless the task explicitly requires it.

## 10. Test affected user flows
When changing a page or component, verify:
- The page loads without console errors.
- Related navigation (links, buttons, forms) works.
- Responsive/dark-mode appearance is not broken.
- No regressions on sibling routes sharing the same layout.

## 11. Ask before major refactors
Do not restructure folders, rename directories, migrate libraries, or rewrite large subsystems without discussing first.
