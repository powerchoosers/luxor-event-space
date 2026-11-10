'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative), mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod); mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : name === 'server-only' ? {} : actual(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename); return mod.exports
}
const copy = load('src/lib/luxorPlannerInvitationCopy.ts')
const sharing = load('src/lib/luxorPlannerSharingServer.ts', {
  '@/lib/luxorPlannerInvitationCopy': copy,
  '@/lib/luxorEmailDesignSystem': { renderLuxorSystemEmail: value => value },
  '@/lib/luxorPlannerLayout': {}, '@/lib/supabaseRestServer': {},
})
const input = { name: 'Sarah Guest', url: 'https://example.invalid/planner-review/private', expiresAt: '2099-12-01T12:00:00Z' }
test('custom invitation retains private link, expiry and verification instructions', () => {
  const message = sharing.buildPlannerPresentationInvitation({ ...input, copyOverride: { ...copy.PLANNER_INVITATION_DEFAULT, subject: 'Design for {{first_name}}', body: '<script>hello</script>' } })
  assert.equal(message.subject, 'Design for Sarah')
  assert.equal(message.body.actions[0].url, input.url)
  assert.match(message.body.note, /expires December 1, 2099/)
  assert.match(message.body.bodyHtml, /one-time code/)
  assert.match(message.body.bodyHtml, /&lt;script&gt;hello&lt;\/script&gt;/)
})
test('restored default uses original invitation and validates variables', () => {
  const message = sharing.buildPlannerPresentationInvitation(input)
  assert.match(message.body.bodyHtml, /then verify the email address/)
  assert.throws(() => copy.validatePlannerInvitationCopy({ ...copy.PLANNER_INVITATION_DEFAULT, body: '{{private_link}}' }), /listed email variable/)
  assert.throws(() => copy.validatePlannerInvitationCopy({ ...copy.PLANNER_INVITATION_DEFAULT, subject: 'Hi\nInjected' }), /single line/)
})
