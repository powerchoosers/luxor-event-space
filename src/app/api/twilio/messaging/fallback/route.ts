import { NextRequest } from 'next/server'
import { readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'
export const runtime = 'nodejs'
export async function POST(request: NextRequest) { const params = await readTwilioForm(request); if (!validateTwilioWebhook(request, params)) return new Response('<Response/>', { status: 403, headers: { 'Content-Type': 'text/xml' } }); return new Response('<Response/>', { headers: { 'Content-Type': 'text/xml; charset=utf-8' } }) }
