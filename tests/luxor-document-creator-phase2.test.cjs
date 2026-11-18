/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const crypto = require('node:crypto')
const { PDFDocument } = require('pdf-lib')

const root = path.resolve(__dirname, '..')

function compile(relativePath, filename, stubs = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(stubs, request)) return stubs[request]
    const mapped = request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : null
    if (mapped) {
      const candidates = [mapped, `${mapped}.ts`, `${mapped}.tsx`]
      const hit = candidates.find((candidate) => fs.existsSync(candidate))
      if (hit) return compile(path.relative(root, hit), `${hit}.synthetic.cjs`, stubs)
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    loaded._compile(js, filename)
  } finally {
    Module._load = originalLoad
  }
  return loaded.exports
}

const fieldTypes = compile('src/lib/luxorCreatedDocumentFieldTypes.ts', path.join(root, 'luxor-created-field-types.synthetic.cjs'), {
  '@/components/portal/PortalUI': { PortalStatusTone: {} },
})

const tokenLib = compile('src/lib/luxorCreatedDocumentToken.ts', path.join(root, 'luxor-created-token.synthetic.cjs'))

const stampLib = compile('src/lib/luxorCreatedDocumentFieldStamp.ts', path.join(root, 'luxor-created-stamp.synthetic.cjs'), {
  './luxorCreatedDocumentFieldTypes': fieldTypes,
  '@/lib/luxorCreatedDocumentFieldTypes': fieldTypes,
})

test('field rectangle validation rejects out-of-bounds placement', () => {
  const { validateNormalizedFieldRect } = fieldTypes
  assert.equal(validateNormalizedFieldRect({ page_index: 0, x: 0.2, y: 0.2, w: 0.3, h: 0.1 }), null)
  assert.match(validateNormalizedFieldRect({ page_index: 0, x: 0.8, y: 0.2, w: 0.3, h: 0.1 }), /within the page/)
})

test('required field completion detects missing values', () => {
  const { fieldValuesComplete } = fieldTypes
  const fields = [
    { id: 'a', field_type: 'signature', required: true },
    { id: 'b', field_type: 'checkbox', required: true },
  ]
  const incomplete = fieldValuesComplete(fields, { a: '   ' })
  assert.equal(incomplete.ok, false)
  assert.deepEqual(incomplete.missing, ['a', 'b'])
  const complete = fieldValuesComplete(fields, { a: 'Pat Smith', b: true })
  assert.equal(complete.ok, true)
})

test('signing token hashing uses sha256 and supports expiry checks', () => {
  const { hashLuxorCreatedDocumentSigningToken, luxorCreatedDocumentTokenExpired, createLuxorCreatedDocumentSigningToken } = tokenLib
  const token = crypto.randomBytes(32).toString('base64url')
  const hash = hashLuxorCreatedDocumentSigningToken(token)
  assert.equal(hash, crypto.createHash('sha256').update(token, 'utf8').digest('hex'))
  assert.equal(luxorCreatedDocumentTokenExpired(new Date(Date.now() - 1000).toISOString()), true)
  const minted = createLuxorCreatedDocumentSigningToken()
  assert.ok(minted.token.length >= 32)
  assert.ok(minted.tokenHash)
})

test('pdf stamping places text inside normalized field rectangle', async () => {
  const { luxorPdfRectFromNormalized, stampLuxorFieldsOnPdf } = stampLib
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const font = await pdf.embedFont(require('pdf-lib').StandardFonts.Helvetica)
  const rect = luxorPdfRectFromNormalized(page, { x: 0.1, y: 0.2, w: 0.3, h: 0.08 })
  assert.ok(rect.x > 50 && rect.x < 70)
  assert.ok(rect.y > 560 && rect.y < 590)
  const fields = [{
    id: 'f1',
    document_id: 'd1',
    field_type: 'name',
    role_key: 'signer_1',
    label: 'Name',
    required: true,
    page_index: 0,
    x: 0.1,
    y: 0.2,
    w: 0.3,
    h: 0.08,
    sort_order: 0,
  }]
  await stampLuxorFieldsOnPdf({
    pdf,
    fields,
    stamps: [{ fieldId: 'f1', fieldType: 'name', value: 'Arianna Patterson' }],
    fonts: { regular: font, oblique: font },
  })
  const bytes = await pdf.save()
  assert.ok(bytes.byteLength > 400)
})

test('booking signing route still resolves booking tokens before created-document branch', () => {
  const signaturesRoute = fs.readFileSync(path.join(root, 'src/app/api/public/signatures/route.ts'), 'utf8')
  const createdBranch = fs.readFileSync(path.join(root, 'src/app/api/public/created-document-signatures.ts'), 'utf8')
  assert.match(signaturesRoute, /getLuxorSignatureRequestByToken/)
  assert.match(signaturesRoute, /tryCreatedDocumentSignGet/)
  assert.match(createdBranch, /resolveLuxorCreatedDocumentSignerFromToken/)
})