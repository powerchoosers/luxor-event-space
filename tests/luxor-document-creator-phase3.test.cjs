/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function compile(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const loaded = new Module(relativePath, module)
  loaded.filename = path.join(root, relativePath)
  loaded.paths = module.paths
  loaded._compile(js, loaded.filename)
  return loaded.exports
}

const plan = compile('src/lib/luxorCreatedDocumentSendPlan.ts')
const overlay = compile('src/lib/luxorCreatedDocumentSignerOverlay.ts')

test('parallel send invites every uninvited recipient and sequential waits', () => {
  const signers = [
    { id: 'a', name: 'Ada', email: 'ada@example.com', sign_order: 1, status: 'pending', invited_at: null },
    { id: 'b', name: 'Bea', email: 'elenaassistant@mail.grokbot.com', sign_order: 2, status: 'pending', invited_at: null },
  ]
  assert.deepEqual(plan.planCreatedDocumentInvitations('parallel', signers).map((signer) => signer.id), ['a', 'b'])
  assert.deepEqual(plan.planCreatedDocumentInvitations('sequential', signers).map((signer) => signer.id), ['a'])
  const afterFirst = signers.map((signer) => signer.id === 'a' ? { ...signer, invited_at: '2026-11-19T00:00:00.000Z', status: 'viewed' } : signer)
  assert.deepEqual(plan.planCreatedDocumentInvitations('sequential', afterFirst), [])
  const firstSigned = afterFirst.map((signer) => signer.id === 'a' ? { ...signer, status: 'signed' } : signer)
  assert.deepEqual(plan.planCreatedDocumentInvitations('sequential', firstSigned).map((signer) => signer.id), ['b'])
})

test('reminders are scheduled only when the operator enables them', () => {
  const now = Date.parse('2026-11-19T00:00:00.000Z')
  assert.equal(plan.createdDocumentReminderSchedule(false, 3, now), null)
  assert.equal(plan.createdDocumentReminderSchedule(true, 3, now), '2026-11-22T00:00:00.000Z')
  assert.equal(plan.createdDocumentReminderSchedule(true, 0, now), '2026-11-20T00:00:00.000Z')
})

test('document status rolls up to viewed, partial, fully signed, and declined', () => {
  assert.equal(plan.rollupCreatedDocumentStatus([{ status: 'pending' }, { status: 'pending' }]), 'sent')
  assert.equal(plan.rollupCreatedDocumentStatus([{ status: 'viewed' }, { status: 'pending' }]), 'opened')
  assert.equal(plan.rollupCreatedDocumentStatus([{ status: 'signed' }, { status: 'viewed' }]), 'partially_signed')
  assert.equal(plan.rollupCreatedDocumentStatus([{ status: 'signed' }, { status: 'signed' }]), 'signed')
  assert.equal(plan.rollupCreatedDocumentStatus([{ status: 'signed' }, { status: 'declined' }]), 'declined')
})

test('library groupings keep drafts, out for signature, and completed apart', () => {
  assert.equal(plan.createdDocumentLibraryStatusFilter('my_documents'), 'status=eq.draft')
  assert.equal(plan.createdDocumentLibraryStatusFilter('out_for_signature'), 'status=in.(sent,opened,partially_signed)')
  assert.equal(plan.createdDocumentLibraryStatusFilter('completed'), 'status=in.(signed,declined,voided)')
})

test('queue guard refuses a real customer address unless the portal confirms a live send', () => {
  assert.equal(plan.isLuxorCreatedDocumentTestRecipient('elenaassistant@mail.grokbot.com'), true)
  assert.equal(plan.isLuxorCreatedDocumentTestRecipient('guest@example.com'), true)
  assert.equal(plan.isLuxorCreatedDocumentTestRecipient('booking@luxoratlaspalmas.com'), false)
  assert.throws(
    () => plan.assertCreatedDocumentQueueRecipient('booking@luxoratlaspalmas.com', false),
    /non-test recipient/,
  )
  assert.doesNotThrow(() => plan.assertCreatedDocumentQueueRecipient('guest@example.com', false))
  assert.doesNotThrow(() => plan.assertCreatedDocumentQueueRecipient('booking@luxoratlaspalmas.com', true))
})

test('combined PDF path stays in the private created-documents folder', () => {
  assert.equal(
    plan.executedCreatedDocumentPdfPath('doc-1'),
    'created-documents/doc-1/final/executed.pdf',
  )
})

test('signer overlay inputs stay at 16px and scale to fit', () => {
  const presentation = overlay.signerOverlayInputPresentation(8)
  assert.equal(presentation.fontSize, '16px')
  assert.match(presentation.transform, /^scale\(0\.5/)
  assert.equal(overlay.signerOverlayInputPresentation(16).transform, 'none')
})

test('signature emails prefer the request host, then the preview deployment', () => {
  assert.equal(plan.createdDocumentSigningOrigin({
    host: 'luxor-event-space-git-preview.vercel.app',
    forwardedProto: 'https',
  }), 'https://luxor-event-space-git-preview.vercel.app')
  assert.equal(plan.createdDocumentSigningOrigin({
    vercelEnv: 'preview',
    vercelUrl: 'luxor-event-space-preview.vercel.app',
  }), 'https://luxor-event-space-preview.vercel.app')
  assert.equal(plan.createdDocumentSigningOrigin({
    siteUrl: 'https://www.luxoratlaspalmas.com',
  }), 'https://www.luxoratlaspalmas.com')
})

test('a blank uninvited role does not block fully signed', () => {
  assert.equal(plan.rollupCreatedDocumentStatus([
    { status: 'signed', name: 'Ada', email: 'ada@example.com', invited_at: '2026-11-19T00:00:00.000Z' },
    { status: 'pending', name: '', email: '', invited_at: null, role_key: 'luxor' },
  ]), 'signed')
  assert.equal(plan.rollupCreatedDocumentStatus([
    { status: 'signed', name: 'Ada', email: 'ada@example.com', invited_at: '2026-11-19T00:00:00.000Z' },
    { status: 'pending', name: 'Bea', email: 'bea@example.com', invited_at: null },
  ]), 'partially_signed')
})

test('blank Luxor and extra roles are not required when one recipient is filled', () => {
  const addressed = plan.addressedCreatedDocumentRecipients([
    { name: 'Ada', email: 'ada@example.com' },
    { name: '', email: '' },
    { name: '', email: '' },
  ])
  assert.equal(addressed.length, 1)
  assert.equal(addressed[0].email, 'ada@example.com')
})

function compileWithStubs(relativePath, filename, stubs) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(stubs, request)) return stubs[request]
    const mapped = request.startsWith('@/')
      ? path.join(root, 'src', request.slice(2))
      : request.startsWith('./') || request.startsWith('../')
        ? path.resolve(path.dirname(filename), request)
        : null
    if (mapped) {
      const candidates = [mapped, `${mapped}.ts`, `${mapped}.tsx`]
      const hit = candidates.find((candidate) => fs.existsSync(candidate))
      if (hit) return compileWithStubs(path.relative(root, hit), `${hit}.synthetic.cjs`, stubs)
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    loaded._compile(js, filename)
  } finally {
    Module._load = originalLoad
  }
  return loaded.exports
}

test('void keeps the signing token and the link is cancelled, not missing', async () => {
  const updates = []
  const patches = []
  const delivery = compileWithStubs('src/lib/luxorCreatedDocumentDeliveryServer.ts', path.join(root, 'luxor-created-delivery-void.synthetic.cjs'), {
    'server-only': {},
    './luxorEmailDesignSystem': { renderLuxorSystemEmail: () => '<p></p>' },
    './luxorEmailJobsServer': { createLuxorEmailJob: async (job) => job },
    './luxorCreatedDocumentFieldsServer': {
      listLuxorCreatedDocumentSigners: async () => [{ id: 'signer', token_hash: 'keep-me', status: 'viewed', email: 'ada@example.com', name: 'Ada', sign_order: 1, invited_at: '2026-11-19T00:00:00.000Z' }],
      updateLuxorCreatedDocumentSigner: async (_id, patch) => { updates.push(patch); return null },
      latestLuxorCreatedDocumentSignedEventPayload: async () => null,
    },
    './luxorCreatedDocumentSignedPdfServer': { buildLuxorCreatedDocumentExecutedPdf: async () => 'path' },
    './luxorCreatedDocumentSendPlan': plan,
    './luxorCreatedDocumentToken': compile('src/lib/luxorCreatedDocumentToken.ts'),
    './luxorDocumentCreatorServer': {
      getLuxorCreatedDocument: async () => ({ id: 'doc', status: 'sent', title: 'Agreement', is_template: false }),
      patchLuxorCreatedDocumentRecord: async (_id, patch) => { patches.push(patch); return { id: 'doc', ...patch } },
    },
    './supabaseRestServer': { supabaseRest: async () => [] },
  })
  await delivery.voidLuxorCreatedDocument('doc')
  assert.equal(updates.length, 0)
  assert.equal(patches[0].status, 'voided')

  const signing = compileWithStubs('src/lib/luxorCreatedDocumentSigningServer.ts', path.join(root, 'luxor-created-void-gate.synthetic.cjs'), {
    'server-only': {},
    './luxorCreatedDocumentFieldTypes': { derivedSignerInitials: () => '', fieldValuesComplete: () => null, resolveEffectiveSignerFieldValues: () => ({}) },
    './luxorCreatedDocumentToken': { createLuxorCreatedDocumentSigningToken: () => ({}), hashLuxorCreatedDocumentSigningToken: () => '', luxorCreatedDocumentTokenExpired: () => false },
    './luxorCreatedDocumentFieldLayout': { luxorChicagoDateString: () => '', signerNeedsAdoptedSignature: () => false },
    './luxorCreatedDocumentFieldsServer': {},
    './luxorCreatedDocumentSignedPdfServer': {},
    './luxorDocumentCreatorServer': {},
  })
  const denial = await signing.luxorCreatedDocumentSignerGateResponse(
    { id: 'signer', document_id: 'doc', status: 'viewed', token_hash: 'keep-me', token_expires_at: null },
    { id: 'doc', status: 'voided', title: 'Agreement' },
  )
  assert.equal(denial.status, 410)
  assert.match(denial.error, /cancelled/i)
})

test('a manual reminder keeps the original link and reschedules the automatic reminder', async () => {
  process.env.LUXOR_PORTAL_SESSION_SECRET = 'phase3-test-secret'
  const tokenLib = compile('src/lib/luxorCreatedDocumentToken.ts')
  const originalToken = 'original-signing-token'
  const ciphertext = tokenLib.encryptLuxorCreatedDocumentSigningToken(originalToken)
  const jobs = []
  let mailedUrl = ''
  const updates = []
  const delivery = compileWithStubs('src/lib/luxorCreatedDocumentDeliveryServer.ts', path.join(root, 'luxor-created-delivery-remind.synthetic.cjs'), {
    'server-only': {},
    './luxorEmailDesignSystem': {
      renderLuxorSystemEmail: (input) => {
        mailedUrl = input.actions?.[0]?.url || mailedUrl
        return '<p>mail</p>'
      },
    },
    './luxorEmailJobsServer': { createLuxorEmailJob: async (job) => { jobs.push(job); return job } },
    './luxorCreatedDocumentFieldsServer': {
      listLuxorCreatedDocumentSigners: async () => [{
        id: 'signer',
        token_hash: 'hashed-original',
        token_ciphertext: ciphertext,
        status: 'viewed',
        email: 'ada@example.com',
        name: 'Ada',
        sign_order: 1,
        invited_at: '2026-11-19T00:00:00.000Z',
      }],
      updateLuxorCreatedDocumentSigner: async (_id, patch) => { updates.push(patch); return null },
      latestLuxorCreatedDocumentSignedEventPayload: async () => null,
    },
    './luxorCreatedDocumentSignedPdfServer': {},
    './luxorCreatedDocumentSendPlan': plan,
    './luxorCreatedDocumentToken': tokenLib,
    './luxorDocumentCreatorServer': {
      getLuxorCreatedDocument: async () => ({
        id: 'doc',
        status: 'sent',
        title: 'Agreement',
        is_template: false,
        signing_order: 'parallel',
        reminder_enabled: true,
        reminder_after_days: 3,
        sent_subject: 'Please sign',
        sent_message: 'Please review and sign this document.',
        signing_link_origin: 'https://preview.example',
      }),
      patchLuxorCreatedDocumentRecord: async (_id, patch) => patch,
    },
    './supabaseRestServer': { supabaseRest: async () => [] },
  })
  const before = Date.now()
  await delivery.remindLuxorCreatedDocumentSigners({ documentId: 'doc', confirmLiveSend: false })
  assert.equal(updates.length, 0)
  assert.match(mailedUrl, new RegExp(`/secure-portal/sign/${originalToken}`))
  assert.match(mailedUrl, /^https:\/\/preview\.example\//)
  assert.equal(jobs.length, 2)
  const scheduled = jobs.find((job) => job.scheduledFor)
  assert.ok(scheduled)
  const delay = Date.parse(scheduled.scheduledFor) - before
  assert.ok(delay >= 3 * 24 * 60 * 60 * 1000 - 5000)
  assert.ok(delay <= 3 * 24 * 60 * 60 * 1000 + 5000)
  assert.equal(jobs.filter((job) => !job.scheduledFor).length, 1)
})

test('sequential follow-up invites use the test-recipient guard', async () => {
  const jobs = []
  const delivery = compileWithStubs('src/lib/luxorCreatedDocumentDeliveryServer.ts', path.join(root, 'luxor-created-delivery-sequential.synthetic.cjs'), {
    'server-only': {},
    './luxorEmailDesignSystem': { renderLuxorSystemEmail: () => '<p></p>' },
    './luxorEmailJobsServer': { createLuxorEmailJob: async (job) => { jobs.push(job); return job } },
    './luxorCreatedDocumentFieldsServer': {
      listLuxorCreatedDocumentSigners: async () => [
        { id: 'a', status: 'signed', email: 'ada@example.com', name: 'Ada', sign_order: 1, invited_at: '2026-11-19T00:00:00.000Z', role_key: 'signer_1' },
        { id: 'b', status: 'pending', email: 'booking@luxoratlaspalmas.com', name: 'Office', sign_order: 2, invited_at: null, role_key: 'signer_2' },
      ],
      updateLuxorCreatedDocumentSigner: async () => null,
      latestLuxorCreatedDocumentSignedEventPayload: async () => null,
    },
    './luxorCreatedDocumentSignedPdfServer': { buildLuxorCreatedDocumentExecutedPdf: async () => 'path' },
    './luxorCreatedDocumentSendPlan': plan,
    './luxorCreatedDocumentToken': compile('src/lib/luxorCreatedDocumentToken.ts'),
    './luxorDocumentCreatorServer': {
      getLuxorCreatedDocument: async () => ({
        id: 'doc',
        status: 'sent',
        title: 'Agreement',
        is_template: false,
        archived_at: null,
        signing_order: 'sequential',
        reminder_enabled: false,
        reminder_after_days: 3,
        sent_subject: 'Please sign',
        sent_message: 'Please review.',
        signing_link_origin: 'https://preview.example',
        final_pdf_path: null,
      }),
      patchLuxorCreatedDocumentRecord: async (_id, patch) => ({ id: 'doc', status: 'sent', signing_order: 'sequential', ...patch }),
    },
    './supabaseRestServer': { supabaseRest: async () => [] },
  })
  await assert.rejects(
    () => delivery.syncLuxorCreatedDocumentDeliveryStatus('doc'),
    /non-test recipient/,
  )
  assert.equal(jobs.length, 0)
  const source = fs.readFileSync(path.join(root, 'src/lib/luxorCreatedDocumentDeliveryServer.ts'), 'utf8')
  const sequential = source.slice(source.indexOf("current.signing_order === 'sequential'"))
  assert.match(sequential, /confirmLiveSend:\s*false/)
  assert.doesNotMatch(sequential, /confirmLiveSend:\s*true/)
})

test('send drops signer rows that have no name and email', () => {
  const delivery = fs.readFileSync(path.join(root, 'src/lib/luxorCreatedDocumentDeliveryServer.ts'), 'utf8')
  const send = delivery.slice(delivery.indexOf('export async function sendLuxorCreatedDocumentForSignature'), delivery.indexOf('export async function remindLuxorCreatedDocumentSigners'))
  assert.match(send, /deleteLuxorCreatedDocumentSigner/)
  assert.match(send, /!signer\.name && !signer\.email/)
})

test('send route and delivery queue use the existing email job helper', () => {
  const delivery = fs.readFileSync(path.join(root, 'src/lib/luxorCreatedDocumentDeliveryServer.ts'), 'utf8')
  const route = fs.readFileSync(path.join(root, 'src/app/api/operations/documents/[id]/send/route.ts'), 'utf8')
  assert.match(delivery, /createLuxorEmailJob/)
  assert.match(delivery, /jobType: 'contract_signature'/)
  assert.doesNotMatch(delivery, /RESEND_API_KEY|new Resend|sendLuxorResendEmail/)
  assert.match(route, /confirmLiveSend: true/)
  assert.match(delivery, /createdDocumentReminderSchedule/)
})
