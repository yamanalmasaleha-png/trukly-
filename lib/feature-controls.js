// BiteShark Controlled Feature-Management Registry, Evaluator & Central Enforcement
//
// Security & Operational Invariants:
//   1. Fixed Reviewed Registry: Controls exist ONLY for reviewed optional, beta, demonstrative,
//      placeholder, or deferred capabilities. Essential operations (authentication, logout,
//      14+ age eligibility, RBAC, CSRF, rate limits, forced RLS, audit logs, policy/accessibility
//      notices, privacy/account-access support issues, Top-admin recovery, healthz, and backups)
//      are NEVER switchable.
//   2. Authoritative Hierarchy: Effective availability requires ALL of:
//        (a) trusted feature configuration (`configTrusted === true` for optional mutations),
//        (b) authoritative environment emergency / provider controls (`PAUSE_WRITES`,
//            `PUSH_PROVIDER_MODE`, `DISABLE_SUBSCRIPTIONS`, `DISABLE_NOTIFICATION_DELIVERY`),
//        (c) cycle-free parent feature dependencies (`depends_on`),
//        (d) persisted operator state (`enabled` | `paused` | `hidden`), and
//        (e) verified server-side role/membership when `audience === 'staff_beta'`.
//      A database toggle can NEVER override an environment emergency stop or enable unconfigured push.
//   3. Zero Silent Cascading Overwrites: Disabling a parent feature restricts its dependents'
//      `effective_state` and explains why without overwriting the dependents' saved settings.
//   4. Optimistic Concurrency & Append-Only Audit: Every change checks `expected_revision` under
//      `SELECT ... FOR UPDATE`, increments `revision`, writes `feature_control_history`, and
//      records a secret-redacted entry in `audit_logs`.

import { withTransaction } from './db-tx.js';
import { EnvAliasConflictError, readEnvCompat } from './env-compat.js';
import { inspectWritePauseConfig, loadAccessContext, recordAuditLog } from './authz.js';
import { resolveMapRuntimeConfig } from './map-config.js';

export const VALID_FEATURE_STATES = Object.freeze(['enabled', 'paused', 'hidden']);
export const VALID_FEATURE_AUDIENCES = Object.freeze(['all', 'staff_beta']);

export const PROTECTED_ESSENTIAL_CAPABILITIES = Object.freeze([
  {
    key: 'authentication_and_sessions',
    title: 'Email OTP Authentication, Sessions & Logout',
    reason: 'Essential account access and immediate session revocation (`/login.html`, `/api/auth/*`) cannot be disabled.'
  },
  {
    key: 'age_eligibility_and_restrictions',
    title: '14+ Age Eligibility Gate & Account/Vendor Restrictions',
    reason: 'Mandatory legal-readiness and trust/safety enforcement (`lib/age-policy.js`, account/vendor suspensions).'
  },
  {
    key: 'rbac_csrf_rls_and_audit',
    title: 'Server RBAC, CSRF, Rate Limits, Forced RLS & Audit Trail',
    reason: 'Core security controls and immutable `audit_logs` are non-negotiable.'
  },
  {
    key: 'policy_accessibility_and_privacy_support',
    title: 'Policy Notices, Accessibility Statement & Support / Feedback Channel',
    reason: 'Public `/policies/*` disclosures and Customer/Vendor Help & Feedback (`/api/issues*`) remain permanently reachable so users can always report broken features or request privacy/account help.'
  },
  {
    key: 'public_vendor_discovery',
    title: 'Canonical Sonoma County Food Discovery',
    reason: 'Core read-only directory (`/api/trucks*`, `/api/catalog/*`, `/api/schedule/today`) remains available during optional write pauses.'
  },
  {
    key: 'top_admin_recovery_and_health',
    title: 'Admin: Top Portal, Feature Controls, Healthz & Backups',
    reason: 'Administrators and health monitors (`/admin`, `/api/admin/features*`, `/api/healthz`) must retain recovery access.'
  }
]);

export const FEATURE_CONTROLS_REGISTRY = Object.freeze([
  Object.freeze({
    key: 'event_inquiries',
    title: 'Event Catering Inquiries',
    category: 'customer_and_vendor_workflows',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note: null,
    depends_on: Object.freeze([]),
    high_impact_interrupt: true,
    description:
      'Customer catering and private-event inquiry submissions (`POST /api/bookings/create`, `#bookingModal`). Inquiry-only — BiteShark does not process payments.',
    affected_workflows: Object.freeze([
      'Customer Book nav button, listing detail Event CTA, and #bookingModal submission',
      'Public date availability pre-check (`GET /api/trucks/availability`) when hidden',
      'Preserves existing customer `GET /api/bookings/list` and vendor owner `GET|POST /api/owner/requests` review of pending inquiries'
    ]),
    interrupt_consequences: Object.freeze([
      'Customers will immediately be unable to submit new catering inquiries (`503 FEATURE_PAUSED` or `403 FEATURE_DISABLED`).',
      'Existing pending and accepted inquiries remain visible so customers can view history and vendor owners can still accept or decline existing requests.'
    ]),
    public_paused_message:
      'New event catering inquiries are temporarily paused. Existing submitted inquiries remain visible in Your Bookings and Owner Mode.',
    public_hidden_message: 'Event catering inquiries are currently unavailable.'
  }),
  Object.freeze({
    key: 'community_hub',
    title: 'Local Community Hub & Feed',
    category: 'community_and_content',
    implementation_status: 'beta',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note:
      'Supports `enabled` or `hidden`. To keep approved posts readable while stopping new posts, set child control `community_submissions` to `paused`.',
    depends_on: Object.freeze([]),
    high_impact_interrupt: true,
    description:
      'Public neighborhood review, tip, question, and Street Whispers hub (`#communityScreen`, `GET /api/community/list`, `POST /api/community/report`).',
    affected_workflows: Object.freeze([
      'Community entry cards, profile menu link, `#communityScreen`, and public `GET /api/community/list`',
      'Dependent control `community_submissions` (`POST /api/community/post`)',
      'Preserves author own-history (`GET /api/community/mine`) and `Admin: Mod` / `Admin: Top` moderation queues'
    ]),
    interrupt_consequences: Object.freeze([
      'Hides `#communityScreen` and blocks public `GET /api/community/list`, `POST /api/community/post`, and `POST /api/community/report` for non-eligible users.',
      'Dependent `community_submissions` automatically becomes `hidden` without overwriting its saved setting; existing records and admin moderation remain intact.'
    ]),
    public_paused_message: 'The Local Community hub is temporarily unavailable.',
    public_hidden_message: 'The Local Community hub is currently unavailable.'
  }),
  Object.freeze({
    key: 'community_submissions',
    title: 'New Community Reviews, Tips & Whispers',
    category: 'community_and_content',
    implementation_status: 'beta',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note: null,
    depends_on: Object.freeze(['community_hub']),
    high_impact_interrupt: true,
    description:
      'Submitting new moderated reviews, tips, questions, and unverified food whispers (`POST /api/community/post`, `#communityCompose`).',
    affected_workflows: Object.freeze([
      'Write a review / Share a tip / Drop a food whisper buttons and `POST /api/community/post`',
      'Preserves approved public feed (`GET /api/community/list`), post reporting (`POST /api/community/report`), author history (`GET /api/community/mine`), and moderation'
    ]),
    interrupt_consequences: Object.freeze([
      'Blocks new community post submissions (`503 FEATURE_PAUSED` or `403 FEATURE_DISABLED`).',
      'Approved posts remain visible, users can still report posts, and moderators can continue reviewing the pending queue.'
    ]),
    public_paused_message:
      'New community reviews and tips are temporarily paused. Approved neighborhood posts and post reporting remain available.',
    public_hidden_message: 'New community submissions are currently disabled.'
  }),
  Object.freeze({
    key: 'local_guides_passport',
    title: 'Local Guides & Exploration Hub',
    category: 'discovery_extras',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note: null,
    depends_on: Object.freeze([]),
    high_impact_interrupt: false,
    description:
      'Parent entry hub (`#guidesScreen`, topbar Local Guides button, bottom-nav Guides tab, and `#guides` routes) hosting Editorial Stories, Visit Journal, and Private Photos.',
    affected_workflows: Object.freeze([
      'Topbar Local Guides button, bottom-nav Guides tab, and `#guides` / `#passport` / `#stories` / `#photos` hash routes',
      'Parent dependency for `editorial_stories`, `visit_journal`, and `private_photos`: pausing pauses new visits and photo uploads while keeping existing stories, visit history, and saved photos readable; hiding hides the entire hub without deleting account data'
    ]),
    interrupt_consequences: Object.freeze([
      'Pausing halts new visit check-ins and photo uploads while keeping existing history readable; hiding removes Local Guides hub navigation and clamps dependent hub tabs to hidden without deleting stored records.'
    ]),
    public_paused_message:
      'Saving new visits and photos in Local Guides is temporarily paused. You can still read stories and view or remove existing saved entries.',
    public_hidden_message: 'Local Guides is currently unavailable.'
  }),
  Object.freeze({
    key: 'editorial_stories',
    title: 'Editorial Stories & Sourced Field Notes',
    category: 'discovery_extras',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note:
      'Supports `enabled` or `hidden` because Editorial Stories (`GET /api/stories`) is a read-only curated surface with no customer mutations to pause.',
    depends_on: Object.freeze(['local_guides_passport']),
    high_impact_interrupt: false,
    description:
      'Curated Sonoma County editorial stories with BiteShark illustrations and verified source attributions (`#guideStories`, Discover editorial spotlight, and `GET /api/stories`).',
    affected_workflows: Object.freeze([
      'Stories tab inside Local Guides (`#guideStories`), Discover editorial spotlight strip, `#stories` deep link, and `GET /api/stories`'
    ]),
    interrupt_consequences: Object.freeze([
      'Hides the Stories tab, Discover story spotlight, and `GET /api/stories` (`403 FEATURE_DISABLED`) while keeping Visit Journal and Private Photos available.'
    ]),
    public_paused_message: 'Editorial stories are temporarily unavailable.',
    public_hidden_message: 'Editorial stories are currently unavailable.'
  }),
  Object.freeze({
    key: 'visit_journal',
    title: 'Visit Journal & Repeat Check-Ins',
    category: 'discovery_extras',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note: null,
    depends_on: Object.freeze(['local_guides_passport']),
    high_impact_interrupt: false,
    description:
      'Account-backed self-reported Visit Journal (`#guidePassportSection`, `/api/me/visits`, `/api/me/exploration/import`), business-detail "Log a visit" action, and trail-stop visit logging.',
    affected_workflows: Object.freeze([
      'Visit Journal tab in Local Guides, detail-modal and saved-trail "Log a visit" actions, legacy device visit import, and `/api/me/visits`',
      'When `paused`, existing visit history and self-deletion remain available while logging or importing new visits is paused (`503 FEATURE_PAUSED`)',
      'Never deletes stored `customer_visits` rows'
    ]),
    interrupt_consequences: Object.freeze([
      'Pausing blocks new visit check-ins and imports while keeping visit history and removal accessible; hiding removes Visit Journal UI and blocks `/api/me/visits` while preserving `/api/me/exploration/export` and self-service `/api/me/visits/delete` for the account owner.'
    ]),
    public_paused_message:
      'Logging new visits is temporarily paused. You can still view or remove visits already saved in your Visit Journal.',
    public_hidden_message: 'The Visit Journal is currently unavailable.'
  }),
  Object.freeze({
    key: 'private_photos',
    title: 'Private Account-Backed Dish & Visit Photos',
    category: 'discovery_extras',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note: null,
    depends_on: Object.freeze(['local_guides_passport']),
    high_impact_interrupt: false,
    description:
      'Private account-backed photo uploads and captions stored outside the public web root (`#guidePhotoSection`, `/api/me/photos`, `/api/me/photos/file`).',
    affected_workflows: Object.freeze([
      'Photos tab in Local Guides, detail-modal "Save private photo" shortcut, legacy photo import, and `/api/me/photos*`',
      'When `paused`, existing private photos remain viewable and deletable while new uploads are paused (`503 FEATURE_PAUSED`)',
      'Never deletes stored `customer_photos` files or metadata when disabled'
    ]),
    interrupt_consequences: Object.freeze([
      'Pausing stops new photo uploads while allowing users to view or delete existing private photos; hiding removes Photos UI and blocks `/api/me/photos` (`403 FEATURE_DISABLED`) while keeping owner privacy export (`/api/me/exploration/export`), owner binary photo download (`/api/me/photos/file`), and self-service deletion (`/api/me/photos/delete`) available.'
    ]),
    public_paused_message:
      'Uploading new private photos is temporarily paused. You can still view or remove photos already saved to your account.',
    public_hidden_message: 'Private photo notebook is currently unavailable.'
  }),
  Object.freeze({
    key: 'exploration_badges',
    title: 'Exploration Badges, Levels & Points Presentation',
    category: 'discovery_extras',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note:
      'Derived read-only presentation over `customer_visits` and `customer_photos`. Disabling hides points, levels, and badges without altering underlying visits or photos; derived totals recalculate automatically when re-enabled.',
    depends_on: Object.freeze(['visit_journal']),
    high_impact_interrupt: false,
    description:
      'Non-monetary points, Flavor Scout..Flavor Legend levels, and the 5 distinct-exploration badges (`First Bite`, `Neighborhood Scout`, `Flavor Hopper`, `Town Hopper`, `Photo Keeper`).',
    affected_workflows: Object.freeze([
      'Points, level bar, and badge shelf inside Visit Journal and `achievements` field in `GET /api/me/exploration`',
      'Underlying visits and photos continue recording normally while presentation is hidden'
    ]),
    interrupt_consequences: Object.freeze([
      'Hides points, level progress, and badges from customer UI and `GET /api/me/exploration` while preserving all underlying visit and photo records.'
    ]),
    public_paused_message: 'Badges and points display is temporarily unavailable.',
    public_hidden_message: 'Badges and points display is currently hidden.'
  }),
  Object.freeze({
    key: 'weekly_challenges',
    title: 'Weekly Exploration Challenges',
    category: 'discovery_extras',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note:
      'Derived Monday–Sunday (`America/Los_Angeles`) progress over `customer_visits`. Hiding suppresses challenge display without erasing or corrupting visit history.',
    depends_on: Object.freeze(['visit_journal']),
    high_impact_interrupt: false,
    description:
      'Monday-start `America/Los_Angeles` weekly challenge ("Two-stop taste trail", counting at most 1 visit per business per calendar day).',
    affected_workflows: Object.freeze([
      'Weekly Challenge card inside Visit Journal and `weekly_challenge` field in `GET /api/me/exploration`'
    ]),
    interrupt_consequences: Object.freeze([
      'Hides the Weekly Challenge card and omits challenge progress in `GET /api/me/exploration` without affecting visit logging.'
    ]),
    public_paused_message: 'Weekly challenges are temporarily unavailable.',
    public_hidden_message: 'Weekly challenges are currently hidden.'
  }),
  Object.freeze({
    key: 'suggested_trails',
    title: 'Suggested Trails, Sharing & Saved Itineraries',
    category: 'discovery_extras',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note: null,
    depends_on: Object.freeze([]),
    high_impact_interrupt: false,
    description:
      'Category-ranked Suggested Trails itinerary builder (`GET /api/trails/suggest`), `#trail=` / `?trail=` share links, and account-backed saved trails with stop progress (`/api/me/trails`).',
    affected_workflows: Object.freeze([
      'Discover Suggested Trails bar, Local Guides trail shortcut, `#trail=` / `?trail=` share links, `GET /api/trails/suggest`, and `/api/me/trails*`',
      'When `paused`, generating/sharing trails and viewing or deleting saved trails remain available while saving new trails to an account is paused (`503 FEATURE_PAUSED`)',
      'Never deletes stored `customer_saved_trails` records'
    ]),
    interrupt_consequences: Object.freeze([
      'Pausing blocks saving new itineraries while keeping public trail suggestions, share links, and existing saved trails accessible; hiding removes Suggested Trails UI and blocks `/api/trails/suggest` and `/api/me/trails` (`403 FEATURE_DISABLED`) while preserving `/api/me/exploration/export` and self-service `/api/me/trails/delete`.'
    ]),
    public_paused_message:
      'Saving new trails to your account is temporarily paused. You can still generate, share, and view existing saved trails.',
    public_hidden_message: 'Suggested trails are currently unavailable.'
  }),
  Object.freeze({
    key: 'flavor_lab_tools',
    title: 'Flavor Finder & Craving Matcher',
    category: 'discovery_extras',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note:
      'Supports `enabled` or `hidden` because Flavor Finder is a stateless client-side craving filter with no server mutations to pause. Suggested Trails (`suggested_trails`) and Owner Mode promo cards are controlled separately.',
    depends_on: Object.freeze([]),
    high_impact_interrupt: false,
    description:
      'Stateless town-and-craving directory matcher (`#smartInvite`, Flavor Finder view on `#smartScreen`).',
    affected_workflows: Object.freeze([
      'Discover Flavor Finder card (`.smart-invite`) and Flavor Finder view (`#smartScreen`)'
    ]),
    interrupt_consequences: Object.freeze([
      'Hides Flavor Finder entry points while keeping Suggested Trails (`suggested_trails`) and Owner Mode vendor tools independent.'
    ]),
    public_paused_message: 'Flavor Finder is temporarily unavailable.',
    public_hidden_message: 'Flavor Finder is currently unavailable.'
  }),
  Object.freeze({
    key: 'street_whispers',
    title: 'Street Whispers Clues, Quiz & Side Missions',
    category: 'community',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note:
      'Supports `enabled` or `hidden` because Street Whispers (`public/street-whispers.js`) is an interactive read-only editorial clue quiz and mission prompt surface inside `#communityScreen`.',
    depends_on: Object.freeze(['community_hub']),
    high_impact_interrupt: false,
    description:
      'Editorial local-spot clue quiz, mystery spot picker, and discovery side missions (`.street-section` inside `#communityScreen`).',
    affected_workflows: Object.freeze([
      'Street Whispers clue quiz, mystery pick, and side missions inside `#communityScreen` (automatically omits missions targeting disabled features)'
    ]),
    interrupt_consequences: Object.freeze([
      'Hides the Street Whispers quiz, mystery picker, and missions section while keeping moderated Community reviews and tips available.'
    ]),
    public_paused_message: 'Street Whispers activities are temporarily unavailable.',
    public_hidden_message: 'Street Whispers activities are currently unavailable.'
  }),
  Object.freeze({
    key: 'interactive_map',
    title: 'Interactive Discovery Map',
    category: 'discovery_extras',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note:
      'Supports `enabled` or `hidden`. Hiding suppresses Leaflet map initialization and makes zero tile requests while preserving full Sonoma County List discovery, search, filters, favorites, and listing details.',
    depends_on: Object.freeze([]),
    high_impact_interrupt: false,
    description:
      'Interactive Sonoma County Leaflet map (`#map`, `.mode-switch`) backed by the allowlisted tile provider (`lib/map-config.js`).',
    affected_workflows: Object.freeze([
      'Discover screen Map/List mode switch (`#mapMode`) and `#map` tile initialization',
      'Preserves full Sonoma County List discovery, search, cuisine/kind/open filters, distance calculation, saved favorites, and listing detail modals'
    ]),
    interrupt_consequences: Object.freeze([
      'Hides the interactive map toggle, tears down any open tile layer, and ensures zero external tile requests are made; List view remains fully available.'
    ]),
    public_paused_message:
      'Interactive map view is temporarily unavailable. Continue browsing all Sonoma County food listings in List view.',
    public_hidden_message:
      'Interactive map view is currently disabled. Continue browsing all Sonoma County food listings in List view.'
  }),
  Object.freeze({
    key: 'vendor_onboarding',
    title: 'Self-Service Vendor Claim & Listing Applications',
    category: 'customer_and_vendor_workflows',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note: null,
    depends_on: Object.freeze([]),
    high_impact_interrupt: true,
    description:
      'Self-service vendor claim/new-listing applications and ownership-evidence uploads (`POST /api/onboarding/applications`, `POST /api/onboarding/evidence`).',
    affected_workflows: Object.freeze([
      'Profile menu Claim or apply as vendor entry, `#vendorApplyModal`, and new/updated application & evidence submissions',
      'Preserves applicant read access (`GET /api/onboarding/applications`), existing approved vendor memberships, and Admin Portal review (`/api/admin/applications*`)'
    ]),
    interrupt_consequences: Object.freeze([
      'Blocks new vendor application drafts, submissions, and evidence uploads (`503 FEATURE_PAUSED` or `403 FEATURE_DISABLED`).',
      'Existing vendor owners/staff keep full access, applicants can still check status of already-submitted applications, and admins can continue reviewing pending applications.'
    ]),
    public_paused_message:
      'New vendor claim and listing applications are temporarily paused. Existing applicants can still view submitted application status below.',
    public_hidden_message: 'Self-service vendor onboarding is currently closed.'
  }),
  Object.freeze({
    key: 'pickup_pager_creation',
    title: 'Kitchen Pickup Pager Ticket Creation',
    category: 'pickup_pager_and_push',
    implementation_status: 'implemented',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note: null,
    depends_on: Object.freeze([]),
    high_impact_interrupt: true,
    description:
      'Creating new 24-hour private customer pickup pager tickets from the vendor kitchen queue (`POST /api/pager/staff`).',
    affected_workflows: Object.freeze([
      'Owner Mode `#pagerCreateForm` (`POST /api/pager/staff`) and idle customer pager launch when `hidden`',
      'Never strands active tickets: kitchen `GET /api/pager/staff`, status updates (`POST /api/pager/update`), customer polling (`GET /api/pager/status`), and push unsubscribe (`DELETE /api/pager/subscriptions`) remain active'
    ]),
    interrupt_consequences: Object.freeze([
      'Prevents vendor staff and owners from creating new pickup tickets (`503 FEATURE_PAUSED` or `403 FEATURE_DISABLED`).',
      'Already-issued active tickets remain manageable by kitchen staff and trackable by customers until collected, cancelled, or expired.'
    ]),
    public_paused_message:
      'Creating new pickup pager tickets is temporarily paused. Active tickets already in the kitchen queue can still be updated and tracked.',
    public_hidden_message: 'New pickup pager ticket creation is currently disabled.'
  }),
  Object.freeze({
    key: 'pickup_pager_demo',
    title: 'Interactive Sample Pickup Pager Demo',
    category: 'pickup_pager_and_push',
    implementation_status: 'demonstrative',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note:
      'Supports `enabled` or `hidden` because the sample burger ticket (#24) runs strictly in browser memory with zero API or push requests.',
    depends_on: Object.freeze([]),
    high_impact_interrupt: false,
    description:
      'Playful browser-only simulated order preview (`Start the sample order` on `#pagerScreen` and Owner Mode demo shortcut).',
    affected_workflows: Object.freeze([
      '`#pagerScreen` `.pager-example-hero` sample order workbench and Owner Mode `Try the customer demo` button',
      'Real customer pickup links (`#pagerRealEntry`) remain unaffected'
    ]),
    interrupt_consequences: Object.freeze([
      'Hides the simulated sample order card so `#pagerScreen` shows only the real private pickup link entry.'
    ]),
    public_paused_message: 'The sample pickup pager demo is currently hidden.',
    public_hidden_message: 'The sample pickup pager demo is currently hidden.'
  }),
  Object.freeze({
    key: 'pager_push_delivery',
    title: 'Background Web Push Worker Dispatch',
    category: 'pickup_pager_and_push',
    implementation_status: 'deferred',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused']),
    allowed_audiences: Object.freeze(['all']),
    state_exceptions_note:
      'Supports `enabled` or `paused` (`all` audience) because worker outbox dispatch has no public browse UI and processes capability-authorized ticket events. Overridden to `paused` whenever `PUSH_PROVIDER_MODE=disabled` (current staging default) or `DISABLE_NOTIFICATION_DELIVERY=1`.',
    depends_on: Object.freeze([]),
    high_impact_interrupt: true,
    description:
      'Outbound RFC 8291/8292 Web Push delivery from `POST /api/pager/worker` (`lib/pager-notifications.js`). Deferred on staging until physical Android/iPhone PWA verification completes.',
    affected_workflows: Object.freeze([
      'Worker batch claiming and pre-dispatch live recheck (`prepareClaimForDispatch`) immediately before outbound `fetch()`',
      'Dependent control `pager_push_subscriptions` (automatically paused when delivery is paused so customers receive truthful foreground-polling guidance)',
      'Preserves foreground ~8s pager polling, unsubscribe key scrubbing, and 24h outbox cleanup'
    ]),
    interrupt_consequences: Object.freeze([
      'Halts all new outbound Web Push provider calls immediately at the pre-dispatch transaction boundary (releasing un-dispatched claims back to `queued`).',
      'Automatically pauses new push subscriptions and keeps customer pagers on truthful ~8-second foreground polling; HTTP requests already transmitted on the wire cannot be recalled.'
    ]),
    public_paused_message:
      'Background push alerts are currently paused. Keep your pickup page open for live status checks every ~8 seconds.',
    public_hidden_message: 'Background push delivery is currently disabled.'
  }),
  Object.freeze({
    key: 'pager_push_subscriptions',
    title: 'Background Web Push Device Subscriptions',
    category: 'pickup_pager_and_push',
    implementation_status: 'deferred',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused', 'hidden']),
    allowed_audiences: Object.freeze(['all']),
    state_exceptions_note:
      'Applies to `all` because pickup pager links are anonymous bearer UUID capabilities rather than signed-in user accounts. `DELETE /api/pager/subscriptions` always remains enabled so devices can unsubscribe and scrub keys.',
    depends_on: Object.freeze(['pager_push_delivery']),
    high_impact_interrupt: true,
    description:
      'Customer browser Web Push opt-in (`Notify me when ready`, `POST /api/pager/subscriptions`). Requires `pager_push_delivery` and active VAPID provider configuration.',
    affected_workflows: Object.freeze([
      '`GET /api/pager/status` `notifications.enabled` flag, `#pagerSubscribeBtn`, and `POST /api/pager/subscriptions`',
      'Preserves `DELETE /api/pager/subscriptions` (unsubscribe + endpoint/key scrubbing) and foreground ~8s polling'
    ]),
    interrupt_consequences: Object.freeze([
      'Stops new Web Push device registrations (`503 FEATURE_PAUSED` or `403 FEATURE_DISABLED`) and hides/disables opt-in UI in favor of truthful foreground polling.',
      'Existing subscribers can still unsubscribe (`DELETE /api/pager/subscriptions`) to scrub cryptographic keys.'
    ]),
    public_paused_message:
      'New background push alert subscriptions are temporarily paused. Keep this page open for live ~8-second order updates.',
    public_hidden_message: 'Background push alert subscriptions are currently unavailable.'
  }),
  Object.freeze({
    key: 'nearby_alert_preferences',
    title: 'Saved-Spot Nearby Alert Preferences (Placeholder)',
    category: 'discovery_extras',
    implementation_status: 'placeholder',
    read_only: false,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled', 'paused', 'hidden']),
    allowed_audiences: Object.freeze(['all', 'staff_beta']),
    state_exceptions_note:
      'Marked `placeholder`: `#favoritesScreen` saves radius preferences (`notification_settings`), but BiteShark has no background geolocation or nearby-vendor push sender.',
    depends_on: Object.freeze([]),
    high_impact_interrupt: false,
    description:
      'Saved-spots radius preference bar (`#favoritesScreen` `.alerts-bar`, `POST /api/notifications/settings`). Preference storage only — no background nearby-truck alerts are sent.',
    affected_workflows: Object.freeze([
      '`#favoritesScreen` `.alerts-bar` toggle/radius selector and `POST /api/notifications/settings`',
      'Saved favorite places (`GET /api/favorites/list`, `POST /api/favorites/toggle`) remain completely unaffected'
    ]),
    interrupt_consequences: Object.freeze([
      'Pauses or hides the placeholder Nearby Alerts preference bar on Saved Places without affecting saved favorites.'
    ]),
    public_paused_message:
      'Nearby alert preference updates are temporarily paused (saved favorite spots remain active).',
    public_hidden_message: 'Nearby alert preferences are currently hidden.'
  }),
  Object.freeze({
    key: 'passkey_webauthn',
    title: 'WebAuthn Passkey Sign-In',
    category: 'deferred_platform_disclosures',
    implementation_status: 'deferred',
    read_only: true,
    default_state: 'hidden',
    default_audience: 'all',
    allowed_states: Object.freeze(['hidden']),
    allowed_audiences: Object.freeze(['all']),
    state_exceptions_note:
      'Read-only disclosure: WebAuthn RP ID origin binding and credential tables are not implemented in the standalone VPS runtime (`supportsPasskeys() === false`). Cannot be toggled on from Admin.',
    depends_on: Object.freeze([]),
    high_impact_interrupt: false,
    description:
      'Biometric / hardware-key WebAuthn authentication (`public/auth-client.js`). Intentionally disabled in code with explicit user disclosure on `/login.html`.',
    affected_workflows: Object.freeze(['`/login.html` passkey disclosure banner (email OTP remains active)']),
    interrupt_consequences: Object.freeze([]),
    public_paused_message: 'Passkeys are unavailable in standalone VPS mode.',
    public_hidden_message: 'Passkeys are unavailable in standalone VPS mode.'
  }),
  Object.freeze({
    key: 'owner_menu_photo_upload',
    title: 'Owner Menu Photo Local Preview',
    category: 'deferred_platform_disclosures',
    implementation_status: 'demonstrative',
    read_only: true,
    default_state: 'enabled',
    default_audience: 'all',
    allowed_states: Object.freeze(['enabled']),
    allowed_audiences: Object.freeze(['all']),
    state_exceptions_note:
      'Read-only disclosure: `#ownerScreen` `.photo-manager` previews vendor-selected images locally in the browser only; public listing photos remain governed by `photo_rights_verified` in Vendor Governance.',
    depends_on: Object.freeze([]),
    high_impact_interrupt: false,
    description:
      'Local-only image preview tile in Owner Mode (`#ownerPhotoGrid`). Does not upload or publish unverified photos to public listings.',
    affected_workflows: Object.freeze(['`#ownerScreen` MENU PHOTOS local browser preview card']),
    interrupt_consequences: Object.freeze([]),
    public_paused_message: null,
    public_hidden_message: null
  })
]);

export const FEATURE_CONTROLS_BY_KEY = new Map(FEATURE_CONTROLS_REGISTRY.map(item => [item.key, item]));

export function assertCycleFreeFeatureRegistry(registry = FEATURE_CONTROLS_REGISTRY) {
  const byKey = new Map(registry.map(item => [item.key, item]));
  const visiting = new Set();
  const visited = new Set();

  function visit(key, chain) {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      throw new Error(`Cycle detected in FEATURE_CONTROLS_REGISTRY: ${[...chain, key].join(' -> ')}`);
    }
    const spec = byKey.get(key);
    if (!spec) {
      throw new Error(`Unknown dependency "${key}" referenced in FEATURE_CONTROLS_REGISTRY.`);
    }
    visiting.add(key);
    for (const parentKey of spec.depends_on || []) {
      visit(parentKey, [...chain, key]);
    }
    visiting.delete(key);
    visited.add(key);
  }

  for (const item of registry) {
    visit(item.key, []);
  }
  return true;
}

// Validate DAG invariant immediately at module load time
assertCycleFreeFeatureRegistry();

// Central declarative HTTP route -> feature control mapping
export const ROUTE_FEATURE_ENFORCEMENT_RULES = Object.freeze([
  Object.freeze({
    pathname: '/api/bookings/create',
    methods: Object.freeze(['POST']),
    featureKey: 'event_inquiries',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/trucks/availability',
    methods: Object.freeze(['GET']),
    featureKey: 'event_inquiries',
    operationKind: 'read_when_not_hidden'
  }),
  Object.freeze({
    pathname: '/api/community/list',
    methods: Object.freeze(['GET']),
    featureKey: 'community_hub',
    operationKind: 'read_when_not_hidden',
    allowModeratorsWhenHidden: true
  }),
  Object.freeze({
    pathname: '/api/community/post',
    methods: Object.freeze(['POST']),
    featureKey: 'community_submissions',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/community/report',
    methods: Object.freeze(['POST']),
    featureKey: 'community_hub',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/onboarding/applications',
    methods: Object.freeze(['POST']),
    featureKey: 'vendor_onboarding',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/onboarding/evidence',
    methods: Object.freeze(['POST']),
    featureKey: 'vendor_onboarding',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/pager/staff',
    methods: Object.freeze(['POST']),
    featureKey: 'pickup_pager_creation',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/pager/subscriptions',
    methods: Object.freeze(['POST']),
    featureKey: 'pager_push_subscriptions',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/notifications/settings',
    methods: Object.freeze(['POST']),
    featureKey: 'nearby_alert_preferences',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/stories',
    methods: Object.freeze(['GET']),
    featureKey: 'editorial_stories',
    operationKind: 'read_when_not_hidden'
  }),
  Object.freeze({
    pathname: '/api/trails/suggest',
    methods: Object.freeze(['GET']),
    featureKey: 'suggested_trails',
    operationKind: 'read_when_not_hidden'
  }),
  Object.freeze({
    pathname: '/api/me/visits',
    methods: Object.freeze(['GET']),
    featureKey: 'visit_journal',
    operationKind: 'read_when_not_hidden'
  }),
  Object.freeze({
    pathname: '/api/me/visits',
    methods: Object.freeze(['POST']),
    featureKey: 'visit_journal',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/me/photos',
    methods: Object.freeze(['GET']),
    featureKey: 'private_photos',
    operationKind: 'read_when_not_hidden'
  }),
  Object.freeze({
    pathname: '/api/me/photos',
    methods: Object.freeze(['POST']),
    featureKey: 'private_photos',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/me/trails',
    methods: Object.freeze(['GET']),
    featureKey: 'suggested_trails',
    operationKind: 'read_when_not_hidden'
  }),
  Object.freeze({
    pathname: '/api/me/trails',
    methods: Object.freeze(['POST']),
    featureKey: 'suggested_trails',
    operationKind: 'mutation'
  }),
  Object.freeze({
    pathname: '/api/me/exploration/import',
    methods: Object.freeze(['POST']),
    featureKey: 'visit_journal',
    operationKind: 'mutation'
  })
]);

let simulatedConfigFailureForTests = null;

export function setSimulatedFeatureConfigFailureForTests(mode) {
  simulatedConfigFailureForTests = mode || null;
}

function parseBoolDisableFlag(suffix) {
  let raw = '';
  try {
    raw = readEnvCompat(suffix, { securityCritical: true });
  } catch (err) {
    if (err instanceof EnvAliasConflictError) return { active: true, reason: `Conflicting ${suffix} alias` };
    throw err;
  }
  const norm = raw.trim().toLowerCase();
  if (!norm || norm === '0' || norm === 'false') return { active: false, reason: null };
  if (norm === '1' || norm === 'true') return { active: true, reason: `${suffix}=1` };
  return { active: true, reason: `Malformed ${suffix} (failing closed)` };
}

function inspectPushEnvironmentStatus() {
  let env = '';
  let rawMode = '';
  try {
    env = readEnvCompat('ENV', { securityCritical: true }).trim().toLowerCase();
    rawMode = readEnvCompat('PUSH_PROVIDER_MODE', { securityCritical: true }).trim().toLowerCase();
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      return { providerEnabled: false, reason: err.message };
    }
    throw err;
  }

  const isProd =
    env === 'production' ||
    process.env.NODE_ENV === 'production' ||
    String(process.env.HATCHABLE_PROJECT_ID || process.env.PROJECT_ID || '').trim() === 'proj_MEO518rmLLl0';

  const mode = rawMode || 'disabled';
  if (mode === 'disabled') {
    return { providerEnabled: false, reason: 'PUSH_PROVIDER_MODE=disabled' };
  }
  if (mode === 'fake' || mode === 'loopback_test') {
    let allowTest = false;
    try {
      allowTest = readEnvCompat('ALLOW_TEST_PUSH_MODES', { securityCritical: true }) === '1';
    } catch {
      return { providerEnabled: false, reason: 'Conflicting ALLOW_TEST_PUSH_MODES' };
    }
    if (isProd || !allowTest) {
      return { providerEnabled: false, reason: `PUSH_PROVIDER_MODE=${mode} not permitted` };
    }
    return { providerEnabled: true, reason: null };
  }
  if (mode === 'webpush') {
    try {
      const pub = readEnvCompat('VAPID_PUBLIC_KEY', { securityCritical: true });
      const priv = readEnvCompat('VAPID_PRIVATE_KEY', { securityCritical: true });
      const sub = readEnvCompat('VAPID_SUBJECT', { securityCritical: true });
      if (!pub || !priv || !sub) {
        return { providerEnabled: false, reason: 'PUSH_PROVIDER_MODE=webpush missing VAPID keys/subject' };
      }
      return { providerEnabled: true, reason: null };
    } catch (err) {
      return { providerEnabled: false, reason: err?.message || 'VAPID configuration conflict' };
    }
  }
  return { providerEnabled: false, reason: `Invalid PUSH_PROVIDER_MODE=${mode}` };
}

export function inspectEnvironmentFeatureOverrides() {
  const wp = inspectWritePauseConfig();
  const disableDelivery = parseBoolDisableFlag('DISABLE_NOTIFICATION_DELIVERY');
  const disableSubs = parseBoolDisableFlag('DISABLE_SUBSCRIPTIONS');
  const pushStatus = inspectPushEnvironmentStatus();

  const overrides = new Map();

  const setPausedOverride = (key, source, explanation) => {
    if (!overrides.has(key)) {
      overrides.set(key, {
        active: true,
        forced_state: 'paused',
        source,
        explanation
      });
    }
  };

  if (wp.active) {
    const pauseSource = wp.failClosedAll
      ? wp.valid
        ? 'PAUSE_WRITES=all'
        : 'PAUSE_WRITES (invalid/conflict fail-closed)'
      : `PAUSE_WRITES=${wp.scopes.join(',')}`;

    if (wp.failClosedAll || wp.scopes.includes('bookings')) {
      setPausedOverride('event_inquiries', pauseSource, `Environment emergency stop (${pauseSource}) pauses new booking writes.`);
    }
    if (wp.failClosedAll || wp.scopes.includes('community')) {
      setPausedOverride('community_submissions', pauseSource, `Environment emergency stop (${pauseSource}) pauses community writes.`);
    }
    if (wp.failClosedAll) {
      setPausedOverride('vendor_onboarding', pauseSource, `Environment emergency stop (${pauseSource}) pauses onboarding writes.`);
    }
    if (wp.failClosedAll || wp.scopes.includes('pagers')) {
      setPausedOverride('pickup_pager_creation', pauseSource, `Environment emergency stop (${pauseSource}) pauses new pager creation.`);
    }
    if (wp.failClosedAll || wp.scopes.includes('notifications')) {
      setPausedOverride('pager_push_delivery', pauseSource, `Environment emergency stop (${pauseSource}) pauses notification writes.`);
      setPausedOverride('pager_push_subscriptions', pauseSource, `Environment emergency stop (${pauseSource}) pauses subscription writes.`);
      setPausedOverride('nearby_alert_preferences', pauseSource, `Environment emergency stop (${pauseSource}) pauses notification settings writes.`);
    }
  }

  if (!pushStatus.providerEnabled) {
    setPausedOverride(
      'pager_push_delivery',
      pushStatus.reason || 'PUSH_PROVIDER_MODE=disabled',
      `Environment provider control (${pushStatus.reason || 'PUSH_PROVIDER_MODE=disabled'}) keeps outbound Web Push disabled.`
    );
    setPausedOverride(
      'pager_push_subscriptions',
      pushStatus.reason || 'PUSH_PROVIDER_MODE=disabled',
      `Environment provider control (${pushStatus.reason || 'PUSH_PROVIDER_MODE=disabled'}) keeps Web Push subscriptions disabled.`
    );
  }

  if (disableDelivery.active) {
    setPausedOverride(
      'pager_push_delivery',
      disableDelivery.reason,
      `Environment kill-switch (${disableDelivery.reason}) halts outbound push delivery.`
    );
    setPausedOverride(
      'pager_push_subscriptions',
      disableDelivery.reason,
      `Environment kill-switch (${disableDelivery.reason}) halts push delivery and new push opt-ins.`
    );
  }

  if (disableSubs.active) {
    setPausedOverride(
      'pager_push_subscriptions',
      disableSubs.reason,
      `Environment kill-switch (${disableSubs.reason}) pauses new push subscriptions.`
    );
  }

  const mapStatus = resolveMapRuntimeConfig();
  if (!mapStatus.enabled) {
    const mapSource = !mapStatus.config_valid
      ? `MAP_CONFIG_INVALID (${mapStatus.error_code || 'INVALID'})`
      : 'MAP_ENABLED=0';
    const mapExplanation = !mapStatus.config_valid
      ? `Environment map provider configuration is invalid (${mapStatus.error_code || 'INVALID'}); interactive map fails safe to hidden with zero tile requests.`
      : 'Environment control (MAP_ENABLED=0) disables the interactive map and suppresses all tile requests.';
    overrides.set('interactive_map', {
      active: true,
      forced_state: 'hidden',
      source: mapSource,
      explanation: mapExplanation
    });
  }

  return overrides;
}

function validatePersistedRows(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = typeof r.feature_key === 'string' ? r.feature_key.trim() : '';
    const spec = FEATURE_CONTROLS_BY_KEY.get(key);
    if (!spec || spec.read_only) {
      return { valid: false, errorCode: 'UNKNOWN_OR_READONLY_PERSISTED_FEATURE_KEY', failedKey: key };
    }
    const state = typeof r.configured_state === 'string' ? r.configured_state.trim() : '';
    const audience = typeof r.audience === 'string' ? r.audience.trim() : '';
    const rev = Number(r.revision);
    if (
      !spec.allowed_states.includes(state) ||
      !spec.allowed_audiences.includes(audience) ||
      !Number.isInteger(rev) ||
      rev < 1
    ) {
      return { valid: false, errorCode: 'MALFORMED_FEATURE_CONTROL_ROW', failedKey: key };
    }
    byKey.set(key, {
      feature_key: key,
      configured_state: state,
      audience,
      revision: rev,
      reason: r.reason || null,
      updated_by: r.updated_by || null,
      updated_by_email_masked: r.updated_by_email_masked || null,
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null
    });
  }
  return { valid: true, byKey };
}

export async function loadPersistedFeatureControls(db, { requireTablePresent = true } = {}) {
  if (simulatedConfigFailureForTests === 'db_unavailable') {
    return {
      configTrusted: false,
      trustError: 'FEATURE_CONFIG_DB_UNAVAILABLE',
      persistedByKey: new Map()
    };
  }
  if (simulatedConfigFailureForTests === 'malformed_row') {
    return {
      configTrusted: false,
      trustError: 'MALFORMED_FEATURE_CONTROL_ROW',
      persistedByKey: new Map()
    };
  }
  if (!db) {
    return {
      configTrusted: false,
      trustError: 'FEATURE_CONFIG_NO_DB',
      persistedByKey: new Map()
    };
  }

  try {
    const rows = await withTransaction(db, async tx => {
      const prevRes = await tx.query("SELECT COALESCE(current_setting('app.feature_controls_read', true), '') AS v");
      const prevVal = prevRes.rows[0]?.v || '';
      await tx.query("SELECT set_config('app.feature_controls_read', 'true', true)");
      try {
        const res = await tx.query(
          `SELECT feature_key, configured_state, audience, revision, reason,
                  updated_by, updated_by_email_masked, updated_at
           FROM feature_controls`
        );
        return res.rows;
      } finally {
        await tx.query("SELECT set_config('app.feature_controls_read', $1, true)", [prevVal]).catch(() => {});
      }
    });

    const validated = validatePersistedRows(rows);
    if (!validated.valid) {
      return {
        configTrusted: false,
        trustError: validated.errorCode,
        persistedByKey: new Map()
      };
    }

    return {
      configTrusted: true,
      trustError: null,
      persistedByKey: validated.byKey
    };
  } catch (err) {
    if (!requireTablePresent && err?.code === '42P01') {
      // Pre-022 schema in historical migration upgrade unit tests
      return {
        configTrusted: true,
        trustError: null,
        persistedByKey: new Map()
      };
    }
    return {
      configTrusted: false,
      trustError: err?.code === '42P01' ? 'FEATURE_CONTROLS_TABLE_MISSING' : 'FEATURE_CONFIG_DB_ERROR',
      persistedByKey: new Map()
    };
  }
}

export function isCallerEligibleForStaffBeta(accessCtx, viewpointMode = null) {
  if (!accessCtx || !accessCtx.authenticated) return false;
  if (viewpointMode === 'customer_preview') {
    return false;
  }
  if (accessCtx.isTopAdmin || accessCtx.isModAdmin) {
    return true;
  }
  if (accessCtx.memberships instanceof Map && accessCtx.memberships.size > 0) {
    return true;
  }
  return Array.isArray(accessCtx.memberships) && accessCtx.memberships.length > 0;
}

function combineStateSeverity(stateA, stateB) {
  // Severity lattice: hidden > paused > enabled
  if (stateA === 'hidden' || stateB === 'hidden') return 'hidden';
  if (stateA === 'paused' || stateB === 'paused') return 'paused';
  return 'enabled';
}

export function evaluateFeatureControlsSnapshot({
  persistedResult,
  accessCtx = null,
  viewpointMode = null,
  envOverrides = inspectEnvironmentFeatureOverrides()
}) {
  const configTrusted = Boolean(persistedResult?.configTrusted);
  const persistedByKey = persistedResult?.persistedByKey || new Map();
  const staffEligible = isCallerEligibleForStaffBeta(accessCtx, viewpointMode);

  const resolvedMap = new Map();

  function evaluateKey(key) {
    if (resolvedMap.has(key)) return resolvedMap.get(key);
    const spec = FEATURE_CONTROLS_BY_KEY.get(key);
    const saved = persistedByKey.get(key) || null;

    const configuredState = spec.read_only
      ? spec.default_state
      : saved
        ? saved.configured_state
        : spec.default_state;
    const configuredAudience = spec.read_only
      ? spec.default_audience
      : saved
        ? saved.audience
        : spec.default_audience;
    const revision = saved ? saved.revision : 0;

    let systemEffectiveState = configuredState;
    let dependencyBlock = null;

    // 1. Evaluate parent dependencies first (DAG guaranteed cycle-free)
    for (const parentKey of spec.depends_on) {
      const parentEval = evaluateKey(parentKey);
      if (parentEval.system_effective_state !== 'enabled') {
        const inherited = parentEval.system_effective_state === 'hidden' ? 'hidden' : 'paused';
        const nextCombined = combineStateSeverity(systemEffectiveState, inherited);
        // Clamp to allowed states if child doesn't support `paused`
        const clamped = spec.allowed_states.includes(nextCombined)
          ? nextCombined
          : spec.allowed_states.includes('hidden')
            ? 'hidden'
            : 'paused';
        systemEffectiveState = clamped;
        dependencyBlock = {
          blocked: true,
          parent_key: parentKey,
          parent_title: parentEval.title,
          parent_effective_state: parentEval.system_effective_state,
          reason: `Unavailable because parent feature "${parentEval.title}" is currently ${parentEval.system_effective_state}.`
        };
      }
    }

    // 2. Authoritative environment emergency / provider overrides
    const envOv = envOverrides.get(key) || null;
    let envOverrideActive = false;
    if (envOv && envOv.active) {
      const combined = combineStateSeverity(systemEffectiveState, envOv.forced_state);
      systemEffectiveState = combined;
      envOverrideActive = true;
    }

    // 3. Fail-closed safety when persisted configuration cannot be trusted
    let untrustedConfigPaused = false;
    if (!configTrusted && !spec.read_only && systemEffectiveState === 'enabled') {
      systemEffectiveState = spec.allowed_states.includes('paused') ? 'paused' : 'hidden';
      untrustedConfigPaused = true;
    }

    // 4. Audience evaluation for the specific caller/viewpoint (`staff_beta`)
    let callerEffectiveState = systemEffectiveState;
    let audienceRestrictedForCaller = false;
    if (
      !spec.read_only &&
      configuredAudience === 'staff_beta' &&
      !staffEligible &&
      callerEffectiveState !== 'hidden'
    ) {
      callerEffectiveState = 'hidden';
      audienceRestrictedForCaller = true;
    }

    const publicMessage =
      callerEffectiveState === 'enabled'
        ? null
        : untrustedConfigPaused
          ? 'This feature is temporarily paused because configuration could not be verified.'
          : callerEffectiveState === 'paused'
            ? spec.public_paused_message
            : spec.public_hidden_message;

    const entry = {
      key: spec.key,
      title: spec.title,
      category: spec.category,
      description: spec.description,
      implementation_status: spec.implementation_status,
      read_only: spec.read_only,
      allowed_states: spec.allowed_states,
      allowed_audiences: spec.allowed_audiences,
      state_exceptions_note: spec.state_exceptions_note,
      depends_on: spec.depends_on,
      high_impact_interrupt: spec.high_impact_interrupt,
      affected_workflows: spec.affected_workflows,
      interrupt_consequences: spec.interrupt_consequences,
      configured_state: configuredState,
      configured_audience: configuredAudience,
      system_effective_state: systemEffectiveState,
      caller_effective_state: callerEffectiveState,
      available_to_caller: callerEffectiveState === 'enabled',
      audience_restricted_for_caller: audienceRestrictedForCaller,
      env_override: envOv
        ? {
            active: envOverrideActive,
            would_override_if_enabled: true,
            source: envOv.source,
            forced_state: envOv.forced_state,
            explanation: envOv.explanation
          }
        : {
            active: false,
            would_override_if_enabled: false,
            source: null,
            forced_state: null,
            explanation: null
          },
      dependency_block: dependencyBlock || {
        blocked: false,
        parent_key: null,
        parent_title: null,
        parent_effective_state: null,
        reason: null
      },
      revision,
      customized: Boolean(saved),
      last_change: saved
        ? {
            actor_id: saved.updated_by,
            actor_email_masked: saved.updated_by_email_masked,
            updated_at: saved.updated_at,
            reason: saved.reason
          }
        : null,
      public_message: publicMessage
    };

    resolvedMap.set(key, entry);
    return entry;
  }

  for (const item of FEATURE_CONTROLS_REGISTRY) {
    evaluateKey(item.key);
  }

  return {
    config_trusted: configTrusted,
    trust_error: persistedResult?.trustError || null,
    entries: resolvedMap
  };
}

export function buildPublicFeatureControlsPayload(evaluated) {
  const features = {};
  for (const [key, item] of evaluated.entries.entries()) {
    features[key] = {
      state: item.caller_effective_state,
      available: item.available_to_caller,
      implementation_status: item.implementation_status,
      message: item.public_message
    };
  }

  const mapCfg = resolveMapRuntimeConfig();
  const mapEntry = evaluated.entries.get('interactive_map');
  const mapAvailable = Boolean(mapCfg.enabled && mapCfg.config_valid && mapEntry && mapEntry.available_to_caller);

  const map = mapAvailable
    ? {
        enabled: true,
        config_valid: true,
        provider_id: mapCfg.provider_id,
        provider_label: mapCfg.provider_label,
        tile_url_template: mapCfg.tile_url_template,
        allowed_hosts: mapCfg.allowed_hosts,
        attribution_html: mapCfg.attribution_html,
        min_zoom: mapCfg.min_zoom,
        max_zoom: mapCfg.max_zoom,
        referrer_policy: 'origin',
        status_reason: 'enabled'
      }
    : {
        enabled: false,
        config_valid: mapCfg.config_valid,
        provider_id: mapCfg.config_valid ? mapCfg.provider_id : null,
        provider_label: mapCfg.config_valid ? mapCfg.provider_label : null,
        tile_url_template: null,
        allowed_hosts: [],
        attribution_html: null,
        min_zoom: null,
        max_zoom: null,
        referrer_policy: 'origin',
        status_reason: !mapCfg.config_valid
          ? mapCfg.error_code || 'MAP_CONFIG_INVALID'
          : !mapCfg.enabled
            ? 'MAP_DISABLED_BY_ENV'
            : 'FEATURE_DISABLED'
      };

  return {
    config_trusted: evaluated.config_trusted,
    propagation_poll_seconds: 60,
    features,
    map,
    observed_at: new Date().toISOString()
  };
}

export function buildAdminFeatureControlsPayload(evaluated, historyRows = [], { actorLevel = 'mod' } = {}) {
  const isTop = actorLevel === 'top';
  const controls = [];
  for (const item of evaluated.entries.values()) {
    controls.push({
      key: item.key,
      title: item.title,
      category: item.category,
      description: item.description,
      implementation_status: item.implementation_status,
      read_only: item.read_only,
      allowed_states: item.allowed_states,
      allowed_audiences: item.allowed_audiences,
      state_exceptions_note: item.state_exceptions_note,
      depends_on: item.depends_on,
      high_impact_interrupt: item.high_impact_interrupt,
      affected_workflows: item.affected_workflows,
      interrupt_consequences: item.interrupt_consequences,
      configured_state: item.configured_state,
      configured_audience: item.configured_audience,
      effective_state: item.system_effective_state,
      env_override: item.env_override,
      dependency_block: item.dependency_block,
      revision: item.revision,
      customized: item.customized,
      last_change: item.last_change
        ? {
            actor_id: isTop ? item.last_change.actor_id : null,
            actor_email_masked: isTop ? item.last_change.actor_email_masked : 'Admin: Top',
            updated_at: item.last_change.updated_at,
            reason: item.last_change.reason
          }
        : null
    });
  }

  return {
    can_edit: isTop,
    config_trusted: evaluated.config_trusted,
    trust_error: evaluated.trust_error,
    protected_essentials: PROTECTED_ESSENTIAL_CAPABILITIES,
    propagation_policy: {
      server_writes_cached: false,
      worker_pre_dispatch_recheck: true,
      browser_poll_seconds: 60,
      cross_tab_broadcast: true,
      note:
        'Server mutations and worker pre-dispatch checks query PostgreSQL live (0 ms cache). Open browser tabs sync immediately on tab focus/visibility, cross-tab BroadcastChannel events, 403/503 feature rejections, and every 60s while visible. Already-transmitted network push packets cannot be recalled.'
    },
    controls,
    recent_history: historyRows.map(h => ({
      id: Number(h.id),
      feature_key: h.feature_key,
      previous_state: h.previous_state,
      new_state: h.new_state,
      previous_audience: h.previous_audience,
      new_audience: h.new_audience,
      revision: Number(h.revision),
      actor_id: isTop ? h.actor_id : null,
      actor_role: h.actor_role,
      change_source: h.change_source,
      reason: h.reason,
      created_at: new Date(h.created_at).toISOString()
    })),
    observed_at: new Date().toISOString()
  };
}

export function requiresInterruptConfirmation(spec, prevState, prevAudience, nextState, nextAudience) {
  if (!spec || !spec.high_impact_interrupt) return false;
  if (prevState === 'enabled' && (nextState === 'paused' || nextState === 'hidden')) {
    return true;
  }
  if (nextState === 'enabled' && prevAudience === 'all' && nextAudience === 'staff_beta') {
    return true;
  }
  return false;
}

export async function updateFeatureControlInTx(
  tx,
  {
    actorId,
    actorEmailMasked = null,
    actorRole = 'top',
    changeSource = 'admin_portal',
    featureKey,
    nextState,
    nextAudience,
    expectedRevision,
    reason,
    confirmedImpact = false
  }
) {
  const cleanKey = typeof featureKey === 'string' ? featureKey.trim() : '';
  const spec = FEATURE_CONTROLS_BY_KEY.get(cleanKey);
  if (!spec) {
    return {
      ok: false,
      status: 400,
      code: 'UNKNOWN_FEATURE_KEY',
      error: 'Unrecognized feature control key.'
    };
  }
  if (spec.read_only) {
    return {
      ok: false,
      status: 400,
      code: 'FEATURE_READ_ONLY',
      error: `"${spec.title}" is a read-only disclosure and cannot be toggled.`
    };
  }

  const cleanState = typeof nextState === 'string' ? nextState.trim().toLowerCase() : '';
  if (!spec.allowed_states.includes(cleanState)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_FEATURE_STATE',
      error: `Invalid state "${cleanState}" for "${spec.title}". Allowed states: ${spec.allowed_states.join(', ')}.`
    };
  }

  const cleanAudience =
    nextAudience === undefined || nextAudience === null || String(nextAudience).trim() === ''
      ? spec.default_audience
      : String(nextAudience).trim().toLowerCase();
  if (!spec.allowed_audiences.includes(cleanAudience)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_FEATURE_AUDIENCE',
      error: `Invalid audience "${cleanAudience}" for "${spec.title}". Allowed audiences: ${spec.allowed_audiences.join(', ')}.`
    };
  }

  const cleanReason =
    typeof reason === 'string' ? reason.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ').trim() : '';
  if (cleanReason.length < 4 || cleanReason.length > 500) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_REASON',
      error: 'Provide an operator reason between 4 and 500 characters.'
    };
  }

  if (expectedRevision !== null && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_EXPECTED_REVISION',
      error: 'expected_revision must be a non-negative integer.'
    };
  }

  // Serialize concurrent updates across the registry + parent dependencies
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('biteshark_feature_controls_write'))");

  const { rows: existingRows } = await tx.query(
    `SELECT feature_key, configured_state, audience, revision, reason, updated_by, updated_by_email_masked, updated_at
     FROM feature_controls
     FOR UPDATE`
  );
  const existingMap = new Map(existingRows.map(r => [r.feature_key, r]));
  const currentRow = existingMap.get(cleanKey) || null;
  const currentRevision = currentRow ? Number(currentRow.revision) : 0;
  const prevState = currentRow ? currentRow.configured_state : spec.default_state;
  const prevAudience = currentRow ? currentRow.audience : spec.default_audience;

  if (expectedRevision !== null && expectedRevision !== currentRevision) {
    return {
      ok: false,
      status: 409,
      code: 'FEATURE_REVISION_CONFLICT',
      error: `Feature "${spec.title}" was modified by another administrator (expected revision ${expectedRevision}, current revision ${currentRevision}). Refresh before saving.`,
      current_revision: currentRevision,
      current_state: prevState,
      current_audience: prevAudience
    };
  }

  // Reject explicitly setting a child to `enabled` while its parent's configured state is disabled
  if (cleanState === 'enabled' && spec.depends_on.length > 0) {
    for (const parentKey of spec.depends_on) {
      const parentSpec = FEATURE_CONTROLS_BY_KEY.get(parentKey);
      const parentRow = existingMap.get(parentKey);
      const parentState = parentRow ? parentRow.configured_state : parentSpec.default_state;
      if (parentState !== 'enabled') {
        return {
          ok: false,
          status: 409,
          code: 'FEATURE_DEPENDENCY_VIOLATION',
          error: `Cannot set "${spec.title}" to enabled while parent feature "${parentSpec.title}" is configured as ${parentState}. Enable "${parentSpec.title}" first.`,
          parent_key: parentKey,
          parent_configured_state: parentState
        };
      }
    }
  }

  const needsConfirm = requiresInterruptConfirmation(spec, prevState, prevAudience, cleanState, cleanAudience);
  if (needsConfirm && confirmedImpact !== true) {
    return {
      ok: false,
      status: 400,
      code: 'CONFIRMATION_REQUIRED',
      error: `Confirm the active-workflow impact before changing "${spec.title}" to ${cleanState}${cleanAudience === 'staff_beta' ? ' (staff_beta)' : ''}.`,
      consequences: spec.interrupt_consequences
    };
  }

  const nextRevision = currentRevision + 1;
  await tx.query(
    `INSERT INTO feature_controls (
       feature_key, configured_state, audience, revision, reason, updated_by, updated_by_email_masked, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (feature_key) DO UPDATE
       SET configured_state = EXCLUDED.configured_state,
           audience = EXCLUDED.audience,
           revision = EXCLUDED.revision,
           reason = EXCLUDED.reason,
           updated_by = EXCLUDED.updated_by,
           updated_by_email_masked = EXCLUDED.updated_by_email_masked,
           updated_at = now()`,
    [cleanKey, cleanState, cleanAudience, nextRevision, cleanReason, actorId, actorEmailMasked]
  );

  await tx.query(
    `INSERT INTO feature_control_history (
       feature_key, previous_state, new_state, previous_audience, new_audience,
       revision, actor_id, actor_role, change_source, reason
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      cleanKey,
      prevState,
      cleanState,
      prevAudience,
      cleanAudience,
      nextRevision,
      actorId,
      actorRole,
      changeSource,
      cleanReason
    ]
  );

  await recordAuditLog(tx, {
    actorId,
    actorRole: actorRole === 'operator_cli' ? 'platform_admin' : actorRole,
    targetType: 'feature_control',
    targetId: cleanKey,
    action: changeSource === 'operator_recovery_cli' ? 'feature_control.recover' : 'feature_control.update',
    metadata: {
      previous_state: prevState,
      new_state: cleanState,
      previous_audience: prevAudience,
      new_audience: cleanAudience,
      revision: nextRevision,
      change_source: changeSource,
      reason: cleanReason.slice(0, 240)
    }
  });

  return {
    ok: true,
    status: 200,
    feature_key: cleanKey,
    revision: nextRevision,
    configured_state: cleanState,
    configured_audience: cleanAudience
  };
}

export function matchRouteFeatureRule(pathname, method) {
  const normPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const upperMethod = String(method || 'GET').toUpperCase();
  for (const rule of ROUTE_FEATURE_ENFORCEMENT_RULES) {
    if (rule.pathname === normPath && rule.methods.includes(upperMethod)) {
      return rule;
    }
  }
  return null;
}

export async function enforceHttpFeatureGate({
  dbAdapter,
  req,
  auth,
  pathname,
  method,
  requireTablePresent = true
}) {
  const rule = matchRouteFeatureRule(pathname, method);
  if (!rule) {
    return { allowed: true };
  }

  const persisted = await loadPersistedFeatureControls(dbAdapter, { requireTablePresent });
  if (!persisted.configTrusted && rule.operationKind === 'mutation') {
    return {
      allowed: false,
      status: 503,
      body: {
        error: 'This feature is temporarily unavailable while platform feature configuration is verified.',
        code: 'FEATURE_CONFIG_UNAVAILABLE',
        feature_key: rule.featureKey
      }
    };
  }

  let accessCtx = null;
  try {
    accessCtx = await loadAccessContext(req, auth, dbAdapter);
  } catch {
    accessCtx = null;
  }

  const isPreviewViewpoint =
    String(req?.headers?.['x-biteshark-viewpoint'] || '')
      .trim()
      .toLowerCase() === 'preview';

  if (!isPreviewViewpoint && rule.allowModeratorsWhenHidden && accessCtx && (accessCtx.isModAdmin || accessCtx.isTopAdmin)) {
    return { allowed: true };
  }

  const evaluated = evaluateFeatureControlsSnapshot({
    persistedResult: persisted,
    accessCtx,
    viewpointMode: isPreviewViewpoint ? 'customer_preview' : null
  });
  const item = evaluated.entries.get(rule.featureKey);
  if (!item) {
    return { allowed: true };
  }

  if (rule.operationKind === 'read_when_not_hidden') {
    if (item.caller_effective_state === 'hidden') {
      return {
        allowed: false,
        status: 403,
        body: {
          error: item.public_message || 'This feature is currently disabled.',
          code: 'FEATURE_DISABLED',
          feature_key: rule.featureKey,
          effective_state: 'hidden'
        }
      };
    }
    return { allowed: true };
  }

  // `mutation`: requires `caller_effective_state === 'enabled'`
  if (item.caller_effective_state === 'paused') {
    return {
      allowed: false,
      status: 503,
      body: {
        error: item.public_message || 'This feature is temporarily paused.',
        code: 'FEATURE_PAUSED',
        feature_key: rule.featureKey,
        effective_state: 'paused'
      }
    };
  }

  if (item.caller_effective_state === 'hidden') {
    return {
      allowed: false,
      status: 403,
      body: {
        error: item.public_message || 'This feature is currently disabled.',
        code: 'FEATURE_DISABLED',
        feature_key: rule.featureKey,
        effective_state: 'hidden'
      }
    };
  }

  return { allowed: true };
}

export async function isPagerPushSubscriptionFeatureEnabled(db) {
  const persisted = await loadPersistedFeatureControls(db, { requireTablePresent: false });
  if (!persisted.configTrusted) return false;
  const evaluated = evaluateFeatureControlsSnapshot({ persistedResult: persisted });
  const item = evaluated.entries.get('pager_push_subscriptions');
  return Boolean(item && item.system_effective_state === 'enabled');
}

export async function isPagerPushDeliveryFeatureAllowed(db) {
  const persisted = await loadPersistedFeatureControls(db, { requireTablePresent: false });
  if (!persisted.configTrusted) {
    return { allowed: false, reason: 'feature_config_unavailable' };
  }
  const evaluated = evaluateFeatureControlsSnapshot({ persistedResult: persisted });
  const item = evaluated.entries.get('pager_push_delivery');
  if (!item || item.system_effective_state !== 'enabled') {
    return { allowed: false, reason: 'feature_control_paused' };
  }
  return { allowed: true, reason: null };
}

export async function checkPagerPushDeliveryInTx(tx) {
  if (simulatedConfigFailureForTests === 'db_unavailable' || simulatedConfigFailureForTests === 'malformed_row') {
    return { allowed: false, reason: 'feature_config_unavailable' };
  }
  const envOverrides = inspectEnvironmentFeatureOverrides();
  if (envOverrides.has('pager_push_delivery')) {
    return { allowed: false, reason: 'env_override_paused' };
  }

  const prevRes = await tx.query("SELECT COALESCE(current_setting('app.feature_controls_read', true), '') AS v");
  const prevVal = prevRes.rows[0]?.v || '';
  await tx.query("SELECT set_config('app.feature_controls_read', 'true', true)");
  await tx.query('SAVEPOINT pager_fc_recheck');
  try {
    const { rows } = await tx.query(
      `SELECT feature_key, configured_state, audience, revision
       FROM feature_controls
       WHERE feature_key = 'pager_push_delivery'`
    );
    await tx.query('RELEASE SAVEPOINT pager_fc_recheck');
    if (!rows.length) {
      return { allowed: true, reason: null };
    }
    const validated = validatePersistedRows(rows);
    if (!validated.valid) {
      return { allowed: false, reason: 'feature_config_unavailable' };
    }
    const row = validated.byKey.get('pager_push_delivery');
    if (row.configured_state !== 'enabled') {
      return { allowed: false, reason: 'feature_control_paused' };
    }
    return { allowed: true, reason: null };
  } catch (err) {
    await tx.query('ROLLBACK TO SAVEPOINT pager_fc_recheck').catch(() => {});
    if (err?.code === '42P01') {
      // Pre-022 schema in historical migration upgrade unit tests
      return { allowed: true, reason: null };
    }
    return { allowed: false, reason: 'feature_config_unavailable' };
  } finally {
    await tx.query("SELECT set_config('app.feature_controls_read', $1, true)", [prevVal]).catch(() => {});
  }
}
