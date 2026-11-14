'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function load(relativePath, env = {}) {
  const touched = ['LUXOR_MAIL_ALLOWED_SENDERS', 'LUXOR_ZOHO_ALLOWED_SENDERS', 'LUXOR_MAIL_FROM', 'LUXOR_ZOHO_LOGIN_EMAIL', 'LUXOR_ELENA_MAIL_ADDRESS', 'LUXOR_ELENA_MAIL_DISPLAY_NAME']
  const previous = Object.fromEntries(touched.map((key) => [key, process.env[key]]))
  for (const key of touched) delete process.env[key]
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })
  try {
    const filename = path.resolve(__dirname, '..', relativePath)
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
  } finally {
    for (const key of touched) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
}

test('elena@ is approved by default and uses Elena | Luxor Events display name', () => {
  const config = load('src/lib/luxorMailConfig.ts', {
    LUXOR_MAIL_ALLOWED_SENDERS: undefined,
    LUXOR_ELENA_MAIL_ADDRESS: undefined,
    LUXOR_ELENA_MAIL_DISPLAY_NAME: undefined,
  })
  assert.ok(config.luxorMailSenders().includes('elena@luxoratlaspalmas.com'))
  assert.equal(config.luxorElenaMailFrom(), 'elena@luxoratlaspalmas.com')
  assert.equal(config.luxorElenaMailDisplayName(), 'Elena | Luxor Events')
  assert.equal(config.luxorElenaMailReplyTo(), 'booking@luxoratlaspalmas.com')
})

test('custom allowlists still include the configured Elena address', () => {
  const config = load('src/lib/luxorMailConfig.ts', {
    LUXOR_MAIL_ALLOWED_SENDERS: 'booking@luxoratlaspalmas.com',
    LUXOR_ELENA_MAIL_ADDRESS: 'elena@luxoratlaspalmas.com',
  })
  assert.ok(config.luxorMailSenders().includes('elena@luxoratlaspalmas.com'))
})