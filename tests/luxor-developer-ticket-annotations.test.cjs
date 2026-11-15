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

const annotations = load('src/lib/luxorDeveloperTicketAnnotations.ts')
const draft = load('src/lib/luxorDeveloperTicketDraft.ts', {
  '@/lib/luxorDeveloperTicketAnnotations': annotations,
})

const { parseDeveloperSupportAnnotations, developerSupportAnnotationsForWebhook, formatDeveloperSupportAnnotationsContext } = annotations
const { readDeveloperTicketDraft, writeDeveloperTicketDraft, developerTicketDraftStorageKey } = draft

test('parseDeveloperSupportAnnotations validates structure and limits', () => {
  const sample = parseDeveloperSupportAnnotations([
    {
      id: 'a1',
      note: 'This label is cut off',
      pagePath: '/portal/leads',
      element: {
        selector: 'button:nth-of-type(2)',
        role: 'button',
        label: 'Add lead',
        visibleText: 'Add lead',
      },
      viewport: { width: 1440, height: 900 },
      createdAt: 1,
      updatedAt: 2,
    },
  ])
  assert.equal(sample.length, 1)
  assert.equal(sample[0].element.label, 'Add lead')
  assert.throws(() => parseDeveloperSupportAnnotations([{ note: 'missing fields' }]), /Invalid ticket annotations/)
  assert.throws(
    () => parseDeveloperSupportAnnotations(new Array(26).fill({
      id: 'x',
      note: 'n',
      pagePath: '/portal',
      element: { selector: 'main', role: 'main', label: 'Main' },
      viewport: { width: 400, height: 800 },
    })),
    /At most 25/,
  )
})

test('webhook annotations mirror stored ticket notes', () => {
  const parsed = parseDeveloperSupportAnnotations([
    {
      id: 'ann-1',
      note: 'Wrong number here',
      pagePath: '/portal/dashboard',
      element: { selector: '#phone', role: 'link', label: 'Phone', visibleText: '(305) 555-0100' },
      viewport: { width: 390, height: 844 },
    },
  ])
  const webhook = developerSupportAnnotationsForWebhook(parsed)
  assert.equal(webhook[0].note, 'Wrong number here')
  assert.equal(webhook[0].selector, '#phone')
  assert.equal(webhook[0].viewportWidth, 390)
  const context = formatDeveloperSupportAnnotationsContext(parsed)
  assert.match(context, /Wrong number here/)
  assert.match(context, /#phone/)
})

test('developer ticket draft persists annotations in localStorage', () => {
  const key = developerTicketDraftStorageKey('a.patterson@luxoratlaspalmas.com')
  const storage = new Map()
  global.window = {
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    dispatchEvent: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  writeDeveloperTicketDraft('a.patterson@luxoratlaspalmas.com', {
    version: 1,
    active: true,
    phase: 'compose',
    title: 'Broken filter',
    description: 'Leads filter stuck',
    priority: 'high',
    pagePath: '/portal/leads',
    savedAttachments: [],
    selectedAttachmentKeys: [],
    annotations: parseDeveloperSupportAnnotations([
      {
        id: 'draft-1',
        note: 'Filter chip',
        pagePath: '/portal/leads',
        element: { selector: 'button.filter', role: 'button', label: 'Status' },
        viewport: { width: 834, height: 1100 },
      },
    ]),
    chatId: '00000000-0000-4000-8000-000000000099',
    updatedAt: 0,
  })
  const loaded = readDeveloperTicketDraft('a.patterson@luxoratlaspalmas.com')
  assert.equal(loaded.active, true)
  assert.equal(loaded.title, 'Broken filter')
  assert.equal(loaded.annotations.length, 1)
  assert.equal(storage.get(key).includes('Filter chip'), true)
  delete global.window
})