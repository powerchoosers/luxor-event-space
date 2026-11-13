/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTypeScript(filePath, stubs = {}) {
  const source = fs.readFileSync(path.join(root, filePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      paths: { '@/*': ['src/*'] },
      baseUrl: root,
    },
  }).outputText
  const loaded = new Module(path.join(root, `${path.basename(filePath)}.synthetic.cjs`), module)
  loaded.filename = path.join(root, `${path.basename(filePath)}.synthetic.cjs`)
  loaded.paths = module.paths
  const originalLoad = Module._load
  const alias = (request) => {
    if (request.startsWith('@/')) return path.join(root, 'src', request.slice(2))
    return request
  }
  Module._load = function (request, parent, isMain) {
    const resolved = alias(request)
    if (Object.hasOwn(stubs, request)) return stubs[request]
    if (Object.hasOwn(stubs, resolved)) return stubs[resolved]
    if (resolved !== request && fs.existsSync(resolved + '.ts')) {
      return loadTypeScript(path.relative(root, resolved + '.ts'), stubs)
    }
    if (resolved !== request && fs.existsSync(resolved + '.tsx')) {
      return loadTypeScript(path.relative(root, resolved + '.tsx'), stubs)
    }
    try {
      return originalLoad.call(this, request, parent, isMain)
    } catch (error) {
      if (resolved !== request) return originalLoad.call(this, resolved, parent, isMain)
      throw error
    }
  }
  try {
    loaded._compile(js, loaded.filename)
  } finally {
    Module._load = originalLoad
  }
  return loaded.exports
}

test('public package cards use catalog names, prices, and inclusions', () => {
  const { buildPublicPackageCards } = loadTypeScript('src/lib/luxorPublicPackages.ts', {
    '@/components/packages/PackageFlipCard': {},
    'server-only': {},
    next: {},
    'next/image': {},
    'framer-motion': { useReducedMotion: () => false },
    react: {
      useState: () => [false, () => {}],
      useCallback: (fn) => fn,
      useId: () => ':id:',
      useRef: () => ({ current: null }),
      useEffect: () => {},
    },
  })
  const cards = buildPublicPackageCards('en')
  assert.equal(cards.length, 3)
  assert.deepEqual(
    cards.map((card) => card.id),
    ['essentials', 'signature', 'luxor'],
  )
  assert.equal(cards[0].displayName, 'Essentials')
  assert.equal(cards[0].startingPrice, 0)
  assert.equal(cards[1].startingPrice, 600)
  assert.equal(cards[2].startingPrice, 1100)
  assert.ok(cards[0].fullInclusions.some((line) => line.includes('venue rental')))
  assert.ok(cards[2].fullInclusions.some((line) => /photobooth/i.test(line)))
  assert.equal(cards[0].shortDescription, 'Perfect for hosts who want to personalize and decorate their own event.')
})

test('package flip helper toggles between front and back faces', () => {
  const { nextPackageCardFace } = loadTypeScript('src/components/packages/PackageFlipCard.tsx', {
    '@/lib/luxorPublicPackages': {},
    '@/lib/icons/phosphor-compat': new Proxy({}, { get: () => () => null }),
    'framer-motion': { useReducedMotion: () => false },
    next: {},
    'next/image': {},
    react: {
      useState: () => [false, () => {}],
      useCallback: (fn) => fn,
      useId: () => ':id:',
      useRef: () => ({ current: null }),
      useEffect: () => {},
    },
  })
  assert.equal(nextPackageCardFace(false), 'front')
  assert.equal(nextPackageCardFace(true), 'back')
})
