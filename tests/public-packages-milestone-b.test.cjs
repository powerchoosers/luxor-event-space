/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTypeScript(filePath, stubs = {}) {
  const source = fs.readFileSync(path.join(root, filePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleKind.CommonJS,
      paths: { '@/*': ['src/*'] },
      baseUrl: root,
    },
  }).outputText
  const absolutePath = path.join(root, filePath)
  const loaded = new Module(absolutePath, module)
  loaded.filename = absolutePath
  loaded.paths = module.paths
  const originalLoad = Module._load
  const alias = (request) => {
    if (request.startsWith('@/')) return path.join(root, 'src', request.slice(2))
    return request
  }
  Module._load = function (request, parent, isMain) {
    const resolved = alias(request)
    if (Object.hasOwn(stubs, request)) return stubs[request]
    if (Object.hasOwn(stubs, resolved)) return stubs[resolved]
    if (resolved !== request && fs.existsSync(resolved + '.ts')) {
      return loadTypeScript(path.relative(root, resolved + '.ts'), stubs)
    }
    if (resolved !== request && fs.existsSync(resolved + '.tsx')) {
      return loadTypeScript(path.relative(root, resolved + '.tsx'), stubs)
    }
    if (request.startsWith('.')) {
      const parentDir = parent?.filename ? path.dirname(parent.filename) : path.join(root, 'src')
      for (const candidate of [
        path.resolve(parentDir, request),
        path.resolve(parentDir, `${request}.ts`),
        path.resolve(parentDir, `${request}.tsx`),
      ]) {
        if (fs.existsSync(candidate) && (candidate.endsWith('.ts') || candidate.endsWith('.tsx'))) {
          return loadTypeScript(path.relative(root, candidate), stubs)
        }
      }
    }
    try {
      return originalLoad.call(this, request, parent, isMain)
    } catch (error) {
      if (resolved !== request) return originalLoad.call(this, resolved, parent, isMain)
      throw error
    }
  }
  try {
    loaded._compile(js, loaded.filename)
  } finally {
    Module._load = originalLoad
  }
  return loaded.exports
}

test('packages inquiry consent profile matches website packages flow', () => {
  const { getLuxorConsentFormProfile, LUXOR_INQUIRY_SMS_DISCLOSURE } = loadTypeScript('src/lib/luxorInquiryTypes.ts')
  const profile = getLuxorConsentFormProfile('website_packages', 'packages_event_inquiry')
  assert.ok(profile)
  assert.equal(profile.flow, 'packages_event_inquiry')
  assert.equal(profile.customerCareSmsDisclosure, LUXOR_INQUIRY_SMS_DISCLOSURE)
  assert.deepEqual(profile.customerCareScopes, ['customer_care', 'tour', 'event'])
})

test('packages submit re-prices from saved draft before create payload is normalized', async () => {
  const quoteTotals = { totalEstimate: 4825, amountToReserve: 1200, refundableSecurityDeposit: 500 }
  let receivedInput
  const { submitPublicPackagesInquiry } = loadTypeScript('src/lib/luxorPublicPackagesInquirySubmitServer.ts', {
    'server-only': {},
    '@/lib/luxorPublicPackagesInquiryDraftServer': {
      decodePackagesDraftToken: () => ({ draftId: 'draft-1' }),
      getPackagesInquiryDraft: async () => ({
        id: 'draft-1',
        locale: 'en',
        configurator_input: {
          eventDate: '2027-06-12',
          guestCount: 120,
          rentalPeriod: 'saturday_evening',
          packageTierId: 'signature',
          eventType: 'Wedding',
          decorEnhancementIds: [],
        },
      }),
      attachPackagesDraftToInquiry: async () => {},
    },
    '@/lib/luxorPublicPackagesConfigurator': {
      calculatePublicPackagesQuote: (input) => {
        receivedInput = input
        return {
          errors: [],
          totals: quoteTotals,
          summaryLines: [],
          selection: {},
        }
      },
      publicPackagesSelectionForProposalConversion: () => ({ schema_version: 1, totals: quoteTotals }),
    },
    '@/lib/luxorProposalPricingServer': {
      getDefaultLuxorProposalPricing: async () => ({ config: {}, version: 4 }),
    },
    '@/lib/luxorInquiriesServer': {
      findRecentDuplicateLuxorInquiry: async () => null,
      createLuxorInquiry: async (payload) => {
        assert.equal(payload.metadata.packagesConfigurator.totals.totalEstimate, quoteTotals.totalEstimate)
        return { id: 'inq-1', ...payload }
      },
    },
    '@/lib/luxorInquiryTypes': loadTypeScript('src/lib/luxorInquiryTypes.ts'),
    '@/lib/luxorPublicEventsServer': { hashPublicRequestIp: () => 'hash' },
  })

  const result = await submitPublicPackagesInquiry({
    draftToken: 'token',
    firstName: 'Ari',
    lastName: 'Test',
    email: 'lead@example.invalid',
    phone: '(210) 555-0100',
    emailInquiryOptIn: true,
  })

  assert.equal(receivedInput.guestCount, 120)
  assert.equal(result.quote.totals.totalEstimate, quoteTotals.totalEstimate)
})

test('findRecentDuplicateLuxorInquiry prefers metadata idempotency key', async () => {
  const inquiryTypes = loadTypeScript('src/lib/luxorInquiryTypes.ts')
  const calls = []
  const { findRecentDuplicateLuxorInquiry } = loadTypeScript('src/lib/luxorInquiriesServer.ts', {
    'server-only': {},
    './luxorInquiryTypes': inquiryTypes,
    './luxorEmailJobsServer': {},
    './supabaseRestServer': {
      supabaseRest: async (query) => {
        calls.push(query)
        if (query.includes('idempotencyKey')) return [{ id: 'duplicate-id', email: 'lead@example.invalid' }]
        return []
      },
    },
    './luxorTourMetrics': {},
    './luxorTextAutomationsServer': {},
    './luxorTourSlotsServer': {},
    './luxorTourSlots': {},
    './luxorCalendarServer': {},
    './luxorTourPlanningServer': {},
    './luxorPhoneNumbersServer': {},
    './luxorInquiryDuplicateMatch': { findRecentLuxorInquiryMatch: () => null },
  })

  const duplicate = await findRecentDuplicateLuxorInquiry({
    fullName: 'Dup',
    email: 'lead@example.invalid',
    phone: '2105550100',
    metadata: { idempotencyKey: 'packages-submit-key-01' },
  })

  assert.equal(duplicate?.id, 'duplicate-id')
  assert.match(calls[0], /idempotencyKey/)
})

test('createLuxorInquiry replays on metadata idempotency unique violation without re-notifying', async () => {
  const inquiryTypes = loadTypeScript('src/lib/luxorInquiryTypes.ts')
  const winner = {
    id: 'inq-idempotency-winner',
    email: 'lead@example.invalid',
    flow: 'packages_event_inquiry',
    full_name: 'Aria Test',
    phone: '2105550100',
    status: 'new',
    metadata: { idempotencyKey: 'packages-concurrent-key-abcdef12' },
  }
  let insertAttempts = 0
  class SupabaseRestError extends Error {
    constructor(message, status, code) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  const { createLuxorInquiry, LUXOR_INQUIRIES_METADATA_IDEMPOTENCY_UNIQUE_INDEX } = loadTypeScript('src/lib/luxorInquiriesServer.ts', {
    'server-only': {},
    './luxorInquiryTypes': inquiryTypes,
    './luxorEmailJobsServer': {
      buildTourEmail: () => ({}),
      createLuxorEmailJob: async () => ({ id: 'email-job' }),
      createPublicToken: () => 'token',
      assertEmailHasNoUnresolvedPlaceholders: () => {},
      buildStandardInquiryEmailHtml: () => '<p>ok</p>',
      buildNewsletterConfirmationEmailHtml: () => '<p>ok</p>',
      listQueuedLuxorEmailJobsByIds: async () => [],
      processLuxorEmailJobs: async () => {},
    },
    './supabaseRestServer': {
      SupabaseRestError,
      supabaseRest: async (path, init) => {
        if (init?.method === 'POST' && String(path).startsWith('luxor_inquiries')) {
          insertAttempts += 1
          if (insertAttempts > 1) {
            throw new SupabaseRestError(
              `duplicate key value violates unique constraint "${LUXOR_INQUIRIES_METADATA_IDEMPOTENCY_UNIQUE_INDEX}"`,
              409,
              '23505',
            )
          }
          return [winner]
        }
        if (String(path).includes('idempotencyKey')) return [winner]
        return []
      },
    },
    './luxorInquiryDuplicateMatch': { findRecentLuxorInquiryMatch: () => null },
    './luxorTourMetrics': { compareLuxorScheduledTours: () => 0, getLuxorInquiryPageRequest: () => ({ path: '', headers: {} }), loadLuxorPages: async () => [] },
    './luxorTextAutomationsServer': { recordLuxorWebsiteSmsConsent: async () => null },
    './luxorTourSlotsServer': {},
    './luxorTourSlots': { formatTourSlotTime: (v) => v },
    './luxorCalendarServer': { normalizedState: (v) => v },
    './luxorTourPlanningServer': {},
    './luxorPhoneNumbersServer': { getActiveLuxorPhoneNumber: async () => null },
  })

  const input = {
    fullName: 'Aria Test',
    email: 'lead@example.invalid',
    phone: '2105550100',
    eventType: 'Wedding',
    message: 'Website packages configurator inquiry.',
    source: 'website_packages',
    flow: 'packages_event_inquiry',
    emailInquiryOptIn: true,
    metadata: { idempotencyKey: 'packages-concurrent-key-abcdef12' },
  }
  const firstOptions = { idempotencyKey: 'packages-concurrent-key-abcdef12' }
  const secondOptions = { idempotencyKey: 'packages-concurrent-key-abcdef12' }
  const first = await createLuxorInquiry(input, 'fixture-agent', firstOptions)
  const second = await createLuxorInquiry(input, 'fixture-agent', secondOptions)
  assert.equal(first.id, winner.id)
  assert.equal(second.id, winner.id)
  assert.equal(secondOptions.replayed, true)
  assert.equal(insertAttempts, 2)
})

test('concurrent packages submit with same idempotency key replays without duplicate attach', async () => {
  const quoteTotals = { totalEstimate: 4825, amountToReserve: 1200, refundableSecurityDeposit: 500 }
  let createCalls = 0
  let attachCalls = 0
  const sharedKey = 'packages-parallel-key-abcdef12'
  const { submitPublicPackagesInquiry } = loadTypeScript('src/lib/luxorPublicPackagesInquirySubmitServer.ts', {
    'server-only': {},
    '@/lib/luxorPublicPackagesInquiryDraftServer': {
      decodePackagesDraftToken: () => ({ draftId: 'draft-1' }),
      getPackagesInquiryDraft: async () => ({
        id: 'draft-1',
        locale: 'en',
        configurator_input: {
          eventDate: '2027-06-12',
          guestCount: 120,
          rentalPeriod: 'evening',
          packageTierId: 'signature',
          eventType: 'Wedding',
          decorAddOnQuantities: {},
        },
      }),
      attachPackagesDraftToInquiry: async () => {
        attachCalls += 1
      },
    },
    '@/lib/luxorPublicPackagesConfigurator': {
      calculatePublicPackagesQuote: () => ({
        errors: [],
        totals: quoteTotals,
        summaryLines: [],
        selection: {},
      }),
      publicPackagesSelectionForProposalConversion: () => ({ schema_version: 1, totals: quoteTotals }),
    },
    '@/lib/luxorProposalPricingServer': {
      getDefaultLuxorProposalPricing: async () => ({ config: {}, version: 4 }),
    },
    '@/lib/luxorInquiriesServer': {
      findRecentDuplicateLuxorInquiry: async () => null,
      createLuxorInquiry: async (_payload, _ua, options) => {
        createCalls += 1
        if (createCalls === 1) {
          await new Promise((resolve) => setTimeout(resolve, 25))
          return { id: 'inq-parallel-winner', email: 'lead@example.invalid' }
        }
        if (options) options.replayed = true
        return { id: 'inq-parallel-winner', email: 'lead@example.invalid' }
      },
    },
    '@/lib/luxorInquiryTypes': loadTypeScript('src/lib/luxorInquiryTypes.ts'),
    '@/lib/luxorPublicEventsServer': { hashPublicRequestIp: () => 'hash' },
  })

  const base = {
    draftToken: 'token',
    firstName: 'Aria',
    lastName: 'Test',
    email: 'lead@example.invalid',
    phone: '(210) 555-0100',
    emailInquiryOptIn: true,
    idempotencyKey: sharedKey,
  }
  const [first, second] = await Promise.all([
    submitPublicPackagesInquiry(base),
    submitPublicPackagesInquiry(base),
  ])
  assert.equal(createCalls, 2)
  assert.equal(attachCalls, 1)
  assert.equal(first.replayed || second.replayed, true)
  assert.notEqual(first.replayed && second.replayed, true)
})

const packagesConfigurator = loadTypeScript('src/lib/luxorPublicPackagesConfigurator.ts', { 'server-only': {} })

function weekendTestConfig() {
  const pricing = loadTypeScript('src/lib/luxorProposalPricing.ts')
  const decor = loadTypeScript('src/lib/luxorDecorCatalogV2.ts')
  const packages = loadTypeScript('src/lib/luxorProposalPackages.ts')
  return {
    ...pricing.LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG,
    pricing_mode: 'venue_plus_preferred_vendor_estimates',
    luxor_costs: {
      ...pricing.LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG,
      proposal_pricing_policy_version: 4,
      package_selection_v1: packages.DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS,
      [decor.LUXOR_DECOR_CATALOG_KEY]: {
        schema_version: decor.LUXOR_DECOR_CATALOG_SCHEMA_VERSION,
        items: [],
      },
    },
  }
}

test('summaryLinesFromPackage returns itemized charge lines', () => {
  const quote = packagesConfigurator.calculatePublicPackagesQuote({
    eventDate: '2026-10-24',
    eventType: 'Birthday Party',
    guestCount: 100,
    rentalPeriod: 'evening',
    packageTierId: 'signature',
    decorAddOnQuantities: {},
  }, weekendTestConfig(), 1)
  assert.ok(quote.summaryLines.some((line) => line.category === 'package' || line.category === 'venue'), quote.summaryLines.map((line) => line.category).join(','))
  assert.ok(quote.summaryLines.some((line) => line.category === 'total'))
  assert.equal(quote.summaryLines.filter((line) => line.category === 'reserve').length, 1)
})

test('getPublicPackageGuestCountBounds returns min and max without synthetic guest picklists', () => {
  const bounds = packagesConfigurator.getPublicPackageGuestCountBounds({
    guest_count: { minimum: 1, maximum: 250 },
    luxor_costs: { guest_count: { minimum: 1, maximum: 250 } },
  })
  assert.equal(bounds.min, 1)
  assert.equal(bounds.max, 180)
  assert.equal(typeof packagesConfigurator.listPublicPackageGuestCountOptions, 'undefined')
})

test('readPackagesInquiryContinuationId accepts valid metadata only', () => {
  const { readPackagesInquiryContinuationId } = loadTypeScript('src/lib/luxorPackagesInquiryTourServer.ts', {
    'server-only': {},
    '@/lib/luxorTourPlanningServer': {},
    '@/lib/luxorEmailJobsServer': {},
    '@/lib/luxorTourSlotsServer': {},
    '@/lib/luxorTourSlots': {},
    '@/lib/luxorInquiriesServer': {},
    '@/lib/luxorTourScheduleServer': {},
    '@/lib/luxorPhoneNumbersServer': {},
    '@/lib/supabaseRestServer': {},
  })
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  assert.equal(readPackagesInquiryContinuationId({ continuePackagesInquiryId: id }), id)
  assert.equal(readPackagesInquiryContinuationId({ continuePackagesInquiryId: 'bad' }), null)
})
