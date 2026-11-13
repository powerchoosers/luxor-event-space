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
  const absolutePath = path.join(root, filePath)
  const loaded = new Module(absolutePath, module)
  loaded.filename = absolutePath
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
    if (request.startsWith('.')) {
      const parentDir = parent?.filename ? path.dirname(parent.filename) : path.join(root, 'src')
      for (const candidate of [
        path.resolve(parentDir, request),
        path.resolve(parentDir, `${request}.ts`),
        path.resolve(parentDir, `${request}.tsx`),
      ]) {
        if (fs.existsSync(candidate)) {
          if (candidate.endsWith('.ts') || candidate.endsWith('.tsx')) {
            return loadTypeScript(path.relative(root, candidate), stubs)
          }
        }
      }
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

function weekendTestConfig() {
  const pricing = loadTypeScript('src/lib/luxorProposalPricing.ts')
  const decor = loadTypeScript('src/lib/luxorDecorCatalogV2.ts')
  return {
    ...pricing.LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG,
    pricing_mode: 'venue_plus_preferred_vendor_estimates',
    luxor_costs: {
      ...pricing.LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG,
      proposal_pricing_policy_version: 4,
      [decor.LUXOR_DECOR_CATALOG_KEY]: {
        schema_version: decor.LUXOR_DECOR_CATALOG_SCHEMA_VERSION,
        items: [{
          id: 'tablecloths',
          name: 'Tablecloths',
          description: 'Tablecloths',
          category: 'signature_package_add_ons',
          amount: 1,
          pricing_unit: 'order',
          minimum_quantity: 1,
          active: true,
          included_in_packages: ['essentials', 'signature', 'luxor', 'customized'],
          display_order: 1,
        }],
      },
    },
  }
}

test('public package cards match engine weekend minimum for Essentials', () => {
  const pricing = loadTypeScript('src/lib/luxorPublicPackageStartingPrices.ts')
  const packages = loadTypeScript('src/lib/luxorPublicPackages.ts')
  const config = weekendTestConfig()
  const snapshot = pricing.buildPublicPackagesPricingSnapshot(config, 1)
  const cards = packages.buildPublicPackageCards('en', snapshot)
  const essentials = snapshot.packages.find((entry) => entry.packageId === 'essentials')
  assert.ok(essentials?.startingPrice !== null, essentials?.unavailableReason || snapshot.unavailableReason)
  assert.equal(cards[0].startingPrice, essentials.startingPrice)
  assert.equal(cards[0].startingPrice, pricing.computePublicPackageWeekendStartingPrice(config, 'essentials').startingPrice)
  assert.ok(essentials.scenario)
  assert.equal(essentials.scenario.guestCount, 1)
  assert.ok(['friday', 'saturday', 'sunday'].includes(essentials.scenario.day))
  assert.ok(cards[0].fullInclusions.some((line) => line.includes('venue rental')))
})

test('package flip helper toggles between front and back faces', () => {
  const { nextPackageCardFace } = loadTypeScript('src/components/packages/PackageFlipCard.tsx', {
    '@/lib/luxorPublicPackages': {},
    '@/lib/icons/phosphor-compat': new Proxy({}, { get: () => () => null }),
    'framer-motion': {
      useReducedMotion: () => false,
      AnimatePresence: ({ children }) => children,
      motion: { div: 'div' },
    },
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
