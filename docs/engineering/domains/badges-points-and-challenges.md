# Domain Map — Badges, Exploration Points & Weekly Challenges

## 1. Current Behavior
- **Primary (`working/biteshark-vps` / `staging.biteshark.live`)**: Computed authoritatively on the server inside `computeExplorationSummaryInTx` ([lib/customer-exploration.js](../../../lib/customer-exploration.js)) from verified PostgreSQL `customer_visits` and `customer_photos` rows (`POINTS_PER_VISIT = 25`, `POINTS_PER_PHOTO = 10` up to 12 photos, `EXPLORATION_LEVELS`, `EXPLORATION_BADGE_DEFINITIONS`, and Pacific Monday-to-Sunday `getMondayWeekBounds` `WEEKLY_CHALLENGE_TARGET = 2` counting at most 1 visit per business per calendar day). Street Whispers (`public/street-whispers.js`) provides transient in-memory clue/roulette/mission prompts (`0` persistent `localStorage` checkoffs). Contains **zero** public leaderboards, user profile pages, or redeemable monetary rewards.
- **Secondary Staging (`staging2` branches prior to exploration merge)**: Still computes badges/points client-side from `localStorage['truckly_guide_passport_v1']`.

## 2. Entry Points, APIs, Flags & Tests
- **Files**: `lib/customer-exploration.js`, `public/exploration-client.js`, `public/guide-passport.js`, `public/street-whispers.js`.
- **APIs**: Returned in `GET /api/me/exploration` (`summary.achievements`, `summary.weekly_challenge`).
- **Feature Flags**: `local_guides_passport`, `visit_journal`, `exploration_badges`, `weekly_challenges`, `street_whispers` *(hiding `exploration_badges` or `weekly_challenges` suppresses presentation without deleting underlying `customer_visits` or `customer_photos`)*.
- **Tests**: `tests/customer-exploration.integration.cjs`, `tests/customer-exploration-browser.e2e.cjs`.
- **Safe Extension Points**: Keep points/badges purely derived (`computeExplorationSummaryInTx`) rather than storing mutable counters that can drift on visit/photo deletion.
