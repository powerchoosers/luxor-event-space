import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { postgrestSchemaUnavailable } from '@/lib/luxorPostgrestSchema'
import { supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import type { LuxorVendor } from '@/lib/luxorInquiryTypes'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function text(value: unknown, max: number) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length <= max ? normalized : null
}
function optionalField(values: Record<string, unknown>, key: string, max: number) {
  if (!Object.prototype.hasOwnProperty.call(values, key)) return { provided: false as const, value: '' }
  const value = text(values[key], max)
  return { provided: true as const, value }
}
async function vendorProfileColumnsAvailable() {
  try {
    await supabaseRestStrict<Array<{ contact_person: string | null }>>('luxor_vendors?select=contact_person&limit=0')
    return true
  } catch (error) {
    if (postgrestSchemaUnavailable(error)) return false
    throw error
  }
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOperationsSession()
    if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
    const { id } = await context.params
    if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid vendor.' }, { status: 400 })
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid vendor details.' }, { status: 400 })
    const values = body as Record<string, unknown>
    const expected = values.expectedUpdatedAt
    if (typeof expected !== 'string' || !Number.isFinite(Date.parse(expected))) return NextResponse.json({ error: 'Refresh the vendor before editing.' }, { status: 400 })
    const name = text(values.name, 200)
    const vendorType = text(values.vendor_type, 100)
    const emailField = optionalField(values, 'email', 200)
    const phoneField = optionalField(values, 'phone', 50)
    const contactField = optionalField(values, 'contact_person', 200)
    const websiteField = optionalField(values, 'business_website', 500)
    const addressField = optionalField(values, 'mailing_address', 1000)
    const notesField = optionalField(values, 'internal_notes', 2000)
    const categoryField = optionalField(values, 'vendor_category', 100)
    if (!name || !vendorType) return NextResponse.json({ error: 'Enter a name and category.' }, { status: 400 })
    if ([emailField, phoneField, contactField, websiteField, addressField, notesField, categoryField].some((field) => field.provided && field.value === null)) {
      return NextResponse.json({ error: 'Keep details within their length limits.' }, { status: 400 })
    }
    const email = emailField.value, phone = phoneField.value
    const contact = contactField.provided ? contactField.value : null
    const website = websiteField.provided ? websiteField.value : null
    const address = addressField.provided ? addressField.value : null
    const notes = notesField.provided ? notesField.value : null
    const vendorCategory = categoryField.provided ? categoryField.value : null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    if (phone && !/^[+\d(). -]+$/.test(phone)) return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 })
    if (website) { try { const parsed = new URL(website); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid URL') } catch { return NextResponse.json({ error: 'Enter a valid http or https website.' }, { status: 400 }) } }
    if ([contact, address, notes].filter((value) => typeof value === 'string').some((value) => /\b(?:\d{3}-\d{2}-\d{4}|\d{2}-\d{7})\b/.test(value))) return NextResponse.json({ error: 'Do not enter tax or government identification numbers in vendor details.' }, { status: 400 })
    const [current] = await supabaseRestStrict<Array<LuxorVendor & { archived_at?: string | null }>>(`luxor_vendors?id=eq.${id}&select=*&limit=1`)
    if (!current) return NextResponse.json({ error: 'Vendor not found.' }, { status: 404 })
    if ('archived_at' in current && current.archived_at) return NextResponse.json({ error: 'Restore this vendor before editing.' }, { status: 409 })
    if (current.updated_at !== expected) return NextResponse.json({ error: 'Vendor changed. Refresh before saving.' }, { status: 409 })
    const profilePayload = {
      contact_person: contact || null,
      business_website: website || null,
      mailing_address: address || null,
      internal_notes: notes || null,
      vendor_category: vendorCategory || null,
    }
    const wantsProfile = Object.values(profilePayload).some(Boolean)
    const profileColumns = await vendorProfileColumnsAvailable()
    if (wantsProfile && !profileColumns) {
      return NextResponse.json({ error: 'Contact, website, address, and notes are not stored on the vendor record yet. Save name, email, phone, and category only.' }, { status: 409 })
    }
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(expected) + 1)).toISOString()
    const patchBody: Record<string, unknown> = { name, email: email || null, phone: phone || null, vendor_type: vendorType, updated_at: updatedAt }
    if (profileColumns && (wantsProfile || [contactField, websiteField, addressField, notesField, categoryField].some((field) => field.provided))) {
      Object.assign(patchBody, profilePayload)
    }
    const [updated] = await supabaseRestStrict<LuxorVendor[]>(`luxor_vendors?id=eq.${id}&updated_at=eq.${encodeURIComponent(expected)}&select=*`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patchBody),
    })
    if (!updated) return NextResponse.json({ error: 'Vendor changed. Refresh before saving.' }, { status: 409 })
    return NextResponse.json(updated, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '23505') return NextResponse.json({ error: 'A vendor with this name already exists. Review the existing vendor.' }, { status: 409 })
    console.error('Vendor update failed:', error)
    return NextResponse.json({ error: 'Vendor details could not be saved. Please retry.' }, { status: 500 })
  }
}
