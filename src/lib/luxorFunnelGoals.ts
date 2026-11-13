import { getFunnelPeriod, type FunnelPeriod } from './luxorFunnelPeriods'
export const FUNNEL_GOAL_METRICS=['newInquiries','toursScheduled','toursCompleted','proposalsSent','bookedEvents','revenue'] as const
export const FUNNEL_GOAL_CADENCES=['daily','weekly','monthly','quarterly','annual'] as const
export type FunnelGoalMetric=typeof FUNNEL_GOAL_METRICS[number]
export type FunnelMetricGoals=Record<typeof FUNNEL_GOAL_CADENCES[number],number|null>&{monthlyOverrides:Record<string,number>;quarterlyOverrides:Record<string,number>}
export type FunnelGoals=Record<FunnelGoalMetric,FunnelMetricGoals>
export function emptyFunnelGoals():FunnelGoals{return Object.fromEntries(FUNNEL_GOAL_METRICS.map(metric=>[metric,{daily:null,weekly:null,monthly:null,quarterly:null,annual:null,monthlyOverrides:{},quarterlyOverrides:{}}])) as FunnelGoals}
function object(value:unknown):value is Record<string,unknown>{return Boolean(value&&typeof value==='object'&&!Array.isArray(value))}
export function parseFunnelGoals(value:unknown):FunnelGoals|null {
  if(!object(value)||Object.keys(value).length!==6||Object.keys(value).some(key=>!FUNNEL_GOAL_METRICS.includes(key as FunnelGoalMetric)))return null
  const result=emptyFunnelGoals()
  for(const metric of FUNNEL_GOAL_METRICS){
    const row=value[metric]
    if(!object(row)||Object.keys(row).length!==7||Object.keys(row).some(key=>![...FUNNEL_GOAL_CADENCES,'monthlyOverrides','quarterlyOverrides'].includes(key)))return null
    const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e12&&(metric==='revenue'?Number(n.toFixed(2))===n:Number.isInteger(n))
    for(const cadence of FUNNEL_GOAL_CADENCES){const n=row[cadence];if(n!==null&&!valid(n))return null;result[metric][cadence]=n as number|null}
    for(const [field,pattern] of [['monthlyOverrides',/^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/],['quarterlyOverrides',/^(19|[2-9]\d)\d{2}-Q[1-4]$/]] as const){
      const overrides=row[field];if(!object(overrides)||Object.keys(overrides).length>240)return null
      for(const [key,n] of Object.entries(overrides).sort(([a],[b])=>a.localeCompare(b))){if(!pattern.test(key)||!valid(n))return null;result[metric][field][key]=n}
    }
  }
  return result
}
export function getFunnelGoal(goal:FunnelMetricGoals,period:FunnelPeriod):number|null {
  if(period.kind==='weekly')return goal.weekly??(goal.daily===null?null:goal.daily*period.dayCount)
  if(period.kind==='monthly')return goal.monthlyOverrides[period.startDate.slice(0,7)]??goal.monthly??(goal.daily===null?null:goal.daily*period.dayCount)
  const key=`${period.startDate.slice(0,4)}-Q${Math.floor((+period.startDate.slice(5,7)-1)/3)+1}`
  const explicit=goal.quarterlyOverrides[key]??goal.quarterly
  if(explicit!==null&&explicit!==undefined)return explicit
  const values=Array.from({length:3},(_,i)=>getFunnelGoal(goal,getFunnelPeriod('monthly',new Date(Date.UTC(+period.startDate.slice(0,4),+period.startDate.slice(5,7)-1+i,1)).toISOString().slice(0,10))))
  return values.some(n=>n===null)?null:values.reduce<number>((sum,n)=>sum+n!,0)
}
export function getFunnelAnnualGoal(goal:FunnelMetricGoals,year:number):number|null {
  if(!Number.isInteger(year)||year<1900||year>9997)throw new Error('Invalid year')
  if(goal.annual!==null)return goal.annual
  const values=[1,4,7,10].map(month=>getFunnelGoal(goal,getFunnelPeriod('quarterly',`${year}-${String(month).padStart(2,'0')}-01`)))
  return values.some(n=>n===null)?null:values.reduce<number>((sum,n)=>sum+n!,0)
}
export function funnelGoalProgress(actual:number|null,goal:number|null):{percent:number|null;barPercent:number}{
  if(actual===null||!Number.isFinite(actual)||actual<0||goal===null||!Number.isFinite(goal)||goal<=0)return {percent:null,barPercent:0}
  const percent=actual/goal*100
  return {percent,barPercent:Math.min(100,percent)}
}
