# Call-outcome candidate: dependency and parity manifest

Status (2026-11-12): SOURCE/TEST BASELINE REVIEW ONLY. Production catalog parity is NOT verified. Two read-only Supabase attempts ended in automatic-review timeouts; neither returned catalog or business rows. No further retries were made. No production candidate functions were executed. SQL remains hard-stopped source, not a migration.

## Direct existing-schema dependencies

All names below are in `public`. IDs/FKs are UUID, timestamps timestamptz, metadata/snapshot/definition/payload/details/permissions JSONB unless stated otherwise. The actual production types, nullability, defaults, generated columns, RLS and triggers must be compared, not assumed from this list.

| Table | Columns read/written directly |
| --- | --- |
| luxor_inquiries | id, email, phone, status, archived_at, is_test, marketing_opt_in, metadata; follow_up_disposition, follow_up_disposition_reason, follow_up_disposition_updated_at |
| luxor_tasks | id, inquiry_id, status, completed_at, automation_enrollment_id, automation_step_key, description; title, due_at, due_date(date), priority, assigned_to, task_type, call_outcome, post_tour_reopen_cancelled(bool), post_tour_user_modified(bool) |
| luxor_notes | id(default UUID), inquiry_id, content, note_type, author, task_id |
| luxor_follow_up_enrollments | id, inquiry_id, status, ended_reason, updated_at, response_received_at |
| luxor_follow_up_actions | enrollment_id, task_id, step_key, status, completed_at, outcome, updated_at; id for ordered locking |
| luxor_custom_workflows | id, current_version_id, status |
| luxor_custom_workflow_versions | id, workflow_id, definition |
| luxor_custom_workflow_enrollments | id(default UUID), workflow_id, workflow_version_id, source_event_id, inquiry_id, status, stopped_at, next_run_at, stop_reason, updated_at, current_step_id |
| luxor_custom_workflow_step_runs | id(default UUID), enrollment_id, workflow_version_id, step_id, step_order(integer), channel, status, last_error, snapshot, completed_at, updated_at, idempotency_key, scheduled_for |
| luxor_custom_workflow_source_events | id(default UUID), event_key, trigger_type, inquiry_id, payload, status, processed_at |
| luxor_custom_workflow_activity | workflow_id, enrollment_id, step_run_id, event_type, actor_email, details; other required columns must have defaults |
| luxor_email_jobs | id, inquiry_id, status, automation_enrollment_id, job_type, custom_workflow_step_run_id, last_error, updated_at, metadata, recipient_email |
| luxor_text_jobs | id, inquiry_id, status, job_type, custom_workflow_step_run_id, last_error, updated_at |
| luxor_bookings | inquiry_id, contract_status, status |
| luxor_portal_members | email, status, role, permissions |
| luxor_marketing_suppressions | email |
| luxor_sms_consents | phone_number, status, consent_scopes(text[]) |

Transitive helper dependencies include custom runtime controls, follow-up automations/templates, SMS consent and marketing suppression logic, source/event capture, tour tables and current inquiry tour fields. Inventory these by actual `pg_get_functiondef` and trigger definitions before rollout.

## Existing functions called directly

- `luxor_custom_workflow_definition_is_structural(jsonb) -> boolean`
- `luxor_custom_workflow_definition_is_runnable(jsonb) -> boolean`
- `luxor_custom_workflow_runtime_enabled() -> boolean`
- `luxor_custom_workflow_authoring_enabled() -> boolean`
- `luxor_custom_workflow_manual_enroll(uuid,uuid[],text) -> TABLE(enrolled_count integer,already_enrolled_count integer,skipped_count integer)`
- `luxor_workflow_normalize_phone(text) -> text`

Built-ins include gen_random_uuid(), md5(text), isfinite(timestamptz), make_interval, JSONB operators, and named timezone America/Chicago. Empty search_path still resolves pg_catalog built-ins. Confirm PostgreSQL version and timezone availability.

Manual-enroll must be the deduplicating implementation from 20261103132905 or equivalent: runtime/authoring gates, active marketing operator, workflow lock, active immutable version, existing eligibility, unique version/client semantics, no provider sends. Its existing acknowledgment skip calls the real schedule helper. Do not replace those helpers with permissive test stubs and call it parity.

## Values/constraints relied upon

- Tasks: pending/completed/cancelled; priority medium; task_type call/email; call_outcome no_answer/voicemail_left/reached.
- Notes: note_type status_change, nullable task_id.
- Brochure enrollments: active/paused/stopped; ended_reason manual_stop. Actions: scheduled/email_queued/task_created/processing -> cancelled, exact selected action -> completed.
- Custom enrollments: active/paused/held -> stopped with stopped_at set and next_run_at NULL. Existing completed/stopped timestamp checks must remain consistent.
- Runs: scheduled/queued/failed/held -> cancelled; sending and provider_outcome_unknown are conflicts. Terminal acknowledgment prefix must be completed with completed_at and no run error. Only prospect-classified runs are cancelled.
- Queues: queued/failed -> cancelled; sending conflicts only for prospect work. Original independent acknowledgment jobs and all transactional-only workflow jobs remain unchanged.
- Events: trigger_type manual, status consumed, processed_at populated. Activity event_type manual_enrollment_created.
- Staff: active; nurture/restart/batch additionally owner or marketing permission. Ordinary call resolution requires active staff, with verified approved staff enforced by route.
- Lead disposition not_interested; eligibility no_response. Bookings signed + confirmed/completed block new prospect scheduling/enrollment.
- Consent: opted_in with text[] containing marketing and EXACT existing canonical phone helper match; no consent is created or restored.
- Existing uniqueness: custom enrollment(workflow_id,workflow_version_id,inquiry_id); source event event_key; run idempotency_key; enrollment/version FK and step-run enrollment/version FK. Same-version restart remains prohibited.

## Producer and acknowledgment assumptions

Seven INSERT/UPDATE admission triggers cover brochure enrollments/actions, custom enrollments/runs, tasks, email jobs, text jobs. Prospect writes share inquiry FOR UPDATE NOWAIT. Caller must treat rejected claim/queue writes as no-send; provider calls must occur only after successful persisted claims. Catalog/source inventory must confirm no alternate producer/claim path bypasses these surfaces or ignores errors.

The current TS activation path requires contact-form versions to begin with existing inquiry acknowledgment. The real consumer links a marker to `marketing_campaign` with metadata.source `inquiry_acknowledgment`; that original job is independent of enrollment. Mixed stop now requires exact terminal marker plus immutable order/version, exact original lead/recipient/source and no automation/custom ownership, consumed automatic source event with exact contact_form_inquiry_created:<lead> key and payload.flow contact_form, OR exact explicit-manual source skip evidence. Independent receipt status may be queued/sending/sent/ambiguous and is not changed or represented as stopped. Any owned acknowledgment email/text job, missing/mismatched proof, nonterminal marker or future transactional step is rejected. New mixed enrollments are prospect-bearing for admission even before prefix completion.

Brochure next steps are precreated by luxorFollowUpsServer.ts enrollment loop; completing a call does not synthesize another successor. Current custom scheduler advances when creating a call task; resolver must not advance it again. Production versions of both behaviors must match tests.

## Synthetic baseline coverage and concrete gaps

`tests/postgres/call-outcome-resolution-baseline.sql` creates synthetic inquiry/booking/queue/task/note/consent/staff tables, then loads real brochure migrations (2026100501..06, 2026100801..02), custom foundation/expansion/definition/eligibility/manual/dedup, normalized phone, tour outbox/enrollment/recipient fence, and manual calendar task migration. It is NOT a clone or full current migration chain.

Notably absent or synthetic rather than production-equivalent:

- Production portal-members schema, permissions policies, role ownership and grants; baseline staff table is a minimal email/status/role/permissions table.
- Real inquiry/task/note/booking schema checks, defaults, RLS and all unrelated triggers. `post_tour_reopen_cancelled` and `post_tour_user_modified` are synthetic columns, not proof actual per-visit trigger effects match.
- Later brochure stop/recovery/test-lead/archive behavior and 20261105152250 booked-follow-up guards are not all applied in this baseline.
- Real per-visit/post-tour task sync, notification, automation-capture and booking/payment triggers may run on candidate writes; full trigger inventory/definitions required.
- Production migrations/default ACL history, schema CREATE rights, function owners, privileges through role membership and overloads.
- Actual active immutable definitions and enrollment mix; production impact counts could not be obtained. Standard source definition itself is confirmed mixed, but no live prevalence is asserted.
- Any out-of-repository worker or deployed legacy helper; successful isolated races do not verify live deployed producer code.

## Security and install gates

New tables enable RLS and revoke PUBLIC/anon/authenticated/service_role mutations; service_role SELECT only. Helpers are SECURITY DEFINER with empty search_path, execute revoked from ordinary callers. Public RPCs grant only service_role and use actor supplied by verified server session; they do not cryptographically authenticate p_actor on their own. Keep service_role secret server-side.

Confirm installer/definer owner can access all dependencies and perform row locks despite RLS, while untrusted roles cannot CREATE in public, change definitions, invoke private helpers, or inherit broad execution. Inspect pg_default_acl, pg_roles, role memberships, namespace ACL, table owner/RLS/FORCE RLS and function ACL/config. Candidate has no explicit OWNER TO; installer identity matters. Existing signature collisions/overloads or default-argument ambiguity must be checked. In particular batch is five-argument (last bool default true), server always explicitly passes its derived allow-new gate; there must not be a stale four-argument overload.

Production packaging must be one reviewed transaction with bounded lock/statement timeout, catalog preflight and postinstall ACL/function/trigger assertions. Removing the guard alone does not make this source install-ready. Do not disable existing security/consent/booking triggers to make tests pass.

## Required read-only production catalog evidence

For the exact tables above collect information_schema.columns, pg_constraint definitions, pg_indexes (including partial/unique predicates), pg_trigger definitions and trigger-function definitions; pg_proc identity arguments/results/body hash/owner/security-definer/proconfig/ACL for helpers and candidate-name collisions; pg_class RLS flags/owner/ACL; namespace/default privileges and relevant role memberships. Compare actual live helpers with intended migration sources. Separately aggregate immutable version step type/mode/scope and active enrollment counts without contact data. No catalog result is currently available; all parity conclusions remain pending.
