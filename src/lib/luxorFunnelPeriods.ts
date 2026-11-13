export const FUNNEL_TIMEZONE = 'America/Chicago'
export type FunnelPeriodKind = 'weekly' | 'monthly' | 'quarterly'
export type FunnelPeriod = { kind:FunnelPeriodKind; anchorDate:string; startDate:string; endDate:string; endExclusiveDate:string; startAt:string; endAt:string; dayCount:number; days:string[]; label:string }
export function isFunnelDateKey(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||+value.slice(0,4)<1900||+value.slice(0,4)>9998)return false
  const date=new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value
}
export function funnelDateKey(value:string|Date=new Date()):string {
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){if(!isFunnelDateKey(value))throw new Error('Invalid calendar date');return value}
  const date=value instanceof Date?value:new Date(value)
  if(!Number.isFinite(date.getTime()))throw new Error('Invalid date')
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:FUNNEL_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]))
  const key=`${parts.year}-${parts.month}-${parts.day}`
  if(!isFunnelDateKey(key))throw new Error('Date outside supported range')
  return key
}
export function addFunnelDays(key:string,count:number):string {
  if(!isFunnelDateKey(key)||!Number.isInteger(count))throw new Error('Invalid calendar offset')
  const date=new Date(`${key}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+count)
  const result=date.toISOString().slice(0,10)
  if(!isFunnelDateKey(result))throw new Error('Date outside supported range')
  return result
}
export function funnelMidnightUtc(key:string):string {
  if(!isFunnelDateKey(key))throw new Error('Invalid boundary')
  const target=Date.parse(`${key}T00:00:00Z`);let guess=target
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:FUNNEL_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
  for(let i=0;i<3;i++){const p=Object.fromEntries(formatter.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));guess+=target-Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)}
  return new Date(guess).toISOString()
}
export function getFunnelPeriod(kind:FunnelPeriodKind='weekly',anchor:Date|string=new Date()):FunnelPeriod {
  if(!['weekly','monthly','quarterly'].includes(kind))throw new Error('Invalid cadence')
  const anchorDate=funnelDateKey(anchor),year=+anchorDate.slice(0,4),month=+anchorDate.slice(5,7)
  let startDate:string,endExclusiveDate:string
  if(kind==='weekly'){startDate=addFunnelDays(anchorDate,-new Date(`${anchorDate}T00:00:00Z`).getUTCDay());endExclusiveDate=addFunnelDays(startDate,7)}
  else{const first=kind==='monthly'?month:Math.floor((month-1)/3)*3+1;startDate=`${year}-${String(first).padStart(2,'0')}-01`;endExclusiveDate=new Date(Date.UTC(year,first-1+(kind==='monthly'?1:3),1)).toISOString().slice(0,10)}
  if(!isFunnelDateKey(endExclusiveDate))throw new Error('Period outside supported range')
  const dayCount=(Date.parse(`${endExclusiveDate}T00:00:00Z`)-Date.parse(`${startDate}T00:00:00Z`))/86400000
  const endDate=addFunnelDays(endExclusiveDate,-1),days=Array.from({length:dayCount},(_,i)=>addFunnelDays(startDate,i))
  const fmt=(key:string)=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}).format(new Date(`${key}T12:00:00Z`))
  const label=kind==='monthly'?new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(`${startDate}T12:00:00Z`)):kind==='quarterly'?`Q${Math.floor((month-1)/3)+1} ${year}`:`${fmt(startDate)} – ${fmt(endDate)}`
  return {kind,anchorDate,startDate,endDate,endExclusiveDate,startAt:funnelMidnightUtc(startDate),endAt:funnelMidnightUtc(endExclusiveDate),dayCount,days,label}
}
export function shiftFunnelPeriod(period:FunnelPeriod,direction:number):FunnelPeriod {
  if(!Number.isInteger(direction))throw new Error('Invalid period offset')
  const anchor=period.kind==='weekly'?addFunnelDays(period.startDate,direction*7):new Date(Date.UTC(+period.startDate.slice(0,4),+period.startDate.slice(5,7)-1+direction*(period.kind==='monthly'?1:3),1)).toISOString().slice(0,10)
  return getFunnelPeriod(period.kind,anchor)
}
export function getDefaultFunnelWeekRange(anchor: Date | string = new Date()): { start: string; end: string } {
  const period = getFunnelPeriod('weekly', anchor)
  return { start: period.startDate, end: period.endDate }
}
function funnelRangeLabel(startDate: string, endDate: string): string {
  const fmt = (key: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${key}T12:00:00Z`))
  return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} – ${fmt(endDate)}`
}
function inferFunnelRangeKind(startDate: string, endDate: string): FunnelPeriodKind {
  for (const kind of ['weekly', 'monthly', 'quarterly'] as const) {
    for (const anchor of [startDate, endDate]) {
      try {
        const candidate = getFunnelPeriod(kind, anchor)
        if (candidate.startDate === startDate && candidate.endDate === endDate) return kind
      } catch { /* try next */ }
    }
  }
  return startDate.slice(0, 7) === endDate.slice(0, 7) ? 'monthly' : 'weekly'
}
export function getFunnelPeriodFromRange(startDate: string, endDate: string): FunnelPeriod {
  if (!isFunnelDateKey(startDate) || !isFunnelDateKey(endDate) || startDate > endDate) throw new Error('Invalid range')
  for (const kind of ['monthly', 'quarterly', 'weekly'] as const) {
    for (const anchor of [startDate, endDate]) {
      try {
        const candidate = getFunnelPeriod(kind, anchor)
        if (candidate.startDate === startDate && candidate.endDate === endDate) return candidate
      } catch { /* try next */ }
    }
  }
  const endExclusiveDate = addFunnelDays(endDate, 1)
  const dayCount = (Date.parse(`${endExclusiveDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 366) throw new Error('Invalid range span')
  const days = Array.from({ length: dayCount }, (_, index) => addFunnelDays(startDate, index))
  const kind = inferFunnelRangeKind(startDate, endDate)
  const fullMonth = startDate.endsWith('-01') && addFunnelDays(endDate, 1).slice(8) === '01'
  const label = kind === 'monthly' && fullMonth
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${startDate}T12:00:00Z`))
    : funnelRangeLabel(startDate, endDate)
  return {
    kind,
    anchorDate: startDate,
    startDate,
    endDate,
    endExclusiveDate,
    startAt: funnelMidnightUtc(startDate),
    endAt: funnelMidnightUtc(endExclusiveDate),
    dayCount,
    days,
    label,
  }
}
export function shiftFunnelDateRange(range: { start: string; end: string }, direction: number): { start: string; end: string } {
  const shifted = shiftFunnelPeriod(getFunnelPeriodFromRange(range.start, range.end), direction)
  return { start: shifted.startDate, end: shifted.endDate }
}
