import { NextRequest, NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { LuxorTask, LuxorBill } from '@/lib/luxorInquiryTypes'
export type { LuxorBill }

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
  rating: string
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

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const [bills, inventory, vendors, utilities, cleaning, tasks] = await Promise.all([
      supabaseRest<LuxorBill[]>('luxor_bills?select=*&order=due_date.asc,created_at.desc').catch(() => []),
      supabaseRest<LuxorInventoryItem[]>('luxor_inventory?select=*&order=name.asc').catch(() => []),
      supabaseRest<LuxorVendor[]>('luxor_vendors?select=*&order=name.asc').catch(() => []),
      supabaseRest<LuxorUtilityReading[]>('luxor_utility_readings?select=*&order=sensor_type.asc').catch(() => []),
      supabaseRest<LuxorCleaningLog[]>('luxor_cleaning_logs?select=*&order=created_at.desc').catch(() => []),
      supabaseRest<LuxorTask[]>('luxor_tasks?select=*&order=due_date.asc,created_at.desc').catch(() => []),
    ])

    return NextResponse.json({ bills, inventory, vendors, utilities, cleaning, tasks })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch operations data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { type, ...data } = body

    if (!type) {
      return NextResponse.json({ error: 'Type parameter is required.' }, { status: 400 })
    }

    let created: LuxorBill | LuxorInventoryItem | LuxorVendor | LuxorCleaningLog | LuxorTask | null = null

    if (type === 'bill') {
      const [res] = await supabaseRest<LuxorBill[]>('luxor_bills?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          service: data.service,
          frequency: data.frequency || 'Monthly',
          provider: data.provider,
          amount: Number(data.amount),
          status: data.status || 'unpaid',
          due_date: data.due_date || null,
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
          rating: data.rating || '5.0 ⭐',
          coi_active: data.coi_active !== undefined ? Boolean(data.coi_active) : true,
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
      const [res] = await supabaseRest<LuxorTask[]>('luxor_tasks?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          inquiry_id: data.inquiry_id || 'c37a6b8f-1a8b-4b16-896c-54a7fbd9c8d1',
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
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { type, id, ...updates } = body

    if (!type || !id) {
      return NextResponse.json({ error: 'Type and ID parameters are required.' }, { status: 400 })
    }

    let table = ''
    if (type === 'bill') table = 'luxor_bills'
    else if (type === 'inventory') table = 'luxor_inventory'
    else if (type === 'vendor') table = 'luxor_vendors'
    else if (type === 'cleaning') table = 'luxor_cleaning_logs'
    else if (type === 'utility') table = 'luxor_utility_readings'
    else if (type === 'task') table = 'luxor_tasks'
    else {
      return NextResponse.json({ error: 'Invalid operation type.' }, { status: 400 })
    }

    const [updated] = await supabaseRest<(LuxorBill | LuxorInventoryItem | LuxorVendor | LuxorCleaningLog | LuxorUtilityReading | LuxorTask)[]>(`${table}?select=*&id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ...updates,
        updated_at: new Date().toISOString(),
      }),
    })

    return NextResponse.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update operation entry.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
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
    else if (type === 'task') table = 'luxor_tasks'
    else {
      return NextResponse.json({ error: 'Invalid operation type.' }, { status: 400 })
    }

    await supabaseRest(`${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete operation entry.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
