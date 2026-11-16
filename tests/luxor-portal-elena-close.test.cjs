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

const elenaClose = load('src/lib/luxorPortalElenaClose.ts')
const clientMount = load('src/lib/luxorPortalClientMount.ts')

test('getPortalClientMountedSnapshot returns a stable cached value', () => {
  const first = clientMount.getPortalClientMountedSnapshot()
  const second = clientMount.getPortalClientMountedSnapshot()
  assert.equal(first, true)
  assert.equal(second, true)
  assert.equal(first === second, true)
})

test('keyboard Enter on close closes once without a duplicate click path', () => {
  const controller = elenaClose.createPortalElenaCloseController(500)
  let closeCount = 0
  const onClose = () => {
    if (!controller.requestClose(true, 'keyboard')) return
    closeCount += 1
  }

  let prevented = 0
  elenaClose.handleElenaPanelCloseKeyDown(
    {
      key: 'Enter',
      preventDefault: () => { prevented += 1 },
      stopPropagation: () => {},
    },
    onClose,
    () => controller.armKeyboardClose(),
  )

  assert.equal(prevented, 1)
  assert.equal(closeCount, 1)
  assert.equal(controller.shouldIgnoreDuplicateCloseClick(), true, 'duplicate click from Enter must be ignored')
  assert.equal(controller.requestClose(true, 'keyboard'), false, 'in-flight close should block re-entry')
  controller.finishClose()
  assert.equal(
    controller.shouldIgnoreLauncherActivation(),
    true,
    'launcher must not re-activate from the same Enter',
  )
  assert.equal(closeCount, 1)
})