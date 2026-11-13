/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const Module = require('node:module')

function load(file) {
  const m = new Module(path.resolve(file), module)
  m.filename = path.resolve(file)
  m.paths = module.paths
  const old = Module._load
  Module._load = function (name, parent, isMain) {
    return old.call(this, name, parent, isMain)
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

const {
  PORTAL_FIX_NOTICE_DISMISS_PREFIX,
  portalFixNoticeDismissStorageKey,
  parsePortalFixNotice,
} = load('src/lib/luxorPortalFixNotice.ts')

test('portal fix notice dismiss storage key is namespaced per notice id', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  assert.equal(portalFixNoticeDismissStorageKey(id), `${PORTAL_FIX_NOTICE_DISMISS_PREFIX}${id}`)
})

test('parsePortalFixNotice keeps banner_label from the row', () => {
  const notice = parsePortalFixNotice({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Smoother lead handoff',
    banner_label: 'Message from Braxton',
    summary: ['Hi Arianna, a small portal update is ready.'],
    fixed_text: 'The lead inbox refresh button now waits for fresh data.',
    unchanged_text: 'Your saved filters and sort order stay exactly as you left them.',
    if_stuck: 'Reply in developer support and mention lead inbox refresh.',
    steps: [{ title: 'Open Leads', text: 'Go to Leads and tap a row.' }],
  })
  assert.ok(notice)
  assert.equal(notice.bannerLabel, 'Message from Braxton')
})
