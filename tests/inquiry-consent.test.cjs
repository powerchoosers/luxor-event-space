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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = new Module(path.join(root, `${path.basename(filePath)}.synthetic.cjs`), module)
  loaded.filename = path.join(root, `${path.basename(filePath)}.synthetic.cjs`)
  loaded.paths = module.paths
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    return Object.hasOwn(stubs, request) ? stubs[request] : originalLoad.call(this, request, parent, isMain)
  }
  try { loaded._compile(js, loaded.filename) } finally { Module._load = originalLoad }
  return loaded.exports
}

test('consent flags accept only separate booleans and do not require omitted optional choices', () => {
  const { hasValidLuxorInquiryConsentFlags } = loadTypeScript('src/lib/luxorInquiryTypes.ts')
  assert.equal(hasValidLuxorInquiryConsentFlags({ fullName: 'Test' }), true)
  for (const field of ['smsOptIn', 'smsMarketingOptIn', 'marketingOptIn']) {
    assert.equal(hasValidLuxorInquiryConsentFlags({ [field]: false }), true)
    assert.equal(hasValidLuxorInquiryConsentFlags({ [field]: true }), true)
    for (const malformed of ['false', 'true', 0, 1, null, {}]) {
      assert.equal(hasValidLuxorInquiryConsentFlags({ [field]: malformed }), false, `${field}=${String(malformed)}`)
    }
  }
  assert.equal(hasValidLuxorInquiryConsentFlags(null), false)
  assert.equal(hasValidLuxorInquiryConsentFlags([]), false)
})

test('inquiry normalization records only explicitly checked independent choices', () => {
  const inquiryTypes = loadTypeScript('src/lib/luxorInquiryTypes.ts')
  const { normalizeInquiry } = loadTypeScript('src/lib/luxorInquiriesServer.ts', {
    'server-only': {},
    './luxorInquiryTypes': inquiryTypes,
    './luxorEmailJobsServer': {},
    './supabaseRestServer': {},
    './luxorTourMetrics': {},
    './luxorTextAutomationsServer': {},
    './luxorTourSlotsServer': {},
  })
  const base = { fullName: 'Synthetic Lead', email: 'lead@example.invalid', phone: '3125550100', source: 'homepage_brochure', flow: 'brochure_lead', eventType: 'Wedding' }
  const none = normalizeInquiry(base)
  assert.equal(none.marketing_opt_in, false)
  assert.equal(none.metadata.marketingEmailConsent, undefined)
  assert.equal(none.metadata.smsConsent, undefined)

  const customerCare = normalizeInquiry({ ...base, smsOptIn: true })
  assert.deepEqual(customerCare.metadata.smsConsent.scopes, ['customer_care', 'tour', 'event'])
  assert.equal(customerCare.metadata.smsConsent.disclosures.length, 1)

  const marketingSms = normalizeInquiry({ ...base, smsMarketingOptIn: true })
  assert.deepEqual(marketingSms.metadata.smsConsent.scopes, ['marketing'])

  const marketingEmail = normalizeInquiry({ ...base, marketingOptIn: true })
  assert.equal(marketingEmail.marketing_opt_in, true)
  assert.deepEqual(marketingEmail.metadata.marketingEmailConsent, {
    status: 'opted_in',
    source: 'website_inquiry_form',
    disclosureVersion: '2026-10-23-v1',
    disclosure: 'Get special offers, event updates, and inspiration. Unsubscribe using the link in any marketing email.',
    email: 'lead@example.invalid',
    capturedAt: marketingEmail.metadata.marketingEmailConsent.capturedAt,
  })
  assert.equal(marketingEmail.metadata.smsConsent, undefined)
  const emailOptInWithoutAddress = normalizeInquiry({ ...base, email: '', marketingOptIn: true })
  assert.equal(emailOptInWithoutAddress.marketing_opt_in, false)
  assert.equal(emailOptInWithoutAddress.metadata.marketingEmailConsent, undefined)

  const combined = normalizeInquiry({ ...base, smsOptIn: true, smsMarketingOptIn: true, marketingOptIn: true })
  assert.deepEqual(combined.metadata.smsConsent.scopes, ['customer_care', 'tour', 'event', 'marketing'])
  assert.equal(combined.metadata.smsConsent.disclosures.length, 2)
  assert.equal(combined.metadata.smsConsent.disclosureVersion, '2026-10-23-v2')
  assert.equal(combined.marketing_opt_in, true)

  for (const invalidOrMissing of [false, undefined, 'false']) {
    const payload = {
      ...base,
      ...(invalidOrMissing === undefined ? {} : { smsOptIn: invalidOrMissing }),
      ...(invalidOrMissing === undefined ? {} : { marketingOptIn: invalidOrMissing }),
      metadata: {
        smsConsent: { status: 'opted_in', scopes: ['customer_care', 'marketing'], disclosures: ['forged'] },
        marketingEmailConsent: { status: 'opted_in', disclosure: 'forged' },
        consentPage: 'forged',
        disclosureVersion: 'forged',
        keepUnrelated: 'preserved',
      },
    }
    const normalized = normalizeInquiry(payload)
    assert.equal(normalized.metadata.smsConsent, undefined)
    assert.equal(normalized.metadata.marketingEmailConsent, undefined)
    assert.equal(normalized.metadata.consentPage, undefined)
    assert.equal(normalized.metadata.disclosureVersion, undefined)
    assert.equal(normalized.metadata.keepUnrelated, 'preserved')
    assert.equal(normalized.marketing_opt_in, false)
  }

  const forgedDisclosure = normalizeInquiry({
    ...base,
    smsOptIn: true,
    marketingOptIn: true,
    metadata: { smsConsent: { disclosures: ['forged'] }, marketingEmailConsent: { disclosure: 'forged' } },
  })
  assert.equal(forgedDisclosure.metadata.smsConsent.disclosures[0], inquiryTypes.LUXOR_INQUIRY_SMS_DISCLOSURE)
  assert.equal(forgedDisclosure.metadata.marketingEmailConsent.disclosure, inquiryTypes.LUXOR_MARKETING_EMAIL_DISCLOSURE)

  const legacySmsSignup = normalizeInquiry({
    ...base,
    source: 'website_sms_signup',
    flow: 'website_sms_signup',
    smsOptIn: true,
    smsMarketingOptIn: true,
  })
  assert.equal(legacySmsSignup.metadata.smsConsent.source, 'website_sms_signup')
  assert.deepEqual(legacySmsSignup.metadata.smsConsent.scopes, ['customer_care', 'tour', 'event', 'marketing'])
  assert.equal(legacySmsSignup.metadata.smsConsent.disclosures[0], inquiryTypes.LUXOR_SMS_SIGNUP_CUSTOMER_CARE_DISCLOSURE)

  const visitEmail = normalizeInquiry({
    ...base,
    source: 'visit_page',
    flow: 'visit_booking',
    marketingOptIn: true,
  })
  assert.equal(visitEmail.marketing_opt_in, true)
  assert.equal(visitEmail.metadata.marketingEmailConsent.disclosure, inquiryTypes.LUXOR_LEGACY_VISIT_EMAIL_DISCLOSURE)
  const spanishVisitEmail = normalizeInquiry({
    ...base,
    source: 'visit_page',
    flow: 'visit_booking',
    marketingOptIn: true,
    metadata: { websiteLocale: 'es' },
  })
  assert.equal(spanishVisitEmail.metadata.marketingEmailConsent.disclosure, inquiryTypes.LUXOR_LEGACY_VISIT_EMAIL_DISCLOSURE_ES)

  const spanishNewsletter = normalizeInquiry({
    ...base,
    source: 'newsletter',
    flow: 'newsletter_signup',
    marketingOptIn: true,
    metadata: { tourLanguagePreference: 'es' },
  })
  assert.equal(spanishNewsletter.marketing_opt_in, true)
  assert.equal(spanishNewsletter.metadata.marketingEmailConsent.disclosure, inquiryTypes.LUXOR_NEWSLETTER_EMAIL_DISCLOSURE_ES)
  assert.equal(spanishNewsletter.metadata.marketingEmailConsent.disclosureVersion, inquiryTypes.LUXOR_NEWSLETTER_EMAIL_DISCLOSURE_VERSION)

  const unknownForm = normalizeInquiry({ ...base, source: 'client-selected-source', smsOptIn: true, marketingOptIn: true })
  assert.equal(unknownForm.metadata.smsConsent, undefined)
  assert.equal(unknownForm.metadata.marketingEmailConsent, undefined)
  assert.equal(unknownForm.marketing_opt_in, false)
})

test('website consent never overwrites STOP, including a STOP racing the first insert', async () => {
  let calls
  let inserted
  let current
  const { recordLuxorWebsiteSmsConsent } = loadTypeScript('src/lib/luxorTextAutomationsServer.ts', {
    'server-only': {},
    twilio: {},
    './luxorCallsServer': { normalizePhoneNumber: (value) => `+1${value.replace(/\D/g, '').slice(-10)}` },
    './luxorMessagesServer': {},
    './luxorPhoneNumbersServer': {},
    './supabaseRestServer': {
      supabaseRest: async (query, init = {}) => {
        calls.push({ query, method: init.method || 'GET', headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined })
        if (init.method === 'PATCH') {
          if (!current || current.status === 'opted_out') return []
          current = { phone_number: '+13125550100', ...JSON.parse(init.body) }
          return [current]
        }
        if (init.method === 'POST') {
          if (current) return []
          if (inserted) {
            current = { phone_number: '+13125550100', status: 'opted_out', proof: { stop: true }, opted_out_at: 'raced' }
            return []
          }
          current = { phone_number: '+13125550100', ...JSON.parse(init.body) }
          return [current]
        }
        return current ? [current] : []
      },
    },
    './luxorTwilioServer': {},
    './luxorInquiriesServer': {},
    './luxorTestLeadServer': {},
    './luxorTestLeadPolicy': {},
  })

  calls = []
  current = { phone_number: '+13125550100', status: 'opted_out', proof: { stop: true }, opted_out_at: 'old' }
  inserted = false
  await recordLuxorWebsiteSmsConsent('3125550100', 'website_inquiry_form', { scopes: ['marketing'] })
  assert.equal(calls.length, 1)
  assert.match(calls[0].query, /status,updated_at,consent_scopes,proof/)
  assert.equal(current.status, 'opted_out')
  assert.deepEqual(current.proof, { stop: true })

  calls = []
  current = null
  inserted = true
  const result = await recordLuxorWebsiteSmsConsent('3125550100', 'website_inquiry_form', { scopes: ['customer_care'] })
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[1].method, 'PATCH')
  assert.equal(calls[2].method, 'POST')
  assert.equal(calls[3].method, 'GET')
  assert.equal(result.status, 'opted_out')
})

test('repeated non-STOP website opt-ins do not replace prior consent proof', async () => {
  const priorProof = { inquiry_id: 'synthetic-old', disclosure_texts: ['old approved copy'] }
  let updatedBody
  const { recordLuxorWebsiteSmsConsent } = loadTypeScript('src/lib/luxorTextAutomationsServer.ts', {
    'server-only': {},
    twilio: {},
    './luxorCallsServer': { normalizePhoneNumber: (value) => `+1${value.replace(/\D/g, '').slice(-10)}` },
    './luxorMessagesServer': {},
    './luxorPhoneNumbersServer': {},
    './supabaseRestServer': {
      supabaseRest: async (_query, init = {}) => {
        if (!init.method) return [{ phone_number: '+13125550100', status: 'opted_in', proof: priorProof }]
        updatedBody = JSON.parse(init.body)
        return [{ phone_number: '+13125550100', ...updatedBody }]
      },
    },
    './luxorTwilioServer': {},
    './luxorInquiriesServer': {},
    './luxorTestLeadServer': {},
    './luxorTestLeadPolicy': {},
  })
  await recordLuxorWebsiteSmsConsent('3125550100', 'website_inquiry_form', {
    scopes: ['customer_care'],
    proof: { inquiry_id: 'synthetic-new', disclosure_texts: ['new approved copy'] },
  })
  assert.deepEqual(updatedBody.proof, priorProof)
})

test('SMS signup marketing choice persists only server-selected disclosure evidence and reuses its source', async () => {
  let inserted
  let recorded
  const inquiryTypes = loadTypeScript('src/lib/luxorInquiryTypes.ts')
  const { createLuxorInquiry } = loadTypeScript('src/lib/luxorInquiriesServer.ts', {
    'server-only': {},
    './luxorInquiryTypes': inquiryTypes,
    './luxorEmailJobsServer': {},
    './supabaseRestServer': {
      supabaseRest: async (_query, init = {}) => {
        inserted = JSON.parse(init.body)
        return [{ id: 'synthetic-inquiry', ...inserted }]
      },
    },
    './luxorTourMetrics': {},
    './luxorTextAutomationsServer': {
      recordLuxorWebsiteSmsConsent: async (phone, source, options) => {
        recorded = { phone, source, options }
        return { status: 'opted_in' }
      },
    },
    './luxorTextCampaignsServer': { queueInquiryTextJobs: async () => {} },
    './luxorTourSlotsServer': {},
  })

  await createLuxorInquiry({
    fullName: 'Synthetic SMS Signup',
    phone: '3125550100',
    eventType: 'Text messaging consent',
    source: 'website_sms_signup',
    flow: 'website_sms_signup',
    smsMarketingOptIn: true,
    metadata: {
      smsConsent: { source: 'forged', scopes: ['payment'], disclosures: ['forged'] },
      disclosureVersion: 'forged',
    },
  })
  assert.equal(inserted.metadata.smsConsent.source, 'website_sms_signup')
  assert.equal(inserted.metadata.smsConsent.disclosures[0], inquiryTypes.LUXOR_SMS_SIGNUP_MARKETING_DISCLOSURE)
  assert.deepEqual(inserted.metadata.smsConsent.scopes, ['marketing'])
  assert.equal(recorded.source, 'website_sms_signup')
  assert.deepEqual(recorded.options.scopes, ['marketing'])
  assert.deepEqual(recorded.options.proof.disclosure_texts, [inquiryTypes.LUXOR_SMS_SIGNUP_MARKETING_DISCLOSURE])
})

test('audience selection requires the exact requested SMS scope', async () => {
  const inquiries = [
    { id: 'care', full_name: 'Care', phone: '3125550101', status: 'new' },
    { id: 'marketing', full_name: 'Marketing', phone: '3125550102', status: 'new' },
    { id: 'empty', full_name: 'Empty', phone: '3125550103', status: 'new' },
  ]
  const consents = [
    { phone_number: '+13125550101', status: 'opted_in', consent_scopes: ['customer_care'] },
    { phone_number: '+13125550102', status: 'opted_in', consent_scopes: ['marketing'] },
    { phone_number: '+13125550103', status: 'opted_in', consent_scopes: [] },
  ]
  const { listEligibleTextAudience } = loadTypeScript('src/lib/luxorTextCampaignsServer.ts', {
    'server-only': {},
    twilio: {},
    './luxorTestLeadPolicy': {},
    './luxorCallsServer': { normalizePhoneNumber: (value) => `+1${value.replace(/\D/g, '').slice(-10)}` },
    './luxorMessagesServer': {},
    './luxorPhoneNumbersServer': {},
    './supabaseRestServer': { supabaseRest: async (query) => query.startsWith('luxor_inquiries?') ? inquiries : consents },
    './luxorTextAutomationsServer': {},
    './luxorTextCampaignTypes': {},
    './luxorTwilioServer': {},
    './luxorPaymentReminderDueDate': {},
    './luxorInquiriesServer': {},
    './luxorTestLeadServer': {},
    './luxorCustomWorkflowFeatureGates': {},
  })
  assert.deepEqual((await listEligibleTextAudience({ requiredScope: 'marketing' })).map((recipient) => recipient.inquiryId), ['marketing'])
  assert.deepEqual((await listEligibleTextAudience({ requiredScope: 'customer_care' })).map((recipient) => recipient.inquiryId), ['care'])
})

test('the public form keeps three separate unchecked optional controls and expandable disclosures', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/LuxorBrochureForm.tsx'), 'utf8')
  for (const control of ['inquiry-sms', 'marketing-email', 'marketing-sms']) {
    assert.match(source, new RegExp(`id=\\{\x60\\$\\{preferencesId\\}-${control}\\x60\\} type="checkbox"`))
  }
  assert.equal((source.match(/checked=\{(?:smsCustomerCareConsent|emailMarketingConsent|smsMarketingConsent)\}/g) || []).length, 3)
  assert.match(source, /type="checkbox" checked=\{smsCustomerCareConsent\}/)
  assert.match(source, /type="checkbox" checked=\{emailMarketingConsent\}/)
  assert.match(source, /type="checkbox" checked=\{smsMarketingConsent\}/)
  assert.match(source, /aria-expanded=\{open\}/)
  assert.match(source, /hidden=\{!inquirySmsDisclosureOpen\}/)
  assert.match(source, /hidden=\{!marketingSmsDisclosureOpen\}/)
  assert.match(source, /LUXOR_INQUIRY_SMS_DISCLOSURE/)
  assert.match(source, /LUXOR_MARKETING_SMS_DISCLOSURE/)
  assert.match(source, /LUXOR_MARKETING_EMAIL_DISCLOSURE/)
  assert.match(source, /By submitting this form, you agree to our/)
  assert.match(source, /Choose how you’d like to hear from us\./)
  const smsSignup = fs.readFileSync(path.join(root, 'src/app/(site)/sms-signup/page.tsx'), 'utf8')
  assert.match(smsSignup, /LUXOR_SMS_SIGNUP_CUSTOMER_CARE_DISCLOSURE/)
  assert.match(smsSignup, /LUXOR_SMS_SIGNUP_MARKETING_DISCLOSURE/)
  const inquiryForm = fs.readFileSync(path.join(root, 'src/components/LuxorInquiryForm.tsx'), 'utf8')
  assert.match(inquiryForm, /LUXOR_LEGACY_INQUIRY_SMS_DISCLOSURE/)
  assert.match(inquiryForm, /LUXOR_LEGACY_MARKETING_SMS_DISCLOSURE/)
  const newsletter = fs.readFileSync(path.join(root, 'src/components/NewsletterSignup.tsx'), 'utf8')
  assert.match(newsletter, /LUXOR_NEWSLETTER_EMAIL_DISCLOSURE/)
  assert.match(newsletter, /LUXOR_NEWSLETTER_EMAIL_DISCLOSURE_ES/)
  assert.match(source, /href="\/privacy"/)
  assert.match(source, /href="\/terms"/)
})
