import { NextRequest, NextResponse } from 'next/server'
import { supabaseRest, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { isLuxorBillCategory } from '@/lib/luxorBillCategories'
import { LuxorBill, LuxorBillIntake } from '@/lib/luxorInquiryTypes'
export type { LuxorBill, LuxorBillIntake }

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

export async function GET(request: NextRequest) {
  try {
    const session = await getOperationsSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const [bills, billIntakes, inventory, vendors, utilities, cleaning, tasks] = await Promise.all([
      supabaseRestStrict<LuxorBill[]>('luxor_bills?select=*&order=due_date.asc,created_at.desc'),
      supabaseRestStrict<LuxorBillIntake[]>('luxor_bill_intakes?select=*&order=received_at.desc&limit=100'),
      supabaseRest<LuxorInventoryItem[]>('luxor_inventory?select=*&order=name.asc').catch(() => []),
      supabaseRestStrict<LuxorVendor[]>('luxor_vendors?select=*&order=name.asc'),
      supabaseRest<LuxorUtilityReading[]>('luxor_utility_readings?select=*&order=sensor_type.asc').catch(() => []),
      supabaseRest<LuxorCleaningLog[]>('luxor_cleaning_logs?select=*&order=created_at.desc').catch(() => []),
      supabaseRest<LuxorMaintenanceTask[]>('luxor_maintenance_tasks?select=*&order=due_date.asc,created_at.desc').catch(() => []),
    ])

    return NextResponse.json({ bills, billIntakes, inventory, vendors, utilities, cleaning, tasks })
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

    if (type === 'bill') {
      if (data.amount_state !== undefined && !['known', 'unknown', 'variable'].includes(data.amount_state)) return NextResponse.json({ error: 'Invalid amount state.' }, { status: 400 })
      const amountState = data.amount_state || 'known'
      if (amountState === 'known' && (!['number', 'string'].includes(typeof data.amount) || (typeof data.amount === 'string' && !data.amount.trim()) || !Number.isFinite(Number(data.amount)) || Number(data.amount) < 0)) return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 400 })
      if (data.status && data.status !== 'unpaid') return NextResponse.json({ error: 'New bills must start unpaid.' }, { status: 400 })
      const [res] = await supabaseRest<LuxorBill[]>('luxor_bills?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          service: data.service,
          frequency: data.frequency || 'Monthly',
          provider: data.provider,
          amount: amountState === 'known' ? Number(data.amount) : 0,
          amount_state: amountState,
          status: 'unpaid',
          due_date: data.due_date || null,
          source_type: 'manual',
          extraction_status: 'needs_review',
          arithmetic_status: 'not_checked',
          currency: 'USD',
        }),
      })
      created = res
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
      const [res] = await supabaseRest<LuxorVendor[]>('luxor_vendors?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          vendor_type: data.vendor_type,
          name: data.name,
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

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
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

    if (type === 'vendor' && Object.prototype.hasOwnProperty.call(updates, 'rating')) {
      updates.rating = typeof updates.rating === 'string' && updates.rating.trim() ? updates.rating.trim() : null
    }

    let versionGuard = ''
    if (type === 'bill') {
      const allowed = new Set(['service', 'provider', 'frequency', 'due_date', 'status', 'amount', 'amount_state', 'bill_category'])
      for (const key of Object.keys(updates)) if (!allowed.has(key)) delete updates[key]
      if ('bill_category' in updates && updates.bill_category !== null && !isLuxorBillCategory(updates.bill_category)) return NextResponse.json({ error: 'Choose an existing expense category.' }, { status: 400 })
      if (updates.amount_state != null && !['known', 'unknown', 'variable'].includes(updates.amount_state)) return NextResponse.json({ error: 'Invalid amount state.' }, { status: 400 })
      if ('amount' in updates && (!['number', 'string'].includes(typeof updates.amount) || (typeof updates.amount === 'string' && !updates.amount.trim()) || !Number.isFinite(Number(updates.amount)) || Number(updates.amount) < 0)) return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 400 })
      if (updates.amount_state === 'known' && !('amount' in updates)) return NextResponse.json({ error: 'Enter a confirmed amount.' }, { status: 400 })
      if (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt))) return NextResponse.json({ error: 'Reload the bill before editing.' }, { status: 400 })
      const [current] = await supabaseRest<LuxorBill[]>(`luxor_bills?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)
      if (!current) return NextResponse.json({ error: 'Bill not found.' }, { status: 404 })
      if (current.status === 'paid') return NextResponse.json({ error: 'Paid bills require an audited correction workflow.' }, { status: 409 })
      if (updates.status === 'paid') return NextResponse.json({ error: 'Use the bill review action to record payment.' }, { status: 400 })
      if (current.updated_at !== expectedUpdatedAt) return NextResponse.json({ error: 'Bill changed. Reload and try again.' }, { status: 409 })
      versionGuard = `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}&status=neq.paid`
      updates.extraction_status = 'needs_review'
      updates.payment_ready_at = null
    }

    const [updated] = await supabaseRest<(LuxorBill | LuxorInventoryItem | LuxorVendor | LuxorCleaningLog | LuxorUtilityReading | LuxorMaintenanceTask)[]>(`${table}?select=*&id=eq.${encodeURIComponent(id)}${versionGuard}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ...updates,
        updated_at: new Date(type === 'bill' ? Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1) : Date.now()).toISOString(),
      }),
    })

    if (!updated) return NextResponse.json({ error: 'Record changed. Reload and try again.' }, { status: 409 })
    return NextResponse.json(updated)
  } catch (error) {
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

    const result = await supabaseRest<unknown[]>(`${table}?id=eq.${encodeURIComponent(id)}${type === 'bill' ? '&status=neq.paid&select=id' : ''}`, {
      method: 'DELETE',
      ...(type === 'bill' ? { headers: { Prefer: 'return=representation' } } : {}),
    })

    if (type === 'bill' && !result?.length) return NextResponse.json({ error: 'Paid bills cannot be deleted; use an audited correction workflow.' }, { status: 409 })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete operation entry.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
