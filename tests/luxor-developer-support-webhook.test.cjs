/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const Module = require('node:module')

function load(file, stubs = {}) {
  const m = new Module(path.resolve(file), module)
  m.filename = path.resolve(file)
  m.paths = module.paths
  const old = Module._load
  Module._load = function (name, parent, isMain) {
    return name in stubs ? stubs[name] : old.call(this, name, parent, isMain)
  }
  try {
    m._compile(
      ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      m.filename,
    )
  } finally {
    Module._load = old
  }
  return m.exports
}

const pagePaths = load('src/lib/luxorDeveloperSupportPagePaths.ts')
const stubs = {
  'server-only': {},
  '@/lib/luxorPortalAuth': {},
  '@/lib/luxorPortalAccess': {},
  '@/lib/supabaseRestServer': {},
  '@/lib/luxorElenaConfirmation': {},
  '@/lib/luxorCursorAutomationServer': {},
  '@/lib/luxorDeveloperSupportAttachmentsServer': { parseDeveloperSupportAttachmentInputs: () => [] },
  '@/lib/luxorDeveloperSupportPagePaths': pagePaths,
}
const limits = load('src/lib/luxorDeveloperSupportLimits.ts')
const { parseDeveloperSupportTicket, buildDeveloperSupportWebhookPayload } = load(
  'src/lib/luxorElenaDeveloperSupportConfirmationServer.ts',
  { ...stubs, '@/lib/luxorDeveloperSupportLimits': limits },
)

test('parseDeveloperSupportTicket keeps portal and public page paths', () => {
  const portal = parseDeveloperSupportTicket({
    title: 'Portal bug',
    description: 'Broken table',
    priority: 'high',
    pagePath: '/portal/leads',
    attachments: [],
  })
  assert.equal(portal.pagePath, '/portal/leads')

  const pub = parseDeveloperSupportTicket({
    title: 'Homepage bug',
    description: 'Hero layout',
    priority: 'medium',
    pagePath: '/events',
    attachments: [],
  })
  assert.equal(pub.pagePath, '/events')

  const esSpaces = parseDeveloperSupportTicket({
    title: 'Spanish spaces page',
    description: null,
    priority: 'medium',
    pagePath: '/es/spaces',
    attachments: [],
  })
  assert.equal(esSpaces.pagePath, '/es/spaces')
})

test('parseDeveloperSupportTicket rejects extra details over 20,000 characters', () => {
  const ok = parseDeveloperSupportTicket({
    title: 'Long spec',
    description: 'x'.repeat(20_000),
    priority: 'medium',
    attachments: [],
  })
  assert.equal(ok.description?.length, 20_000)

  assert.throws(
    () => parseDeveloperSupportTicket({
      title: 'Too long',
      description: 'x'.repeat(20_001),
      priority: 'medium',
      attachments: [],
    }),
    /Shorten the extra details to 20,000 characters or less/,
  )
})

test('webhook payload carries pagePath, pageArea, and context route lines', () => {
  const payload = buildDeveloperSupportWebhookPayload({
    confirmationId: '00000000-0000-4000-8000-000000000001',
    title: 'Packages page',
    description: 'Cards misaligned',
    priority: 'high',
    pagePath: '/events',
    reporterEmail: 'owner@luxor.invalid',
    reporterName: 'Arianna Patterson',
    attachmentContext: null,
  })
  assert.equal(payload.pagePath, '/events')
  assert.equal(payload.pageArea, 'public')
  assert.match(payload.context, /Target page path \(authoritative route\): \/events/)
  assert.match(payload.context, /Page area: public/)
})
