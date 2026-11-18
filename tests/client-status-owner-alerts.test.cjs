/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function compile(relativePath, filename, stubs = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(stubs, request)) return stubs[request]
    return originalLoad.call(this, request, parent, isMain)
  }
  try { loaded._compile(js, filename) } finally { Module._load = originalLoad }
  return loaded.exports
}

const attention = compile('src/lib/luxorClientAttention.ts', path.join(root, 'client-attention.synthetic.cjs'))

test('luxorLeadNeedsClientAttention respects acknowledgement timestamp', () => {
  assert.equal(attention.luxorLeadNeedsClientAttention({ client_attention_at: null, client_attention_acknowledged_at: null }), false)
  assert.equal(attention.luxorLeadNeedsClientAttention({
    client_attention_at: '2026-11-18T12:00:00.000Z',
    client_attention_acknowledged_at: null,
  }), true)
  assert.equal(attention.luxorLeadNeedsClientAttention({
    client_attention_at: '2026-11-18T12:00:00.000Z',
    client_attention_acknowledged_at: '2026-11-18T13:00:00.000Z',
  }), false)
  assert.equal(attention.luxorLeadNeedsClientAttention({
    client_attention_at: '2026-11-18T13:00:00.000Z',
    client_attention_acknowledged_at: '2026-11-18T12:00:00.000Z',
  }), true)
})

test('owner recipient helper documents booking fallback source in module', () => {
  const source = fs.readFileSync(path.join(root, 'src/lib/luxorOwnerNotificationRecipientsServer.ts'), 'utf8')
  assert.match(source, /luxor_user_preferences/)
  assert.match(source, /notification_emails/)
  assert.match(source, /booking@luxoratlaspalmas\.com/)
})