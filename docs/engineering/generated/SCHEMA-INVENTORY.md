# Code Registry — Database Migrations, Tables, RLS & Schema Diagram

> [!NOTE]
> **Machine-Generated Reference Inventory** — Do not hand-edit. Regenerate via `npm run registry:docs` (`node tools/code-registry/cli.mjs generate-docs`).
> - **Repository**: `https://github.com/yamanalmasaleha-png/trukly-`
> - **Provenance Mode**: `committed_source_digest` *(branch/detached-HEAD invariant; commit-bound runs use `npm run registry:scan -- --include-timestamp`)*
> - **Generator**: `biteshark-code-registry@2.0.0` (`biteshark.code-registry.v2`)
> - **Source Analysis Digest**: `c7326f45a26b8a8d55f356372108471d7be2d6b3ff831e3f1c1b164340723c08`
> - **Analysis Scope & Limits**: Static AST, HTML, CSS, and SQL analysis without executing application modules. Relationships distinguish confirmed_static, documented_wrapper, inferred_candidate, and dynamic_unresolved; static analysis does not prove runtime behavioral correctness.

## Schema Provenance & Verification Scope
- **Static Basis**: `reconstructed_from_repository_migrations` *(reconstructed offline from `migrations/*.sql` and `scripts/run-migrations.cjs`; this static file alone does **not** prove a live database check ran)*
- **Live PostgreSQL Catalog Verification**: Run `node tools/code-registry/cli.mjs validate --verify-db` (enforced in CI `postgres-backend-hardening`) to cross-check reconstructed tables, columns, normalized types, nullability, default presence, primary/unique/foreign-key constraints, indexes, and `FORCE ROW LEVEL SECURITY` policies against PostgreSQL `pg_catalog`.
- **Migrations Indexed**: **29**
- **Tables Indexed**: **59** (**44** with `FORCE ROW LEVEL SECURITY`)
- **Views / Functions / Triggers**: **1** views, **9** SQL functions, **7** triggers

## 1. Ordered SQL Migration Ledger

| # | Migration File | SHA-256 (First 16) | Tables Created | Tables Altered | RLS Policies Added | Manual Review Flag |
|---:|---|---|---|---|---|---|
| 1 | [migrations/001_create_bookings.sql](../../../migrations/001_create_bookings.sql) | `504752fb30ed492f` | `bookings` | — | 0 | No |
| 2 | [migrations/002_create_truck_settings.sql](../../../migrations/002_create_truck_settings.sql) | `82774792c7494d89` | `truck_settings` | — | 0 | No |
| 3 | [migrations/003_create_favorites.sql](../../../migrations/003_create_favorites.sql) | `acbad7e0c9fb01b7` | `favorites` | — | 0 | No |
| 4 | [migrations/004_create_notification_settings.sql](../../../migrations/004_create_notification_settings.sql) | `d6fefeda33ebe4d5` | `notification_settings` | — | 0 | No |
| 5 | [migrations/005_create_owner_profiles.sql](../../../migrations/005_create_owner_profiles.sql) | `8350916237fbb81f` | `owner_profiles` | — | 0 | No |
| 6 | [migrations/006_create_owner_schedule.sql](../../../migrations/006_create_owner_schedule.sql) | `f9c5b84e2c530aa9` | `owner_schedule` | — | 0 | No |
| 7 | [migrations/007_add_booking_packages.sql](../../../migrations/007_add_booking_packages.sql) | `21ecf6a0e604efc8` | — | `bookings` | 0 | No |
| 8 | [migrations/008_pickup_pagers.sql](../../../migrations/008_pickup_pagers.sql) | `01a0b143eb52cd1e` | `pickup_pagers` | — | 0 | No |
| 9 | [migrations/009_create_community_reviews.sql](../../../migrations/009_create_community_reviews.sql) | `a6034867813ee06b` | `community_reviews` | — | 0 | No |
| 10 | [migrations/010_allow_community_whispers.sql](../../../migrations/010_allow_community_whispers.sql) | `e46651dd7e251c1a` | — | `community_reviews` | 0 | No |
| 11 | [migrations/011_vendor_authz_and_audit.sql](../../../migrations/011_vendor_authz_and_audit.sql) | `9918ac6921ab7d1f` | `vendors`, `platform_roles`, `vendor_memberships`, `audit_logs` | `bookings`, `owner_profiles`, `owner_schedule`, `pickup_pagers`, `truck_settings` | 0 | No |
| 12 | [migrations/012_harden_bookings.sql](../../../migrations/012_harden_bookings.sql) | `d8e00f0d040ed5e3` | — | `bookings` | 0 | No |
| 13 | [migrations/013_harden_community_privacy.sql](../../../migrations/013_harden_community_privacy.sql) | `e2e53f2b0f329850` | — | `community_reviews` | 4 | No |
| 14 | [migrations/014_unified_discovery_catalog.sql](../../../migrations/014_unified_discovery_catalog.sql) | `9bf8c7d5b11fc787` | — | `owner_schedule`, `truck_settings`, `vendors` | 0 | No |
| 15 | [migrations/015_pager_notifications_outbox.sql](../../../migrations/015_pager_notifications_outbox.sql) | `813c20930ed191cb` | `pager_notification_subscriptions`, `pager_notification_events`, `pager_notification_deliveries`, `pager_rate_limits` | `pager_notification_deliveries`, `pager_notification_events`, `pager_notification_subscriptions`, `pager_rate_limits`, `pickup_pagers` | 4 | No |
| 16 | [migrations/016_pager_worker_fencing_and_catchup.sql](../../../migrations/016_pager_worker_fencing_and_catchup.sql) | `f8a67e3c72facaaa` | — | `pager_notification_deliveries` | 0 | No |
| 17 | [migrations/017_standalone_auth_and_sessions.sql](../../../migrations/017_standalone_auth_and_sessions.sql) | `6b5707946eb38839` | `auth_users`, `auth_otp_challenges`, `auth_sessions`, `auth_rate_limits`, `auth_staging_mailbox` | `auth_otp_challenges`, `auth_rate_limits`, `auth_sessions`, `auth_staging_mailbox`, `auth_users` | 5 | No |
| 18 | [migrations/018_admin_portal_onboarding_moderation_issues.sql](../../../migrations/018_admin_portal_onboarding_moderation_issues.sql) | `28d980f6b37a9f53` | `platform_role_revocations`, `admin_bootstrap_grants`, `vendor_status_history`, `account_invitations`, `vendor_applications`, `vendor_application_evidence`, `community_reports`, `community_moderation_history`, `support_issues`, `support_issue_notes`, `admin_notification_outbox` | `account_invitations`, `admin_notification_outbox`, `community_moderation_history`, `community_reports`, `community_reviews`, `platform_roles`, `support_issue_notes`, `support_issues`, `vendor_application_evidence`, `vendor_applications`, `vendors` | 11 | No |
| 19 | [migrations/019_age_eligibility_and_compliance_readiness.sql](../../../migrations/019_age_eligibility_and_compliance_readiness.sql) | `89c58eefde58888a` | `compliance_readiness_items`, `compliance_readiness_history` | `auth_otp_challenges`, `auth_users`, `compliance_readiness_history`, `compliance_readiness_items` | 3 | Yes |
| 20 | [migrations/020_age_gate_allowlist_and_precise_wording.sql](../../../migrations/020_age_gate_allowlist_and_precise_wording.sql) | `85675399e75787dd` | — | — | 0 | Yes |
| 21 | [migrations/021_auth_diagnostics_and_email_readiness.sql](../../../migrations/021_auth_diagnostics_and_email_readiness.sql) | `03f02634ba60f82f` | `auth_delivery_telemetry` | `auth_delivery_telemetry` | 1 | No |
| 22 | [migrations/022_feature_controls.sql](../../../migrations/022_feature_controls.sql) | `adaddd249e0257af` | `feature_controls`, `feature_control_history` | `feature_control_history`, `feature_controls` | 5 | No |
| 23 | [migrations/023_invitation_delivery_and_lifecycle.sql](../../../migrations/023_invitation_delivery_and_lifecycle.sql) | `ff02286142d9c9d0` | `account_invitation_events` | `account_invitation_events`, `account_invitations`, `auth_delivery_telemetry` | 2 | No |
| 24 | [migrations/024_diagnostics_and_reliability.sql](../../../migrations/024_diagnostics_and_reliability.sql) | `fe7244e50fcb26b1` | `worker_runtime_heartbeats`, `diagnostic_releases`, `diagnostic_incident_groups`, `diagnostic_event_samples`, `diagnostic_incident_notes` | `community_reviews`, `diagnostic_event_samples`, `diagnostic_incident_groups`, `diagnostic_incident_notes`, `diagnostic_releases`, `worker_runtime_heartbeats` | 5 | No |
| 25 | [migrations/025_support_feedback_and_diagnostic_links.sql](../../../migrations/025_support_feedback_and_diagnostic_links.sql) | `1dcad86db9dff412` | `support_issue_events`, `support_issue_diagnostic_links`, `support_issue_notifications` | `auth_delivery_telemetry`, `support_issue_diagnostic_links`, `support_issue_events`, `support_issue_notes`, `support_issue_notifications`, `support_issues` | 9 | No |
| 26 | [migrations/026_urgent_pilot_security_hardening.sql](../../../migrations/026_urgent_pilot_security_hardening.sql) | `cd46081cd0193e2d` | — | — | 0 | No |
| 27 | [migrations/027_customer_exploration_foundation.sql](../../../migrations/027_customer_exploration_foundation.sql) | `ccc2eaeea5e00cac` | `customer_visits`, `customer_photos`, `customer_saved_trails`, `customer_saved_trail_stops` | `customer_photos`, `customer_saved_trail_stops`, `customer_saved_trails`, `customer_visits` | 4 | No |
| 28 | [migrations/028_exploration_photo_reconciliation.sql](../../../migrations/028_exploration_photo_reconciliation.sql) | `0393c64b9001f398` | — | — | 2 | No |
| 29 | [migrations/029_customer_profiles_collections_and_sharing.sql](../../../migrations/029_customer_profiles_collections_and_sharing.sql) | `5047db23f7a39e79` | `customer_profiles`, `customer_sharing_eligibility`, `customer_collections`, `customer_collection_photo_attachments`, `customer_collection_entries`, `customer_collection_shares`, `customer_share_reports`, `customer_share_moderation_events` | `customer_collection_entries`, `customer_collection_photo_attachments`, `customer_collection_shares`, `customer_collections`, `customer_profiles`, `customer_share_moderation_events`, `customer_share_reports`, `customer_sharing_eligibility` | 18 | No |

## 2. Entity-Relationship Diagram (Generated from Foreign Keys)

```mermaid
erDiagram
  account_invitation_events {
    bigserial id PK
    uuid invitation_id FK
    text event_type
    text actor_id
    text actor_role
    text delivery_mode
    integer provider_status
    text provider_message_id
    text error_code
    text correlation_id
    text release_sha
    text note
    timestamptz created_at
  }
  account_invitations {
    uuid id PK
    text email_normalized
    text requested_role
    text vendor_id FK
    text status
    text token_sha256
    text initiated_by
    text initiator_role
    text approved_by
    timestamptz approved_at
    text approval_reason
    text rejected_by
    timestamptz rejected_at
    text rejection_reason
  }
  admin_bootstrap_grants {
    uuid id PK
    text user_id
    text email_normalized
    text bootstrap_source
    timestamptz created_at
  }
  admin_notification_outbox {
    uuid id PK
    text recipient_user_id
    text recipient_email
    text event_kind
    text subject
    text summary
    text delivery_status
    timestamptz created_at
  }
  audit_logs {
    uuid id PK
    text actor_id
    text actor_role
    text vendor_id FK
    text target_type
    text target_id
    text action
    jsonb metadata
    timestamptz created_at
  }
  auth_delivery_telemetry {
    bigserial id PK
    text correlation_id
    text flow
    text delivery_mode
    text outcome_stage
    integer http_status
    integer provider_status
    text provider_message_id
    text error_code
    boolean is_designated_test
    timestamptz created_at
  }
  auth_otp_challenges {
    uuid id PK
    text email_normalized
    text code_hmac
    integer attempts
    integer max_attempts
    text requester_ip_hash
    timestamptz expires_at
    timestamptz consumed_at
    timestamptz invalidated_at
    timestamptz created_at
    boolean signup_age_eligible
    text signup_age_policy_version
    timestamptz signup_age_assessed_at
  }
  auth_rate_limits {
    text bucket_key PK
    timestamptz window_start PK
    integer hit_count
  }
  auth_sessions {
    uuid id PK
    text token_sha256
    text user_id FK
    text ip_hash
    text ua_hash
    timestamptz created_at
    timestamptz last_seen_at
    timestamptz expires_at
    timestamptz max_expires_at
    timestamptz revoked_at
  }
  auth_staging_mailbox {
    uuid challenge_id PK
    text email_normalized
    text ciphertext_b64
    text iv_b64
    text auth_tag_b64
    timestamptz expires_at
    timestamptz created_at
  }
  auth_users {
    text id PK
    text email_normalized
    timestamptz disabled_at
    timestamptz last_login_at
    timestamptz created_at
    timestamptz updated_at
    text age_eligibility_status
    text age_policy_version
    timestamptz age_assessed_at
    text age_assessment_basis
  }
  bookings {
    uuid id PK
    text truck_id FK
    text truck_name
    text event_type
    date event_date
    integer guest_count
    text location
    text note
    text requester
    text status
    timestamptz created_at
    text package_id
    text package_name
    integer package_price
  }
  community_moderation_history {
    uuid id PK
    uuid post_id FK
    text actor_id
    text actor_role
    text action
    text from_status
    text to_status
    text reason
    text internal_note
    timestamptz created_at
  }
  community_reports {
    uuid id PK
    uuid post_id FK
    text reporter_user_id
    text reason_category
    text details
    text status
    text reviewed_by
    timestamptz reviewed_at
    timestamptz created_at
  }
  community_reviews {
    uuid id PK
    text author_id
    text nickname
    text kind
    text place_id
    text place_name
    text town
    text title
    text body
    integer rating
    text status
    timestamptz created_at
    timestamptz moderated_at
    text moderated_by
  }
  compliance_readiness_history {
    uuid id PK
    text item_key FK
    text actor_id
    text actor_role
    text change_kind
    text from_status
    text to_status
    text summary
    jsonb metadata
    timestamptz created_at
  }
  compliance_readiness_items {
    text item_key PK
    integer sort_order
    text category
    text topic
    boolean is_launch_critical
    boolean mod_visible
    boolean mod_counsel_access_granted
    text current_practice
    text unresolved_questions
    text status
    text not_applicable_explanation
    boolean decision_recorded
    boolean implemented_recorded
    boolean tested_recorded
  }
  customer_collection_entries {
    text id PK
    text collection_id FK
    text user_id FK
    smallint position
    text vendor_id FK
    text recorded_vendor_id
    text vendor_name_snapshot
    text vendor_town_snapshot
    text vendor_cuisine_snapshot
    text recommendation
    text photo_attachment_id FK
    timestamptz created_at
    timestamptz updated_at
  }
  customer_collection_photo_attachments {
    text id PK
    text collection_id FK
    text user_id FK
    text source_photo_id FK
    text recorded_source_photo_id
    text shared_rel_path
    text mime_type
    integer byte_size
    integer width
    integer height
    text sha256_hex
    boolean share_consent_confirmed
    timestamptz consented_at
    text moderation_status
  }
  customer_collection_shares {
    text id PK
    text collection_id FK
    text user_id FK
    text token_sha256
    text masked_token_hint
    boolean include_display_name
    boolean include_bio
    boolean include_preferred_area
    boolean include_achievements
    boolean include_shared_photos
    timestamptz expires_at
    text status
    text replaced_by_share_id FK
    timestamptz revoked_at
  }
  customer_collections {
    text id PK
    text user_id FK
    text title
    text intro
    text visibility_mode
    text moderation_status
    timestamptz suppressed_at
    text suppressed_by
    text suppression_authority
    text suppression_reason
    text suppressed_content_sha256
    integer revision
    text idempotency_key
    timestamptz created_at
  }
  customer_photos {
    text id PK
    text user_id FK
    text vendor_id FK
    text recorded_vendor_id
    text vendor_name_snapshot
    text caption
    text mime_type
    integer byte_size
    integer thumb_byte_size
    integer width
    integer height
    text sha256_hex
    text storage_rel_path
    text thumb_rel_path
  }
  customer_profiles {
    text user_id PK
    text public_profile_id
    text display_name
    text bio
    text avatar_style
    text preferred_town
    text food_interests
    boolean communication_product_updates_opt_in
    text visibility_mode
    boolean allow_public_indexing
    integer revision
    timestamptz created_at
    timestamptz updated_at
  }
  customer_saved_trail_stops {
    text trail_id PK
    text user_id FK
    smallint position PK
    text vendor_id FK
    text recorded_vendor_id
    text vendor_name_snapshot
    text match_reason
  }
  customer_saved_trails {
    text id PK
    text user_id FK
    text title
    text theme_key
    text town_filter
    date saved_local_date
    text idempotency_key
    timestamptz created_at
    timestamptz deleted_at
  }
  customer_share_moderation_events {
    bigserial id PK
    text collection_id FK
    text share_id FK
    text attachment_id FK
    text actor_user_id
    text actor_authority
    text action
    text reason
    timestamptz created_at
  }
  customer_share_reports {
    text id PK
    text share_id FK
    text collection_id FK
    text attachment_id FK
    text reporter_user_id FK
    text reporter_ip_hash
    text reason
    text details
    text status
    text reviewed_by
    timestamptz reviewed_at
    timestamptz created_at
  }
  customer_sharing_eligibility {
    text user_id PK
    text eligibility_status
    text policy_version
    text assessment_basis
    timestamptz assessed_at
    timestamptz updated_at
  }
  customer_visits {
    text id PK
    text user_id FK
    text vendor_id FK
    text recorded_vendor_id
    text vendor_name_snapshot
    text normalized_cuisine
    text normalized_town
    text private_note
    timestamptz visited_at
    date visit_local_date
    text calendar_tz
    text entry_source
    text idempotency_key
    timestamptz created_at
  }
  diagnostic_event_samples {
    uuid id PK
    uuid group_id FK
    timestamptz occurred_at
    timestamptz received_at
    text emitting_component
    text trust_level
    text server_release_sha
    text client_build_version
    text client_loaded_release_sha
    boolean is_stale_client
    text feature_key
    text operation_name
    text route_template
    text http_method
  }
  diagnostic_incident_groups {
    uuid id PK
    text fingerprint
    text title
    text emitting_component
    text trust_level
    text feature_key
    text operation_name
    text route_template
    text severity
    text error_code
    text sanitized_summary
    text user_impact
    text safe_next_steps
    boolean retryable
  }
  diagnostic_incident_notes {
    uuid id PK
    uuid group_id
    text group_fingerprint
    text group_title
    boolean mod_visible
    text actor_id
    text actor_role
    text action_type
    text previous_triage_status
    text new_triage_status
    text suspected_cause
    text suspected_fix_sha
    text note_body
    text correlation_id
  }
  diagnostic_releases {
    text release_sha PK
    text environment
    text previous_release_sha
    text deploy_mode
    text client_bundle_version
    timestamptz first_seen_at
    timestamptz last_seen_at
    bigint startup_count
    text notes
  }
  favorites {
    text user_id PK
    text truck_id PK
    timestamptz created_at
  }
  feature_control_history {
    bigserial id PK
    text feature_key
    text previous_state
    text new_state
    text previous_audience
    text new_audience
    integer revision
    text actor_id
    text actor_role
    text change_source
    text reason
    timestamptz created_at
  }
  feature_controls {
    text feature_key PK
    text configured_state
    text audience
    integer revision
    text reason
    text updated_by
    text updated_by_email_masked
    timestamptz updated_at
  }
  notification_settings {
    text user_id PK
    boolean nearby_enabled
    integer radius_miles
    timestamptz updated_at
  }
  owner_profiles {
    text truck_id PK
    text display_name
    text description
    text cuisine
    boolean accepting_bookings
    timestamptz updated_at
  }
  owner_schedule {
    uuid id PK
    text truck_id FK
    date service_date
    time opens_at
    time closes_at
    text location
    text status
    timestamptz updated_at
  }
  pager_notification_deliveries {
    uuid id PK
    uuid event_id FK
    uuid subscription_id FK
    uuid pager_id FK
    text status
    integer attempt_count
    integer max_attempts
    timestamptz next_attempt_at
    text lease_owner
    timestamptz lease_expires_at
    text provider_name
    integer provider_status
    text last_error_code
    text last_error_redacted
  }
  pager_notification_events {
    uuid id PK
    uuid pager_id FK
    text vendor_id FK
    text event_type
    integer transition_seq
    text dedupe_key
    text collapse_key
    jsonb payload
    timestamptz created_at
    timestamptz expires_at
  }
  pager_notification_subscriptions {
    uuid id PK
    uuid pager_id FK
    text channel
    text destination_hash
    text endpoint_url
    text p256dh_key
    text auth_secret
    text device_token
    text unsubscribe_token_hash
    text status
    text platform_hint
    text invalidated_reason
    timestamptz created_at
    timestamptz updated_at
  }
  pager_rate_limits {
    text bucket_key PK
    timestamptz window_start PK
    integer hit_count
  }
  pickup_pagers {
    uuid id PK
    uuid request_key
    text vendor
    text ticket
    text status
    timestamptz created_at
    timestamptz updated_at
    timestamptz expires_at
    text vendor_id FK
    text created_by
    text updated_by
    timestamptz ready_notified_at
    integer ready_notify_count
  }
  platform_role_revocations {
    text user_id PK
    text revoked_by
    text reason
    timestamptz revoked_at
  }
  platform_roles {
    text user_id PK
    text role
    text granted_by
    timestamptz created_at
    timestamptz updated_at
    text notes
  }
  schema_migrations {
    text filename PK
    text checksum_sha256
    timestamptz applied_at
  }
  support_issue_diagnostic_links {
    uuid id PK
    uuid issue_id FK
    uuid diagnostic_group_id FK
    text diagnostic_fingerprint
    text link_state
    text linked_by
    text linked_by_role
    text link_reason
    text public_summary
    text fixing_release_sha
    text verification_status
    text verification_note
    timestamptz unlinked_at
    text unlinked_by
  }
  support_issue_events {
    uuid id PK
    uuid issue_id FK
    text event_type
    text visibility
    text actor_user_id
    text actor_role
    text public_actor_label
    text summary
    jsonb metadata
    timestamptz created_at
  }
  support_issue_notes {
    uuid id PK
    uuid issue_id FK
    text author_user_id
    text author_role
    text visibility
    text body
    timestamptz created_at
    text author_display_label
    text idempotency_key
  }
  support_issue_notifications {
    uuid id PK
    uuid issue_id FK
    text recipient_user_id
    text event_kind
    text dedupe_key
    text delivery_status
    text delivery_mode
    integer attempt_count
    integer provider_status
    text provider_message_id
    text error_code
    text correlation_id
    timestamptz created_at
    timestamptz updated_at
  }
  support_issues {
    uuid id PK
    text reporter_user_id
    text reporter_email
    text reporter_context
    text category
    text severity
    text status
    text vendor_id FK
    uuid related_booking_id FK
    uuid related_review_id FK
    text subject
    text description
    boolean confidential_reporter
    text assignee_user_id
  }
  truck_settings {
    text truck_id PK
    text location
    boolean is_open
    time opens_at
    time closes_at
    timestamptz updated_at
    double_precision lat
    double_precision lng
    text location_source
    text location_accuracy
    timestamptz observed_at
    timestamptz expires_at
  }
  vendor_application_evidence {
    uuid id PK
    uuid application_id FK
    text uploaded_by
    text original_filename
    text mime_type
    integer byte_size
    text sha256_hex
    text evidence_kind
    bytea file_bytes
    timestamptz retention_expires_at
    timestamptz deleted_at
    text deleted_by
    timestamptz created_at
  }
  vendor_applications {
    uuid id PK
    text applicant_user_id
    text applicant_email
    text claim_type
    text target_vendor_id FK
    text proposed_slug
    text business_name
    text city
    text cuisine
    text listing_kind
    text service_area
    text contact_name
    text contact_email
    text contact_phone
  }
  vendor_memberships {
    text vendor_id PK
    text user_id PK
    text role
    text granted_by
    timestamptz created_at
  }
  vendor_status_history {
    uuid id PK
    text vendor_id FK
    text actor_id
    text actor_role
    text action
    text reason
    jsonb before_state
    jsonb after_state
    timestamptz created_at
  }
  vendors {
    text id PK
    text canonical_name
    text city
    text cuisine
    text listing_kind
    boolean event_bookable
    boolean is_active
    timestamptz created_at
    integer sort_order
    text section
    text emoji
    text kind_label
    text listing_type
    boolean popup
  }
  worker_runtime_heartbeats {
    text worker_name PK
    timestamptz last_run_at
    text last_status
    text release_sha
    text last_correlation_id
    jsonb last_summary
    timestamptz updated_at
  }
  account_invitations ||--o{ account_invitation_events : "invitation_id"
  vendors ||--o{ account_invitations : "vendor_id"
  account_invitations ||--o{ account_invitations : "replaced_by_invitation_id"
  vendors ||--o{ audit_logs : "vendor_id"
  auth_users ||--o{ auth_sessions : "user_id"
  auth_otp_challenges ||--o{ auth_staging_mailbox : "challenge_id"
  vendors ||--o{ bookings : "truck_id"
  community_reviews ||--o{ community_moderation_history : "post_id"
  community_reviews ||--o{ community_reports : "post_id"
  compliance_readiness_items ||--o{ compliance_readiness_history : "item_key"
  customer_collections ||--o{ customer_collection_entries : "collection_id"
  auth_users ||--o{ customer_collection_entries : "user_id"
  vendors ||--o{ customer_collection_entries : "vendor_id"
  customer_collection_photo_attachments ||--o{ customer_collection_entries : "photo_attachment_id"
  customer_collections ||--o{ customer_collection_photo_attachments : "collection_id"
  auth_users ||--o{ customer_collection_photo_attachments : "user_id"
  customer_photos ||--o{ customer_collection_photo_attachments : "source_photo_id"
  customer_collections ||--o{ customer_collection_shares : "collection_id"
  auth_users ||--o{ customer_collection_shares : "user_id"
  customer_collection_shares ||--o{ customer_collection_shares : "replaced_by_share_id"
  auth_users ||--o{ customer_collections : "user_id"
  auth_users ||--o{ customer_photos : "user_id"
  vendors ||--o{ customer_photos : "vendor_id"
  auth_users ||--o{ customer_profiles : "user_id"
  customer_saved_trails ||--o{ customer_saved_trail_stops : "trail_id"
  auth_users ||--o{ customer_saved_trail_stops : "user_id"
  vendors ||--o{ customer_saved_trail_stops : "vendor_id"
  auth_users ||--o{ customer_saved_trails : "user_id"
  customer_collections ||--o{ customer_share_moderation_events : "collection_id"
  customer_collection_shares ||--o{ customer_share_moderation_events : "share_id"
  customer_collection_photo_attachments ||--o{ customer_share_moderation_events : "attachment_id"
  customer_collection_shares ||--o{ customer_share_reports : "share_id"
  customer_collections ||--o{ customer_share_reports : "collection_id"
  customer_collection_photo_attachments ||--o{ customer_share_reports : "attachment_id"
  auth_users ||--o{ customer_share_reports : "reporter_user_id"
  auth_users ||--o{ customer_sharing_eligibility : "user_id"
  auth_users ||--o{ customer_visits : "user_id"
  vendors ||--o{ customer_visits : "vendor_id"
  diagnostic_incident_groups ||--o{ diagnostic_event_samples : "group_id"
  vendors ||--o{ owner_profiles : "truck_id"
  vendors ||--o{ owner_schedule : "truck_id"
  pager_notification_events ||--o{ pager_notification_deliveries : "event_id"
  pager_notification_subscriptions ||--o{ pager_notification_deliveries : "subscription_id"
  pickup_pagers ||--o{ pager_notification_deliveries : "pager_id"
  pickup_pagers ||--o{ pager_notification_events : "pager_id"
  vendors ||--o{ pager_notification_events : "vendor_id"
  pickup_pagers ||--o{ pager_notification_subscriptions : "pager_id"
  vendors ||--o{ pickup_pagers : "vendor_id"
  support_issues ||--o{ support_issue_diagnostic_links : "issue_id"
  diagnostic_incident_groups ||--o{ support_issue_diagnostic_links : "diagnostic_group_id"
  support_issues ||--o{ support_issue_events : "issue_id"
  support_issues ||--o{ support_issue_notes : "issue_id"
  support_issues ||--o{ support_issue_notifications : "issue_id"
  vendors ||--o{ support_issues : "vendor_id"
  bookings ||--o{ support_issues : "related_booking_id"
  community_reviews ||--o{ support_issues : "related_review_id"
  vendors ||--o{ truck_settings : "truck_id"
  vendor_applications ||--o{ vendor_application_evidence : "application_id"
  vendors ||--o{ vendor_applications : "target_vendor_id"
  vendors ||--o{ vendor_applications : "approved_vendor_id"
  vendors ||--o{ vendor_memberships : "vendor_id"
  vendors ||--o{ vendor_status_history : "vendor_id"
```

## 3. Reconstructed Table & RLS Catalog (59 Tables)

### Table `account_invitation_events`
- **Created in**: `023_invitation_delivery_and_lifecycle.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `BIGSERIAL` | PK | Yes | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `invitation_id` | `UUID` | — | Yes | — | `account_invitations(id)` (CASCADE) | `023_invitation_delivery_and_lifecycle.sql` |
| `event_type` | `TEXT` | — | Yes | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `actor_id` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `actor_role` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `delivery_mode` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `provider_status` | `INTEGER` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `provider_message_id` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `error_code` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `correlation_id` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `release_sha` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `note` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `023_invitation_delivery_and_lifecycle.sql` |

- **Constraints (11)**: `account_invitation_events_pkey` (PRIMARY KEY), `account_invitation_events_event_type_check` (CHECK), `account_invitation_events_actor_id_check` (CHECK), `account_invitation_events_actor_role_check` (CHECK), `account_invitation_events_delivery_mode_check` (CHECK), `account_invitation_events_provider_status_check` (CHECK), `account_invitation_events_provider_message_id_check` (CHECK), `account_invitation_events_error_code_check` (CHECK), `account_invitation_events_correlation_id_check` (CHECK), `account_invitation_events_release_sha_check` (CHECK), `account_invitation_events_note_check` (CHECK)
- **Indexes (1)**: `idx_account_invitation_events_inv`
- **RLS Policies (1)**:
  - `account_invitation_events_admin_rls` (`FOR ALL`, GUCs: `app.admin_portal`) — `023_invitation_delivery_and_lifecycle.sql`

### Table `account_invitations`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql` | **Altered in**: `023_invitation_delivery_and_lifecycle.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `email_normalized` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `requested_role` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `vendor_id` | `TEXT` | — | No | — | `vendors(id)` (CASCADE) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `status` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `token_sha256` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `initiated_by` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `initiator_role` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `approved_by` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `approved_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `approval_reason` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `rejected_by` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `rejected_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `rejection_reason` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `consumed_by_user_id` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `consumed_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `revoked_by` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `revoked_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `idempotency_key` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `invite_note` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `expires_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `delivery_status` | `TEXT` | — | Yes | `'not_requested'` | — | `023_invitation_delivery_and_lifecycle.sql` |
| `delivery_mode` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `token_version` | `INTEGER` | — | Yes | `1` | — | `023_invitation_delivery_and_lifecycle.sql` |
| `send_attempt_count` | `INTEGER` | — | Yes | `0` | — | `023_invitation_delivery_and_lifecycle.sql` |
| `last_sent_at` | `TIMESTAMPTZ` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `last_sent_by` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `last_attempt_at` | `TIMESTAMPTZ` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `provider_status` | `INTEGER` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `provider_message_id` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `last_error_code` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `last_correlation_id` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `revoke_reason` | `TEXT` | — | No | — | — | `023_invitation_delivery_and_lifecycle.sql` |
| `replaced_by_invitation_id` | `UUID` | — | No | — | `account_invitations(id)` (SET NULL) | `023_invitation_delivery_and_lifecycle.sql` |

- **Constraints (23)**: `account_invitations_pkey` (PRIMARY KEY), `account_invitations_email_normalized_check` (CHECK), `account_invitations_requested_role_check` (CHECK), `account_invitations_status_check` (CHECK), `account_invitations_token_sha256_key` (UNIQUE), `account_invitations_token_sha256_check` (CHECK), `account_invitations_initiated_by_check` (CHECK), `account_invitations_initiator_role_check` (CHECK), `account_invitations_invite_note_check` (CHECK), `account_invitations_staff_vendor_chk` (CHECK), `account_invitations_owner_initiator_chk` (CHECK), `account_invitations_pending_no_token_chk` (CHECK), `account_invitations_issued_token_chk` (CHECK), `account_invitations_mod_priv_requires_top_chk` (CHECK), `account_invitations_delivery_status_chk` (CHECK), `account_invitations_delivery_mode_chk` (CHECK), `account_invitations_token_version_chk` (CHECK), `account_invitations_send_attempts_chk` (CHECK), `account_invitations_provider_status_chk` (CHECK), `account_invitations_provider_msg_id_chk` (CHECK), `account_invitations_last_error_code_chk` (CHECK), `account_invitations_last_corr_id_chk` (CHECK), `account_invitations_revoke_reason_chk` (CHECK)
- **Indexes (4)**: `idx_account_invitations_idempotency` *(UNIQUE)*, `idx_account_invitations_status_created`, `idx_account_invitations_email`, `idx_account_invitations_active_email`
- **RLS Policies (1)**:
  - `account_invitations_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.auth_internal`, `app.user_email`, `app.user_id`) — `023_invitation_delivery_and_lifecycle.sql`

### Table `admin_bootstrap_grants`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `user_id` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `email_normalized` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `bootstrap_source` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |

- **Constraints (5)**: `admin_bootstrap_grants_pkey` (PRIMARY KEY), `admin_bootstrap_grants_user_id_key` (UNIQUE), `admin_bootstrap_grants_user_id_check` (CHECK), `admin_bootstrap_grants_email_normalized_key` (UNIQUE), `admin_bootstrap_grants_bootstrap_source_check` (CHECK)

### Table `admin_notification_outbox`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `recipient_user_id` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `recipient_email` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `event_kind` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `subject` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `summary` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `delivery_status` | `TEXT` | — | Yes | `'recorded_test_safe'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |

- **Constraints (5)**: `admin_notification_outbox_pkey` (PRIMARY KEY), `admin_notification_outbox_event_kind_check` (CHECK), `admin_notification_outbox_subject_check` (CHECK), `admin_notification_outbox_summary_check` (CHECK), `admin_notification_outbox_delivery_status_check` (CHECK)
- **Indexes (1)**: `idx_admin_notification_outbox_user`
- **RLS Policies (1)**:
  - `admin_notification_outbox_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.can_moderate`, `app.user_id`) — `018_admin_portal_onboarding_moderation_issues.sql`

### Table `audit_logs`
- **Created in**: `011_vendor_authz_and_audit.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `011_vendor_authz_and_audit.sql` |
| `actor_id` | `TEXT` | — | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `actor_role` | `TEXT` | — | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `vendor_id` | `TEXT` | — | No | — | `vendors(id)` (SET NULL) | `011_vendor_authz_and_audit.sql` |
| `target_type` | `TEXT` | — | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `target_id` | `TEXT` | — | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `action` | `TEXT` | — | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `metadata` | `JSONB` | — | Yes | `'{}'::jsonb` | — | `011_vendor_authz_and_audit.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `011_vendor_authz_and_audit.sql` |

- **Constraints (6)**: `audit_logs_pkey` (PRIMARY KEY), `audit_logs_actor_id_check` (CHECK), `audit_logs_actor_role_check` (CHECK), `audit_logs_target_type_check` (CHECK), `audit_logs_target_id_check` (CHECK), `audit_logs_action_check` (CHECK)

### Table `auth_delivery_telemetry`
- **Created in**: `021_auth_diagnostics_and_email_readiness.sql` | **Altered in**: `023_invitation_delivery_and_lifecycle.sql`, `025_support_feedback_and_diagnostic_links.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `BIGSERIAL` | PK | Yes | — | — | `021_auth_diagnostics_and_email_readiness.sql` |
| `correlation_id` | `TEXT` | — | Yes | — | — | `021_auth_diagnostics_and_email_readiness.sql` |
| `flow` | `TEXT` | — | Yes | — | — | `021_auth_diagnostics_and_email_readiness.sql` |
| `delivery_mode` | `TEXT` | — | Yes | — | — | `021_auth_diagnostics_and_email_readiness.sql` |
| `outcome_stage` | `TEXT` | — | Yes | — | — | `021_auth_diagnostics_and_email_readiness.sql` |
| `http_status` | `INTEGER` | — | Yes | — | — | `021_auth_diagnostics_and_email_readiness.sql` |
| `provider_status` | `INTEGER` | — | No | — | — | `021_auth_diagnostics_and_email_readiness.sql` |
| `provider_message_id` | `TEXT` | — | No | — | — | `021_auth_diagnostics_and_email_readiness.sql` |
| `error_code` | `TEXT` | — | No | — | — | `021_auth_diagnostics_and_email_readiness.sql` |
| `is_designated_test` | `BOOLEAN` | — | Yes | `false` | — | `021_auth_diagnostics_and_email_readiness.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `021_auth_diagnostics_and_email_readiness.sql` |

- **Constraints (9)**: `auth_delivery_telemetry_pkey` (PRIMARY KEY), `auth_delivery_telemetry_correlation_id_check` (CHECK), `auth_delivery_telemetry_delivery_mode_check` (CHECK), `auth_delivery_telemetry_outcome_stage_check` (CHECK), `auth_delivery_telemetry_http_status_check` (CHECK), `auth_delivery_telemetry_provider_status_check` (CHECK), `auth_delivery_telemetry_provider_message_id_check` (CHECK), `auth_delivery_telemetry_error_code_check` (CHECK), `auth_delivery_telemetry_flow_check` (CHECK)
- **Indexes (2)**: `idx_auth_delivery_telemetry_created_desc`, `idx_auth_delivery_telemetry_outcome_created`
- **RLS Policies (1)**:
  - `auth_delivery_telemetry_internal_only` (`FOR ALL`, GUCs: `app.auth_internal`) — `021_auth_diagnostics_and_email_readiness.sql`

### Table `auth_otp_challenges`
- **Created in**: `017_standalone_auth_and_sessions.sql` | **Altered in**: `019_age_eligibility_and_compliance_readiness.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `017_standalone_auth_and_sessions.sql` |
| `email_normalized` | `TEXT` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `code_hmac` | `TEXT` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `attempts` | `INTEGER` | — | Yes | `0` | — | `017_standalone_auth_and_sessions.sql` |
| `max_attempts` | `INTEGER` | — | Yes | `5` | — | `017_standalone_auth_and_sessions.sql` |
| `requester_ip_hash` | `TEXT` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `expires_at` | `TIMESTAMPTZ` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `consumed_at` | `TIMESTAMPTZ` | — | No | — | — | `017_standalone_auth_and_sessions.sql` |
| `invalidated_at` | `TIMESTAMPTZ` | — | No | — | — | `017_standalone_auth_and_sessions.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `017_standalone_auth_and_sessions.sql` |
| `signup_age_eligible` | `BOOLEAN` | — | Yes | `false` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `signup_age_policy_version` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `signup_age_assessed_at` | `TIMESTAMPTZ` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |

- **Constraints (6)**: `auth_otp_challenges_pkey` (PRIMARY KEY), `auth_otp_challenges_email_normalized_check` (CHECK), `auth_otp_challenges_code_hmac_check` (CHECK), `auth_otp_challenges_attempts_check` (CHECK), `auth_otp_challenges_max_attempts_check` (CHECK), `auth_otp_challenges_signup_age_policy_version_check` (CHECK)
- **Indexes (2)**: `idx_auth_otp_one_active_per_email` *(UNIQUE)*, `idx_auth_otp_challenges_expires`
- **RLS Policies (1)**:
  - `auth_otp_challenges_internal_only` (`FOR ALL`, GUCs: `app.auth_internal`) — `017_standalone_auth_and_sessions.sql`

### Table `auth_rate_limits`
- **Created in**: `017_standalone_auth_and_sessions.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `bucket_key` | `TEXT` | PK | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `window_start` | `TIMESTAMPTZ` | PK | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `hit_count` | `INTEGER` | — | Yes | `1` | — | `017_standalone_auth_and_sessions.sql` |

- **Constraints (3)**: `auth_rate_limits_bucket_key_check` (CHECK), `auth_rate_limits_hit_count_check` (CHECK), `PRIMARY KEY` (PRIMARY KEY)
- **Indexes (1)**: `idx_auth_rate_limits_window`
- **RLS Policies (1)**:
  - `auth_rate_limits_internal_only` (`FOR ALL`, GUCs: `app.auth_internal`) — `017_standalone_auth_and_sessions.sql`

### Table `auth_sessions`
- **Created in**: `017_standalone_auth_and_sessions.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `017_standalone_auth_and_sessions.sql` |
| `token_sha256` | `TEXT` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `user_id` | `TEXT` | — | Yes | — | `auth_users(id)` (CASCADE) | `017_standalone_auth_and_sessions.sql` |
| `ip_hash` | `TEXT` | — | No | — | — | `017_standalone_auth_and_sessions.sql` |
| `ua_hash` | `TEXT` | — | No | — | — | `017_standalone_auth_and_sessions.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `017_standalone_auth_and_sessions.sql` |
| `last_seen_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `017_standalone_auth_and_sessions.sql` |
| `expires_at` | `TIMESTAMPTZ` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `max_expires_at` | `TIMESTAMPTZ` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `revoked_at` | `TIMESTAMPTZ` | — | No | — | — | `017_standalone_auth_and_sessions.sql` |

- **Constraints (3)**: `auth_sessions_pkey` (PRIMARY KEY), `auth_sessions_token_sha256_key` (UNIQUE), `auth_sessions_token_sha256_check` (CHECK)
- **Indexes (2)**: `idx_auth_sessions_user_active`, `idx_auth_sessions_expires`
- **RLS Policies (1)**:
  - `auth_sessions_internal_only` (`FOR ALL`, GUCs: `app.auth_internal`) — `017_standalone_auth_and_sessions.sql`

### Table `auth_staging_mailbox`
- **Created in**: `017_standalone_auth_and_sessions.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `challenge_id` | `UUID` | PK | Yes | — | `auth_otp_challenges(id)` (CASCADE) | `017_standalone_auth_and_sessions.sql` |
| `email_normalized` | `TEXT` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `ciphertext_b64` | `TEXT` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `iv_b64` | `TEXT` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `auth_tag_b64` | `TEXT` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `expires_at` | `TIMESTAMPTZ` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `017_standalone_auth_and_sessions.sql` |

- **Constraints (1)**: `auth_staging_mailbox_pkey` (PRIMARY KEY)
- **Indexes (1)**: `idx_auth_staging_mailbox_email`
- **RLS Policies (1)**:
  - `auth_staging_mailbox_internal_only` (`FOR ALL`, GUCs: `app.auth_internal`) — `017_standalone_auth_and_sessions.sql`

### Table `auth_users`
- **Created in**: `017_standalone_auth_and_sessions.sql` | **Altered in**: `019_age_eligibility_and_compliance_readiness.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `TEXT` | PK | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `email_normalized` | `TEXT` | — | Yes | — | — | `017_standalone_auth_and_sessions.sql` |
| `disabled_at` | `TIMESTAMPTZ` | — | No | — | — | `017_standalone_auth_and_sessions.sql` |
| `last_login_at` | `TIMESTAMPTZ` | — | No | — | — | `017_standalone_auth_and_sessions.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `017_standalone_auth_and_sessions.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `017_standalone_auth_and_sessions.sql` |
| `age_eligibility_status` | `TEXT` | — | Yes | `'not_assessed'` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `age_policy_version` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `age_assessed_at` | `TIMESTAMPTZ` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `age_assessment_basis` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |

- **Constraints (8)**: `auth_users_pkey` (PRIMARY KEY), `auth_users_id_check` (CHECK), `auth_users_email_normalized_key` (UNIQUE), `auth_users_email_normalized_check` (CHECK), `auth_users_age_eligibility_status_check` (CHECK), `auth_users_age_policy_version_check` (CHECK), `auth_users_age_assessment_basis_check` (CHECK), `auth_users_age_consistency` (CHECK)
- **RLS Policies (1)**:
  - `auth_users_internal_only` (`FOR ALL`, GUCs: `app.auth_internal`) — `017_standalone_auth_and_sessions.sql`

### Table `bookings`
- **Created in**: `001_create_bookings.sql` | **Altered in**: `007_add_booking_packages.sql`, `011_vendor_authz_and_audit.sql`, `012_harden_bookings.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `001_create_bookings.sql` |
| `truck_id` | `TEXT` | — | No | — | `vendors(id)` (RESTRICT) | `001_create_bookings.sql` |
| `truck_name` | `TEXT` | — | Yes | — | — | `001_create_bookings.sql` |
| `event_type` | `TEXT` | — | Yes | — | — | `001_create_bookings.sql` |
| `event_date` | `DATE` | — | Yes | — | — | `001_create_bookings.sql` |
| `guest_count` | `INTEGER` | — | Yes | — | — | `001_create_bookings.sql` |
| `location` | `TEXT` | — | Yes | — | — | `001_create_bookings.sql` |
| `note` | `TEXT` | — | No | — | — | `001_create_bookings.sql` |
| `requester` | `TEXT` | — | No | — | — | `001_create_bookings.sql` |
| `status` | `TEXT` | — | Yes | `'pending'` | — | `001_create_bookings.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `001_create_bookings.sql` |
| `package_id` | `TEXT` | — | No | — | — | `007_add_booking_packages.sql` |
| `package_name` | `TEXT` | — | No | — | — | `007_add_booking_packages.sql` |
| `package_price` | `INTEGER` | — | No | — | — | `007_add_booking_packages.sql` |
| `requester_user_id` | `TEXT` | — | No | — | — | `012_harden_bookings.sql` |
| `requester_email` | `TEXT` | — | No | — | — | `012_harden_bookings.sql` |
| `idempotency_key` | `TEXT` | — | No | — | — | `012_harden_bookings.sql` |
| `request_hash` | `TEXT` | — | No | — | — | `012_harden_bookings.sql` |
| `decided_by` | `TEXT` | — | No | — | — | `012_harden_bookings.sql` |
| `decided_at` | `TIMESTAMPTZ` | — | No | — | — | `012_harden_bookings.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `012_harden_bookings.sql` |

- **Constraints (5)**: `bookings_pkey` (PRIMARY KEY), `bookings_guest_count_check` (CHECK), `bookings_vendor_fk` (FOREIGN KEY), `bookings_status_valid_chk` (CHECK), `bookings_package_terms_chk` (CHECK)
- **Indexes (3)**: `bookings_requester_idempotency_uidx` *(UNIQUE)*, `bookings_requester_user_idx`, `bookings_vendor_status_date_idx`

### Table `community_moderation_history`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `post_id` | `UUID` | — | Yes | — | `community_reviews(id)` (CASCADE) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `actor_id` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `actor_role` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `action` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `from_status` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `to_status` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `reason` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `internal_note` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |

- **Constraints (6)**: `community_moderation_history_pkey` (PRIMARY KEY), `community_moderation_history_actor_id_check` (CHECK), `community_moderation_history_actor_role_check` (CHECK), `community_moderation_history_action_check` (CHECK), `community_moderation_history_reason_check` (CHECK), `community_moderation_history_internal_note_check` (CHECK)
- **Indexes (1)**: `idx_community_mod_history_post`
- **RLS Policies (1)**:
  - `community_mod_history_rls` (`FOR ALL`, GUCs: `app.can_moderate`) — `018_admin_portal_onboarding_moderation_issues.sql`

### Table `community_reports`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `post_id` | `UUID` | — | Yes | — | `community_reviews(id)` (CASCADE) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `reporter_user_id` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `reason_category` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `details` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `status` | `TEXT` | — | Yes | `'open'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `reviewed_by` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `reviewed_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |

- **Constraints (6)**: `community_reports_pkey` (PRIMARY KEY), `community_reports_reporter_user_id_check` (CHECK), `community_reports_reason_category_check` (CHECK), `community_reports_details_check` (CHECK), `community_reports_status_check` (CHECK), `UNIQUE` (UNIQUE)
- **Indexes (1)**: `idx_community_reports_status`
- **RLS Policies (1)**:
  - `community_reports_rls` (`FOR ALL`, GUCs: `app.can_moderate`, `app.user_id`) — `018_admin_portal_onboarding_moderation_issues.sql`

### Table `community_reviews`
- **Created in**: `009_create_community_reviews.sql` | **Altered in**: `010_allow_community_whispers.sql`, `013_harden_community_privacy.sql`, `018_admin_portal_onboarding_moderation_issues.sql`, `024_diagnostics_and_reliability.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `009_create_community_reviews.sql` |
| `author_id` | `TEXT` | — | Yes | — | — | `009_create_community_reviews.sql` |
| `nickname` | `TEXT` | — | Yes | `'Local food fan'` | — | `009_create_community_reviews.sql` |
| `kind` | `TEXT` | — | Yes | — | — | `009_create_community_reviews.sql` |
| `place_id` | `TEXT` | — | Yes | — | — | `009_create_community_reviews.sql` |
| `place_name` | `TEXT` | — | Yes | — | — | `009_create_community_reviews.sql` |
| `town` | `TEXT` | — | Yes | — | — | `009_create_community_reviews.sql` |
| `title` | `TEXT` | — | Yes | — | — | `009_create_community_reviews.sql` |
| `body` | `TEXT` | — | Yes | — | — | `009_create_community_reviews.sql` |
| `rating` | `INTEGER` | — | No | — | — | `009_create_community_reviews.sql` |
| `status` | `TEXT` | — | Yes | `'pending'` | — | `009_create_community_reviews.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `NOW()` | — | `009_create_community_reviews.sql` |
| `moderated_at` | `TIMESTAMPTZ` | — | No | — | — | `009_create_community_reviews.sql` |
| `moderated_by` | `TEXT` | — | No | — | — | `013_harden_community_privacy.sql` |
| `moderation_reason` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `moderation_internal_note` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `report_count` | `INTEGER` | — | Yes | `0` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `last_reported_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `hidden_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `hidden_by` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `restored_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `restored_by` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `idempotency_key` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |

- **Constraints (9)**: `community_reviews_pkey` (PRIMARY KEY), `community_reviews_rating_check` (CHECK), `CHECK` (CHECK), `CHECK` (CHECK), `community_reviews_kind_check` (CHECK), `community_reviews_report_count_check` (CHECK), `community_reviews_status_check` (CHECK), `community_reviews_moderation_consistency_chk` (CHECK), `community_reviews_idempotency_key_chk` (CHECK)
- **Indexes (1)**: `idx_community_reviews_author_idem` *(UNIQUE)*
- **RLS Policies (5)**:
  - `community_select_approved` (`FOR SELECT`, GUCs: none) — `013_harden_community_privacy.sql`
  - `community_select_own` (`FOR SELECT`, GUCs: `app.user_id`) — `013_harden_community_privacy.sql`
  - `community_insert_own` (`FOR INSERT`, GUCs: `app.user_id`) — `013_harden_community_privacy.sql`
  - `community_moderator_all` (`FOR ALL`, GUCs: `app.can_moderate`) — `013_harden_community_privacy.sql`
  - `community_report_bump` (`FOR UPDATE`, GUCs: `app.community_report`) — `018_admin_portal_onboarding_moderation_issues.sql`

### Table `compliance_readiness_history`
- **Created in**: `019_age_eligibility_and_compliance_readiness.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `item_key` | `TEXT` | — | Yes | — | `compliance_readiness_items(item_key)` (RESTRICT) | `019_age_eligibility_and_compliance_readiness.sql` |
| `actor_id` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `actor_role` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `change_kind` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `from_status` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `to_status` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `summary` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `metadata` | `JSONB` | — | Yes | `'{}'::jsonb` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `019_age_eligibility_and_compliance_readiness.sql` |

- **Constraints (5)**: `compliance_readiness_history_pkey` (PRIMARY KEY), `compliance_readiness_history_actor_id_check` (CHECK), `compliance_readiness_history_actor_role_check` (CHECK), `compliance_readiness_history_change_kind_check` (CHECK), `compliance_readiness_history_summary_check` (CHECK)
- **Indexes (1)**: `idx_compliance_history_item_created`
- **RLS Policies (2)**:
  - `compliance_history_admin_portal_select` (`FOR SELECT`, GUCs: `app.admin_portal`) — `019_age_eligibility_and_compliance_readiness.sql`
  - `compliance_history_admin_portal_insert` (`FOR INSERT`, GUCs: `app.admin_portal`) — `019_age_eligibility_and_compliance_readiness.sql`

### Table `compliance_readiness_items`
- **Created in**: `019_age_eligibility_and_compliance_readiness.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `item_key` | `TEXT` | PK | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `sort_order` | `INTEGER` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `category` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `topic` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `is_launch_critical` | `BOOLEAN` | — | Yes | `true` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `mod_visible` | `BOOLEAN` | — | Yes | `true` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `mod_counsel_access_granted` | `BOOLEAN` | — | Yes | `false` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `current_practice` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `unresolved_questions` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `status` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `not_applicable_explanation` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `decision_recorded` | `BOOLEAN` | — | Yes | `false` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `implemented_recorded` | `BOOLEAN` | — | Yes | `false` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `tested_recorded` | `BOOLEAN` | — | Yes | `false` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `owner_label` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `next_action` | `TEXT` | — | Yes | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `target_review_date` | `DATE` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `policy_version` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `supporting_evidence` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `operational_notes` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `confidential_counsel_notes` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `approved_doc_version` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `approved_jurisdiction_scope` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `legal_reviewer_name` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `legal_reviewed_at` | `DATE` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `dependencies` | `TEXT[]` | — | Yes | `'{}'::text[]` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `updated_by` | `TEXT` | — | No | — | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `019_age_eligibility_and_compliance_readiness.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `019_age_eligibility_and_compliance_readiness.sql` |

- **Constraints (19)**: `compliance_readiness_items_pkey` (PRIMARY KEY), `compliance_readiness_items_item_key_check` (CHECK), `compliance_readiness_items_category_check` (CHECK), `compliance_readiness_items_topic_check` (CHECK), `compliance_readiness_items_current_practice_check` (CHECK), `compliance_readiness_items_unresolved_questions_check` (CHECK), `compliance_readiness_items_status_check` (CHECK), `compliance_readiness_items_not_applicable_explanation_check` (CHECK), `compliance_readiness_items_owner_label_check` (CHECK), `compliance_readiness_items_next_action_check` (CHECK), `compliance_readiness_items_policy_version_check` (CHECK), `compliance_readiness_items_supporting_evidence_check` (CHECK), `compliance_readiness_items_operational_notes_check` (CHECK), `compliance_readiness_items_confidential_counsel_notes_check` (CHECK), `compliance_readiness_items_approved_doc_version_check` (CHECK), `compliance_readiness_items_approved_jurisdiction_scope_check` (CHECK), `compliance_readiness_items_legal_reviewer_name_check` (CHECK), `compliance_not_applicable_requires_explanation` (CHECK), `compliance_legally_approved_requires_evidence` (CHECK)
- **RLS Policies (1)**:
  - `compliance_items_admin_portal_all` (`FOR ALL`, GUCs: `app.admin_portal`) — `019_age_eligibility_and_compliance_readiness.sql`

### Table `customer_collection_entries`
- **Created in**: `029_customer_profiles_collections_and_sharing.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `TEXT` | PK | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `collection_id` | `TEXT` | — | Yes | — | `customer_collections(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `user_id` | `TEXT` | — | Yes | — | `auth_users(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `position` | `SMALLINT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `vendor_id` | `TEXT` | — | No | — | `vendors(id)` (SET NULL) | `029_customer_profiles_collections_and_sharing.sql` |
| `recorded_vendor_id` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `vendor_name_snapshot` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `vendor_town_snapshot` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `vendor_cuisine_snapshot` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `recommendation` | `TEXT` | — | Yes | `''` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `photo_attachment_id` | `TEXT` | — | No | — | `customer_collection_photo_attachments(id)` (SET NULL) | `029_customer_profiles_collections_and_sharing.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |

- **Constraints (10)**: `customer_collection_entries_pkey` (PRIMARY KEY), `customer_collection_entries_id_check` (CHECK), `customer_collection_entries_position_check` (CHECK), `customer_collection_entries_recorded_vendor_id_check` (CHECK), `customer_collection_entries_vendor_name_snapshot_check` (CHECK), `customer_collection_entries_vendor_town_snapshot_check` (CHECK), `customer_collection_entries_vendor_cuisine_snapshot_check` (CHECK), `customer_collection_entries_recommendation_check` (CHECK), `customer_collection_entries_unique_position` (UNIQUE), `customer_collection_entries_unique_vendor` (UNIQUE)
- **Indexes (1)**: `idx_customer_collection_entries_collection_pos`
- **RLS Policies (2)**:
  - `customer_collection_entries_owner_all` (`FOR ALL`, GUCs: `app.user_id`) — `029_customer_profiles_collections_and_sharing.sql`
  - `customer_collection_entries_share_or_mod_select` (`FOR SELECT`, GUCs: `app.can_moderate`, `app.is_platform_admin`, `app.share_lookup`, `app.share_moderation`) — `029_customer_profiles_collections_and_sharing.sql`

### Table `customer_collection_photo_attachments`
- **Created in**: `029_customer_profiles_collections_and_sharing.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `TEXT` | PK | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `collection_id` | `TEXT` | — | Yes | — | `customer_collections(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `user_id` | `TEXT` | — | Yes | — | `auth_users(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `source_photo_id` | `TEXT` | — | No | — | `customer_photos(id)` (SET NULL) | `029_customer_profiles_collections_and_sharing.sql` |
| `recorded_source_photo_id` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `shared_rel_path` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `mime_type` | `TEXT` | — | Yes | `'image/webp'` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `byte_size` | `INTEGER` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `width` | `INTEGER` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `height` | `INTEGER` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `sha256_hex` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `share_consent_confirmed` | `BOOLEAN` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `consented_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `moderation_status` | `TEXT` | — | Yes | `'active'` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `suppressed_at` | `TIMESTAMPTZ` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `suppressed_by` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `suppression_authority` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `suppression_reason` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `revoked_at` | `TIMESTAMPTZ` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `files_purged_at` | `TIMESTAMPTZ` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |

- **Constraints (13)**: `customer_collection_photo_attachments_pkey` (PRIMARY KEY), `customer_collection_photo_attachments_id_check` (CHECK), `customer_collection_photo_attachments_recorded_source_photo_id_check` (CHECK), `customer_collection_photo_attachments_shared_rel_path_check` (CHECK), `customer_collection_photo_attachments_mime_type_check` (CHECK), `customer_collection_photo_attachments_byte_size_check` (CHECK), `customer_collection_photo_attachments_width_check` (CHECK), `customer_collection_photo_attachments_height_check` (CHECK), `customer_collection_photo_attachments_sha256_hex_check` (CHECK), `customer_collection_photo_attachments_share_consent_confirmed_check` (CHECK), `customer_collection_photo_attachments_moderation_status_check` (CHECK), `customer_collection_photo_attachments_suppression_authority_check` (CHECK), `customer_collection_photo_attachments_suppression_reason_check` (CHECK)
- **Indexes (3)**: `idx_collection_photo_attachments_collection`, `idx_collection_photo_attachments_source_photo`, `idx_collection_photo_attachments_pending_purge`
- **RLS Policies (4)**:
  - `customer_collection_photos_owner_all` (`FOR ALL`, GUCs: `app.user_id`) — `029_customer_profiles_collections_and_sharing.sql`
  - `customer_collection_photos_share_lookup_select` (`FOR SELECT`, GUCs: `app.share_lookup`) — `029_customer_profiles_collections_and_sharing.sql`
  - `customer_collection_photos_moderation_access` (`FOR ALL`, GUCs: `app.can_moderate`, `app.is_platform_admin`, `app.share_moderation`) — `029_customer_profiles_collections_and_sharing.sql`
  - `customer_collection_photos_maintenance_all` (`FOR ALL`, GUCs: `app.photo_maintenance`) — `029_customer_profiles_collections_and_sharing.sql`

### Table `customer_collection_shares`
- **Created in**: `029_customer_profiles_collections_and_sharing.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `TEXT` | PK | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `collection_id` | `TEXT` | — | Yes | — | `customer_collections(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `user_id` | `TEXT` | — | Yes | — | `auth_users(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `token_sha256` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `masked_token_hint` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `include_display_name` | `BOOLEAN` | — | Yes | `false` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `include_bio` | `BOOLEAN` | — | Yes | `false` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `include_preferred_area` | `BOOLEAN` | — | Yes | `false` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `include_achievements` | `BOOLEAN` | — | Yes | `false` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `include_shared_photos` | `BOOLEAN` | — | Yes | `false` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `expires_at` | `TIMESTAMPTZ` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `status` | `TEXT` | — | Yes | `'active'` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `replaced_by_share_id` | `TEXT` | — | No | — | `customer_collection_shares(id)` (SET NULL) | `029_customer_profiles_collections_and_sharing.sql` |
| `revoked_at` | `TIMESTAMPTZ` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `revoke_reason` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `moderation_suppressed_at` | `TIMESTAMPTZ` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `moderation_suppressed_by` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `moderation_authority` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `moderation_reason` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `idempotency_key` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |

- **Constraints (10)**: `customer_collection_shares_pkey` (PRIMARY KEY), `customer_collection_shares_id_check` (CHECK), `customer_collection_shares_token_sha256_key` (UNIQUE), `customer_collection_shares_token_sha256_check` (CHECK), `customer_collection_shares_masked_token_hint_check` (CHECK), `customer_collection_shares_status_check` (CHECK), `customer_collection_shares_revoke_reason_check` (CHECK), `customer_collection_shares_moderation_authority_check` (CHECK), `customer_collection_shares_moderation_reason_check` (CHECK), `customer_collection_shares_idempotency_key_check` (CHECK)
- **Indexes (3)**: `idx_customer_collection_shares_collection_status`, `idx_customer_collection_shares_user_status`, `idx_customer_collection_shares_user_idem` *(UNIQUE)*
- **RLS Policies (3)**:
  - `customer_collection_shares_owner_all` (`FOR ALL`, GUCs: `app.user_id`) — `029_customer_profiles_collections_and_sharing.sql`
  - `customer_collection_shares_share_lookup_select` (`FOR SELECT`, GUCs: `app.share_lookup`) — `029_customer_profiles_collections_and_sharing.sql`
  - `customer_collection_shares_moderation_access` (`FOR ALL`, GUCs: `app.can_moderate`, `app.is_platform_admin`, `app.share_moderation`) — `029_customer_profiles_collections_and_sharing.sql`

### Table `customer_collections`
- **Created in**: `029_customer_profiles_collections_and_sharing.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `TEXT` | PK | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `user_id` | `TEXT` | — | Yes | — | `auth_users(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `title` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `intro` | `TEXT` | — | Yes | `''` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `visibility_mode` | `TEXT` | — | Yes | `'private'` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `moderation_status` | `TEXT` | — | Yes | `'active'` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `suppressed_at` | `TIMESTAMPTZ` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `suppressed_by` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `suppression_authority` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `suppression_reason` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `suppressed_content_sha256` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `revision` | `INTEGER` | — | Yes | `1` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `idempotency_key` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `deleted_at` | `TIMESTAMPTZ` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |

- **Constraints (11)**: `customer_collections_pkey` (PRIMARY KEY), `customer_collections_id_check` (CHECK), `customer_collections_title_check` (CHECK), `customer_collections_intro_check` (CHECK), `customer_collections_visibility_mode_check` (CHECK), `customer_collections_moderation_status_check` (CHECK), `customer_collections_suppression_authority_check` (CHECK), `customer_collections_suppression_reason_check` (CHECK), `customer_collections_suppressed_content_sha256_check` (CHECK), `customer_collections_revision_check` (CHECK), `customer_collections_idempotency_key_check` (CHECK)
- **Indexes (2)**: `idx_customer_collections_user_active`, `idx_customer_collections_user_idem` *(UNIQUE)*
- **RLS Policies (3)**:
  - `customer_collections_owner_all` (`FOR ALL`, GUCs: `app.user_id`) — `029_customer_profiles_collections_and_sharing.sql`
  - `customer_collections_share_lookup_select` (`FOR SELECT`, GUCs: `app.share_lookup`) — `029_customer_profiles_collections_and_sharing.sql`
  - `customer_collections_moderation_access` (`FOR ALL`, GUCs: `app.can_moderate`, `app.is_platform_admin`, `app.share_moderation`) — `029_customer_profiles_collections_and_sharing.sql`

### Table `customer_photos`
- **Created in**: `027_customer_exploration_foundation.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `TEXT` | PK | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `user_id` | `TEXT` | — | Yes | — | `auth_users(id)` (CASCADE) | `027_customer_exploration_foundation.sql` |
| `vendor_id` | `TEXT` | — | No | — | `vendors(id)` (SET NULL) | `027_customer_exploration_foundation.sql` |
| `recorded_vendor_id` | `TEXT` | — | No | — | — | `027_customer_exploration_foundation.sql` |
| `vendor_name_snapshot` | `TEXT` | — | No | — | — | `027_customer_exploration_foundation.sql` |
| `caption` | `TEXT` | — | Yes | `''` | — | `027_customer_exploration_foundation.sql` |
| `mime_type` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `byte_size` | `INTEGER` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `thumb_byte_size` | `INTEGER` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `width` | `INTEGER` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `height` | `INTEGER` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `sha256_hex` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `storage_rel_path` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `thumb_rel_path` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `entry_source` | `TEXT` | — | Yes | `'manual'` | — | `027_customer_exploration_foundation.sql` |
| `idempotency_key` | `TEXT` | — | No | — | — | `027_customer_exploration_foundation.sql` |
| `taken_local_date` | `DATE` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `027_customer_exploration_foundation.sql` |
| `deleted_at` | `TIMESTAMPTZ` | — | No | — | — | `027_customer_exploration_foundation.sql` |
| `files_purged_at` | `TIMESTAMPTZ` | — | No | — | — | `027_customer_exploration_foundation.sql` |

- **Constraints (15)**: `customer_photos_pkey` (PRIMARY KEY), `customer_photos_id_check` (CHECK), `customer_photos_recorded_vendor_id_check` (CHECK), `customer_photos_vendor_name_snapshot_check` (CHECK), `customer_photos_caption_check` (CHECK), `customer_photos_mime_type_check` (CHECK), `customer_photos_byte_size_check` (CHECK), `customer_photos_thumb_byte_size_check` (CHECK), `customer_photos_width_check` (CHECK), `customer_photos_height_check` (CHECK), `customer_photos_sha256_hex_check` (CHECK), `customer_photos_storage_rel_path_check` (CHECK), `customer_photos_thumb_rel_path_check` (CHECK), `customer_photos_entry_source_check` (CHECK), `customer_photos_idempotency_key_check` (CHECK)
- **Indexes (3)**: `idx_customer_photos_user_idempotency` *(UNIQUE)*, `idx_customer_photos_user_active_created`, `idx_customer_photos_pending_file_purge`
- **RLS Policies (3)**:
  - `customer_photos_owner_all` (`FOR ALL`, GUCs: `app.user_id`) — `027_customer_exploration_foundation.sql`
  - `customer_photos_maintenance_select` (`FOR SELECT`, GUCs: `app.photo_maintenance`) — `028_exploration_photo_reconciliation.sql`
  - `customer_photos_maintenance_mark_purged` (`FOR UPDATE`, GUCs: `app.photo_maintenance`) — `028_exploration_photo_reconciliation.sql`

### Table `customer_profiles`
- **Created in**: `029_customer_profiles_collections_and_sharing.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `user_id` | `TEXT` | PK | Yes | — | `auth_users(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `public_profile_id` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `display_name` | `TEXT` | — | Yes | `''` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `bio` | `TEXT` | — | Yes | `''` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `avatar_style` | `TEXT` | — | Yes | `'initials_fern'` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `preferred_town` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `food_interests` | `TEXT[]` | — | Yes | `'{}'::text[]` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `communication_product_updates_opt_in` | `BOOLEAN` | — | Yes | `false` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `visibility_mode` | `TEXT` | — | Yes | `'private'` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `allow_public_indexing` | `BOOLEAN` | — | Yes | `false` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `revision` | `INTEGER` | — | Yes | `1` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |

- **Constraints (11)**: `customer_profiles_pkey` (PRIMARY KEY), `customer_profiles_public_profile_id_key` (UNIQUE), `customer_profiles_public_profile_id_check` (CHECK), `customer_profiles_display_name_check` (CHECK), `customer_profiles_bio_check` (CHECK), `customer_profiles_avatar_style_check` (CHECK), `customer_profiles_preferred_town_check` (CHECK), `customer_profiles_food_interests_check` (CHECK), `customer_profiles_visibility_mode_check` (CHECK), `customer_profiles_allow_public_indexing_check` (CHECK), `customer_profiles_revision_check` (CHECK)
- **RLS Policies (2)**:
  - `customer_profiles_owner_all` (`FOR ALL`, GUCs: `app.user_id`) — `029_customer_profiles_collections_and_sharing.sql`
  - `customer_profiles_share_lookup_select` (`FOR SELECT`, GUCs: `app.share_lookup`) — `029_customer_profiles_collections_and_sharing.sql`

### Table `customer_saved_trail_stops`
- **Created in**: `027_customer_exploration_foundation.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `trail_id` | `TEXT` | PK | Yes | — | `customer_saved_trails(id)` (CASCADE) | `027_customer_exploration_foundation.sql` |
| `user_id` | `TEXT` | — | Yes | — | `auth_users(id)` (CASCADE) | `027_customer_exploration_foundation.sql` |
| `position` | `SMALLINT` | PK | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `vendor_id` | `TEXT` | — | No | — | `vendors(id)` (SET NULL) | `027_customer_exploration_foundation.sql` |
| `recorded_vendor_id` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `vendor_name_snapshot` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `match_reason` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |

- **Constraints (6)**: `customer_saved_trail_stops_position_check` (CHECK), `customer_saved_trail_stops_recorded_vendor_id_check` (CHECK), `customer_saved_trail_stops_vendor_name_snapshot_check` (CHECK), `customer_saved_trail_stops_match_reason_check` (CHECK), `PRIMARY KEY` (PRIMARY KEY), `UNIQUE` (UNIQUE)
- **Indexes (1)**: `idx_customer_saved_trail_stops_user`
- **RLS Policies (1)**:
  - `customer_saved_trail_stops_owner_all` (`FOR ALL`, GUCs: `app.user_id`) — `027_customer_exploration_foundation.sql`

### Table `customer_saved_trails`
- **Created in**: `027_customer_exploration_foundation.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `TEXT` | PK | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `user_id` | `TEXT` | — | Yes | — | `auth_users(id)` (CASCADE) | `027_customer_exploration_foundation.sql` |
| `title` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `theme_key` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `town_filter` | `TEXT` | — | No | — | — | `027_customer_exploration_foundation.sql` |
| `saved_local_date` | `DATE` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `idempotency_key` | `TEXT` | — | No | — | — | `027_customer_exploration_foundation.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `027_customer_exploration_foundation.sql` |
| `deleted_at` | `TIMESTAMPTZ` | — | No | — | — | `027_customer_exploration_foundation.sql` |

- **Constraints (6)**: `customer_saved_trails_pkey` (PRIMARY KEY), `customer_saved_trails_id_check` (CHECK), `customer_saved_trails_title_check` (CHECK), `customer_saved_trails_theme_key_check` (CHECK), `customer_saved_trails_town_filter_check` (CHECK), `customer_saved_trails_idempotency_key_check` (CHECK)
- **Indexes (2)**: `idx_customer_saved_trails_user_idempotency` *(UNIQUE)*, `idx_customer_saved_trails_user_active`
- **RLS Policies (1)**:
  - `customer_saved_trails_owner_all` (`FOR ALL`, GUCs: `app.user_id`) — `027_customer_exploration_foundation.sql`

### Table `customer_share_moderation_events`
- **Created in**: `029_customer_profiles_collections_and_sharing.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `BIGSERIAL` | PK | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `collection_id` | `TEXT` | — | Yes | — | `customer_collections(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `share_id` | `TEXT` | — | No | — | `customer_collection_shares(id)` (SET NULL) | `029_customer_profiles_collections_and_sharing.sql` |
| `attachment_id` | `TEXT` | — | No | — | `customer_collection_photo_attachments(id)` (SET NULL) | `029_customer_profiles_collections_and_sharing.sql` |
| `actor_user_id` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `actor_authority` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `action` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `reason` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |

- **Constraints (4)**: `customer_share_moderation_events_pkey` (PRIMARY KEY), `customer_share_moderation_events_actor_authority_check` (CHECK), `customer_share_moderation_events_action_check` (CHECK), `customer_share_moderation_events_reason_check` (CHECK)
- **Indexes (1)**: `idx_customer_share_mod_events_collection`
- **RLS Policies (1)**:
  - `customer_share_mod_events_access` (`FOR ALL`, GUCs: `app.can_moderate`, `app.is_platform_admin`, `app.share_moderation`) — `029_customer_profiles_collections_and_sharing.sql`

### Table `customer_share_reports`
- **Created in**: `029_customer_profiles_collections_and_sharing.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `TEXT` | PK | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `share_id` | `TEXT` | — | Yes | — | `customer_collection_shares(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `collection_id` | `TEXT` | — | Yes | — | `customer_collections(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `attachment_id` | `TEXT` | — | No | — | `customer_collection_photo_attachments(id)` (SET NULL) | `029_customer_profiles_collections_and_sharing.sql` |
| `reporter_user_id` | `TEXT` | — | No | — | `auth_users(id)` (SET NULL) | `029_customer_profiles_collections_and_sharing.sql` |
| `reporter_ip_hash` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `reason` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `details` | `TEXT` | — | Yes | `''` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `status` | `TEXT` | — | Yes | `'open'` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `reviewed_by` | `TEXT` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `reviewed_at` | `TIMESTAMPTZ` | — | No | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |

- **Constraints (6)**: `customer_share_reports_pkey` (PRIMARY KEY), `customer_share_reports_id_check` (CHECK), `customer_share_reports_reporter_ip_hash_check` (CHECK), `customer_share_reports_reason_check` (CHECK), `customer_share_reports_details_check` (CHECK), `customer_share_reports_status_check` (CHECK)
- **Indexes (2)**: `idx_customer_share_reports_status_created`, `idx_customer_share_reports_collection`
- **RLS Policies (1)**:
  - `customer_share_reports_intake` (`FOR ALL`, GUCs: `app.can_moderate`, `app.is_platform_admin`, `app.share_moderation`, `app.share_report_intake`) — `029_customer_profiles_collections_and_sharing.sql`

### Table `customer_sharing_eligibility`
- **Created in**: `029_customer_profiles_collections_and_sharing.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `user_id` | `TEXT` | PK | Yes | — | `auth_users(id)` (CASCADE) | `029_customer_profiles_collections_and_sharing.sql` |
| `eligibility_status` | `TEXT` | — | Yes | `'unknown'` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `policy_version` | `TEXT` | — | Yes | — | — | `029_customer_profiles_collections_and_sharing.sql` |
| `assessment_basis` | `TEXT` | — | Yes | `'self_attested_calendar_dob'` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `assessed_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `029_customer_profiles_collections_and_sharing.sql` |

- **Constraints (4)**: `customer_sharing_eligibility_pkey` (PRIMARY KEY), `customer_sharing_eligibility_eligibility_status_check` (CHECK), `customer_sharing_eligibility_policy_version_check` (CHECK), `customer_sharing_eligibility_assessment_basis_check` (CHECK)
- **RLS Policies (2)**:
  - `customer_sharing_eligibility_owner_all` (`FOR ALL`, GUCs: `app.user_id`) — `029_customer_profiles_collections_and_sharing.sql`
  - `customer_sharing_eligibility_share_lookup_select` (`FOR SELECT`, GUCs: `app.share_lookup`) — `029_customer_profiles_collections_and_sharing.sql`

### Table `customer_visits`
- **Created in**: `027_customer_exploration_foundation.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `TEXT` | PK | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `user_id` | `TEXT` | — | Yes | — | `auth_users(id)` (CASCADE) | `027_customer_exploration_foundation.sql` |
| `vendor_id` | `TEXT` | — | No | — | `vendors(id)` (SET NULL) | `027_customer_exploration_foundation.sql` |
| `recorded_vendor_id` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `vendor_name_snapshot` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `normalized_cuisine` | `TEXT` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `normalized_town` | `TEXT` | — | No | — | — | `027_customer_exploration_foundation.sql` |
| `private_note` | `TEXT` | — | Yes | `''` | — | `027_customer_exploration_foundation.sql` |
| `visited_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `027_customer_exploration_foundation.sql` |
| `visit_local_date` | `DATE` | — | Yes | — | — | `027_customer_exploration_foundation.sql` |
| `calendar_tz` | `TEXT` | — | Yes | `'America/Los_Angeles'` | — | `027_customer_exploration_foundation.sql` |
| `entry_source` | `TEXT` | — | Yes | `'manual'` | — | `027_customer_exploration_foundation.sql` |
| `idempotency_key` | `TEXT` | — | No | — | — | `027_customer_exploration_foundation.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `027_customer_exploration_foundation.sql` |
| `deleted_at` | `TIMESTAMPTZ` | — | No | — | — | `027_customer_exploration_foundation.sql` |

- **Constraints (10)**: `customer_visits_pkey` (PRIMARY KEY), `customer_visits_id_check` (CHECK), `customer_visits_recorded_vendor_id_check` (CHECK), `customer_visits_vendor_name_snapshot_check` (CHECK), `customer_visits_normalized_cuisine_check` (CHECK), `customer_visits_normalized_town_check` (CHECK), `customer_visits_private_note_check` (CHECK), `customer_visits_calendar_tz_check` (CHECK), `customer_visits_entry_source_check` (CHECK), `customer_visits_idempotency_key_check` (CHECK)
- **Indexes (4)**: `idx_customer_visits_active_user_vendor_day` *(UNIQUE)*, `idx_customer_visits_user_idempotency` *(UNIQUE)*, `idx_customer_visits_user_active_history`, `idx_customer_visits_user_vendor_active`
- **RLS Policies (1)**:
  - `customer_visits_owner_all` (`FOR ALL`, GUCs: `app.user_id`) — `027_customer_exploration_foundation.sql`

### Table `diagnostic_event_samples`
- **Created in**: `024_diagnostics_and_reliability.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `024_diagnostics_and_reliability.sql` |
| `group_id` | `UUID` | — | Yes | — | `diagnostic_incident_groups(id)` (CASCADE) | `024_diagnostics_and_reliability.sql` |
| `occurred_at` | `TIMESTAMPTZ` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `received_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `024_diagnostics_and_reliability.sql` |
| `emitting_component` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `trust_level` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `server_release_sha` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `client_build_version` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `client_loaded_release_sha` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `is_stale_client` | `BOOLEAN` | — | Yes | `false` | — | `024_diagnostics_and_reliability.sql` |
| `feature_key` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `operation_name` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `route_template` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `http_method` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `http_status` | `INTEGER` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `severity` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `error_code` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `sanitized_message` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `user_impact` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `correlation_id` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `duration_ms` | `INTEGER` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `retryable` | `BOOLEAN` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `outcome_state` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `safe_context` | `JSONB` | — | Yes | `'{}'::jsonb` | — | `024_diagnostics_and_reliability.sql` |

- **Constraints (19)**: `diagnostic_event_samples_pkey` (PRIMARY KEY), `diagnostic_event_samples_emitting_component_check` (CHECK), `diagnostic_event_samples_trust_level_check` (CHECK), `diagnostic_event_samples_server_release_sha_check` (CHECK), `diagnostic_event_samples_client_build_version_check` (CHECK), `diagnostic_event_samples_client_loaded_release_sha_check` (CHECK), `diagnostic_event_samples_feature_key_check` (CHECK), `diagnostic_event_samples_operation_name_check` (CHECK), `diagnostic_event_samples_route_template_check` (CHECK), `diagnostic_event_samples_http_method_check` (CHECK), `diagnostic_event_samples_http_status_check` (CHECK), `diagnostic_event_samples_severity_check` (CHECK), `diagnostic_event_samples_error_code_check` (CHECK), `diagnostic_event_samples_sanitized_message_check` (CHECK), `diagnostic_event_samples_user_impact_check` (CHECK), `diagnostic_event_samples_correlation_id_check` (CHECK), `diagnostic_event_samples_duration_ms_check` (CHECK), `diagnostic_event_samples_outcome_state_check` (CHECK), `diagnostic_event_samples_safe_context_check` (CHECK)
- **Indexes (3)**: `idx_diag_samples_group_recent`, `idx_diag_samples_corr`, `idx_diag_samples_received`
- **RLS Policies (1)**:
  - `diagnostic_event_samples_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.diagnostics_internal`) — `024_diagnostics_and_reliability.sql`

### Table `diagnostic_incident_groups`
- **Created in**: `024_diagnostics_and_reliability.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `024_diagnostics_and_reliability.sql` |
| `fingerprint` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `title` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `emitting_component` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `trust_level` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `feature_key` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `operation_name` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `route_template` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `severity` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `error_code` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `sanitized_summary` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `user_impact` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `safe_next_steps` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `retryable` | `BOOLEAN` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `outcome_state` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `is_synthetic_test` | `BOOLEAN` | — | Yes | `false` | — | `024_diagnostics_and_reliability.sql` |
| `mod_visible` | `BOOLEAN` | — | Yes | `true` | — | `024_diagnostics_and_reliability.sql` |
| `triage_status` | `TEXT` | — | Yes | `'new'` | — | `024_diagnostics_and_reliability.sql` |
| `suspected_cause` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `suspected_fix_sha` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `fix_recorded_at` | `TIMESTAMPTZ` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `fix_recorded_by` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `occurrence_count` | `BIGINT` | — | Yes | `1` | — | `024_diagnostics_and_reliability.sql` |
| `first_seen_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `024_diagnostics_and_reliability.sql` |
| `last_seen_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `024_diagnostics_and_reliability.sql` |
| `first_server_release_sha` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `last_server_release_sha` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `observed_server_releases` | `TEXT[]` | — | Yes | `'{}'` | — | `024_diagnostics_and_reliability.sql` |
| `observed_client_builds` | `TEXT[]` | — | Yes | `'{}'` | — | `024_diagnostics_and_reliability.sql` |
| `stale_client_observed` | `BOOLEAN` | — | Yes | `false` | — | `024_diagnostics_and_reliability.sql` |
| `continued_after_suspected_fix` | `BOOLEAN` | — | Yes | `false` | — | `024_diagnostics_and_reliability.sql` |
| `last_correlation_id` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `last_sample_at` | `TIMESTAMPTZ` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `024_diagnostics_and_reliability.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `024_diagnostics_and_reliability.sql` |

- **Constraints (25)**: `diagnostic_incident_groups_pkey` (PRIMARY KEY), `diagnostic_incident_groups_fingerprint_key` (UNIQUE), `diagnostic_incident_groups_fingerprint_check` (CHECK), `diagnostic_incident_groups_title_check` (CHECK), `diagnostic_incident_groups_emitting_component_check` (CHECK), `diagnostic_incident_groups_trust_level_check` (CHECK), `diagnostic_incident_groups_feature_key_check` (CHECK), `diagnostic_incident_groups_operation_name_check` (CHECK), `diagnostic_incident_groups_route_template_check` (CHECK), `diagnostic_incident_groups_severity_check` (CHECK), `diagnostic_incident_groups_error_code_check` (CHECK), `diagnostic_incident_groups_sanitized_summary_check` (CHECK), `diagnostic_incident_groups_user_impact_check` (CHECK), `diagnostic_incident_groups_safe_next_steps_check` (CHECK), `diagnostic_incident_groups_outcome_state_check` (CHECK), `diagnostic_incident_groups_triage_status_check` (CHECK), `diagnostic_incident_groups_suspected_cause_check` (CHECK), `diagnostic_incident_groups_suspected_fix_sha_check` (CHECK), `diagnostic_incident_groups_fix_recorded_by_check` (CHECK), `diagnostic_incident_groups_occurrence_count_check` (CHECK), `diagnostic_incident_groups_first_server_release_sha_check` (CHECK), `diagnostic_incident_groups_last_server_release_sha_check` (CHECK), `diagnostic_incident_groups_observed_server_releases_check` (CHECK), `diagnostic_incident_groups_observed_client_builds_check` (CHECK), `diagnostic_incident_groups_last_correlation_id_check` (CHECK)
- **Indexes (3)**: `idx_diag_groups_last_seen`, `idx_diag_groups_filter`, `idx_diag_groups_corr`
- **RLS Policies (1)**:
  - `diagnostic_incident_groups_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.diagnostics_internal`) — `024_diagnostics_and_reliability.sql`

### Table `diagnostic_incident_notes`
- **Created in**: `024_diagnostics_and_reliability.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `024_diagnostics_and_reliability.sql` |
| `group_id` | `UUID` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `group_fingerprint` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `group_title` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `mod_visible` | `BOOLEAN` | — | Yes | `true` | — | `024_diagnostics_and_reliability.sql` |
| `actor_id` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `actor_role` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `action_type` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `previous_triage_status` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `new_triage_status` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `suspected_cause` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `suspected_fix_sha` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `note_body` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `correlation_id` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `024_diagnostics_and_reliability.sql` |

- **Constraints (12)**: `diagnostic_incident_notes_pkey` (PRIMARY KEY), `diagnostic_incident_notes_group_fingerprint_check` (CHECK), `diagnostic_incident_notes_group_title_check` (CHECK), `diagnostic_incident_notes_actor_id_check` (CHECK), `diagnostic_incident_notes_actor_role_check` (CHECK), `diagnostic_incident_notes_action_type_check` (CHECK), `diagnostic_incident_notes_previous_triage_status_check` (CHECK), `diagnostic_incident_notes_new_triage_status_check` (CHECK), `diagnostic_incident_notes_suspected_cause_check` (CHECK), `diagnostic_incident_notes_suspected_fix_sha_check` (CHECK), `diagnostic_incident_notes_note_body_check` (CHECK), `diagnostic_incident_notes_correlation_id_check` (CHECK)
- **Indexes (2)**: `idx_diag_notes_group`, `idx_diag_notes_fingerprint`
- **RLS Policies (1)**:
  - `diagnostic_incident_notes_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.diagnostics_internal`) — `024_diagnostics_and_reliability.sql`

### Table `diagnostic_releases`
- **Created in**: `024_diagnostics_and_reliability.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `release_sha` | `TEXT` | PK | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `environment` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `previous_release_sha` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `deploy_mode` | `TEXT` | — | Yes | `'startup'` | — | `024_diagnostics_and_reliability.sql` |
| `client_bundle_version` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `first_seen_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `024_diagnostics_and_reliability.sql` |
| `last_seen_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `024_diagnostics_and_reliability.sql` |
| `startup_count` | `BIGINT` | — | Yes | `1` | — | `024_diagnostics_and_reliability.sql` |
| `notes` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |

- **Constraints (8)**: `diagnostic_releases_pkey` (PRIMARY KEY), `diagnostic_releases_release_sha_check` (CHECK), `diagnostic_releases_environment_check` (CHECK), `diagnostic_releases_previous_release_sha_check` (CHECK), `diagnostic_releases_deploy_mode_check` (CHECK), `diagnostic_releases_client_bundle_version_check` (CHECK), `diagnostic_releases_startup_count_check` (CHECK), `diagnostic_releases_notes_check` (CHECK)
- **Indexes (1)**: `idx_diagnostic_releases_first_seen`
- **RLS Policies (1)**:
  - `diagnostic_releases_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.diagnostics_internal`) — `024_diagnostics_and_reliability.sql`

### Table `favorites`
- **Created in**: `003_create_favorites.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `user_id` | `TEXT` | PK | Yes | — | — | `003_create_favorites.sql` |
| `truck_id` | `TEXT` | PK | Yes | — | — | `003_create_favorites.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `003_create_favorites.sql` |

- **Constraints (1)**: `PRIMARY KEY` (PRIMARY KEY)

### Table `feature_control_history`
- **Created in**: `022_feature_controls.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `BIGSERIAL` | PK | Yes | — | — | `022_feature_controls.sql` |
| `feature_key` | `TEXT` | — | Yes | — | — | `022_feature_controls.sql` |
| `previous_state` | `TEXT` | — | No | — | — | `022_feature_controls.sql` |
| `new_state` | `TEXT` | — | Yes | — | — | `022_feature_controls.sql` |
| `previous_audience` | `TEXT` | — | No | — | — | `022_feature_controls.sql` |
| `new_audience` | `TEXT` | — | Yes | — | — | `022_feature_controls.sql` |
| `revision` | `INTEGER` | — | Yes | — | — | `022_feature_controls.sql` |
| `actor_id` | `TEXT` | — | Yes | — | — | `022_feature_controls.sql` |
| `actor_role` | `TEXT` | — | Yes | — | — | `022_feature_controls.sql` |
| `change_source` | `TEXT` | — | Yes | — | — | `022_feature_controls.sql` |
| `reason` | `TEXT` | — | Yes | — | — | `022_feature_controls.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `022_feature_controls.sql` |

- **Constraints (11)**: `feature_control_history_pkey` (PRIMARY KEY), `feature_control_history_feature_key_check` (CHECK), `feature_control_history_previous_state_check` (CHECK), `feature_control_history_new_state_check` (CHECK), `feature_control_history_previous_audience_check` (CHECK), `feature_control_history_new_audience_check` (CHECK), `feature_control_history_revision_check` (CHECK), `feature_control_history_actor_id_check` (CHECK), `feature_control_history_actor_role_check` (CHECK), `feature_control_history_change_source_check` (CHECK), `feature_control_history_reason_check` (CHECK)
- **Indexes (2)**: `idx_feature_control_history_key_created`, `idx_feature_control_history_created_desc`
- **RLS Policies (2)**:
  - `feature_control_history_select_admin` (`FOR SELECT`, GUCs: `app.can_moderate`, `app.is_platform_admin`) — `022_feature_controls.sql`
  - `feature_control_history_insert_top_only` (`FOR INSERT`, GUCs: `app.is_platform_admin`) — `022_feature_controls.sql`

### Table `feature_controls`
- **Created in**: `022_feature_controls.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `feature_key` | `TEXT` | PK | Yes | — | — | `022_feature_controls.sql` |
| `configured_state` | `TEXT` | — | Yes | — | — | `022_feature_controls.sql` |
| `audience` | `TEXT` | — | Yes | `'all'` | — | `022_feature_controls.sql` |
| `revision` | `INTEGER` | — | Yes | `1` | — | `022_feature_controls.sql` |
| `reason` | `TEXT` | — | Yes | — | — | `022_feature_controls.sql` |
| `updated_by` | `TEXT` | — | Yes | — | — | `022_feature_controls.sql` |
| `updated_by_email_masked` | `TEXT` | — | No | — | — | `022_feature_controls.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `022_feature_controls.sql` |

- **Constraints (8)**: `feature_controls_pkey` (PRIMARY KEY), `feature_controls_feature_key_check` (CHECK), `feature_controls_configured_state_check` (CHECK), `feature_controls_audience_check` (CHECK), `feature_controls_revision_check` (CHECK), `feature_controls_reason_check` (CHECK), `feature_controls_updated_by_check` (CHECK), `feature_controls_updated_by_email_masked_check` (CHECK)
- **RLS Policies (3)**:
  - `feature_controls_select_policy` (`FOR SELECT`, GUCs: `app.can_moderate`, `app.feature_controls_read`, `app.is_platform_admin`) — `022_feature_controls.sql`
  - `feature_controls_write_top_only` (`FOR INSERT`, GUCs: `app.is_platform_admin`) — `022_feature_controls.sql`
  - `feature_controls_update_top_only` (`FOR UPDATE`, GUCs: `app.is_platform_admin`) — `022_feature_controls.sql`

### Table `notification_settings`
- **Created in**: `004_create_notification_settings.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `user_id` | `TEXT` | PK | Yes | — | — | `004_create_notification_settings.sql` |
| `nearby_enabled` | `BOOLEAN` | — | Yes | `true` | — | `004_create_notification_settings.sql` |
| `radius_miles` | `INTEGER` | — | Yes | `3` | — | `004_create_notification_settings.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `004_create_notification_settings.sql` |

- **Constraints (2)**: `notification_settings_pkey` (PRIMARY KEY), `notification_settings_radius_miles_check` (CHECK)

### Table `owner_profiles`
- **Created in**: `005_create_owner_profiles.sql` | **Altered in**: `011_vendor_authz_and_audit.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `truck_id` | `TEXT` | PK | Yes | — | `vendors(id)` (CASCADE) | `005_create_owner_profiles.sql` |
| `display_name` | `TEXT` | — | Yes | — | — | `005_create_owner_profiles.sql` |
| `description` | `TEXT` | — | No | — | — | `005_create_owner_profiles.sql` |
| `cuisine` | `TEXT` | — | No | — | — | `005_create_owner_profiles.sql` |
| `accepting_bookings` | `BOOLEAN` | — | Yes | `true` | — | `005_create_owner_profiles.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `005_create_owner_profiles.sql` |

- **Constraints (2)**: `owner_profiles_pkey` (PRIMARY KEY), `owner_profiles_vendor_fk` (FOREIGN KEY)

### Table `owner_schedule`
- **Created in**: `006_create_owner_schedule.sql` | **Altered in**: `011_vendor_authz_and_audit.sql`, `014_unified_discovery_catalog.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `006_create_owner_schedule.sql` |
| `truck_id` | `TEXT` | — | Yes | — | `vendors(id)` (CASCADE) | `006_create_owner_schedule.sql` |
| `service_date` | `DATE` | — | Yes | — | — | `006_create_owner_schedule.sql` |
| `opens_at` | `TIME` | — | No | — | — | `006_create_owner_schedule.sql` |
| `closes_at` | `TIME` | — | No | — | — | `006_create_owner_schedule.sql` |
| `location` | `TEXT` | — | No | — | — | `006_create_owner_schedule.sql` |
| `status` | `TEXT` | — | Yes | `'scheduled'` | — | `006_create_owner_schedule.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `014_unified_discovery_catalog.sql` |

- **Constraints (3)**: `owner_schedule_pkey` (PRIMARY KEY), `UNIQUE` (UNIQUE), `owner_schedule_vendor_fk` (FOREIGN KEY)

### Table `pager_notification_deliveries`
- **Created in**: `015_pager_notifications_outbox.sql` | **Altered in**: `016_pager_worker_fencing_and_catchup.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `015_pager_notifications_outbox.sql` |
| `event_id` | `UUID` | — | Yes | — | `pager_notification_events(id)` (CASCADE) | `015_pager_notifications_outbox.sql` |
| `subscription_id` | `UUID` | — | Yes | — | `pager_notification_subscriptions(id)` (CASCADE) | `015_pager_notifications_outbox.sql` |
| `pager_id` | `UUID` | — | Yes | — | `pickup_pagers(id)` (CASCADE) | `015_pager_notifications_outbox.sql` |
| `status` | `TEXT` | — | Yes | `'queued'` | — | `015_pager_notifications_outbox.sql` |
| `attempt_count` | `INTEGER` | — | Yes | `0` | — | `015_pager_notifications_outbox.sql` |
| `max_attempts` | `INTEGER` | — | Yes | `5` | — | `015_pager_notifications_outbox.sql` |
| `next_attempt_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `015_pager_notifications_outbox.sql` |
| `lease_owner` | `TEXT` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `lease_expires_at` | `TIMESTAMPTZ` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `provider_name` | `TEXT` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `provider_status` | `INTEGER` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `last_error_code` | `TEXT` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `last_error_redacted` | `TEXT` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `delivered_at` | `TIMESTAMPTZ` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `015_pager_notifications_outbox.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `015_pager_notifications_outbox.sql` |
| `claim_token` | `TEXT` | — | No | — | — | `016_pager_worker_fencing_and_catchup.sql` |
| `claimed_at` | `TIMESTAMPTZ` | — | No | — | — | `016_pager_worker_fencing_and_catchup.sql` |
| `dispatched_at` | `TIMESTAMPTZ` | — | No | — | — | `016_pager_worker_fencing_and_catchup.sql` |
| `delivery_origin` | `TEXT` | — | Yes | `'transition'` | — | `016_pager_worker_fencing_and_catchup.sql` |

- **Constraints (7)**: `pager_notification_deliveries_pkey` (PRIMARY KEY), `pager_notification_deliveries_status_check` (CHECK), `pager_notification_deliveries_attempt_count_check` (CHECK), `pager_notification_deliveries_max_attempts_check` (CHECK), `pager_delivery_event_sub_uidx` (UNIQUE), `pager_delivery_origin_chk` (CHECK), `pager_delivery_lease_consistency_chk` (CHECK)
- **Indexes (2)**: `pager_deliveries_claim_idx`, `pager_deliveries_pager_idx`
- **RLS Policies (1)**:
  - `pager_deliveries_internal_only` (`FOR ALL`, GUCs: `app.pager_internal`) — `015_pager_notifications_outbox.sql`

### Table `pager_notification_events`
- **Created in**: `015_pager_notifications_outbox.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `015_pager_notifications_outbox.sql` |
| `pager_id` | `UUID` | — | Yes | — | `pickup_pagers(id)` (CASCADE) | `015_pager_notifications_outbox.sql` |
| `vendor_id` | `TEXT` | — | No | — | `vendors(id)` (NO ACTION) | `015_pager_notifications_outbox.sql` |
| `event_type` | `TEXT` | — | Yes | — | — | `015_pager_notifications_outbox.sql` |
| `transition_seq` | `INTEGER` | — | Yes | — | — | `015_pager_notifications_outbox.sql` |
| `dedupe_key` | `TEXT` | — | Yes | — | — | `015_pager_notifications_outbox.sql` |
| `collapse_key` | `TEXT` | — | Yes | — | — | `015_pager_notifications_outbox.sql` |
| `payload` | `JSONB` | — | Yes | — | — | `015_pager_notifications_outbox.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `015_pager_notifications_outbox.sql` |
| `expires_at` | `TIMESTAMPTZ` | — | Yes | — | — | `015_pager_notifications_outbox.sql` |

- **Constraints (4)**: `pager_notification_events_pkey` (PRIMARY KEY), `pager_notification_events_event_type_check` (CHECK), `pager_notification_events_transition_seq_check` (CHECK), `pager_notification_events_dedupe_key_key` (UNIQUE)
- **Indexes (1)**: `pager_events_pager_idx`
- **RLS Policies (1)**:
  - `pager_events_internal_only` (`FOR ALL`, GUCs: `app.pager_internal`) — `015_pager_notifications_outbox.sql`

### Table `pager_notification_subscriptions`
- **Created in**: `015_pager_notifications_outbox.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `015_pager_notifications_outbox.sql` |
| `pager_id` | `UUID` | — | Yes | — | `pickup_pagers(id)` (CASCADE) | `015_pager_notifications_outbox.sql` |
| `channel` | `TEXT` | — | Yes | — | — | `015_pager_notifications_outbox.sql` |
| `destination_hash` | `TEXT` | — | Yes | — | — | `015_pager_notifications_outbox.sql` |
| `endpoint_url` | `TEXT` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `p256dh_key` | `TEXT` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `auth_secret` | `TEXT` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `device_token` | `TEXT` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `unsubscribe_token_hash` | `TEXT` | — | Yes | — | — | `015_pager_notifications_outbox.sql` |
| `status` | `TEXT` | — | Yes | `'active'` | — | `015_pager_notifications_outbox.sql` |
| `platform_hint` | `TEXT` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `invalidated_reason` | `TEXT` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `015_pager_notifications_outbox.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `015_pager_notifications_outbox.sql` |
| `expires_at` | `TIMESTAMPTZ` | — | Yes | — | — | `015_pager_notifications_outbox.sql` |

- **Constraints (5)**: `pager_notification_subscriptions_pkey` (PRIMARY KEY), `pager_notification_subscriptions_channel_check` (CHECK), `pager_notification_subscriptions_status_check` (CHECK), `pager_sub_unique_dest` (UNIQUE), `pager_sub_material_scrubbed_chk` (CHECK)
- **Indexes (1)**: `pager_sub_active_pager_idx`
- **RLS Policies (1)**:
  - `pager_sub_internal_only` (`FOR ALL`, GUCs: `app.pager_internal`) — `015_pager_notifications_outbox.sql`

### Table `pager_rate_limits`
- **Created in**: `015_pager_notifications_outbox.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `bucket_key` | `TEXT` | PK | Yes | — | — | `015_pager_notifications_outbox.sql` |
| `window_start` | `TIMESTAMPTZ` | PK | Yes | — | — | `015_pager_notifications_outbox.sql` |
| `hit_count` | `INTEGER` | — | Yes | `1` | — | `015_pager_notifications_outbox.sql` |

- **Constraints (2)**: `pager_rate_limits_hit_count_check` (CHECK), `PRIMARY KEY` (PRIMARY KEY)
- **RLS Policies (1)**:
  - `pager_ratelimit_internal_only` (`FOR ALL`, GUCs: `app.pager_internal`) — `015_pager_notifications_outbox.sql`

### Table `pickup_pagers`
- **Created in**: `008_pickup_pagers.sql` | **Altered in**: `011_vendor_authz_and_audit.sql`, `015_pager_notifications_outbox.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `uuid` | PK | Yes | `gen_random_uuid()` | — | `008_pickup_pagers.sql` |
| `request_key` | `uuid` | — | Yes | — | — | `008_pickup_pagers.sql` |
| `vendor` | `text` | — | Yes | — | — | `008_pickup_pagers.sql` |
| `ticket` | `text` | — | Yes | — | — | `008_pickup_pagers.sql` |
| `status` | `text` | — | Yes | `'cooking'` | — | `008_pickup_pagers.sql` |
| `created_at` | `timestamptz` | — | Yes | `now()` | — | `008_pickup_pagers.sql` |
| `updated_at` | `timestamptz` | — | Yes | `now()` | — | `008_pickup_pagers.sql` |
| `expires_at` | `timestamptz` | — | Yes | `now() + interval '24 hours'` | — | `008_pickup_pagers.sql` |
| `vendor_id` | `TEXT` | — | No | — | `vendors(id)` (RESTRICT) | `011_vendor_authz_and_audit.sql` |
| `created_by` | `TEXT` | — | No | — | — | `011_vendor_authz_and_audit.sql` |
| `updated_by` | `TEXT` | — | No | — | — | `011_vendor_authz_and_audit.sql` |
| `ready_notified_at` | `TIMESTAMPTZ` | — | No | — | — | `015_pager_notifications_outbox.sql` |
| `ready_notify_count` | `INTEGER` | — | Yes | `0` | — | `015_pager_notifications_outbox.sql` |

- **Constraints (5)**: `pickup_pagers_pkey` (PRIMARY KEY), `pickup_pagers_request_key_key` (UNIQUE), `pickup_pagers_vendor_check` (CHECK), `pickup_pagers_ticket_check` (CHECK), `pickup_pagers_status_check` (CHECK)

### Table `platform_role_revocations`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `user_id` | `TEXT` | PK | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `revoked_by` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `reason` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `revoked_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |

- **Constraints (4)**: `platform_role_revocations_pkey` (PRIMARY KEY), `platform_role_revocations_user_id_check` (CHECK), `platform_role_revocations_revoked_by_check` (CHECK), `platform_role_revocations_reason_check` (CHECK)

### Table `platform_roles`
- **Created in**: `011_vendor_authz_and_audit.sql` | **Altered in**: `018_admin_portal_onboarding_moderation_issues.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `user_id` | `TEXT` | PK | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `role` | `TEXT` | — | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `granted_by` | `TEXT` | — | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `011_vendor_authz_and_audit.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `notes` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |

- **Constraints (4)**: `platform_roles_pkey` (PRIMARY KEY), `platform_roles_user_id_check` (CHECK), `platform_roles_granted_by_check` (CHECK), `platform_roles_role_check` (CHECK)

### Table `schema_migrations`
- **Created in**: `scripts/run-migrations.cjs`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `filename` | `TEXT` | PK | Yes | — | — | `scripts/run-migrations.cjs` |
| `checksum_sha256` | `TEXT` | — | Yes | — | — | `scripts/run-migrations.cjs` |
| `applied_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `scripts/run-migrations.cjs` |

- **Constraints (1)**: `schema_migrations_pkey` (PRIMARY KEY)

### Table `support_issue_diagnostic_links`
- **Created in**: `025_support_feedback_and_diagnostic_links.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `issue_id` | `UUID` | — | Yes | — | `support_issues(id)` (CASCADE) | `025_support_feedback_and_diagnostic_links.sql` |
| `diagnostic_group_id` | `UUID` | — | Yes | — | `diagnostic_incident_groups(id)` (CASCADE) | `025_support_feedback_and_diagnostic_links.sql` |
| `diagnostic_fingerprint` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `link_state` | `TEXT` | — | Yes | `'confirmed'` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `linked_by` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `linked_by_role` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `link_reason` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `public_summary` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `fixing_release_sha` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `verification_status` | `TEXT` | — | Yes | `'unverified'` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `verification_note` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `unlinked_at` | `TIMESTAMPTZ` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `unlinked_by` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `unlink_reason` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `025_support_feedback_and_diagnostic_links.sql` |

- **Constraints (11)**: `support_issue_diagnostic_links_pkey` (PRIMARY KEY), `support_issue_diagnostic_links_diagnostic_fingerprint_check` (CHECK), `support_issue_diagnostic_links_link_state_check` (CHECK), `support_issue_diagnostic_links_linked_by_check` (CHECK), `support_issue_diagnostic_links_linked_by_role_check` (CHECK), `support_issue_diagnostic_links_link_reason_check` (CHECK), `support_issue_diagnostic_links_public_summary_check` (CHECK), `support_issue_diagnostic_links_fixing_release_sha_check` (CHECK), `support_issue_diagnostic_links_verification_status_check` (CHECK), `support_issue_diagnostic_links_verification_note_check` (CHECK), `support_issue_diagnostic_links_unlink_reason_check` (CHECK)
- **Indexes (2)**: `idx_support_diag_links_active` *(UNIQUE)*, `idx_support_diag_links_diag`
- **RLS Policies (2)**:
  - `support_diag_links_staff_all` (`FOR ALL`, GUCs: `app.admin_portal`, `app.can_moderate`, `app.diagnostics_internal`) — `025_support_feedback_and_diagnostic_links.sql`
  - `support_diag_links_reporter_public` (`FOR SELECT`, GUCs: `app.user_id`) — `025_support_feedback_and_diagnostic_links.sql`

### Table `support_issue_events`
- **Created in**: `025_support_feedback_and_diagnostic_links.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `issue_id` | `UUID` | — | Yes | — | `support_issues(id)` (CASCADE) | `025_support_feedback_and_diagnostic_links.sql` |
| `event_type` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `visibility` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `actor_user_id` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `actor_role` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `public_actor_label` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `summary` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `metadata` | `JSONB` | — | Yes | `'{}'::jsonb` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `025_support_feedback_and_diagnostic_links.sql` |

- **Constraints (8)**: `support_issue_events_pkey` (PRIMARY KEY), `support_issue_events_event_type_check` (CHECK), `support_issue_events_visibility_check` (CHECK), `support_issue_events_actor_user_id_check` (CHECK), `support_issue_events_actor_role_check` (CHECK), `support_issue_events_public_actor_label_check` (CHECK), `support_issue_events_summary_check` (CHECK), `support_issue_events_metadata_check` (CHECK)
- **Indexes (1)**: `idx_support_issue_events_issue`
- **RLS Policies (3)**:
  - `support_issue_events_staff_all` (`FOR ALL`, GUCs: `app.admin_portal`, `app.can_moderate`, `app.diagnostics_internal`) — `025_support_feedback_and_diagnostic_links.sql`
  - `support_issue_events_reporter_select` (`FOR SELECT`, GUCs: `app.user_id`) — `025_support_feedback_and_diagnostic_links.sql`
  - `support_issue_events_reporter_insert` (`FOR INSERT`, GUCs: `app.user_id`) — `025_support_feedback_and_diagnostic_links.sql`

### Table `support_issue_notes`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql` | **Altered in**: `025_support_feedback_and_diagnostic_links.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `issue_id` | `UUID` | — | Yes | — | `support_issues(id)` (CASCADE) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `author_user_id` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `author_role` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `visibility` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `body` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `author_display_label` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `idempotency_key` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |

- **Constraints (7)**: `support_issue_notes_pkey` (PRIMARY KEY), `support_issue_notes_author_user_id_check` (CHECK), `support_issue_notes_author_role_check` (CHECK), `support_issue_notes_visibility_check` (CHECK), `support_issue_notes_body_check` (CHECK), `support_issue_notes_display_label_chk` (CHECK), `support_issue_notes_idem_chk` (CHECK)
- **Indexes (2)**: `idx_support_issue_notes_issue`, `idx_support_issue_notes_idem` *(UNIQUE)*
- **RLS Policies (3)**:
  - `support_issue_notes_mod_all` (`FOR ALL`, GUCs: `app.can_moderate`) — `018_admin_portal_onboarding_moderation_issues.sql`
  - `support_issue_notes_reporter_visible` (`FOR SELECT`, GUCs: `app.user_id`) — `025_support_feedback_and_diagnostic_links.sql`
  - `support_issue_notes_reporter_insert` (`FOR INSERT`, GUCs: `app.user_id`) — `025_support_feedback_and_diagnostic_links.sql`

### Table `support_issue_notifications`
- **Created in**: `025_support_feedback_and_diagnostic_links.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `issue_id` | `UUID` | — | Yes | — | `support_issues(id)` (CASCADE) | `025_support_feedback_and_diagnostic_links.sql` |
| `recipient_user_id` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `event_kind` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `dedupe_key` | `TEXT` | — | Yes | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `delivery_status` | `TEXT` | — | Yes | `'in_app_only'` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `delivery_mode` | `TEXT` | — | Yes | `'disabled'` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `attempt_count` | `INTEGER` | — | Yes | `0` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `provider_status` | `INTEGER` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `provider_message_id` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `error_code` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `correlation_id` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `025_support_feedback_and_diagnostic_links.sql` |

- **Constraints (12)**: `support_issue_notifications_pkey` (PRIMARY KEY), `support_issue_notifications_recipient_user_id_check` (CHECK), `support_issue_notifications_event_kind_check` (CHECK), `support_issue_notifications_dedupe_key_check` (CHECK), `support_issue_notifications_delivery_status_check` (CHECK), `support_issue_notifications_delivery_mode_check` (CHECK), `support_issue_notifications_attempt_count_check` (CHECK), `support_issue_notifications_provider_status_check` (CHECK), `support_issue_notifications_provider_message_id_check` (CHECK), `support_issue_notifications_error_code_check` (CHECK), `support_issue_notifications_correlation_id_check` (CHECK), `UNIQUE` (UNIQUE)
- **Indexes (1)**: `idx_support_issue_notifs_issue`
- **RLS Policies (1)**:
  - `support_issue_notifs_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.auth_internal`, `app.can_moderate`, `app.user_id`) — `025_support_feedback_and_diagnostic_links.sql`

### Table `support_issues`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql` | **Altered in**: `025_support_feedback_and_diagnostic_links.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true` | **Runtime Role Revokes**: `REVOKE DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `reporter_user_id` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `reporter_email` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `reporter_context` | `TEXT` | — | Yes | `'customer'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `category` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `severity` | `TEXT` | — | Yes | `'normal'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `status` | `TEXT` | — | Yes | `'open'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `vendor_id` | `TEXT` | — | No | — | `vendors(id)` (SET NULL) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `related_booking_id` | `UUID` | — | No | — | `bookings(id)` (SET NULL) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `related_review_id` | `UUID` | — | No | — | `community_reviews(id)` (SET NULL) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `subject` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `description` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `confidential_reporter` | `BOOLEAN` | — | Yes | `true` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `assignee_user_id` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `resolution_reason` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `sla_due_at` | `TIMESTAMPTZ` | — | Yes | `(now() + interval '48 hours')` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `idempotency_key` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `resolved_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `ticket_number` | `TEXT` | — | Yes | `next_support_ticket_number()` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `entry_kind` | `TEXT` | — | Yes | `'problem'` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `sharing_scope` | `TEXT` | — | Yes | `'personal'` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `reporter_urgency` | `TEXT` | — | Yes | `'normal'` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `priority_updated_by` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `priority_updated_at` | `TIMESTAMPTZ` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `priority_change_reason` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `assigned_at` | `TIMESTAMPTZ` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `assigned_by` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `escalated_to_top` | `BOOLEAN` | — | Yes | `false` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `escalation_reason` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `waiting_for_team` | `BOOLEAN` | — | Yes | `true` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `reporter_last_read_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `staff_last_read_at` | `TIMESTAMPTZ` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `last_public_staff_activity_at` | `TIMESTAMPTZ` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `last_activity_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `reopen_count` | `INTEGER` | — | Yes | `0` | — | `025_support_feedback_and_diagnostic_links.sql` |
| `reopened_at` | `TIMESTAMPTZ` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `closed_at` | `TIMESTAMPTZ` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `affected_feature` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `operation_name` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `error_correlation_id` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `reported_occurred_at` | `TIMESTAMPTZ` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `server_release_sha` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `client_build_version` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `client_loaded_release_sha` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |
| `coarse_device_info` | `TEXT` | — | No | — | — | `025_support_feedback_and_diagnostic_links.sql` |

- **Constraints (25)**: `support_issues_pkey` (PRIMARY KEY), `support_issues_reporter_user_id_check` (CHECK), `support_issues_reporter_email_check` (CHECK), `support_issues_reporter_context_check` (CHECK), `support_issues_severity_check` (CHECK), `support_issues_subject_check` (CHECK), `support_issues_description_check` (CHECK), `support_issues_resolution_reason_check` (CHECK), `UNIQUE` (UNIQUE), `support_issues_category_check` (CHECK), `support_issues_status_check` (CHECK), `support_issues_ticket_number_chk` (CHECK), `support_issues_entry_kind_chk` (CHECK), `support_issues_sharing_scope_chk` (CHECK), `support_issues_reporter_urgency_chk` (CHECK), `support_issues_priority_reason_chk` (CHECK), `support_issues_escalation_reason_chk` (CHECK), `support_issues_reopen_count_chk` (CHECK), `support_issues_affected_feature_chk` (CHECK), `support_issues_operation_name_chk` (CHECK), `support_issues_error_corr_chk` (CHECK), `support_issues_server_sha_chk` (CHECK), `support_issues_client_build_chk` (CHECK), `support_issues_client_sha_chk` (CHECK), `support_issues_coarse_device_chk` (CHECK)
- **Indexes (7)**: `idx_support_issues_status_sla`, `idx_support_issues_reporter`, `idx_support_issues_vendor`, `idx_support_issues_ticket_number` *(UNIQUE)*, `idx_support_issues_assignee_status`, `idx_support_issues_corr`, `idx_support_issues_waiting_team`
- **RLS Policies (1)**:
  - `support_issues_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.can_moderate`, `app.user_id`) — `025_support_feedback_and_diagnostic_links.sql`

### Table `truck_settings`
- **Created in**: `002_create_truck_settings.sql` | **Altered in**: `011_vendor_authz_and_audit.sql`, `014_unified_discovery_catalog.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `truck_id` | `TEXT` | PK | Yes | — | `vendors(id)` (CASCADE) | `002_create_truck_settings.sql` |
| `location` | `TEXT` | — | Yes | — | — | `002_create_truck_settings.sql` |
| `is_open` | `BOOLEAN` | — | Yes | `true` | — | `002_create_truck_settings.sql` |
| `opens_at` | `TIME` | — | No | — | — | `002_create_truck_settings.sql` |
| `closes_at` | `TIME` | — | No | — | — | `002_create_truck_settings.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `002_create_truck_settings.sql` |
| `lat` | `DOUBLE PRECISION` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `lng` | `DOUBLE PRECISION` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `location_source` | `TEXT` | — | Yes | `'owner_reported'` | — | `014_unified_discovery_catalog.sql` |
| `location_accuracy` | `TEXT` | — | Yes | `'owner_text_only'` | — | `014_unified_discovery_catalog.sql` |
| `observed_at` | `TIMESTAMPTZ` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `expires_at` | `TIMESTAMPTZ` | — | No | — | — | `014_unified_discovery_catalog.sql` |

- **Constraints (7)**: `truck_settings_pkey` (PRIMARY KEY), `truck_settings_vendor_fk` (FOREIGN KEY), `truck_settings_lat_chk` (CHECK), `truck_settings_lng_chk` (CHECK), `truck_settings_coord_pair_chk` (CHECK), `truck_settings_loc_source_chk` (CHECK), `truck_settings_loc_accuracy_chk` (CHECK)

### Table `vendor_application_evidence`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `application_id` | `UUID` | — | Yes | — | `vendor_applications(id)` (CASCADE) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `uploaded_by` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `original_filename` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `mime_type` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `byte_size` | `INTEGER` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `sha256_hex` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `evidence_kind` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `file_bytes` | `BYTEA` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `retention_expires_at` | `TIMESTAMPTZ` | — | Yes | `(now() + interval '90 days')` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `deleted_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `deleted_by` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |

- **Constraints (7)**: `vendor_application_evidence_pkey` (PRIMARY KEY), `vendor_application_evidence_uploaded_by_check` (CHECK), `vendor_application_evidence_original_filename_check` (CHECK), `vendor_application_evidence_mime_type_check` (CHECK), `vendor_application_evidence_byte_size_check` (CHECK), `vendor_application_evidence_sha256_hex_check` (CHECK), `vendor_application_evidence_evidence_kind_check` (CHECK)
- **Indexes (1)**: `idx_vendor_application_evidence_app`
- **RLS Policies (1)**:
  - `vendor_application_evidence_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.user_id`) — `018_admin_portal_onboarding_moderation_issues.sql`

### Table `vendor_applications`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `applicant_user_id` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `applicant_email` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `claim_type` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `target_vendor_id` | `TEXT` | — | No | — | `vendors(id)` (SET NULL) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `proposed_slug` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `business_name` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `city` | `TEXT` | — | Yes | `'Santa Rosa'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `cuisine` | `TEXT` | — | Yes | `'Mexican'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `listing_kind` | `TEXT` | — | Yes | `'food_truck'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `service_area` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `contact_name` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `contact_email` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `contact_phone` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `website_or_menu_url` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `permit_or_license_summary` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `ownership_statement` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `status` | `TEXT` | — | Yes | `'draft'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `applicant_feedback` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `internal_notes` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `mod_recommendation` | `TEXT` | — | Yes | `'none'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `mod_recommended_by` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `mod_recommended_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `mod_recommendation_reason` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `decided_by` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `decided_role` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `decided_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `decision_reason` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `approved_vendor_id` | `TEXT` | — | No | — | `vendors(id)` (SET NULL) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `revision_count` | `INTEGER` | — | Yes | `0` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `submitted_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |

- **Constraints (27)**: `vendor_applications_pkey` (PRIMARY KEY), `vendor_applications_applicant_user_id_check` (CHECK), `vendor_applications_applicant_email_check` (CHECK), `vendor_applications_claim_type_check` (CHECK), `vendor_applications_proposed_slug_check` (CHECK), `vendor_applications_business_name_check` (CHECK), `vendor_applications_city_check` (CHECK), `vendor_applications_cuisine_check` (CHECK), `vendor_applications_listing_kind_check` (CHECK), `vendor_applications_service_area_check` (CHECK), `vendor_applications_contact_name_check` (CHECK), `vendor_applications_contact_email_check` (CHECK), `vendor_applications_contact_phone_check` (CHECK), `vendor_applications_website_or_menu_url_check` (CHECK), `vendor_applications_permit_or_license_summary_check` (CHECK), `vendor_applications_ownership_statement_check` (CHECK), `vendor_applications_status_check` (CHECK), `vendor_applications_applicant_feedback_check` (CHECK), `vendor_applications_internal_notes_check` (CHECK), `vendor_applications_mod_recommendation_check` (CHECK), `vendor_applications_mod_recommendation_reason_check` (CHECK), `vendor_applications_decided_role_check` (CHECK), `vendor_applications_decision_reason_check` (CHECK), `vendor_applications_revision_count_check` (CHECK), `vendor_applications_claim_target_chk` (CHECK), `vendor_applications_no_self_approval_chk` (CHECK), `vendor_applications_no_self_mod_rec_chk` (CHECK)
- **Indexes (3)**: `idx_vendor_applications_status`, `idx_vendor_applications_applicant`, `idx_vendor_applications_target_vendor`
- **RLS Policies (1)**:
  - `vendor_applications_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.user_id`) — `018_admin_portal_onboarding_moderation_issues.sql`

### Table `vendor_memberships`
- **Created in**: `011_vendor_authz_and_audit.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `vendor_id` | `TEXT` | PK | Yes | — | `vendors(id)` (CASCADE) | `011_vendor_authz_and_audit.sql` |
| `user_id` | `TEXT` | PK | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `role` | `TEXT` | — | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `granted_by` | `TEXT` | — | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `011_vendor_authz_and_audit.sql` |

- **Constraints (4)**: `vendor_memberships_user_id_check` (CHECK), `vendor_memberships_role_check` (CHECK), `vendor_memberships_granted_by_check` (CHECK), `PRIMARY KEY` (PRIMARY KEY)

### Table `vendor_status_history`
- **Created in**: `018_admin_portal_onboarding_moderation_issues.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false` | **Runtime Role Revokes**: `REVOKE UPDATE, DELETE`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `UUID` | PK | Yes | `gen_random_uuid()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `vendor_id` | `TEXT` | — | Yes | — | `vendors(id)` (CASCADE) | `018_admin_portal_onboarding_moderation_issues.sql` |
| `actor_id` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `actor_role` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `action` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `reason` | `TEXT` | — | Yes | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `before_state` | `JSONB` | — | Yes | `'{}'::jsonb` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `after_state` | `JSONB` | — | Yes | `'{}'::jsonb` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `018_admin_portal_onboarding_moderation_issues.sql` |

- **Constraints (5)**: `vendor_status_history_pkey` (PRIMARY KEY), `vendor_status_history_actor_id_check` (CHECK), `vendor_status_history_actor_role_check` (CHECK), `vendor_status_history_action_check` (CHECK), `vendor_status_history_reason_check` (CHECK)
- **Indexes (1)**: `idx_vendor_status_history_vendor`

### Table `vendors`
- **Created in**: `011_vendor_authz_and_audit.sql` | **Altered in**: `014_unified_discovery_catalog.sql`, `018_admin_portal_onboarding_moderation_issues.sql`
- **Row-Level Security**: Enabled = `false`, Forced = `false`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `id` | `TEXT` | PK | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `canonical_name` | `TEXT` | — | Yes | — | — | `011_vendor_authz_and_audit.sql` |
| `city` | `TEXT` | — | Yes | `'Sonoma County'` | — | `011_vendor_authz_and_audit.sql` |
| `cuisine` | `TEXT` | — | Yes | `'Global'` | — | `011_vendor_authz_and_audit.sql` |
| `listing_kind` | `TEXT` | — | Yes | `'food_truck'` | — | `011_vendor_authz_and_audit.sql` |
| `event_bookable` | `BOOLEAN` | — | Yes | `true` | — | `011_vendor_authz_and_audit.sql` |
| `is_active` | `BOOLEAN` | — | Yes | `true` | — | `011_vendor_authz_and_audit.sql` |
| `created_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `011_vendor_authz_and_audit.sql` |
| `sort_order` | `INTEGER` | — | Yes | `1000` | — | `014_unified_discovery_catalog.sql` |
| `section` | `TEXT` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `emoji` | `TEXT` | — | Yes | `'🚚'` | — | `014_unified_discovery_catalog.sql` |
| `kind_label` | `TEXT` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `listing_type` | `TEXT` | — | Yes | `'Mobile / catering'` | — | `014_unified_discovery_catalog.sql` |
| `popup` | `BOOLEAN` | — | Yes | `false` | — | `014_unified_discovery_catalog.sql` |
| `extra` | `BOOLEAN` | — | Yes | `false` | — | `014_unified_discovery_catalog.sql` |
| `blurb` | `TEXT` | — | Yes | `'Find local food and` | — | `014_unified_discovery_catalog.sql` |
| `special_note` | `TEXT` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `source_url` | `TEXT` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `story_source_url` | `TEXT` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `checked_label` | `TEXT` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `price` | `TEXT` | — | Yes | `'$$'` | — | `014_unified_discovery_catalog.sql` |
| `color` | `TEXT` | — | Yes | `'#ff6b5f'` | — | `014_unified_discovery_catalog.sql` |
| `tags` | `TEXT[]` | — | Yes | `ARRAY[]::TEXT[]` | — | `014_unified_discovery_catalog.sql` |
| `rating` | `NUMERIC(2,1)` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `reviews` | `INTEGER` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `featured` | `BOOLEAN` | — | Yes | `false` | — | `014_unified_discovery_catalog.sql` |
| `curated_location` | `TEXT` | — | Yes | `'Sonoma County service area · location varies'` | — | `014_unified_discovery_catalog.sql` |
| `curated_lat` | `DOUBLE PRECISION` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `curated_lng` | `DOUBLE PRECISION` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `curated_location_source` | `TEXT` | — | Yes | `'curated_illustrative'` | — | `014_unified_discovery_catalog.sql` |
| `curated_location_accuracy` | `TEXT` | — | Yes | `'illustrative_pin'` | — | `014_unified_discovery_catalog.sql` |
| `curated_hours` | `TEXT` | — | Yes | `'Schedule not verified · contact vendor'` | — | `014_unified_discovery_catalog.sql` |
| `recurring_schedule` | `JSONB` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `verified` | `BOOLEAN` | — | Yes | `false` | — | `014_unified_discovery_catalog.sql` |
| `verification_status` | `TEXT` | — | Yes | `'needs_review'` | — | `014_unified_discovery_catalog.sql` |
| `photo` | `TEXT` | — | No | — | — | `014_unified_discovery_catalog.sql` |
| `photo_rights_verified` | `BOOLEAN` | — | Yes | `false` | — | `014_unified_discovery_catalog.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `014_unified_discovery_catalog.sql` |
| `ownership_status` | `TEXT` | — | Yes | `'unclaimed'` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `hidden_from_discovery` | `BOOLEAN` | — | Yes | `false` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `bookings_restricted` | `BOOLEAN` | — | Yes | `false` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `vendor_access_suspended` | `BOOLEAN` | — | Yes | `false` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `pager_restricted` | `BOOLEAN` | — | Yes | `false` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `needs_info_correction` | `BOOLEAN` | — | Yes | `false` | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `correction_note` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `restriction_reason` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `restricted_by` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `restriction_authority` | `TEXT` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `restricted_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |
| `temp_restriction_expires_at` | `TIMESTAMPTZ` | — | No | — | — | `018_admin_portal_onboarding_moderation_issues.sql` |

- **Constraints (12)**: `vendors_pkey` (PRIMARY KEY), `vendors_id_check` (CHECK), `vendors_canonical_name_check` (CHECK), `vendors_listing_kind_check` (CHECK), `vendors_curated_lat_chk` (CHECK), `vendors_curated_lng_chk` (CHECK), `vendors_curated_coord_pair_chk` (CHECK), `vendors_curated_loc_source_chk` (CHECK), `vendors_curated_loc_accuracy_chk` (CHECK), `vendors_verification_consistency_chk` (CHECK), `vendors_ownership_status_chk` (CHECK), `vendors_restriction_authority_chk` (CHECK)
- **Indexes (1)**: `vendors_active_sort_idx`

### Table `worker_runtime_heartbeats`
- **Created in**: `024_diagnostics_and_reliability.sql`
- **Row-Level Security**: Enabled = `true`, Forced = `true`

| Column | SQL Type | PK | Not Null | Default | Foreign Key | Origin Migration |
|---|---|---|---|---|---|---|
| `worker_name` | `TEXT` | PK | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `last_run_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `024_diagnostics_and_reliability.sql` |
| `last_status` | `TEXT` | — | Yes | — | — | `024_diagnostics_and_reliability.sql` |
| `release_sha` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `last_correlation_id` | `TEXT` | — | No | — | — | `024_diagnostics_and_reliability.sql` |
| `last_summary` | `JSONB` | — | Yes | `'{}'::jsonb` | — | `024_diagnostics_and_reliability.sql` |
| `updated_at` | `TIMESTAMPTZ` | — | Yes | `now()` | — | `024_diagnostics_and_reliability.sql` |

- **Constraints (6)**: `worker_runtime_heartbeats_pkey` (PRIMARY KEY), `worker_runtime_heartbeats_worker_name_check` (CHECK), `worker_runtime_heartbeats_last_status_check` (CHECK), `worker_runtime_heartbeats_release_sha_check` (CHECK), `worker_runtime_heartbeats_last_correlation_id_check` (CHECK), `worker_runtime_heartbeats_last_summary_check` (CHECK)
- **RLS Policies (1)**:
  - `worker_runtime_heartbeats_rls` (`FOR ALL`, GUCs: `app.admin_portal`, `app.diagnostics_internal`, `app.worker_internal`) — `024_diagnostics_and_reliability.sql`

## 4. Views, SQL Functions & Triggers

- **View**: `community_public_posts` (`013_harden_community_privacy.sql`)
- **Function**: `enforce_bookings_integrity()` (`012_harden_bookings.sql`)
- **Function**: `enforce_community_reviews_guard()` (`018_admin_portal_onboarding_moderation_issues.sql`)
- **Function**: `enforce_pickup_pager_vendor_id()` (`011_vendor_authz_and_audit.sql`)
- **Function**: `enforce_support_issues_immutable_fields()` (`025_support_feedback_and_diagnostic_links.sql`)
- **Function**: `guard_membership_grant()` (`011_vendor_authz_and_audit.sql`)
- **Function**: `is_last_top_cleanup_authorized()` (`026_urgent_pilot_security_hardening.sql`)
- **Function**: `next_support_ticket_number()` (`025_support_feedback_and_diagnostic_links.sql`)
- **Function**: `protect_last_top_admin()` (`026_urgent_pilot_security_hardening.sql`)
- **Function**: `protect_last_top_admin_on_auth_users()` (`026_urgent_pilot_security_hardening.sql`)
- **Trigger**: `trg_enforce_bookings_integrity` (`BEFORE INSERT OR UPDATE ON bookings`, `012_harden_bookings.sql`)
- **Trigger**: `trg_enforce_community_reviews_guard` (`BEFORE INSERT OR UPDATE ON community_reviews`, `013_harden_community_privacy.sql`)
- **Trigger**: `trg_enforce_pickup_pager_vendor_id` (`BEFORE INSERT OR UPDATE ON pickup_pagers`, `011_vendor_authz_and_audit.sql`)
- **Trigger**: `trg_guard_membership_grant` (`BEFORE INSERT OR UPDATE ON vendor_memberships`, `011_vendor_authz_and_audit.sql`)
- **Trigger**: `trg_protect_last_top_admin` (`BEFORE UPDATE OR DELETE ON platform_roles`, `026_urgent_pilot_security_hardening.sql`)
- **Trigger**: `trg_protect_last_top_admin_on_auth_users` (`BEFORE UPDATE OR DELETE ON auth_users`, `026_urgent_pilot_security_hardening.sql`)
- **Trigger**: `trg_support_issues_immutable` (`BEFORE UPDATE ON support_issues`, `025_support_feedback_and_diagnostic_links.sql`)
