import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const policySource = fs.readFileSync(path.join(root, 'src/lib/luxorTestLeadPolicy.ts'), 'utf8')
const inquiryTypesSource = fs.readFileSync(path.join(root, 'src/lib/luxorInquiryTypes.ts'), 'utf8')
const idempotencySource = fs.readFileSync(path.join(root, 'src/lib/luxorSubmissionIdempotency.ts'), 'utf8')
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261015010000_permanent_test_lead_runs.sql'), 'utf8')
const inquiryRoute = fs.readFileSync(path.join(root, 'src/app/api/inquiries/route.ts'), 'utf8')
const newsletterRoute = fs.readFileSync(path.join(root, 'src/app/api/newsletter/route.ts'), 'utf8')
const elenaActionsRoute = fs.readFileSync(path.join(root, 'src/app/api/portal/elena-chat/actions/route.ts'), 'utf8')
const inquiriesServer = fs.readFileSync(path.join(root, 'src/lib/luxorInquiriesServer.ts'), 'utf8')
const inquiryTypes = fs.readFileSync(path.join(root, 'src/lib/luxorInquiryTypes.ts'), 'utf8')
const testPanel = fs.readFileSync(path.join(root, 'src/components/portal/LuxorTestLeadPanel.tsx'), 'utf8')
const emailWorker = fs.readFileSync(path.join(root, 'src/lib/luxorEmailJobsServer.ts'), 'utf8')
const resendWebhook = fs.readFileSync(path.join(root, 'src/lib/luxorResendWebhookServer.ts'), 'utf8')
const supabaseRestServer = fs.readFileSync(path.join(root, 'src/lib/supabaseRestServer.ts'), 'utf8')
const testLeadRoute = fs.readFileSync(path.join(root, 'src/app/api/portal/test-lead/route.ts'), 'utf8')

const policyJs = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const policy = await import(`data:text/javascript;base64,${Buffer.from(policyJs).toString('base64')}`)
const inquiryTypesJs = ts.transpileModule(inquiryTypesSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const inquiryTypesModule = await import(`data:text/javascript;base64,${Buffer.from(inquiryTypesJs).toString('base64')}`)
const idempotencyJs = ts.transpileModule(idempotencySource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const idempotencyModule = await import(`data:text/javascript;base64,${Buffer.from(idempotencyJs).toString('base64')}`)

const settings = { enabled: true, identification_email: 'test@example.invalid', identification_phone: '2149600276' }

test('empty contacts and partial identifiers never classify a submission as test', () => {
  assert.equal(policy.matchesTestLeadIdentifiers({}, settings), false)
  assert.equal(policy.matchesTestLeadIdentifiers({ email: 'test@' }, settings), false)
  assert.equal(policy.matchesTestLeadIdentifiers({ phone: '214-960' }, settings), false)
  assert.equal(policy.matchesTestLeadIdentifiers({ phone: '' }, settings), false)
  assert.equal(policy.matchesTestLeadIdentifiers({ email: 'test@example.invalid' }, null), false)
  assert.equal(policy.matchesTestLeadIdentifiers({ email: 'test@example.invalid' }, { ...settings, enabled: false }), false)
})

test('exact configured email and normalized complete phone classify independently', () => {
  assert.equal(policy.matchesTestLeadIdentifiers({ email: ' TEST@example.invalid ' }, settings), true)
  assert.equal(policy.matchesTestLeadIdentifiers({ phone: '(214) 960-0276' }, settings), true)
  assert.equal(policy.matchesTestLeadIdentifiers({ email: 'test@example.invalid.evil' }, settings), false)
  assert.equal(policy.matchesTestLeadIdentifiers({ phone: '12149600276' }, settings), false)
})

test('only exact owner-confirmed historical IDs are excluded from revenue analytics while remaining unflagged', () => {
  const knownId = 'ce4a7a94-abd7-402f-bac4-156af405ffb1'
  assert.equal(inquiryTypesModule.isLuxorTestInquiry({ id: knownId, is_test: false }), false)
  assert.equal(inquiryTypesModule.isLuxorNonRevenueTestInquiry({ id: knownId, is_test: false }), true)
  assert.equal(inquiryTypesModule.isLuxorNonRevenueTestInquiry({ id: 'new-customer', is_test: false }), false)
  assert.equal(inquiryTypesModule.isLuxorNonRevenueTestInquiry({ id: 'permanent-test', is_test: true }), true)
})

test('same payload reuses an idempotency key after uncertain failure and clears it after success', async () => {
  const savedStorage = globalThis.sessionStorage
  const savedFetch = globalThis.fetch
  const values = new Map()
  const sentKeys = []
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } })
  globalThis.fetch = async (_path, options) => {
    sentKeys.push(options.headers['Idempotency-Key'])
    if (sentKeys.length === 1) throw new Error('connection reset after request may have reached server')
    return new Response('{}', { status: 201 })
  }
  try {
    await assert.rejects(idempotencyModule.submitLuxorIdempotentForm('test-form', '/api/inquiries', { email: 'x@example.invalid' }))
    await idempotencyModule.submitLuxorIdempotentForm('test-form', '/api/inquiries', { email: 'x@example.invalid' })
    assert.equal(sentKeys[0], sentKeys[1])
    await idempotencyModule.submitLuxorIdempotentForm('test-form', '/api/inquiries', { email: 'x@example.invalid' })
    assert.notEqual(sentKeys[1], sentKeys[2])
  } finally {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: savedStorage })
    globalThis.fetch = savedFetch
  }
})

test('database start and settings RPCs reject collisions with every unflagged inquiry', () => {
  assert.match(migration, /where inquiry\.is_test is not true[\s\S]*lower\(trim\(coalesce\(inquiry\.email, ''\)\)\) = v_email[\s\S]*regexp_replace\(coalesce\(inquiry\.phone, ''\)/)
  assert.match(migration, /if v_conflicts > 0 then[\s\S]*unflagged customer records/)
  assert.match(migration, /from public\.luxor_test_runs[\s\S]*where test_lead_id = v_lead\.id and idempotency_key = p_idempotency_key/)
  assert.match(migration, /create unique index if not exists luxor_test_runs_one_active_per_lead_idx/)
  assert.match(migration, /alter table public\.luxor_test_run_activity enable row level security/)
  assert.match(migration, /inquiry\.is_test is not true[\s\S]*not exists \([\s\S]*exemption\.inquiry_id = inquiry\.id/)
  const exemptions = [...migration.matchAll(/\('([0-9a-f-]{36})', 'owner_confirmed_legacy_test'\)/g)].map((match) => match[1])
  assert.equal(exemptions.length, 10)
  assert.equal(new Set(exemptions).size, 10)
  assert.deepEqual(exemptions.sort(), [...inquiryTypesModule.LUXOR_OWNER_CONFIRMED_LEGACY_TEST_INQUIRY_IDS].sort())
  assert.match(migration, /1, true, 'luxoratlaspalmas@gmail\.com', '2149600276'[\s\S]*'luxoratlaspalmas@gmail\.com', now\(\)/)
})

test('test inquiry and newsletter matches branch before all production inquiry side effects', () => {
  const testBranch = inquiryRoute.indexOf('if (testClassification.matches)')
  const eventWrite = inquiryRoute.indexOf('await recordLuxorPublicEvent({', testBranch)
  const normalCreate = inquiryRoute.indexOf('createLuxorInquiry(payload', testBranch)
  assert.ok(testBranch > 0 && eventWrite > testBranch && normalCreate > eventWrite)
  assert.match(inquiryRoute.slice(testBranch, eventWrite), /startLuxorTestRun/)
  const newsBranch = newsletterRoute.indexOf('if (testClassification.matches)')
  const newsEvent = newsletterRoute.indexOf('await recordLuxorPublicEvent', newsBranch)
  const newsCreate = newsletterRoute.indexOf('createLuxorInquiry(input', newsBranch)
  assert.ok(newsBranch > 0 && newsEvent > newsBranch && newsCreate > newsEvent)
  assert.match(newsletterRoute.slice(newsBranch, newsEvent), /startLuxorTestRun/)
})

test('every lead creation route sends exact test matches through idempotent run creation', () => {
  assert.match(inquiryRoute, /request\.headers\.get\('idempotency-key'\)/)
  assert.match(newsletterRoute, /request\.headers\.get\('idempotency-key'\)/)
  const internalBranch = elenaActionsRoute.indexOf('if (testClassification.matches)')
  const internalCreate = elenaActionsRoute.indexOf('createLuxorInquiry(inquiryInput)')
  assert.ok(internalBranch > 0 && internalCreate > internalBranch)
  assert.match(elenaActionsRoute.slice(internalBranch, internalCreate), /startLuxorTestRun/)
})

test('pinned test card is separate from ordinary pipeline filtering and offers guarded controls', () => {
  const leadsPage = fs.readFileSync(path.join(root, 'src/app/(portal)/portal/leads/page.tsx'), 'utf8')
  assert.match(leadsPage, /if \(isLuxorTestInquiry\(lead\)\) return false/)
  assert.match(leadsPage, /activeTab === 'pipeline'[\s\S]*LuxorTestLeadPanel/)
  assert.match(testPanel, /aria-label="Pinned test lead"/)
  assert.match(testPanel, /Test History/)
  assert.match(testPanel, /Test Settings/)
  assert.match(testPanel, /Reset Pipeline/)
  assert.match(testPanel, /window\.confirm\(/)
  assert.match(testPanel, /href=\{`\/portal\/leads\/\$\{leadId\}`\}/)
  assert.match(testPanel, /setRecipient\(event\.target\.value\); setConfirmed\(false\)/)
  const testLeadServer = fs.readFileSync(path.join(root, 'src/lib/luxorTestLeadServer.ts'), 'utf8')
  assert.match(testLeadServer, /const settings = await getLuxorTestSettings\(\)[\s\S]*return \{ settings, matches:/)
  assert.doesNotMatch(testLeadServer.slice(testLeadServer.indexOf('export async function isConfiguredTestSubmission'), testLeadServer.indexOf('export async function startLuxorTestRun')), /catch/)
  assert.match(migration, /before update or delete on public\.luxor_test_run_activity/)
})

test('test email jobs are run-fenced, recipient-overridden, and track provider acceptance separately from delivery', () => {
  assert.match(migration, /job_type <> 'test_notification'/)
  assert.match(migration, /coalesce\(v_job\.metadata ->> 'test_email', 'false'\) <> 'true'/)
  assert.match(migration, /update public\.luxor_email_jobs set status = 'sending'/)
  assert.match(emailWorker, /rpc\/luxor_authorize_test_email_job/)
  assert.match(emailWorker, /recipient_email: authorization\.recipient/)
  assert.match(emailWorker, /provider_status: 'accepted',[\s\S]*delivery_status: 'unknown'/)
  assert.match(resendWebhook, /delivery_status: deliveryStatus/)
})

test('missing test schema is treated as unavailable while normal mail status and test failures remain observable', () => {
  assert.match(supabaseRestServer, /method === 'GET' && response\.status === 404 && \['PGRST202', 'PGRST205'\]/)
  assert.match(testLeadRoute, /if \(!settings\) return NextResponse\.json\(\{ available: false/)
  assert.match(testLeadRoute, /select=\*&limit=1000/)
  assert.match(testLeadRoute, /row\.is_test === true/)
  assert.match(resendWebhook, /select=\*&id=eq\.\$\{encodeURIComponent\(emailJobId\)\}/)
  assert.match(resendWebhook, /if \(job\?\.test_run_id\) \{[\s\S]*luxor_test_run_activity/)
  assert.doesNotMatch(resendWebhook.slice(resendWebhook.indexOf('if (job?.test_run_id)'), resendWebhook.indexOf("if (event.type === 'email.delivered'")), /catch\(/)
  assert.match(resendWebhook, /const updated = await supabaseRest<LuxorMailRow\[]>[\s\S]*status: \(rank\[next\]/)
})

test('ordinary inquiry creation does not implicitly promote a record based on contact data', () => {
  assert.doesNotMatch(inquiriesServer, /is_test\s*:\s*true/)
  assert.match(inquiryTypes, /return inquiry\?\.is_test === true/)
  assert.doesNotMatch(inquiryTypes, /metadata\?\.is_test_record/)
  assert.match(migration, /and metadata ->> 'is_test_record' = 'true'/)
  assert.match(migration, /The permanent test lead cannot be deleted or demoted/)
})
