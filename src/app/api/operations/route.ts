import { after, NextRequest, NextResponse } from 'next/server'
import { supabaseRest, supabaseRestStrict, supabaseRestCount, SupabaseRestError } from '@/lib/supabaseRestServer'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { isLuxorBillCategory } from '@/lib/luxorBillCategories'
import { analyzeManualBill } from '@/lib/luxorManualBillAnalysisServer'
import { parseManualBillCreate } from '@/lib/luxorManualBillCreate'
import { loadOperationsBillsWithExpenseLinks } from '@/lib/luxorOperationsBillExpenses'
import { luxorTimestampIsKnown, luxorTimestampMs } from '@/lib/luxorTimestamp'
import { LuxorBill, LuxorBillIntake } from '@/lib/luxorInquiryTypes'
export type { LuxorBill, LuxorBillIntake }
export const maxDuration = 60

export type LuxorInventoryItem = {
  id: string
  created_at: string
  updated_at: string
  category: 'furniture' | 'supplies' | 'decor' | 'other'
  name: string
  count: number
  unit: string
  status: 'Good' | 'Low' | 'Out of Stock'
}

export type LuxorVendor = {
  id: string
  archived_at?: string | null
  created_at: string
  updated_at: string
  vendor_type: string
  name: string
  email: string | null
  phone: string | null
  rating: string | null
  coi_active: boolean
}

export type LuxorUtilityReading = {
  id: string
  created_at: string
  sensor_type: 'electric' | 'water' | 'gas' | 'internet' | 'security'
  current_load: string
  previous_bill_total: number
  anomaly_status: string
}

export type LuxorCleaningLog = {
  id: string
  created_at: string
  task_name: string
  completed: boolean
  completed_at: string | null
  notes: string | null
}

export type LuxorMaintenanceTask = {
  id: string
  created_at: string
  updated_at: string
  title: string
  description: string | null
  due_date: string | null
  completed_at: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'completed' | 'cancelled'
}

async function loadIntakesWithAttention(): Promise<LuxorBillIntake[]> {
  const recentPath = 'luxor_bill_intakes?select=*&order=received_at.desc,id.asc&limit=100'
  const attentionPath = 'luxor_bill_intakes?select=*&status=in.(received,processing,failed,ignored)&order=received_at.desc,id.asc'
  const [recent, count] = await Promise.all([supabaseRestStrict<LuxorBillIntake[]>(recentPath), supabaseRestCount(attentionPath)])
  const attention: LuxorBillIntake[] = []
  for (let offset = 0; offset < count; offset += 500) {
    const page = await supabaseRestStrict<LuxorBillIntake[]>(`${attentionPath}&limit=500&offset=${offset}`)
    if (page.length !== Math.min(500, count - offset)) throw new Error('Invoice intake records changed while loading. Please retry.')
    attention.push(...page)
  }
  if (attention.some((item) => !item.id) || new Set(attention.map((item) => item.id)).size !== count || await supabaseRestCount(attentionPath) !== count) throw new Error('Invoice intake records changed while loading. Please retry.')
  const combined = new Map(recent.map((item) => [item.id, item]))
  for (const item of attention) combined.set(item.id, item)
  return [...combined.values()].sort((a, b) => String(b.received_at || '').localeCompare(String(a.received_at || '')) || a.id.localeCompare(b.id))
}

export async function GET(request: NextRequest) {
  try {
    const session = await getOperationsSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const [bills, billIntakes, inventory, vendors, utilities, cleaning, tasks] = await Promise.all([
      loadOperationsBillsWithExpenseLinks<LuxorBill>({
        embedded: () => supabaseRestStrict<Array<LuxorBill & { linked_expense: { id: string } | { id: string }[] | null }>>(
          'luxor_bills?select=*,linked_expense:luxor_booking_expenses!luxor_booking_expenses_source_bill_id_fkey(id)&order=due_date.asc,created_at.desc',
        ),
        bills: () => supabaseRestStrict<LuxorBill[]>('luxor_bills?select=*&order=due_date.asc,created_at.desc'),
        expenses: (billIds) => supabaseRestStrict<Array<{ id: string; source_bill_id: string | null }>>(
          `luxor_booking_expenses?select=id,source_bill_id&source_bill_id=in.(${billIds.join(',')})`,
        ),
      }),
      loadIntakesWithAttention(),
      supabaseRest<LuxorInventoryItem[]>('luxor_inventory?select=*&order=name.asc').catch(() => []),
      supabaseRestStrict<LuxorVendor[]>('luxor_vendors?select=id,created_at,updated_at,archived_at,vendor_type,name,email,phone,rating,coi_active&order=name.asc'),
      supabaseRest<LuxorUtilityReading[]>('luxor_utility_readings?select=*&order=sensor_type.asc').catch(() => []),
      supabaseRest<LuxorCleaningLog[]>('luxor_cleaning_logs?select=*&order=created_at.desc').catch(() => []),
      supabaseRest<LuxorMaintenanceTask[]>('luxor_maintenance_tasks?select=*&order=due_date.asc,created_at.desc').catch(() => []),
    ])

    return NextResponse.json({
      bills,
      billIntakes, invoiceAnalysisConfigured: Boolean(process.env.OPEN_ROUTER_API_KEY?.trim()), resendReceivingConfigured: Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_WEBHOOK_SECRET?.trim()), inventory, vendors, utilities, cleaning, tasks,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch operations data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getOperationsSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { type, ...data } = body

    if (!type) {
      return NextResponse.json({ error: 'Type parameter is required.' }, { status: 400 })
    }

    let created: LuxorBill | LuxorInventoryItem | LuxorVendor | LuxorCleaningLog | LuxorMaintenanceTask | null = null
    let replayedBill = false

    if (type === 'bill') {
      let parsed: ReturnType<typeof parseManualBillCreate>
      try { parsed = parseManualBillCreate(data) }
      catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Enter a valid bill.' }, { status: 400 }) }
      const requestPath = `luxor_bills?select=*&client_request_id=eq.${encodeURIComponent(parsed.requestId)}&limit=1`
      const readSaved = () => supabaseRestStrict<Array<LuxorBill & { client_request_fingerprint?: string | null }>>(requestPath)
      const existing = await readSaved()
      if (parsed.draft.vendorId) {
        const [vendor] = await supabaseRestStrict<Array<{ id: string }>>(`luxor_vendors?select=id&id=eq.${encodeURIComponent(parsed.draft.vendorId)}&limit=1`)
        if (!vendor) return NextResponse.json({ error: 'Choose a vendor that is already saved.' }, { status: 400 })
      }
      if (existing[0]) {
        if (existing[0].client_request_fingerprint !== parsed.fingerprint) return NextResponse.json({ error: 'This save was already used for a different bill. Change a detail and save again.' }, { status: 409 })
        created = existing[0]
        replayedBill = true
      } else {
        try {
          const [res] = await supabaseRest<LuxorBill[]>('luxor_bills?select=*', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              service: parsed.draft.service,
              frequency: parsed.draft.frequency,
              provider: parsed.draft.provider,
              amount: parsed.draft.amountCents === null ? 0 : parsed.draft.amountCents / 100,
              amount_state: parsed.draft.amountState,
              bill_category: parsed.draft.billCategory,
              status: 'unpaid',
              due_date: parsed.draft.dueDate,
              invoice_number: parsed.draft.invoiceNumber,
              issue_date: parsed.draft.issueDate,
              source_type: 'manual',
              extraction_status: 'needs_review',
              extracted_fields: { manual_analysis: { status: 'queued', queued_at: new Date().toISOString() } },
              arithmetic_status: 'not_checked',
              currency: 'USD',
              vendor_id: parsed.draft.vendorId,
              vendor_link_method: parsed.draft.vendorId ? 'owner' : null,
              client_request_id: parsed.requestId,
              client_request_fingerprint: parsed.fingerprint,
            }),
          })
          created = res
        } catch (error) {
          if (!(error instanceof SupabaseRestError) || error.code !== '23505') throw error
          const raced = await readSaved()
          if (!raced[0] || raced[0].client_request_fingerprint !== parsed.fingerprint) return NextResponse.json({ error: 'This save was already used for a different bill. Change a detail and save again.' }, { status: 409 })
          created = raced[0]
          replayedBill = true
        }
      }
    } else if (type === 'inventory') {
      const [res] = await supabaseRest<LuxorInventoryItem[]>('luxor_inventory?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          category: data.category,
          name: data.name,
          count: Number(data.count),
          unit: data.unit || 'pcs',
          status: data.status || 'Good',
        }),
      })
      created = res
    } else if (type === 'vendor') {
      let website: string | null = null
      if (data.business_website !== undefined && data.business_website !== null && data.business_website !== '') {
        const member = await getLuxorPortalMember(session.email)
        if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required to save a website.' }, { status: 403 })
        if (typeof data.business_website !== 'string' || data.business_website.length > 500) return NextResponse.json({ error: 'Enter a valid website.' }, { status: 400 })
        try { const url = new URL(data.business_website.trim()); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); website = url.href } catch { return NextResponse.json({ error: 'Enter a valid http or https website.' }, { status: 400 }) }
      }
      const [res] = await supabaseRest<LuxorVendor[]>('luxor_vendors?select=id,created_at,updated_at,archived_at,vendor_type,name,email,phone,rating,coi_active', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          vendor_type: data.vendor_type,
          name: data.name,
          ...(website ? { business_website: website } : {}),
          email: data.email || null,
          phone: data.phone || null,
          rating: typeof data.rating === 'string' && data.rating.trim() ? data.rating.trim() : null,
          coi_active: data.coi_active === true,
        }),
      })
      created = res
    } else if (type === 'cleaning') {
      const [res] = await supabaseRest<LuxorCleaningLog[]>('luxor_cleaning_logs?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          task_name: data.task_name,
          completed: Boolean(data.completed),
          completed_at: data.completed ? new Date().toISOString() : null,
          notes: data.notes || null,
        }),
      })
      created = res
    } else if (type === 'task') {
      const [res] = await supabaseRest<LuxorMaintenanceTask[]>('luxor_maintenance_tasks?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          title: data.title,
          description: data.description || null,
          due_date: data.due_date || null,
          priority: data.priority || 'medium',
          status: data.status || 'pending',
        }),
      })
      created = res
    } else {
      return NextResponse.json({ error: 'Invalid operation type.' }, { status: 400 })
    }

    if (type === 'bill' && created && !replayedBill) {
      const id = created.id
      try { after(async () => { await analyzeManualBill(id).catch((error) => console.error('Manual bill analysis failed:', error)) }) }
      catch (error) { console.error('Manual bill analysis scheduling failed:', error) }
    }
    let recurringObligation: string | null = null
    if (type === 'bill' && created && 'provider' in created && 'bill_category' in created && typeof created.provider === 'string' && typeof created.bill_category === 'string') {
      try {
        const templates = await supabaseRestStrict<Array<{ name: string; vendor_name: string | null; category: string }>>('luxor_expense_templates?select=name,vendor_name,category&is_active=eq.true')
        const provider = created.provider.trim().toLowerCase()
        const category = created.bill_category.trim().toLowerCase()
        let vendorName = ''
        if ('vendor_id' in created && typeof created.vendor_id === 'string' && created.vendor_id) {
          const [vendor] = await supabaseRestStrict<Array<{ name: string }>>(`luxor_vendors?select=name&id=eq.${encodeURIComponent(created.vendor_id)}&limit=1`)
          vendorName = vendor?.name.trim().toLowerCase() || ''
        }
        const sameCategory = (template: { vendor_name: string | null; category: string }) => template.category.trim().toLowerCase() === category
        recurringObligation = templates.find((template) => vendorName && (template.vendor_name || '').trim().toLowerCase() === vendorName && sameCategory(template))?.name
          || templates.find((template) => provider && (template.vendor_name || '').trim().toLowerCase() === provider && sameCategory(template))?.name
          || null
      } catch { recurringObligation = null }
    }
    return NextResponse.json(recurringObligation ? { ...created, recurring_obligation: recurringObligation } : created, { status: 201 })
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '23505') return NextResponse.json({ error: 'A vendor with this name already exists. Review the existing vendor.' }, { status: 409 })
    const message = error instanceof Error ? error.message : 'Failed to create operation entry.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getOperationsSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { type, id, expectedUpdatedAt, ...updates } = body

    if (!type || !id) {
      return NextResponse.json({ error: 'Type and ID parameters are required.' }, { status: 400 })
    }

    let table = ''
    if (type === 'bill') table = 'luxor_bills'
    else if (type === 'inventory') table = 'luxor_inventory'
    else if (type === 'vendor') table = 'luxor_vendors'
    else if (type === 'cleaning') table = 'luxor_cleaning_logs'
    else if (type === 'utility') table = 'luxor_utility_readings'
    else if (type === 'task') table = 'luxor_maintenance_tasks'
    else {
      return NextResponse.json({ error: 'Invalid operation type.' }, { status: 400 })
    }

    if (type === 'vendor') {
      const allowed = new Set(['name', 'vendor_type', 'email', 'phone', 'rating', 'coi_active'])
      for (const key of Object.keys(updates)) if (!allowed.has(key)) delete updates[key]
      if (Object.prototype.hasOwnProperty.call(updates, 'rating')) updates.rating = typeof updates.rating === 'string' && updates.rating.trim() ? updates.rating.trim() : null
    }

    let versionGuard = ''
    if (type === 'bill') {
      const allowed = new Set(['service', 'provider', 'frequency', 'due_date', 'status', 'amount', 'amount_state', 'bill_category'])
      for (const key of Object.keys(updates)) if (!allowed.has(key)) delete updates[key]
      if ('bill_category' in updates && updates.bill_category !== null && !isLuxorBillCategory(updates.bill_category)) return NextResponse.json({ error: 'Choose an existing expense category.' }, { status: 400 })
      if (updates.amount_state != null && !['known', 'unknown', 'variable'].includes(updates.amount_state)) return NextResponse.json({ error: 'Invalid amount state.' }, { status: 400 })
      if ('amount' in updates && (!['number', 'string'].includes(typeof updates.amount) || (typeof updates.amount === 'string' && !updates.amount.trim()) || !Number.isFinite(Number(updates.amount)) || Number(updates.amount) < 0)) return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 400 })
      if (updates.amount_state === 'known' && !('amount' in updates)) return NextResponse.json({ error: 'Enter a confirmed amount.' }, { status: 400 })
      if (updates.amount_state === 'unknown' || updates.amount_state === 'variable') updates.amount = 0
      if (typeof expectedUpdatedAt !== 'string' || !luxorTimestampIsKnown(expectedUpdatedAt)) return NextResponse.json({ error: 'Reload the bill before editing.' }, { status: 400 })
      const [current] = await supabaseRest<LuxorBill[]>(`luxor_bills?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)
      if (!current) return NextResponse.json({ error: 'Bill not found.' }, { status: 404 })
      if (current.status === 'paid') return NextResponse.json({ error: 'Paid bills require an audited correction workflow.' }, { status: 409 })
      if (updates.status === 'paid') return NextResponse.json({ error: 'Use the bill review action to record payment.' }, { status: 400 })
      if (current.updated_at !== expectedUpdatedAt) return NextResponse.json({ error: 'Bill changed. Reload and try again.' }, { status: 409 })
      if (typeof updates.frequency === 'string') {
        const next = updates.frequency.trim()
        const allowed = ['One-time', 'Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annually']
        if (!next || next.length > 40 || (!allowed.includes(next) && next !== current.frequency)) return NextResponse.json({ error: 'Choose a bill frequency.' }, { status: 400 })
        updates.frequency = next
      }
      if ('due_date' in updates) {
        const value = updates.due_date
        if (value === null || value === '') updates.due_date = null
        else if (typeof value !== 'string') return NextResponse.json({ error: 'Choose a valid due date.' }, { status: 400 })
        else {
          const day = value.slice(0, 10)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: 'Choose a valid due date.' }, { status: 400 })
          const [year, month, dayNumber] = day.split('-').map(Number)
          const date = new Date(Date.UTC(year, month - 1, dayNumber))
          if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== dayNumber) return NextResponse.json({ error: 'Choose a valid due date.' }, { status: 400 })
          updates.due_date = day
        }
      }
      versionGuard = `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}&status=neq.paid`
      updates.extraction_status = 'needs_review'
      updates.payment_ready_at = null
    }

    const [updated] = await supabaseRest<(LuxorBill | LuxorInventoryItem | LuxorVendor | LuxorCleaningLog | LuxorUtilityReading | LuxorMaintenanceTask)[]>(`${table}?select=${type === 'vendor' ? 'id,created_at,updated_at,vendor_type,name,email,phone,rating,coi_active' : '*'}&id=eq.${encodeURIComponent(id)}${versionGuard}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ...updates,
        updated_at: new Date(type === 'bill' ? Math.max(Date.now(), luxorTimestampMs(expectedUpdatedAt)! + 1) : Date.now()).toISOString(),
      }),
    })

    if (!updated) return NextResponse.json({ error: 'Record changed. Reload and try again.' }, { status: 409 })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '23505') return NextResponse.json({ error: 'A vendor with this name already exists. Review the existing vendor.' }, { status: 409 })
    const message = error instanceof Error ? error.message : 'Failed to update operation entry.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getOperationsSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const id = searchParams.get('id')

    if (!type || !id) {
      return NextResponse.json({ error: 'Type and ID parameters are required.' }, { status: 400 })
    }

    if (type === 'bill' || type === 'vendor') {
      return NextResponse.json({ error: 'Bills and vendors are retained for history and cannot be deleted.' }, { status: 409 })
    }

    let table = ''
    if (type === 'inventory') table = 'luxor_inventory'
    else if (type === 'cleaning') table = 'luxor_cleaning_logs'
    else if (type === 'utility') table = 'luxor_utility_readings'
    else if (type === 'task') table = 'luxor_maintenance_tasks'
    else {
      return NextResponse.json({ error: 'Invalid operation type.' }, { status: 400 })
    }

    await supabaseRest<unknown[]>(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete operation entry.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
