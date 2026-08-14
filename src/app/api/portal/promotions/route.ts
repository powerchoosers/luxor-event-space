import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorPromotion } from '@/lib/luxorInquiryTypes'

type PromotionInput = Partial<Pick<LuxorPromotion, 'name' | 'code' | 'discount_type' | 'value' | 'active' | 'metadata'>> & {
  id?: string
}

class PromotionConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PromotionConflictError'
  }
}

function cleanName(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : ''
}

function cleanCode(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
    : ''
}

function generatedCode(name: string) {
  const label = cleanCode(name).slice(0, 46) || 'PROMO'
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  return `${label}-${suffix}`.slice(0, 60)
}

function validDiscountType(value: unknown): value is LuxorPromotion['discount_type'] {
  return value === 'percent' || value === 'fixed'
}

function positiveMoney(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null
}

function isDuplicateError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return /duplicate key|unique constraint|already exists/i.test(message)
}

async function listPromotions() {
  return supabaseRest<LuxorPromotion[]>('luxor_promotions?select=*&order=active.desc,name.asc')
}

async function assertNoPromotionCollision(input: { name: string; code: string; ignoreId?: string }) {
  const promotions = await listPromotions()
  const nameCollision = promotions.find((promotion) =>
    promotion.id !== input.ignoreId && promotion.name.trim().toLocaleLowerCase() === input.name.toLocaleLowerCase(),
  )
  if (nameCollision) {
    throw new PromotionConflictError('A saved promotion already uses that name. Choose a distinct name so staff can recognize it later.')
  }
  const codeCollision = promotions.find((promotion) =>
    promotion.id !== input.ignoreId && promotion.code.trim().toUpperCase() === input.code,
  )
  if (codeCollision) {
    throw new PromotionConflictError('A saved promotion already uses that code. Choose a different code.')
  }
}

function promotionErrorResponse(error: unknown, fallback: string) {
  if (error instanceof PromotionConflictError || isDuplicateError(error)) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'A promotion with those details already exists.' }, { status: 409 })
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 })
}

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    return NextResponse.json(await listPromotions())
  } catch (error) {
    return promotionErrorResponse(error, 'Promotions could not be loaded.')
  }
}

/**
 * Creates a reusable saved promotion. Code is optional for the owner UI; it
 * is generated server-side so the client never needs to invent one.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const body = await request.json().catch(() => ({})) as PromotionInput
    const name = cleanName(body.name)
    const code = cleanCode(body.code) || generatedCode(name)
    const discountType = validDiscountType(body.discount_type) ? body.discount_type : 'percent'
    const value = positiveMoney(body.value)

    if (!name || !value) return NextResponse.json({ error: 'A promotion name and a positive value are required.' }, { status: 400 })
    if (discountType === 'percent' && value > 100) return NextResponse.json({ error: 'Percentage promotions cannot exceed 100%.' }, { status: 400 })

    await assertNoPromotionCollision({ name, code })
    const [promotion] = await supabaseRest<LuxorPromotion[]>('luxor_promotions?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name,
        code,
        discount_type: discountType,
        value,
        active: body.active !== false,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      }),
    })
    return NextResponse.json(promotion, { status: 201 })
  } catch (error) {
    return promotionErrorResponse(error, 'Promotion could not be saved.')
  }
}

/**
 * Owner-only promotion management. Codes intentionally remain stable: a
 * proposal snapshots the terms it used, and changing a label/value/type only
 * affects proposals calculated in the future.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const body = await request.json().catch(() => ({})) as PromotionInput
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return NextResponse.json({ error: 'Promotion id is required.' }, { status: 400 })

    const promotions = await listPromotions()
    const existing = promotions.find((promotion) => promotion.id === id)
    if (!existing) return NextResponse.json({ error: 'Promotion not found.' }, { status: 404 })

    const updates: Partial<Pick<LuxorPromotion, 'name' | 'discount_type' | 'value' | 'active'>> = {}
    const name = body.name === undefined ? existing.name : cleanName(body.name)
    if (!name) return NextResponse.json({ error: 'Promotion name cannot be empty.' }, { status: 400 })
    if (body.name !== undefined) updates.name = name

    const discountType = body.discount_type === undefined ? existing.discount_type : body.discount_type
    if (!validDiscountType(discountType)) return NextResponse.json({ error: 'discount_type must be percent or fixed.' }, { status: 400 })
    if (body.discount_type !== undefined) updates.discount_type = discountType

    const value = body.value === undefined ? positiveMoney(existing.value) : positiveMoney(body.value)
    if (!value) return NextResponse.json({ error: 'Promotion value must be greater than zero.' }, { status: 400 })
    if (discountType === 'percent' && value > 100) return NextResponse.json({ error: 'Percentage promotions cannot exceed 100%.' }, { status: 400 })
    if (body.value !== undefined) updates.value = value

    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') return NextResponse.json({ error: 'active must be true or false.' }, { status: 400 })
      updates.active = body.active
    }
    if (!Object.keys(updates).length) return NextResponse.json({ error: 'Provide a name, discount type, value, or active state to update.' }, { status: 400 })

    await assertNoPromotionCollision({ name, code: existing.code.trim().toUpperCase(), ignoreId: id })
    const [promotion] = await supabaseRest<LuxorPromotion[]>(`luxor_promotions?select=*&id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
    })
    if (!promotion) return NextResponse.json({ error: 'Promotion not found.' }, { status: 404 })
    return NextResponse.json(promotion)
  } catch (error) {
    return promotionErrorResponse(error, 'Promotion could not be updated.')
  }
}
