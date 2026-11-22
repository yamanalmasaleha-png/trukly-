# Domain Map — Community Hub, Street Whispers & Content Moderation

## 1. Current Behavior
Provides a neighborhood feed (`#communityScreen`) for customer reviews, tips, questions, and Street Whispers prompts. New submissions (`POST /api/community/post`) enter moderation/rate-limited workflow (`5/hr`, idempotency-deduplicated), users can flag content (`POST /api/community/report`), and `Admin: Mod` / `Admin: Top` moderate posts and reports from `/admin#moderation`.

## 2. Entry Points & Key Symbols
- **Server**: [api/community/list.js](../../../api/community/list.js), [api/community/mine.js](../../../api/community/mine.js), [api/community/post.js](../../../api/community/post.js), legacy [api/community/moderate.js](../../../api/community/moderate.js); `POST /api/community/report` & `GET|POST /api/admin/moderation*` ([server/admin-routes.js](../../../server/admin-routes.js)).
- **Browser**: [public/community.js](../../../public/community.js), [public/street-whispers.js](../../../public/street-whispers.js), `window.bitesharkOpenCommunityReport` ([public/role-experience.js](../../../public/role-experience.js)), `#sec-moderation` ([public/admin.js](../../../public/admin.js)).

## 3. HTTP APIs & Database Tables
- **APIs**: `GET /api/community/list`, `GET /api/community/mine`, `POST /api/community/post`, `POST /api/community/report`, canonical `GET /api/admin/moderation` + `POST /api/admin/moderation/decision` (`approve|reject|hide|restore|dismiss_reports`), legacy `GET|POST /api/community/moderate`.
- **Tables & Views** (`FORCE ROW LEVEL SECURITY`): `community_reviews` (and view `public_community_reviews` with `security_invoker = true`), `community_reports`, `community_moderation_history` (append-only). Uses RLS GUCs `app.user_id`, `app.is_moderator`, `app.admin_internal`.

## 4. Permissions, Flags & Tests
- **Permissions**: Public read of `status = 'approved'` rows; `14+` session for posting, viewing own history (`/api/community/mine`), and reporting; `Admin: Mod` or `Admin: Top` for moderation decisions.
- **Feature Flags**: Parent `community_hub` (`enabled` | `hidden`) -> child `community_submissions` (`enabled` | `paused` | `hidden`) *(+ `street_whispers` child control on `83181ba`)*; overridden by `BITESHARK_PAUSE_WRITES=community|all`. Moderators retain read access even when `community_hub` is `hidden`.
- **Tests**: `tests/backend-hardening.integration.cjs`, `tests/admin-governance.integration.cjs`, `tests/feature-controls.integration.cjs`.
- **Known Inconsistencies**: Dual moderation endpoints (`/api/admin/moderation*` is canonical; `/api/community/moderate` on `#ownerScreen` is legacy).
- **Safe Extension Points**: Add new moderation capabilities exclusively to `/api/admin/moderation*` in `server/admin-routes.js`.
