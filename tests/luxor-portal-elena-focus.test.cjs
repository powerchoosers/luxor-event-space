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

const focus = load('src/lib/luxorPortalElenaFocus.ts')
const clientMount = load('src/lib/luxorPortalClientMount.ts')

test('client mount getSnapshot is stable', () => {
  assert.equal(clientMount.getPortalClientMountedSnapshot(), clientMount.getPortalClientMountedSnapshot())
})

test('focusElenaPanelEntry prefers first focusable control', () => {
  let focused = null
  const button = {
    focus: () => {
      focused = 'button'
    },
  }
  const panel = {
    querySelector: (selector) => (String(selector).includes('button') ? button : null),
  }
  focus.focusElenaPanelEntry(panel)
  assert.equal(focused, 'button')
})

test('focusElenaLauncher moves focus to launcher', () => {
  let focused = false
  const launcher = {
    focus: () => {
      focused = true
    },
  }
  focus.focusElenaLauncher(launcher)
  assert.equal(focused, true)
})