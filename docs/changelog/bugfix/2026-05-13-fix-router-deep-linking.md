# 2026-05-13 — Fix router deep-linking

## What changed
- In `frontend/src/App.tsx`, the initial-load gate now waits for `me` (the `/api/secure/ping` profile response) before rendering `<Routes>`, instead of gating only on `isLoading`.
- Reordered the gates so the `!isSignedIn` → `<LoginPage />` branch fires before the loading screen, since `!isSignedIn` is the cheaper signal.
- No changes to `DefaultRedirect`, `RequireRole`, route declarations, or any component internals. The R3 route map is unchanged.

## Why
- Reported bug: Lead/Admin users typing `/admin/control-center`, `/ops/dashboard`, etc. into the address bar were always snapped back to `/routes` (Lead) or `/admin/dashboard` (Admin). Deep-linking was broken for every role.
- Root cause was a render-order race, not a stray `useEffect` or misplaced `DefaultRedirect`:
  - MSAL hydrates `isSignedIn=true` synchronously from `localStorage` on first render.
  - `me` (and the roles array) is populated by an effect that fires *after* the first commit. `isLoading` also flips inside that effect, so on the very first render `isLoading=false` and `me=null`.
  - With the old gate (`if (isLoading) ...`), the first render committed `<Routes>` with an empty roles array. `RequireRole` saw no matching role on the deep-linked path and rendered `<Navigate to="/" replace />`. After `me` resolved, `DefaultRedirect` at `/` then sent the user to their role's landing path — exactly the symptom reported.
- Gating on `!me` as well closes the window: while we have an MSAL account but no profile yet, we render the loading screen, so the URL is preserved until roles are known and `RequireRole` can evaluate correctly.

## Verification (manual, not previewed)
- Preview server cannot exercise this path: the bug only manifests after a real Entra sign-in, which the preview harness cannot perform.
- The fix is reachable via direct code review: the only first-render branch that previously rendered `<Routes>` with `me=null` is now blocked by the new `|| !me` clause, and the R3 route map and guard placement are otherwise untouched.

## Files touched
- `frontend/src/App.tsx`
- `docs/changelog/2026-05-13-fix-router-deep-linking.md`
