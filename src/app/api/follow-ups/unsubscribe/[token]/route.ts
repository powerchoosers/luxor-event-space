import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { stopLuxorBrochureFollowUp } from '@/lib/luxorFollowUpsServer'

type Context = { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new NextResponse('Invalid unsubscribe link.', { status: 404 })
  return new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe | Luxor</title><body style="font:16px Arial,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#332f28"><h1>Unsubscribe from Luxor follow-up emails</h1><p>Confirm below to stop future brochure follow-up emails. Your event inquiry and other service messages remain available.</p><form method="post"><button style="padding:12px 18px;border:0;background:#caa24c;color:#fff;font-weight:600;cursor:pointer">Unsubscribe</button></form></body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function POST(_request: Request, { params }: Context) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new NextResponse('Invalid unsubscribe link.', { status: 404 })
  try {
    const [enrollment] = await supabaseRest<Array<{ id: string; inquiry_id: string }>>(
      `luxor_follow_up_enrollments?select=id,inquiry_id&unsubscribe_token=eq.${encodeURIComponent(token)}&automation_key=eq.brochure_lead&limit=1`,
    )
    if (enrollment) {
      const [inquiry] = await supabaseRest<Array<{ email: string | null }>>(
        `luxor_inquiries?select=email&id=eq.${encodeURIComponent(enrollment.inquiry_id)}&limit=1`,
      )
      await supabaseRest(`luxor_inquiries?id=eq.${encodeURIComponent(enrollment.inquiry_id)}`, {
        method: 'PATCH', body: JSON.stringify({ marketing_opt_in: false, updated_at: new Date().toISOString() }),
      })
      if (inquiry?.email) {
        await supabaseRest('luxor_marketing_suppressions?on_conflict=email', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ email: inquiry.email.trim().toLowerCase(), reason: 'unsubscribe', source: 'brochure_follow_up', metadata: { automation_key: 'brochure_lead', enrollment_id: enrollment.id } }),
        })
      }
      await stopLuxorBrochureFollowUp(enrollment.inquiry_id, 'unsubscribed')
    }
    return new NextResponse('You are unsubscribed from Luxor brochure follow-up emails. You may close this page.', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch {
    return new NextResponse('Unable to unsubscribe right now. Please contact booking@luxoratlaspalmas.com.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}
