/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function load(filename, stubs = {}) {
  filename = path.resolve(filename)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return loaded.exports
}

test('creates a monthly variable utilities schedule for an obvious emailed energy bill', async () => {
  const writes = []
  const bill = {
    id: 'bill-1', provider: 'CPS Energy', service: 'Electricity', frequency: 'One-time', due_date: '2026-11-30',
    extraction_status: 'needs_review', payment_ready_at: null, archived_at: null, duplicate_of_bill_id: null,
    bill_category: null, extracted_fields: { category_suggestion: 'Utilities' }, vendor_id: null,
  }
  const stubs = {
    'server-only': {},
    '@/lib/luxorBillCategories': { isLuxorBillCategory: (value) => ['Utilities', 'Rent'].includes(value) },
    '@/lib/luxorRecurringBillSuggestion': load('src/lib/luxorRecurringBillSuggestion.ts'),
    '@/lib/luxorExpensesServer': {
      isDateKey: (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
      luxorTodayDateKey: () => '2026-11-10',
      getLuxorExpenseCategoryByName: async () => ({ id: 'cat', name: 'Utilities', is_active: true }),
      generateLuxorExpenseOccurrences: async () => ({ inserted: 1, skipped: 0, templates_checked: 1 }),
    },
    '@/lib/supabaseRestServer': {
      supabaseRestStrict: async (url, options) => {
        writes.push({ url, body: options?.body ? JSON.parse(options.body) : null })
        if (url.startsWith('luxor_expense_templates?select=*&is_active=eq.true')) return []
        if (url === 'luxor_expense_templates?select=*' && options?.method === 'POST') return [{ id: 'template-1', updated_at: '2026-11-10T00:00:00Z', is_active: true, ...JSON.parse(options.body) }]
        return []
      },
    },
  }
  const { ensureUtilityRecurringScheduleFromBill } = load('src/lib/luxorUtilityRecurringAutoServer.ts', stubs)
  const result = await ensureUtilityRecurringScheduleFromBill(bill)
  assert.deepEqual(result, { created: true, templateId: 'template-1' })
  assert.equal(writes[1].body.frequency, 'monthly')
  assert.equal(writes[1].body.is_variable, true)
  assert.equal(writes[1].body.category, 'Utilities')
  assert.equal(writes[1].body.vendor_name, 'CPS Energy')
})

test('skips schedule creation when an active template already exists for the vendor', async () => {
  const bill = { id: 'bill-2', provider: 'City Water', service: 'Water', frequency: 'Monthly', due_date: '2026-11-30', extraction_status: 'ready', payment_ready_at: '2026-11-10T00:00:00Z', archived_at: null, duplicate_of_bill_id: null, extracted_fields: { category_suggestion: 'Utilities' } }
  const stubs = {
    'server-only': {},
    '@/lib/luxorBillCategories': { isLuxorBillCategory: () => true },
    '@/lib/luxorRecurringBillSuggestion': load('src/lib/luxorRecurringBillSuggestion.ts'),
    '@/lib/luxorExpensesServer': { isDateKey: () => true, luxorTodayDateKey: () => '2026-11-10', getLuxorExpenseCategoryByName: async () => ({ id: 'cat', name: 'Utilities', is_active: true }), generateLuxorExpenseOccurrences: async () => ({ inserted: 0, skipped: 0, templates_checked: 0 }) },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async (url) => url.startsWith('luxor_expense_templates?select=*&is_active=eq.true') ? [{ id: 'existing', vendor_name: 'City Water', is_active: true }] : [] },
  }
  const { ensureUtilityRecurringScheduleFromBill } = load('src/lib/luxorUtilityRecurringAutoServer.ts', stubs)
  assert.deepEqual(await ensureUtilityRecurringScheduleFromBill(bill), { created: false, templateId: 'existing' })
})
