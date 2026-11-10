/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve('src/lib/luxorRecurringBillSuggestion.ts')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths; loaded._compile(code, filename)
const { suggestsRecurringBill, groupUnlinkedRecurringBills, groupUnlinkedRecurringProviders, uniqueSavedProviderForGroup } = loaded.exports
const bill = (service, changes = {}) => ({ service, frequency: 'One-time', extraction_status: 'needs_review', extracted_fields: {}, ...changes })

test('recognizes potential recurring services without creating a schedule', () => {
  for (const service of ['Water service', 'TV service', 'Business phone', 'Venue lease', 'Internet access']) assert.equal(suggestsRecurringBill(bill(service)), true, service)
  assert.equal(suggestsRecurringBill(bill('Annual maintenance', { frequency: 'Annually' })), true)
  assert.equal(suggestsRecurringBill(bill('Service charge', { extracted_fields: { category_suggestion: ' utilities ' } })), true)
  assert.equal(suggestsRecurringBill(bill('Usage charge', { provider: 'City Water Services' })), true)
  assert.equal(suggestsRecurringBill(bill('Usage charge', { provider: 'Waterfall Floral Design' })), false)
  for (const frequency of ['Every month', 'per month', 'Once a year', 'bi-weekly', 'Every 2 months', 'Semi-annual']) assert.equal(suggestsRecurringBill(bill('Service charge', { frequency })), true, frequency)
  for (const frequency of ['One-time', 'Not monthly', 'Monthly payment declined', '']) assert.equal(suggestsRecurringBill(bill('Service charge', { frequency })), false, frequency)
  assert.equal(suggestsRecurringBill(bill('Floral arrangements')), false)
})

test('shows unlinked active schedules with matching bill history without merging records', () => {
  const bills = [bill('Adjustment', { id: 'bill-1', provider: ' Water Co ', created_at: '2026-01-01' })]
  const schedules = [
    { id: 's1', name: 'Water', vendor_name: 'water co', vendor_id: null, is_active: true },
    { id: 's2', name: 'Rent', vendor_name: 'Landlord', vendor_id: null, is_active: true },
    { id: 's3', name: 'Old', vendor_name: 'Old supplier', vendor_id: null, is_active: false },
    { id: 's4', name: 'Linked', vendor_name: 'Other', vendor_id: 'vendor-id', is_active: true },
    { id: 's5', name: 'Unknown', vendor_name: null, vendor_id: null, is_active: true },
  ]
  const original = JSON.stringify({ bills, schedules })
  const groups = groupUnlinkedRecurringProviders(bills, schedules)
  assert.deepEqual(groups.map((group) => [group.name, group.bills.map((bill) => bill.id), group.schedules.map((schedule) => schedule.id)]), [
    ['Water Co', ['bill-1'], ['s1']], ['Landlord', [], ['s2']], ['Provider not set', [], ['s5']],
  ])
  assert.equal(JSON.stringify({ bills, schedules }), original)
})

test('excludes archived, duplicate, and non-invoice records even if their text looks recurring', () => {
  for (const changes of [{ archived_at: '2026-01-01' }, { duplicate_of_bill_id: 'duplicate' }, { extraction_status: 'duplicate' }, { extracted_fields: { classification: 'receipt', category_suggestion: 'Utilities' } }]) assert.equal(suggestsRecurringBill(bill('Water service', changes)), false)
})

test('groups matching recorded names for review without merging or altering bills', () => {
  const bills = [bill('Water service', { id: '1', provider: ' Water Co ', created_at: '2026-01-01' }), bill('Water service', { id: '2', provider: 'water   co', created_at: '2026-02-01' }), bill('Phone service', { id: '3', provider: '', created_at: '2026-03-01' }), bill('Water', { id: '4', provider: 'Water Co', vendor_id: 'already-linked' }), bill('Service adjustment', { id: '5', provider: 'Water Co', created_at: '2025-12-01' }), bill('One-time supply', { id: '6', provider: 'Different Co' })]
  const original = JSON.stringify(bills)
  const result = groupUnlinkedRecurringBills(bills)
  assert.deepEqual(result.map((group) => group.bills.map((item) => item.id)), [['2', '1', '5'], ['3']])
  assert.deepEqual(groupUnlinkedRecurringBills(bills, ['Different Co']).map((group) => group.bills.map((item) => item.id)), [['2', '1', '5'], ['3'], ['6']])
  assert.equal(JSON.stringify(bills), original)
})

test('same-name candidates use a saved provider only when the match is unique and active', () => {
  const vendor = { id: 'one', name: '  Water  Co ', archived_at: null }
  assert.equal(uniqueSavedProviderForGroup('name:water co', [vendor]), 'one')
  assert.equal(uniqueSavedProviderForGroup('name:water co', [vendor, { ...vendor, id: 'two' }]), null)
  assert.equal(uniqueSavedProviderForGroup('name:water co', [{ ...vendor, archived_at: '2026-01-01' }]), null)
  assert.equal(uniqueSavedProviderForGroup('unknown:one', [vendor]), null)
})
