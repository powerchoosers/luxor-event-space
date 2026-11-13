/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const filename = path.resolve('src/lib/luxorElenaChatAttachmentsServer.ts')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = module.paths
const originalLoad = Module._load
Module._load = function (request, parent, main) {
  if (request === 'server-only') return {}
  if (request === '@/lib/luxorExpensesServer') return { getLuxorExpenseStorageConfig: () => ({ url: 'https://example.supabase.co', key: 'test' }) }
  if (request === '@supabase/supabase-js') return { createClient: () => ({ storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/file' } }) }) } }) }
  return originalLoad.call(this, request, parent, main)
}
try {
  loaded._compile(code, filename)
} finally {
  Module._load = originalLoad
}

const { isElenaChatAttachmentStoragePath } = loaded.exports

test('isElenaChatAttachmentStoragePath only allows elena-chat paths for the chat', () => {
  const chatId = '11111111-1111-4111-8111-111111111111'
  assert.equal(
    isElenaChatAttachmentStoragePath(chatId, `elena-chat/${chatId}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-contract.pdf`),
    true,
  )
  assert.equal(isElenaChatAttachmentStoragePath(chatId, `developer-support/${chatId}/file.pdf`), false)
  assert.equal(isElenaChatAttachmentStoragePath(chatId, `elena-chat/other-id/file.pdf`), false)
  assert.equal(isElenaChatAttachmentStoragePath(chatId, `elena-chat/${chatId}/../secret.pdf`), false)
})
