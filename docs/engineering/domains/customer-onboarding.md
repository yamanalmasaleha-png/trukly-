# Domain Map — Customer Onboarding & Welcome Experience

## 1. Current Behavior
Provides a non-blocking welcome chooser (`#welcomeScreen`) and vendor introduction flow (`#vendorIntroScreen`), remembers optional start preference (`customer` vs `vendor`) in a 90-day client cookie (`bs_start_pref`), optionally suggests a Sonoma town from coarse proxy geo (`GET /api/account/context` when `BITESHARK_ENABLE_PROXY_COARSE_GEO=1`), and lets anonymous visitors browse discovery, stories, and suggested trails before signing in.

## 2. Entry Points, Symbols & Storage
- **Browser**: `window.bitesharkWelcome`, `syncStartPreferenceMenuUI` ([public/role-experience.js](../../../public/role-experience.js)); `#welcomeScreen`, `#vendorIntroScreen` ([public/index.html](../../../public/index.html)).
- **Server**: `GET /api/account/context` (`coarse_area` field in [server/admin-routes.js](../../../server/admin-routes.js#L697-L765)).
- **Storage**: Cookie `bs_start_pref` (`SameSite=Lax; Path=/; Max-Age=7776000`).

## 3. Permissions, Flags & Tests
- **Permissions**: Public (`#welcome` and `?vendor_intro=1` require no account; claiming/submitting a vendor application transitions to `14+` OTP sign-in and `vendor_onboarding`).
- **Feature Flags**: `vendor_onboarding` controls vendor CTA availability inside `#welcomeScreen` and `#vendorIntroScreen`.
- **Tests**: `tests/welcome-experience-browser.e2e.cjs`.
- **Safe Extension Points**: Keep `#discoverScreen` immediately reachable without forced login walls; store non-sensitive arrival preferences in `bs_start_pref` rather than server tables for guests.
