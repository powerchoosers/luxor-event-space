/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const filename = path.resolve('src/app/api/expenses/templates/[id]/profile-bills/route.ts')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bill = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
let operations = null, finance = true, writes = [], rpcError = null
class SupabaseRestError extends Error { constructor(message, status, code) { super(message); this.status=status; this.code=code } }
class RequestError extends Error { constructor(message,status=400) { super(message); this.status=status } }
const modules = {
 'next/server': { NextResponse: { json: (body, options={}) => ({ body,status: options.status || 200 }) } },
 '@/lib/luxorOperationsAccess': { getOperationsSession: async () => operations },
 '@/lib/luxorExpensesServer': { authorizeLuxorExpenseRequest: async () => { if (!finance) throw new RequestError('Finance access required.',403); return { session: { email: 'owner@example.invalid' } } }, isExpenseUuid: x => typeof x === 'string' && /^[a-f0-9-]{36}$/.test(x), LuxorExpenseRequestError: RequestError, toExpenseErrorResponse: e => ({ status: e.status || 500, message:e.message }) },
 '@/lib/supabaseRestServer': { SupabaseRestError, supabaseRestStrict: async (url,options) => { writes.push({url,options}); if (url.includes('luxor_expense_templates?')) return [{ id,updated_at:'2026-01-01',is_active:true }]; if (url.startsWith('rpc/')) { if (rpcError) throw rpcError; return { ok:true } }; return [] } },
}
const original=Module._load, loaded=new Module(filename,module); loaded.filename=filename; loaded.paths=module.paths
Module._load=function(request,parent,main) { return modules[request] || original.call(this,request,parent,main) }; try { loaded._compile(code,filename) } finally { Module._load=original }
const { GET, POST }=loaded.exports, context={params:Promise.resolve({id})}, request={json:async()=>({bill_id:bill,expected_bill_updated_at:'2026-01-01',expected_template_updated_at:'2026-01-01'})}
test('finance and operations access are both required for reading or linking bills', async()=>{ operations=null; finance=true; writes=[]; assert.equal((await GET({},context)).status,403); assert.equal((await POST(request,context)).status,403); assert.equal(writes.length,0); operations={email:'owner@example.invalid'}; finance=false; assert.equal((await GET({},context)).status,403); assert.equal(writes.length,0) })
test('link uses authenticated actor and reviewed version stamps',async()=>{ operations={email:'owner@example.invalid'}; finance=true; writes=[]; assert.equal((await POST(request,context)).status,200); const body=JSON.parse(writes[0].options.body); assert.equal(body.p_actor,'owner@example.invalid'); assert.equal(body.p_bill_id,bill); assert.equal(body.p_bill_updated_at,'2026-01-01') })

test('conflicting concurrent association is reported as a conflict',async()=>{ operations={email:'owner@example.invalid'}; finance=true; rpcError=new SupabaseRestError('constraint detail',409,'23505'); try { const result=await POST(request,context); assert.equal(result.status,409); assert.match(result.body.error,/another cost profile/); assert.doesNotMatch(result.body.error,/constraint detail/) } finally { rpcError=null } })
