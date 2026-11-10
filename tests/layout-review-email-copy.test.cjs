'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative), mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod); mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename); return mod.exports
}
const copy = load('src/lib/luxorLayoutReviewEmailCopy.ts')
const renderer = load('src/lib/luxorLayoutReviewsServer.ts', { './luxorLayoutReviewEmailCopy': copy })
const input = { clientName: 'Sample Guest', review: { layout_name: 'Wedding setup', expires_at: '2099-12-01T12:00:00Z' }, reviewUrl: 'https://example.invalid/layout-review/synthetic' }
test('custom layout wording retains the exact private review link and expiry', () => {
  const custom = { ...copy.LAYOUT_REVIEW_EMAIL_DEFAULT, subject: 'Layout for {{first_name}}', body: 'Please review {{layout_name}}.' }
  const message = renderer.buildLuxorLayoutReviewEmail({ ...input, copyOverride: custom })
  assert.equal(message.subject, 'Layout for Sample'); assert.match(message.body, /Please review Wedding setup/); assert.match(message.body, /https:\/\/example\.invalid\/layout-review\/synthetic/); assert.match(message.body, /private link expires/i)
})
test('restoring default preserves original copy and disallows unlisted variables', () => {
  assert.match(renderer.buildLuxorLayoutReviewEmail(input).body, /Your saved event layout/)
  assert.throws(() => copy.validateLayoutReviewEmailCopy({ ...copy.LAYOUT_REVIEW_EMAIL_DEFAULT, body: '{{unknown}}' }), /listed email variables/)
})
