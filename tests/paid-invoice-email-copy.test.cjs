'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript')
const file=path.resolve(__dirname,'../src/lib/luxorPaidInvoiceEmailCopy.ts'),mod=new Module(file,module);mod.filename=file
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const {PAID_INVOICE_EMAIL_STARTER,validatePaidInvoiceEmailCopy,renderPaidInvoiceEmailCopy,paidInvoiceCopyHtml}=mod.exports
test('paid invoice editable copy escapes markup and accepts only the named variable',()=>{
  const copy=renderPaidInvoiceEmailCopy({...PAID_INVOICE_EMAIL_STARTER,greeting:'Hello {{first_name}},',closing:'<script>\nThank you'},'<Guest>')
  const html=paidInvoiceCopyHtml(copy)
  assert.equal(html.greeting,'Hello &lt;Guest&gt;,'); assert.equal(html.closing,'&lt;script&gt;<br />Thank you')
  assert.throws(()=>validatePaidInvoiceEmailCopy({...PAID_INVOICE_EMAIL_STARTER,closing:'{{amount}}'}),/listed email variable/)
  assert.throws(()=>validatePaidInvoiceEmailCopy({...PAID_INVOICE_EMAIL_STARTER,subject:'Receipt\nInjected'}),/single line/)
})
test('both Stripe branches retain generated payment and reservation facts',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/app/api/stripe/webhook/route.ts'),'utf8')
  assert.match(source,/formatMoney\(recorded\.payment\.amount\)/)
  assert.match(source,/\$\{paymentExplanation\}/)
  assert.match(source,/Your date remains pending until the agreement is signed/)
  assert.match(source,/\$\{securedOfferMessage\}\$\{taxCoverageReceipt\}/)
  assert.match(source,/paidInvoiceCopyForQueue\(currentInquiry\.full_name\)/)
  assert.match(source,/paidInvoiceCopyForQueue\(inquiry\.full_name\)/)
})
