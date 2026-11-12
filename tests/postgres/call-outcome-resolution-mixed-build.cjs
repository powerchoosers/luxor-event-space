/* eslint @typescript-eslint/no-require-imports: off */
/* Build a disposable SQL fixture from the actual application default, not a copied approximation. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const mod=new Module(path.join(root,'synthetic-default-workflow.cjs'),module);mod.filename=path.join(root,'synthetic-default-workflow.cjs');mod.paths=module.paths;
const old=Module._load;Module._load=function(name,parent,main){if(name==='./luxorWorkflowEmailDocument')return {validateWorkflowEmailDocument:()=>[]};return old.call(this,name,parent,main)};
try{mod._compile(ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/luxorCustomWorkflowDefinition.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod.filename)}finally{Module._load=old}
const definition=mod.exports.createNewContactFollowUpDefinition();
if(!process.argv[2])throw Error('Provide disposable output SQL path');
const template=fs.readFileSync(path.join(__dirname,'call-outcome-resolution-mixed.sql'),'utf8');
if(!template.includes('__STANDARD_DEFINITION_JSON__'))throw Error('Missing default-definition placeholder');
fs.writeFileSync(process.argv[2],template.replace('__STANDARD_DEFINITION_JSON__',JSON.stringify(definition)));
