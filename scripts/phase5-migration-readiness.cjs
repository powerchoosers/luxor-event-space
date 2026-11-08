/* eslint-disable no-console */
/**
 * Read-only checklist for Lewis before/after applying the Phase 5 migration batch.
 * Does not connect to Supabase or apply SQL.
 */
const batch = [
  '20261108031817_luxor_archive_bill_vendor.sql',
  '20261108032405_luxor_vendor_profiles_and_bill_plans.sql',
  '20261108040719_luxor_vendor_name_guard.sql',
  '20261108042619_luxor_vendor_claim_archive_completion.sql',
  '20261108044218_luxor_vendor_document_audit.sql',
]

const optionalWithPhase5 = [
  '20261108031232_luxor_bill_history_guards.sql — DB trigger: bill paid status requires linked expense payment lines',
]

console.log('Phase 5 production migration batch (apply in order, scope only these five):')
for (const file of batch) console.log(`  - supabase/migrations/${file}`)
console.log('\nOptional same release (ask Lewis — aligns app honest-settlement rules):')
for (const line of optionalWithPhase5) console.log(`  - supabase/migrations/${line}`)

console.log(`
Already on production (do not re-apply):
  - 20261108210000_luxor_manual_bill_request_id.sql

After apply, verify in SQL (Luxor project):
  - luxor_bill_reminder_preferences exists
  - luxor_bill_payment_plans exists + luxor_create_bill_payment_plan / luxor_read_bill_payment_plans RPCs
  - luxor_vendor_documents + luxor_vendor_document_claims exist
  - luxor_bills.archived_at and luxor_vendors.archived_at exist
  - luxor_vendors.contact_person exists

Then in portal (light mode first):
  - /portal/finances/bills — save reminder prefs on a linked bill; list appears when balance verified
  - Operations bill review — save payment plan; cancel/close plan
  - Archive panel — archive and restore a test vendor or bill
  - Vendor profile — upload PDF; open download
  - Edit vendor — full profile fields persist

Local regression before release:
  npm run test:phase5-bills
  npm run lint -- --quiet
  npm run typecheck
`)
