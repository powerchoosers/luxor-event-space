/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const filename = path.resolve('src/lib/luxorElenaAttachmentsServer.ts')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = module.paths
const originalLoad = Module._load
Module._load = function (request, parent, main) {
  return request === 'server-only' ? {} : originalLoad.call(this, request, parent, main)
}
try {
  loaded._compile(code, filename)
} finally {
  Module._load = originalLoad
}

const { prepareElenaChatAttachments } = loaded.exports

test('prepareElenaChatAttachments sends images and PDFs as multimodal parts', () => {
  const pngData = 'data:image/png;base64,AAAA'
  const pdfData = 'data:application/pdf;base64,QUJDRA=='
  const result = prepareElenaChatAttachments([
    { name: 'receipt.png', type: 'image/png', dataUrl: pngData },
    { name: 'water-bill.pdf', type: 'application/pdf', dataUrl: pdfData },
    { name: 'notes.txt', type: 'text/plain', textContent: 'Vendor called about due date.' },
  ])

  assert.equal(result.hasPdf, true)
  assert.ok(result.message)
  assert.equal(result.message.role, 'user')
  const parts = result.message.content
  assert.equal(parts.filter((part) => part.type === 'image_url').length, 1)
  assert.equal(parts.filter((part) => part.type === 'file').length, 1)
  assert.match(parts.find((part) => part.type === 'text' && part.text.includes('notes.txt')).text, /Vendor called/)
})

test('prepareElenaChatAttachments rejects oversize data URLs', () => {
  const huge = `data:image/png;base64,${'A'.repeat(10_500_001)}`
  const result = prepareElenaChatAttachments([{ name: 'huge.png', type: 'image/png', dataUrl: huge }])
  assert.match(result.skipped.join(' '), /too large/)
})
