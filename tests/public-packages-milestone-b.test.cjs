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

test('readPackagesInquiryContinuationId accepts valid metadata only', () => {
  const { readPackagesInquiryContinuationId } = loadTypeScript('src/lib/luxorPackagesInquiryTourServer.ts', {
    'server-only': {},
    '@/lib/luxorTourPlanningServer': {},
    '@/lib/luxorEmailJobsServer': {},
    '@/lib/luxorTourSlotsServer': {},
    '@/lib/luxorInquiriesServer': {},
    '@/lib/luxorTourScheduleServer': {},
    '@/lib/luxorPhoneNumbersServer': {},
    '@/lib/supabaseRestServer': {},
  })
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  assert.equal(readPackagesInquiryContinuationId({ continuePackagesInquiryId: id }), id)
  assert.equal(readPackagesInquiryContinuationId({ continuePackagesInquiryId: 'bad' }), null)
})
