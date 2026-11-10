/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve('src/lib/luxorRecurringCostEvidence.ts')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths; loaded._compile(code, filename)
const { recurringCostEvidence } = loaded.exports
const bills = ['2026-01-31','2026-02-28','2026-03-31'].map((due_date, index) => ({ id: String(index), provider: 'Internet Co', service: 'Internet', frequency: 'Monthly', due_date, extraction_status: 'ready', payment_ready_at: '2026-01-01' }))
const expenses = bills.map((bill) => ({ source_bill_id: bill.id, booking_id: null, expense_type: 'business', category: 'Utilities', status: 'incurred' }))
test('identifies reviewed recurring business bills without changing records', () => {
 const before = JSON.stringify({ bills, expenses }); const result = recurringCostEvidence(bills, expenses, [])
 assert.equal(result.length, 1); assert.equal(result[0].frequency, 'monthly'); assert.equal(result[0].latestDueDate, '2026-03-31'); assert.deepEqual(result[0].billIds, ['0','1','2']); assert.equal(JSON.stringify({ bills, expenses }), before)
})
test('does not infer a schedule from missing, irregular, event, duplicate, or already scheduled records', () => {
 assert.equal(recurringCostEvidence(bills.slice(0,2),expenses,[]).length,0)
 assert.equal(recurringCostEvidence(bills.map((b,i)=>i===1 ? {...b,due_date:'2026-02-21'} : b),expenses,[]).length,0)
 assert.equal(recurringCostEvidence(bills,expenses.map((e,i)=>i===1 ? {...e,booking_id:'event'} : e),[]).length,0)
 assert.equal(recurringCostEvidence(bills.map((b,i)=>i===1 ? {...b,duplicate_of_bill_id:'a'} : b),expenses,[]).length,0)
 assert.equal(recurringCostEvidence(bills,expenses,[{name:'Internet',vendor_name:'Internet Co',is_active:true}]).length,0)
 assert.equal(recurringCostEvidence(bills,expenses.map((e,i)=>i===1 ? {...e,expense_type:'event'} : e),[]).length,0)
})
