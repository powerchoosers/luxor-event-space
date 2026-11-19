/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const crypto = require('node:crypto')
const os = require('node:os')
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

const layoutLib = compile('src/lib/luxorCreatedDocumentFieldLayout.ts', path.join(root, 'luxor-created-layout.synthetic.cjs'), {
  './luxorCreatedDocumentFieldTypes': fieldTypes,
})

const stampLib = compile('src/lib/luxorCreatedDocumentFieldStamp.ts', path.join(root, 'luxor-created-stamp.synthetic.cjs'), {
  './luxorCreatedDocumentFieldTypes': fieldTypes,
  '@/lib/luxorCreatedDocumentFieldTypes': fieldTypes,
})

test('field rectangle validation and clamp keep placement on the page', () => {
  const { validateNormalizedFieldRect, clampNormalizedFieldRect } = fieldTypes
  assert.equal(validateNormalizedFieldRect({ page_index: 0, x: 0.2, y: 0.2, w: 0.3, h: 0.1 }), null)
  const clamped = clampNormalizedFieldRect({ page_index: 0, x: 0.8, y: 0.2, w: 0.3, h: 0.1 })
  assert.ok(clamped.x + clamped.w <= 1.0001)
  assert.equal(validateNormalizedFieldRect(clamped), null)
})

test('effective signer values treat prefilled name, date, and adopted signature as filled', () => {
  const { resolveEffectiveSignerFieldValues } = fieldTypes
  const fields = [
    { id: 'n', field_type: 'name' },
    { id: 'd', field_type: 'date' },
    { id: 's', field_type: 'signature' },
  ]
  const values = resolveEffectiveSignerFieldValues(fields, {}, {
    signerName: 'Pat Smith',
    signerEmail: 'pat@example.com',
    signatureAdopted: true,
    defaultDate: '1/2/2026',
  })
  assert.equal(values.n, 'Pat Smith')
  assert.equal(values.d, '1/2/2026')
  assert.equal(values.s, 'Pat Smith')
  const { derivedSignerInitials } = fieldTypes
  assert.equal(derivedSignerInitials('QA Test Signer'), 'QTS')
  const initials = resolveEffectiveSignerFieldValues([{ id: 'i', field_type: 'initials' }], { i: 'QA Test Signer' }, {
    signerName: 'QA Test Signer',
    signerEmail: '',
    signatureAdopted: true,
    defaultDate: '1/2/2026',
  })
  assert.equal(initials.i, 'QTS')
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

test('stamped QA pdf artifact is written for visual review', async () => {
  const { luxorPdfRectFromNormalized, stampLuxorFieldsOnPdf } = stampLib
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const font = await pdf.embedFont(require('pdf-lib').StandardFonts.Helvetica)
  const fields = [{
    id: 'f1',
    document_id: 'd1',
    field_type: 'name',
    role_key: 'signer_1',
    label: 'Name',
    required: true,
    page_index: 0,
    x: 0.12,
    y: 0.72,
    w: 0.34,
    h: 0.05,
    sort_order: 0,
  }]
  await stampLuxorFieldsOnPdf({
    pdf,
    fields,
    stamps: [{ fieldId: 'f1', fieldType: 'name', value: 'Arianna Patterson' }],
    fonts: { regular: font, oblique: font },
  })
  const bytes = await pdf.save()
  const artifactPath = path.join(os.tmpdir(), 'luxor-stamped-document.pdf')
  fs.writeFileSync(artifactPath, Buffer.from(bytes))
  assert.ok(fs.statSync(artifactPath).size > 500)
  const artifactsDir = '/opt/cursor/artifacts'
  if (fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true })
    fs.copyFileSync(artifactPath, path.join(artifactsDir, 'stamped-document.pdf'))
  }
  const rect = luxorPdfRectFromNormalized(page, fields[0])
  assert.ok(rect.x > 50)
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

function signerRow(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    document_id: '22222222-2222-4222-8222-222222222222',
    role_key: 'signer_1',
    role_label: 'Signer',
    name: 'Pat Smith',
    email: 'pat@example.invalid',
    status: 'viewed',
    token_hash: 'abc',
    token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    viewed_at: new Date().toISOString(),
    signed_at: null,
    declined_at: null,
    decline_reason: null,
    signed_pdf_path: null,
    last_ip: null,
    last_user_agent: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

test('created-document signer gate rejects expired and declined tokens', async () => {
  const signingStubs = {
    './luxorCreatedDocumentToken': tokenLib,
    './luxorCreatedDocumentFieldTypes': fieldTypes,
    './luxorCreatedDocumentFieldLayout': layoutLib,
    './luxorCreatedDocumentFieldsServer': {
      getLuxorCreatedDocumentSignerByTokenHash: async () => null,
      updateLuxorCreatedDocumentSigner: async () => null,
    },
    './luxorCreatedDocumentSignedPdfServer': {},
    './luxorDocumentCreatorServer': {
      getLuxorCreatedDocument: async () => ({ id: 'doc', status: 'draft', title: 'Test', document_type: 'agreement', pdf_storage_path: 'x.pdf' }),
    },
    'server-only': {},
  }
  const signing = compile('src/lib/luxorCreatedDocumentSigningServer.ts', path.join(root, 'luxor-created-signing-gate.synthetic.cjs'), signingStubs)
  const { luxorCreatedDocumentSignerGateResponse } = signing

  const doc = { id: 'doc', status: 'draft' }
  const expired = await luxorCreatedDocumentSignerGateResponse(signerRow({
    status: 'expired',
    token_expires_at: new Date(Date.now() - 60_000).toISOString(),
  }), doc)
  assert.equal(expired?.status, 410)
  assert.match(expired?.error, /expired/i)

  const declined = await luxorCreatedDocumentSignerGateResponse(signerRow({ status: 'declined', declined_at: new Date().toISOString() }), doc)
  assert.equal(declined?.status, 410)
  assert.match(declined?.error, /no longer active/i)

  const signed = await luxorCreatedDocumentSignerGateResponse(signerRow({
    status: 'signed',
    signed_at: new Date().toISOString(),
    token_expires_at: new Date(Date.now() - 60_000).toISOString(),
  }), doc)
  assert.equal(signed, null)
})

function signingGateModule(document) {
  return compile('src/lib/luxorCreatedDocumentSigningServer.ts', path.join(root, 'luxor-created-signing-download.synthetic.cjs'), {
    './luxorCreatedDocumentToken': tokenLib,
    './luxorCreatedDocumentFieldTypes': fieldTypes,
    './luxorCreatedDocumentFieldLayout': layoutLib,
    './luxorCreatedDocumentFieldsServer': {
      getLuxorCreatedDocumentSignerByTokenHash: async () => null,
      updateLuxorCreatedDocumentSigner: async () => null,
    },
    './luxorCreatedDocumentSignedPdfServer': {},
    './luxorDocumentCreatorServer': {
      getLuxorCreatedDocument: async () => document,
    },
    'server-only': {},
  })
}

function downloadRouteFixture(state) {
  const gateModule = signingGateModule(state.document)
  return compile('src/app/api/public/signatures/download/route.ts', path.join(root, 'luxor-download-route.synthetic.cjs'), {
    '@/lib/luxorDocumentsServer': { downloadLuxorPrivatePdf: async () => new Uint8Array([37, 80, 68, 70]) },
    '@/lib/luxorSignaturesServer': { getLuxorSignatureRequestByToken: async () => null, recordLuxorSignatureEvent: async () => null },
    '@/lib/luxorCreatedDocumentFieldsServer': { recordLuxorCreatedDocumentEvent: async () => null },
    '@/lib/luxorCreatedDocumentSigningServer': {
      resolveLuxorCreatedDocumentSignerFromToken: async () => state.signer,
      luxorCreatedDocumentSignerGateResponse: (signer) => gateModule.luxorCreatedDocumentSignerGateResponse(signer, state.document),
      createdDocumentPdfDownloadPath: async () => state.pdfPath,
    },
    'next/server': {
      NextResponse: class NextResponse extends Response {
        static json(body, init) {
          return new NextResponse(JSON.stringify(body), {
            ...init,
            headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
          })
        }
      },
    },
  })
}

test('created-document PDF download refuses expired and declined tokens', async () => {
  const document = { id: 'doc', status: 'draft', title: 'Test', pdf_storage_path: 'private/doc.pdf' }
  for (const signer of [
    signerRow({ status: 'expired', token_expires_at: new Date(Date.now() - 60_000).toISOString() }),
    signerRow({ status: 'declined', declined_at: new Date().toISOString(), token_expires_at: new Date(Date.now() + 60_000).toISOString() }),
  ]) {
    const { GET } = downloadRouteFixture({ signer, document, pdfPath: document.pdf_storage_path })
    const response = await GET({ nextUrl: new URL('http://localhost/api/public/signatures/download?token=test&kind=contract') })
    assert.equal(response.status, 410)
    const body = await response.json()
    assert.ok(body.error)
  }
})

test('field layout mapping and required defaults follow phase-2 rules', () => {
  const {
    defaultCreatedDocumentFieldRequired,
    normalizedFieldOverlayStyle,
    pointerToNormalizedTopLeft,
    createdDocumentSignClientStatus,
    signerNeedsAdoptedSignature,
  } = layoutLib
  assert.equal(defaultCreatedDocumentFieldRequired('initials'), true)
  assert.equal(defaultCreatedDocumentFieldRequired('text'), false)
  assert.equal(defaultCreatedDocumentFieldRequired('checkbox'), false)
  assert.deepEqual(normalizedFieldOverlayStyle({ x: 0.1, y: 0.2, w: 0.3, h: 0.08 }), {
    left: '10%',
    top: '20%',
    width: '30%',
    height: '8%',
  })
  const point = pointerToNormalizedTopLeft(150, 220, { left: 100, top: 200, width: 400, height: 520 }, { w: 0.2, h: 0.05 })
  assert.ok(point.x >= 0 && point.x <= 0.8)
  assert.ok(point.y >= 0 && point.y <= 0.95)
  assert.equal(createdDocumentSignClientStatus('Please complete all required fields.'), 400)
  assert.equal(createdDocumentSignClientStatus('This signing link has expired.'), 410)
  assert.equal(signerNeedsAdoptedSignature(['name', 'text']), false)
  assert.equal(signerNeedsAdoptedSignature(['initials']), true)
})

test('created-document POST maps validation errors to 4xx', async () => {
  const postMod = compile('src/app/api/public/created-document-signatures.ts', path.join(root, 'luxor-created-post.synthetic.cjs'), {
    '@/lib/luxorCreatedDocumentSigningServer': {
      resolveLuxorCreatedDocumentSignerFromToken: async () => signerRow(),
      luxorCreatedDocumentSignerGateResponse: async () => null,
      markLuxorCreatedDocumentSignerViewed: async (s) => s,
      publicCreatedDocumentSignaturePayload: async () => ({ flow: 'created_document' }),
      completeLuxorCreatedDocumentSigner: async () => { throw new Error('Please complete all required fields.') },
      declineLuxorCreatedDocumentSigner: async () => signerRow(),
    },
    '@/lib/luxorCreatedDocumentFieldLayout': layoutLib,
    'next/server': {
      NextResponse: class NextResponse extends Response {
        static json(body, init) {
          return new NextResponse(JSON.stringify(body), {
            ...init,
            headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
          })
        }
      },
    },
  })
  const request = { headers: { get: () => null } }
  const response = await postMod.tryCreatedDocumentSignPost(request, 'token', { accepted: true, signedName: 'Pat' })
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.match(body.error, /required fields/i)
})

test('created-document sign GET and POST refuse expired and declined tokens', async () => {
  const document = { id: 'doc', status: 'draft', title: 'Test', document_type: 'agreement', pdf_storage_path: 'private/doc.pdf' }
  const gateModule = signingGateModule(document)
  const nextResponse = {
    NextResponse: class NextResponse extends Response {
      static json(body, init) {
        return new NextResponse(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        })
      }
    },
  }
  const request = {
    headers: { get: () => null },
    json: async () => ({ token: 'blocked' }),
  }
  for (const signer of [
    signerRow({ status: 'expired', token_expires_at: new Date(Date.now() - 60_000).toISOString() }),
    signerRow({ status: 'declined', declined_at: new Date().toISOString() }),
  ]) {
    const mod = compile('src/app/api/public/created-document-signatures.ts', path.join(root, `luxor-created-signatures-${signer.status}.synthetic.cjs`), {
      '@/lib/luxorCreatedDocumentSigningServer': {
        resolveLuxorCreatedDocumentSignerFromToken: async () => signer,
        luxorCreatedDocumentSignerGateResponse: (s) => gateModule.luxorCreatedDocumentSignerGateResponse(s, document),
        markLuxorCreatedDocumentSignerViewed: async (s) => s,
        publicCreatedDocumentSignaturePayload: async () => ({ flow: 'created_document' }),
        declineLuxorCreatedDocumentSigner: async () => signer,
        completeLuxorCreatedDocumentSigner: async () => signer,
      },
      'next/server': nextResponse,
    })
    assert.equal((await mod.tryCreatedDocumentSignGet(request, 'blocked')).status, 410)
    assert.equal((await mod.tryCreatedDocumentSignPost(request, 'blocked', { accepted: true, signedName: 'Pat' })).status, 410)
  }
})