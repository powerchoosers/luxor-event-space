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
        if (fs.existsSync(candidate) && (candidate.endsWith('.ts') || candidate.endsWith('.tsx'))) {
          return loadTypeScript(path.relative(root, candidate), stubs)
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
  const packages = loadTypeScript('src/lib/luxorProposalPackages.ts')
  return {
    ...pricing.LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG,
    pricing_mode: 'venue_plus_preferred_vendor_estimates',
    luxor_costs: {
      ...pricing.LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG,
      proposal_pricing_policy_version: 4,
      package_selection_v1: packages.DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS,
      [decor.LUXOR_DECOR_CATALOG_KEY]: {
        schema_version: decor.LUXOR_DECOR_CATALOG_SCHEMA_VERSION,
        items: [
          {
            id: 'custom_photo_board',
            name: 'Custom Photo Board',
            description: 'Custom Photo Board',
            category: 'premium_add_ons',
            amount: 250,
            pricing_unit: 'each',
            minimum_quantity: 1,
            active: true,
            included_in_packages: [],
            display_order: 1,
          },
          {
            id: 'marquee_letters_4ft',
            name: '4-ft Marquee Letters',
            description: 'Marquee Letters',
            category: 'premium_add_ons',
            amount: 40,
            pricing_unit: 'letter',
            minimum_quantity: 2,
            active: true,
            included_in_packages: [],
            display_order: 2,
          },
        ],
      },
    },
  }
}

const configurator = loadTypeScript('src/lib/luxorPublicPackagesConfigurator.ts', {
  'server-only': {},
})
const config = weekendTestConfig()

const scenarios = [
  {
    name: 'Saturday evening Signature 100 guests',
    input: {
      eventDate: '2026-10-24',
      eventType: 'Birthday Party',
      guestCount: 100,
      rentalPeriod: 'evening',
      packageTierId: 'signature',
      decorAddOnQuantities: {},
    },
  },
  {
    name: 'Friday morning Essentials 50 guests',
    input: {
      eventDate: '2026-10-23',
      eventType: 'Quinceañera',
      guestCount: 50,
      rentalPeriod: 'morning',
      packageTierId: 'essentials',
      decorAddOnQuantities: {},
    },
  },
  {
    name: 'Sunday full day Luxor 150 guests with decor add-on',
    input: {
      eventDate: '2026-10-25',
      eventType: 'Wedding Reception',
      guestCount: 150,
      rentalPeriod: 'full_day',
      packageTierId: 'luxor',
      decorAddOnQuantities: { tablecloths: 1 },
    },
  },
]

test('luxor tier prices premium decor add-ons with catalog ids and minimum quantities', () => {
  const baseInput = {
    eventDate: '2026-10-25',
    eventType: 'Wedding Reception',
    guestCount: 150,
    rentalPeriod: 'full_day',
    packageTierId: 'luxor',
    decorAddOnQuantities: {},
  }
  const withoutDecor = configurator.calculatePublicPackagesQuote(baseInput, config, 1)
  const withDecor = configurator.calculatePublicPackagesQuote({
    ...baseInput,
    decorAddOnQuantities: {
      custom_photo_board: 1,
      marquee_letters_4ft: 2,
    },
  }, config, 1)
  assert.ok(withoutDecor.totals.totalEstimate !== null)
  assert.ok(withDecor.totals.totalEstimate !== null)
  assert.ok(withDecor.totals.totalEstimate > withoutDecor.totals.totalEstimate)
  assert.ok(withDecor.summaryLines.some((line) => line.category === 'enhancement'))
})

for (const scenario of scenarios) {
  test(`website total matches proposal builder for ${scenario.name}`, () => {
    const quote = configurator.calculatePublicPackagesQuote(scenario.input, config, 1)
    const direct = configurator.calculateProposalBuilderParityTotal(scenario.input, config)
    assert.equal(quote.errors.length, 0, quote.errors.join('; '))
    assert.equal(quote.totals.totalEstimate, direct)
  })
}
