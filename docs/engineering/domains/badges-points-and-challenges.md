# Domain Map — Badges, Exploration Points & Weekly Challenges

## 1. Current Behavior (Branch-Aware)
- **Baseline (`a4e9f53` & `a2f0135`)**: Computed client-side in [public/guide-passport.js](../../../public/guide-passport.js) from `localStorage['truckly_guide_passport_v1']` visits (`#passportBadges`, `#passportStats`, `#passportWeekly`) plus local Street Whispers mission prompts in [public/street-whispers.js](../../../public/street-whispers.js).
- **Branch `feature/customer-exploration-journal-trails` (`83181ba`)**: Computed authoritatively on the server inside `computeExplorationSummaryInTx` ([`lib/customer-exploration.js` @ `83181ba`](https://github.com/yamanalmasaleha-png/trukly-/blob/83181ba0fea67183e21781896447f19f1a8f4860/lib/customer-exploration.js)) from verified PostgreSQL `customer_visits` and `customer_photos` rows (`POINTS_PER_VISIT = 25`, `POINTS_PER_PHOTO = 10`, `EXPLORATION_LEVELS`, `EXPLORATION_BADGE_DEFINITIONS`, and Pacific Monday-to-Sunday `getMondayWeekBounds` `WEEKLY_CHALLENGE_TARGET = 2`). Contains **zero** public leaderboards, user profile pages, or redeemable monetary rewards.

## 2. Entry Points, APIs, Flags & Tests
- **Files**: `public/guide-passport.js`, `public/street-whispers.js` *(+ `lib/customer-exploration.js`, `public/exploration-client.js` on `83181ba`)*.
- **APIs (`83181ba`)**: Returned in `GET /api/me/exploration` (`summary.points`, `summary.level`, `summary.badges`, `summary.weekly_challenge`).
- **Feature Flags**: `local_guides_passport` *(+ child controls `exploration_badges` and `weekly_challenges` on `83181ba`; pausing/hiding hides badge/challenge UI without deleting underlying `customer_visits` or `customer_photos`!)*
- **Tests**: `tests/customer-exploration.integration.cjs`, `tests/customer-exploration-browser.e2e.cjs` (`83181ba`).
- **Safe Extension Points**: Keep points/badges purely derived (`computeExplorationSummaryInTx`) rather than storing mutable counters that can drift on visit/photo deletion.
