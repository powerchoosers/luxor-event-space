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
const testProposalServer = fs.readFileSync(path.join(root, 'src/lib/luxorTestProposalServer.ts'), 'utf8')
const testProposalRoute = fs.readFileSync(path.join(root, 'src/app/api/portal/test-lead/proposal/route.ts'), 'utf8')
const testProposalMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261015050000_run_isolated_test_proposals.sql'), 'utf8')
const proposalEmailServer = fs.readFileSync(path.join(root, 'src/lib/luxorProposalEmailServer.ts'), 'utf8')
const emailWorkerWithTestAttachments = fs.readFileSync(path.join(root, 'src/lib/luxorEmailJobsServer.ts'), 'utf8')
const testEmailDelivery = fs.readFileSync(path.join(root, 'src/lib/luxorTestEmailDelivery.ts'), 'utf8')
const proposalBuilder = fs.readFileSync(path.join(root, 'src/components/portal/ProposalBuilderModal.tsx'), 'utf8')

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

test('legacy metadata and exact owner-confirmed historical IDs remain excluded from revenue analytics', () => {
  const knownId = 'ce4a7a94-abd7-402f-bac4-156af405ffb1'
  assert.equal(inquiryTypesModule.isLuxorTestInquiry({ id: knownId, is_test: false, metadata: {} }), false)
  assert.equal(inquiryTypesModule.isLuxorTestInquiry({ id: 'legacy-test', is_test: false, metadata: { is_test_record: true } }), true)
  assert.equal(inquiryTypesModule.isLuxorNonRevenueTestInquiry({ id: knownId, is_test: false }), true)
  assert.equal(inquiryTypesModule.isLuxorNonRevenueTestInquiry({ id: 'new-customer', is_test: false }), false)
  assert.equal(inquiryTypesModule.isLuxorNonRevenueTestInquiry({ id: 'permanent-test', is_test: true }), true)
  assert.equal(inquiryTypesModule.isLuxorNonRevenueTestInquiry({ id: 'legacy-test', is_test: false, metadata: { is_test_record: true } }), true)
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
  assert.match(migration, /Lock the permanent lead before the run/)
  assert.match(migration, /inquiry\.is_test is not true[\s\S]*not exists \([\s\S]*exemption\.inquiry_id = inquiry\.id/)
  const exemptions = [...migration.matchAll(/\('([0-9a-f-]{36})', 'owner_confirmed_legacy_test'\)/g)].map((match) => match[1])
  assert.equal(exemptions.length, 10)
  assert.equal(new Set(exemptions).size, 10)
  assert.deepEqual(exemptions.sort(), [...inquiryTypesModule.LUXOR_OWNER_CONFIRMED_LEGACY_TEST_INQUIRY_IDS].sort())
  assert.match(migration, /1, false, 'luxoratlaspalmas@gmail\.com', '2149600276'[\s\S]*'luxoratlaspalmas@gmail\.com', now\(\)/)
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
  assert.match(testPanel, /readOnly/)
  assert.match(testPanel, /bg-sky-700[\s\S]*Reset Pipeline/)
  const testLeadServer = fs.readFileSync(path.join(root, 'src/lib/luxorTestLeadServer.ts'), 'utf8')
  assert.match(testLeadServer, /const settings = await getLuxorTestSettings\(\)[\s\S]*return \{ settings, matches:/)
  assert.doesNotMatch(testLeadServer.slice(testLeadServer.indexOf('export async function isConfiguredTestSubmission'), testLeadServer.indexOf('export async function startLuxorTestRun')), /catch/)
  assert.match(migration, /before update or delete on public\.luxor_test_run_activity/)
  assert.match(migration, /Worker interrupted; provider outcome is unknown/)
})

test('test email jobs are run-fenced, recipient-overridden, and track provider acceptance separately from delivery', () => {
  assert.match(migration, /job_type <> 'test_notification'/)
  assert.match(migration, /coalesce\(v_job\.metadata ->> 'test_email', 'false'\) <> 'true'/)
  assert.match(migration, /update public\.luxor_email_jobs set status = 'sending'/)
  assert.match(emailWorker, /rpc\/luxor_authorize_test_email_job/)
  assert.match(emailWorker, /recipient_email: authorization\.recipient/)
  assert.match(emailWorker, /provider_status: 'accepted',[\s\S]*delivery_status: 'unknown'/)
  assert.match(resendWebhook, /delivery_status: deliveryStatus/)
  assert.match(resendWebhook, /luxor_email_jobs\?select=\*\&id=/)
})

test('missing test schema is treated as unavailable while normal mail status and test failures remain observable', () => {
  assert.match(supabaseRestServer, /method === 'GET' && response\.status === 404 && payload\.code === 'PGRST205'/)
  assert.doesNotMatch(supabaseRestServer, /PGRST202/)
  assert.match(testLeadRoute, /if \(!settings\) return NextResponse\.json\(\{ available: false/)
  assert.match(testLeadRoute, /luxor_inquiries\?select=\*&id=eq\./)
  assert.match(testLeadRoute, /status=eq\.in_progress[\s\S]*limit=1/)
  assert.match(resendWebhook, /select=\*&id=eq\.\$\{encodeURIComponent\(emailJobId\)\}/)
  assert.match(resendWebhook, /if \(job\?\.test_run_id\) \{[\s\S]*luxor_test_run_activity/)
  assert.doesNotMatch(resendWebhook.slice(resendWebhook.indexOf('if (job?.test_run_id)'), resendWebhook.indexOf("if (event.type === 'email.delivered'")), /catch\(/)
  assert.match(resendWebhook, /const updated = await supabaseRest<LuxorMailRow\[]>[\s\S]*status: \(rank\[next\]/)
})

test('ordinary inquiry creation does not implicitly promote a record based on contact data', () => {
  assert.doesNotMatch(inquiriesServer, /is_test\s*:\s*true/)
  assert.match(inquiryTypes, /return inquiry\?\.is_test === true \|\| inquiry\?\.metadata\?\.is_test_record === true/)
  assert.match(inquiryTypes, /metadata\?\.is_test_record === true/)
  assert.match(migration, /and metadata ->> 'is_test_record' = 'true'/)
  assert.match(migration, /The permanent test lead cannot be deleted or demoted/)
  assert.doesNotMatch(migration, /luxoratlaspalmas@hmail\.com/i)
})

test('test proposal calculation, validation, HTML and PDF share the production proposal functions', () => {
  const invoiceRoute = fs.readFileSync(path.join(root, 'src/app/api/invoices/route.ts'), 'utf8')
  assert.match(invoiceRoute, /calculateLuxorProposal/)
  assert.match(testProposalServer, /calculateLuxorProposal\(input\.selection, pricing\.config, \{ promotion, sameDayBooking \}\)/)
  assert.match(testProposalServer, /assertLuxorWeekdayRentalSelection\(input\.selection, pricing\.config, true, hasFrozenLegacyCustomTimeProposal\(storedInvoice\)\)/)
  assert.match(testProposalServer, /getLuxorProposalPricingForInvoice\(storedInvoice\)/)
  assert.match(testProposalServer, /resolveLuxorProposalPromotion\(input\.selection, storedInvoice\)/)
  assert.match(testProposalServer, /resolveLuxorOriginalProposalCreatedAt\(storedInvoice\)/)
  assert.match(testProposalServer, /resolveLuxorSameDayBooking\(input\.selection, storedInvoice, originalCreatedAt\)/)
  assert.match(testProposalServer, /if \(input\.action === 'publish' && !calculation\.publishable\)/)
  assert.match(testProposalServer, /buildLuxorProposalEmail\(\{ invoice, inquiry: testInquiry, reviewUrl, testOnly: true \}\)/)
  assert.match(testProposalServer, /buildLuxorInvoicePdf\(invoice, testInquiry\)/)
  assert.match(testProposalServer, /details\.email = \{ subject: email\.subject, html: email\.html, recipient: LUXOR_TEST_PROPOSAL_RECIPIENT \}/)
  assert.doesNotMatch(testProposalServer, /Synthetic|Gold Celebration Package|5000/)
  assert.match(proposalEmailServer, /TEST ONLY — no customer proposal, agreement, booking, or payment was created/)
  assert.match(proposalEmailServer, /input\.testOnly \? 'View test proposal' : 'Review proposal'/)
})

test('test proposal save and publish are run-scoped and do not call production customer workflows', () => {
  assert.match(testProposalRoute, /authorizedMember\(\)/)
  assert.match(testProposalRoute, /prepareLuxorTestProposal\(\{ testRunId, action, selection, description, notes, expectedRevision \}\)/)
  const proposalPricingRoute = fs.readFileSync(path.join(root, 'src/app/api/proposal-pricing/route.ts'), 'utf8')
  assert.match(proposalPricingRoute, /getLuxorPortalMember\(session\.email\)[\s\S]*memberCan\(member, 'settings'\)/)
  assert.match(proposalPricingRoute, /luxor_test_run_artifacts\?select=status,details[\s\S]*existingTestInvoice = invoice as unknown as LuxorInvoice/)
  assert.match(testProposalRoute, /rpc\/luxor_save_test_proposal/)
  assert.match(testProposalRoute, /p_expected_revision: expectedRevision/)
  assert.match(testProposalRoute, /p_request_fingerprint: prepared\.requestFingerprint/)
  assert.match(testProposalRoute, /if \(result\.conflict\)/)
  assert.match(testProposalRoute, /action === 'publish' \? prepared\.pdfBase64 : null/)
  assert.match(testProposalRoute, /details: \{ invoice: artifact\.details\?\.invoice \?\? null \}/)
  assert.doesNotMatch(testProposalRoute, /artifact: result\.artifact/)
  assert.doesNotMatch(testProposalRoute, /createInvoice|createNote|createLuxorBooking|createLuxorSignature|sendLuxorZohoEmail|\/api\/invoices/)
  assert.match(testLeadRoute, /category === 'proposal'[\s\S]*Use the proposal builder/)
  assert.match(testProposalMigration, /test_lead_id = '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid/)
  assert.match(testProposalMigration, /artifact_type = 'tour' and status = 'completed'/)
  assert.match(testProposalMigration, /'luxoratlaspalmas@gmail\.com'/)
  assert.match(testProposalMigration, /'test_notification'/)
  assert.match(testProposalMigration, /metadata, test_run_id[\s\S]*v_run\.id/)
  assert.match(testProposalMigration, /luxor_test_run_artifacts/)
  assert.match(testProposalMigration, /luxor_test_run_emails/)
  assert.match(testProposalMigration, /luxor_test_run_activity/)
  assert.match(testProposalMigration, /status = 'in_progress'[\s\S]*for update/)
  assert.match(testProposalMigration, /status not in \('simulated', 'drafted'\)/)
  assert.match(testProposalMigration, /published_email_id/)
  assert.match(testProposalMigration, /for update[\s\S]*proposal_revision[\s\S]*v_current_revision/)
  assert.match(testProposalMigration, /v_existing\.details ->> 'publish_request_fingerprint'[\s\S]*v_existing\.details ->> 'published_email_id'[\s\S]*'replayed', true/)
  assert.match(testProposalMigration, /p_expected_revision integer default 0[\s\S]*p_request_fingerprint text default null/)
  assert.doesNotMatch(testProposalMigration, /insert into public\.(luxor_invoices|luxor_bookings|luxor_signature_requests|luxor_payments|luxor_tours)/i)
  assert.match(testProposalMigration, /revoke all on function public\.luxor_save_test_proposal\([\s\S]*from public, anon, authenticated/)
  assert.match(testProposalMigration, /grant execute on function public\.luxor_save_test_proposal\([\s\S]*to service_role/)
})

test('proposal preparation uses production pricing, checks the completed tour, and has no write side effects', async () => {
  const { createRequire } = await import('node:module')
  const Module = createRequire(import.meta.url)('node:module')
  const originalLoad = Module._load
  const originalResolve = Module._resolveFilename
  const requireFn = createRequire(path.join(root, 'tests', 'luxor-test-proposal-runtime.cjs'))
  const originalTs = requireFn.extensions['.ts']
  const calls = []
  requireFn.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8')
    module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
  }
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('.') && !path.extname(request)) {
      const candidate = path.resolve(path.dirname(parent.filename), `${request}.ts`)
      if (fs.existsSync(candidate)) return originalResolve.call(this, candidate, parent, isMain, options)
    }
    return originalResolve.call(this, request, parent, isMain, options)
  }
  const config = {
    ...requireFn('../src/lib/luxorProposalPricing.ts').LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG,
    payment_plan: { mode: 'pay_in_full', booking_payment_percent: 100, final_payment_due_days_before_event: 30 },
  }
  Module._load = function (request, parent, isMain) {
    if (request === 'server-only') return {}
    if (request === '@/lib/luxorInquiryTypes') return {}
    if (request === '@/lib/luxorProposalPricing') return originalLoad.call(this, path.join(root, 'src/lib/luxorProposalPricing.ts'), parent, isMain)
    if (request === '@/lib/luxorProposalPricingServer') return {
      getLuxorProposalPricingForInvoice: async () => ({ config, version: 7 }),
      hasFrozenLegacyCustomTimeProposal: () => false,
      resolveLuxorOriginalProposalCreatedAt: async (invoice) => invoice?.created_at || '2026-10-01T12:00:00.000Z',
      resolveLuxorProposalPromotion: async () => null,
      resolveLuxorSameDayBooking: async () => null,
      assertLuxorWeekdayRentalSelection: () => {},
    }
    if (request === '@/lib/luxorProposalEmailServer') return { buildLuxorProposalEmail: (args) => { calls.push(['email', args]); return { subject: 'Test only', html: '<p>test</p>' } } }
    if (request === '@/lib/luxorInvoicePdfServer') return { buildLuxorInvoicePdf: async (invoice) => { calls.push(['pdf', invoice]); return Buffer.from('test-pdf') } }
    if (request === '@/lib/luxorProposalTerms') return originalLoad.call(this, path.join(root, 'src/lib/luxorProposalTerms.ts'), parent, isMain)
    if (request === '@/lib/luxorInquiriesServer') return { getLuxorInquiry: async () => ({ id: '00b264d6-a3fb-4ea3-9142-415f76385c39', is_test: true, full_name: 'Luxor Test Lead', event_type: 'Wedding', email: 'luxoratlaspalmas@gmail.com' }) }
    if (request === '@/lib/supabaseRestServer') return { supabaseRest: async (query, options) => {
      calls.push([options?.method || 'GET', query])
      if (query.startsWith('luxor_test_runs?')) return [{ id: 'run-1', test_lead_id: '00b264d6-a3fb-4ea3-9142-415f76385c39', status: 'in_progress' }]
      if (query.includes('artifact_type=eq.tour')) return [{ status: globalThis.__tourStatus || 'completed' }]
      return globalThis.__proposalArtifacts || []
    } }
    return originalLoad.call(this, request, parent, isMain)
  }
  const helperPath = path.join(root, 'src/lib/luxorTestProposalServer.ts')
  try {
    const helper = requireFn(helperPath)
    const selection = { packageId: 'rental_only', eventDate: '2027-06-06', guestCount: 80, rentalPeriod: 'evening', addOns: [], paymentPlan: { mode: 'pay_in_full', booking_payment_percent: 100, final_payment_due_days_before_event: 30 } }
    const draft = await helper.prepareLuxorTestProposal({ testRunId: 'run-1', action: 'save', selection, description: 'User entered event details', notes: null, expectedRevision: 0 })
    assert.ok(draft.invoice.total > 0)
    assert.ok(draft.invoice.line_items.length > 0)
    assert.equal(draft.invoice.description, 'User entered event details')
    assert.equal(draft.details.invoice.proposal_context.pricing_config_version, 7)
    assert.equal(draft.email, null)
    assert.equal(draft.pdfBase64, null)
    assert.equal(calls.some(([method]) => method !== 'GET'), false)
    assert.equal(calls.some(([kind]) => kind === 'email' || kind === 'pdf'), false)

    globalThis.__tourStatus = 'confirmed'
    await assert.rejects(helper.prepareLuxorTestProposal({ testRunId: 'run-1', action: 'save', selection, description: 'x', notes: null, expectedRevision: 0 }), /Complete the simulated tour/)
    globalThis.__tourStatus = 'completed'
    calls.length = 0
    const published = await helper.prepareLuxorTestProposal({ testRunId: 'run-1', action: 'publish', selection, description: 'User entered event details', notes: null, expectedRevision: 0 })
    assert.equal(published.invoice.status, 'sent')
    assert.ok(published.email.html.includes('test'))
    assert.ok(published.pdfBase64)
    assert.equal(published.details.email.recipient, 'luxoratlaspalmas@gmail.com')
    assert.equal(calls.filter(([kind]) => kind === 'email').length, 1)
    assert.equal(calls.filter(([kind]) => kind === 'pdf').length, 1)
    const reordered = { rentalPeriod: 'evening', addOns: [], guestCount: 80, packageId: 'rental_only', eventDate: '2027-06-06', paymentPlan: selection.paymentPlan }
    assert.equal(helper.luxorTestProposalRequestFingerprint({ testRunId: 'run-1', selection, description: 'x', notes: null }), helper.luxorTestProposalRequestFingerprint({ testRunId: 'run-1', selection: reordered, description: ' x ', notes: null }))
    assert.notEqual(helper.luxorTestProposalRequestFingerprint({ testRunId: 'run-1', selection, description: 'x', notes: null }), helper.luxorTestProposalRequestFingerprint({ testRunId: 'run-1', selection: { ...selection, guestCount: 81 }, description: 'x', notes: null }))
  } finally {
    delete globalThis.__tourStatus
    delete globalThis.__proposalArtifacts
    Module._load = originalLoad
    Module._resolveFilename = originalResolve
    if (originalTs) requireFn.extensions['.ts'] = originalTs
    else delete requireFn.extensions['.ts']
    delete requireFn.cache[helperPath]
  }
})

test('proposal lifecycle contract fences stale drafts and deduplicates concurrent publish retries', async () => {
  // In-memory adapter for the checked-in RPC contract: it exercises app-level
  // request behavior without a database connection or production side effects.
  assert.match(testProposalMigration, /for update/)
  assert.match(testProposalMigration, /p_expected_revision <> v_current_revision/)
  assert.match(testProposalMigration, /v_existing\.details ->> 'publish_request_fingerprint'/)
  assert.match(testProposalMigration, /v_existing\.details ->> 'published_email_id'[\s\S]*'replayed', true/)
  assert.match(testProposalMigration, /insert into public\.luxor_test_run_emails/)
  const lock = Promise.resolve()
  let tail = lock
  const state = { status: 'drafted', revision: 0, details: null, emailId: null, jobs: 0 }
  const rpc = async ({ action, expectedRevision, fingerprint, details }) => {
    let release
    const prior = tail
    tail = new Promise((resolve) => { release = resolve })
    await prior
    try {
      if (state.status === 'sent' && action === 'publish' && state.details.publish_request_fingerprint === fingerprint) return { replayed: true, emailId: state.emailId }
      if (state.status === 'sent') return { conflict: true }
      if (state.revision !== expectedRevision) return { conflict: true }
      state.revision += 1
      if (action === 'save') { state.details = { ...details, proposal_revision: state.revision }; return { revision: state.revision } }
      state.status = 'sent'
      state.emailId = `email-${++state.jobs}`
      state.details = { ...details, proposal_revision: state.revision, publish_request_fingerprint: fingerprint }
      return { replayed: false, emailId: state.emailId }
    } finally { release() }
  }
  const saved = await rpc({ action: 'save', expectedRevision: 0, details: { content: 'first draft' } })
  assert.equal(saved.revision, 1)
  assert.deepEqual(await rpc({ action: 'save', expectedRevision: 0, details: { content: 'stale draft' } }), { conflict: true })
  assert.equal(state.details.content, 'first draft')
  const payload = { action: 'publish', expectedRevision: 1, fingerprint: 'sha256-user-payload', details: { content: 'first draft' } }
  const concurrent = await Promise.all([rpc(payload), rpc(payload)])
  assert.equal(concurrent.filter((result) => result.replayed === false).length, 1)
  assert.equal(concurrent[0].emailId, concurrent[1].emailId)
  const retry = await rpc(payload)
  assert.equal(retry.replayed, true)
  assert.equal(retry.emailId, concurrent[0].emailId)
  assert.equal(state.jobs, 1)
  assert.deepEqual(await rpc({ ...payload, fingerprint: 'different-content' }), { conflict: true })
})

test('normal proposal builder uses the test run path and disables handoff/signing actions in test mode', () => {
  assert.match(proposalBuilder, /testRunId\?: string \| null/)
  assert.match(proposalBuilder, /\.\.\.\(!testRunId \? \{ invoiceId, supersedesInvoiceId \} : \{\}\)/)
  assert.match(proposalBuilder, /\.\.\.\(!testRunId \? \{ invoiceId, supersedesInvoiceId \} : \{\}\)/)
  assert.match(proposalBuilder, /\.\.\.\(testRunId \? \{ testRunId \} : \{\}\)/)
  assert.match(proposalBuilder, /!testRunId && presentationMode === 'in_person'/)
  assert.match(proposalBuilder, /\{!testRunId \? <button type="button" role="radio" aria-checked=\{presentationMode === 'in_person'\}/)
  assert.match(proposalBuilder, /This test flow does not create or send an agreement, signature request, booking, or payment request/)
  assert.match(testEmailDelivery, /LUXOR_TEST_EMAIL_RECIPIENT = LUXOR_TEST_IDENTIFICATION_EMAIL/)
  assert.match(emailWorkerWithTestAttachments, /rpc\/luxor_authorize_test_email_job/)
  assert.match(emailWorkerWithTestAttachments, /metadata\.test_attachment_base64/)
  assert.match(emailWorkerWithTestAttachments, /sendProvider: \(\{ to, subject, body, from, fromName, attachments \}\) => sendLuxorZohoEmail/)
})
