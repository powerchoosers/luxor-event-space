'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function loadConversational() {
  const filename = path.resolve(__dirname, '../src/lib/luxorConversationalEmailServer.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  )
  return mod.exports
}

test('Elena conversational email reuses composer signature styling', () => {
  const { buildConversationalEmailHtml, luxorEmailHtmlToPlainText } = loadConversational()
  const html = buildConversationalEmailHtml({
    to: 'guest@example.invalid',
    subject: 'Venue details',
    body: 'Here is what you asked about.',
    senderName: 'Elena',
    senderRole: "Luxor's AI concierge",
    organizationName: 'Luxor at Las Palmas Events',
    senderEmail: 'elena@luxoratlaspalmas.com',
    senderPhone: '+12109068803',
    signatureWebsite: 'luxoratlaspalmas.com',
  })
  assert.match(html, /class="luxor-signature-wrap"/)
  assert.match(html, /Elena/)
  assert.match(html, /Luxor.+ AI concierge · Luxor at Las Palmas Events/)
  assert.match(html, /elena@luxoratlaspalmas\.com/)
  assert.match(html, /luxoratlaspalmas\.com/)
  const text = luxorEmailHtmlToPlainText(html)
  assert.match(text, /Here is what you asked about\./)
  assert.match(text, /Elena/)
})