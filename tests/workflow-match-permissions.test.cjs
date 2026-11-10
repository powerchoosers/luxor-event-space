'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/luxorWorkflowMatchPermissions.ts'), mod = new Module(file, module)
mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const links = [
  '/portal/marketing/custom-workflows/system-inquiry-confirmation',
  '/portal/marketing/custom-workflows/system-final-payment-emails?step=14_days',
  '/portal/marketing/custom-workflows/system-event-emails?step=details',
  '/portal/marketing/custom-workflows/system-phone-missed_call',
].map((href) => ({ href, name: href, note: '' }))
test('filters domain-specific workflow results without hiding general inquiry results', () => {
  const filtered = mod.exports.filterWorkflowMatches(links, () => false)
  assert.deepEqual(filtered.map((item) => item.href), [links[0].href])
  assert.deepEqual(mod.exports.filterWorkflowMatches(links, (permission) => permission === 'finances').map((item) => item.href), [links[0].href, links[1].href])
  assert.deepEqual(mod.exports.filterWorkflowMatches(links, () => true), links)
})
test('chat applies the same filtering to the model result and clickable links', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/app/api/portal/elena-chat/route.ts'), 'utf8')
  assert.match(source, /filterWorkflowMatches\(result\.matches, can, member\.role === 'owner'\)/)
  assert.match(source, /visibleMatches\.filter\(\(item\) => item\.href !== null\)/)
  assert.match(source, /Some results are unavailable with your current access/)
})
test('planner invitation requires owner and planner access', () => {
  const planner = [{ href: '/portal/marketing/custom-workflows/system-planner-invitation', name: 'Planner', note: '' }]
  assert.deepEqual(mod.exports.filterWorkflowMatches(planner, () => true), [])
  assert.deepEqual(mod.exports.filterWorkflowMatches(planner, () => false, true), [])
  assert.deepEqual(mod.exports.filterWorkflowMatches(planner, () => true, true), planner)
})
test('Zelle instructions require finance access', () => {
  const zelle=[{ href:'/portal/marketing/custom-workflows/system-zelle-instructions',name:'Zelle',note:'' }]
  assert.deepEqual(mod.exports.filterWorkflowMatches(zelle,()=>false),[])
  assert.deepEqual(mod.exports.filterWorkflowMatches(zelle,p=>p==='finances'),zelle)
})
test('paid-invoice workflow requires finance access', () => {
  const receipt=[{href:'/portal/marketing/custom-workflows/system-paid-invoice-email',name:'Paid invoice',note:''}]
  assert.deepEqual(mod.exports.filterWorkflowMatches(receipt,()=>false),[])
  assert.deepEqual(mod.exports.filterWorkflowMatches(receipt,p=>p==='finances'),receipt)
})
test('staff receipt workflow requires finance access', () => {
  const receipt=[{href:'/portal/marketing/custom-workflows/system-payment-receipt',name:'Receipt',note:''}]
  assert.deepEqual(mod.exports.filterWorkflowMatches(receipt,()=>false),[])
  assert.deepEqual(mod.exports.filterWorkflowMatches(receipt,p=>p==='finances'),receipt)
})
test('executed agreement workflow requires planner and finance access', () => {
  const agreement=[{href:'/portal/marketing/custom-workflows/system-agreement-client',name:'Agreement',note:''}]
  assert.deepEqual(mod.exports.filterWorkflowMatches(agreement,p=>p==='finances'),[])
  assert.deepEqual(mod.exports.filterWorkflowMatches(agreement,p=>p==='planner'),[])
  assert.deepEqual(mod.exports.filterWorkflowMatches(agreement,()=>true),agreement)
})
test('owner audit workflow requires owner planner and finance access', () => {
  const owner=[{href:'/portal/marketing/custom-workflows/system-agreement-owner',name:'Owner audit',note:''}]
  assert.deepEqual(mod.exports.filterWorkflowMatches(owner,()=>true,false),[])
  assert.deepEqual(mod.exports.filterWorkflowMatches(owner,p=>p==='finances',true),[])
  assert.deepEqual(mod.exports.filterWorkflowMatches(owner,()=>true,true),owner)
})
test('agreement package requires planner and finance access', () => {
  const pkg = [{ href: '/portal/marketing/custom-workflows/system-agreement-package', name: 'Agreement package', note: '' }]
  assert.deepEqual(mod.exports.filterWorkflowMatches(pkg, () => false), [])
  assert.deepEqual(mod.exports.filterWorkflowMatches(pkg, (p) => p === 'planner'), [])
  assert.deepEqual(mod.exports.filterWorkflowMatches(pkg, (p) => p === 'finances'), [])
  assert.deepEqual(mod.exports.filterWorkflowMatches(pkg, () => true), pkg)
})
test('calendar messages require calendar access', () => {
  const calendar = [{ href: '/portal/marketing/custom-workflows/system-calendar-messages?step=cancellation', name: 'Calendar cancel', note: '' }]
  assert.deepEqual(mod.exports.filterWorkflowMatches(calendar, () => false), [])
  assert.deepEqual(mod.exports.filterWorkflowMatches(calendar, (p) => p === 'calendar'), calendar)
})
