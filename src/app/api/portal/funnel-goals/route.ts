import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedLuxorPortalSession,getLuxorPortalSession,isAuthorizedLuxorPortalEmail } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember,memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { emptyFunnelGoals,parseFunnelGoals } from '@/lib/luxorFunnelGoals'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'no-store'}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
async function access(){
  const verified=await getVerifiedLuxorPortalSession(),session=verified?await getLuxorPortalSession():null
  if(!verified||!session||verified.email!==session.email||!isAuthorizedLuxorPortalEmail(session.email))return null
  const member=await getLuxorPortalMember(session.email)
  return member?.status==='active'&&memberCan(member,'leads')?{email:session.email,canEdit:memberCan(member,'settings')}:null
}
function unavailable(){return NextResponse.json({available:false,code:'goals_unavailable',error:'Shared goals are unavailable. No saved result can be confirmed.'},{status:503,headers})}
export async function GET(){
  try{
    const actor=await access();if(!actor)return NextResponse.json({error:'Active staff with lead access is required.'},{status:403,headers})
    const rows=await supabaseRestStrict<Array<{goals:unknown;revision:number;updated_at:string|null}>>('luxor_funnel_goals?singleton=eq.true&select=goals,revision,updated_at&limit=1')
    if(!Array.isArray(rows)||rows.length>1)throw new Error('Invalid saved goals')
    if(!rows.length)return NextResponse.json({available:true,goals:emptyFunnelGoals(),revision:0,updatedAt:null,canEdit:actor.canEdit},{headers})
    const row=rows[0],goals=parseFunnelGoals(row.goals)
    if(!goals||!Number.isSafeInteger(row.revision)||row.revision<0||(row.updated_at!==null&&!Number.isFinite(Date.parse(row.updated_at))))throw new Error('Invalid saved goals')
    return NextResponse.json({available:true,goals,revision:row.revision,updatedAt:row.updated_at,canEdit:actor.canEdit},{headers})
  }catch{return unavailable()}
}
export async function PUT(request:NextRequest){
  try{
    const actor=await access();if(!actor?.canEdit)return NextResponse.json({error:'Settings and lead permissions are required.'},{status:403,headers})
    if(request.headers.get('origin')!==request.nextUrl.origin||!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return NextResponse.json({error:'Invalid request origin.'},{status:403,headers})
    const body=await request.json().catch(()=>null),goals=parseFunnelGoals(body?.goals)
    if(!goals||typeof body?.requestId!=='string'||!uuid.test(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||body.expectedRevision>=Number.MAX_SAFE_INTEGER)return NextResponse.json({error:'Enter valid goals and revision.',committed:false},{status:400,headers})
    const requestId=body.requestId.toLowerCase()
    const result=await supabaseRestStrict<{available?:boolean;code?:string;committed?:boolean;requestId?:string;goals?:unknown;revision?:number;updatedAt?:string}>('rpc/luxor_save_funnel_goals',{method:'POST',body:JSON.stringify({p_request_id:requestId,p_expected_revision:body.expectedRevision,p_goals:goals,p_actor:actor.email})})
    if(result?.available===false&&result.requestId===requestId&&result.committed===false){
      if(result.code==='revision_conflict')return NextResponse.json({error:'Goals changed on another device. Reload saved goals before editing.',code:result.code,committed:false},{status:409,headers})
      if(result.code==='request_id_reused')return NextResponse.json({error:'Request ID was already used with different goals.',code:result.code,committed:false},{status:400,headers})
    }
    const saved=parseFunnelGoals(result?.goals)
    if(result?.available!==true||result.requestId!==requestId||!saved||JSON.stringify(saved)!==JSON.stringify(goals)||result.revision!==body.expectedRevision+1||typeof result.updatedAt!=='string'||!Number.isFinite(Date.parse(result.updatedAt)))throw new Error('Save unconfirmed')
    return NextResponse.json({...result,goals:saved,canEdit:true},{headers})
  }catch{return NextResponse.json({available:false,code:'save_unconfirmed',error:'The save could not be confirmed. Retry the original request before changing goals.'},{status:503,headers})}
}
