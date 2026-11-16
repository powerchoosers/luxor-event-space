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

const noteSave = load('src/lib/luxorDeveloperTicketNoteSave.ts')

test('Esc cancel must not allow blur or timer save paths', () => {
  assert.equal(
    noteSave.shouldSaveDeveloperTicketNote({
      cancelled: true,
      suppressed: false,
      hasAnchor: true,
      trimmedNote: 'QA test esc',
    }),
    false,
  )
  assert.equal(
    noteSave.shouldSaveDeveloperTicketNote({
      cancelled: false,
      suppressed: true,
      hasAnchor: true,
      trimmedNote: 'QA test esc',
    }),
    false,
  )
})

test('edit updates the same annotation id in place', () => {
  const existing = {
    id: 'ann-1',
    note: 'Old text',
    pagePath: '/portal/leads',
    element: { selector: '#lead-filter', role: 'button', label: 'Filter', visibleText: 'Filter' },
    viewport: { width: 1440, height: 900 },
    createdAt: 100,
    updatedAt: 100,
  }
  const next = noteSave.buildDeveloperTicketAnnotationCommit({
    id: 'ann-1',
    note: 'Revised copy',
    pagePath: '/portal/leads',
    viewport: { width: 1440, height: 900 },
    element: existing.element,
    existing,
    now: 200,
  })
  assert.equal(next.id, 'ann-1')
  assert.equal(next.note, 'Revised copy')
  assert.equal(next.createdAt, 100)
  assert.equal(next.updatedAt, 200)
  assert.equal(next.element.selector, '#lead-filter')
})