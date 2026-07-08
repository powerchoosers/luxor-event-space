import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { processDueLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'

export const dynamic = 'force-dynamic'

const SUPABASE_EMAIL_JOBS_SHARED_SECRET = '7d96ffc48d44f4d10c5d8ca92c398ae32f2c586e9f292715c1962ed4eca30a83'

async function handleCronRequest(request: NextRequest) {
  const serviceRoleFingerprint = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? crypto.createHash('sha256').update(process.env.SUPABASE_SERVICE_ROLE_KEY).digest('hex')
    : null
  const configuredSecret =
    SUPABASE_EMAIL_JOBS_SHARED_SECRET ||
    process.env.LUXOR_CRON_SECRET ||
    process.env.CRON_SECRET ||
    process.env.LUXOR_PORTAL_SESSION_SECRET ||
    serviceRoleFingerprint
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  const providedSecret = bearerSecret || request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret')

  if (!configuredSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized cron request.' }, { status: 401 })
  }

  try {
    const results = await processDueLuxorEmailJobs(25)
    return NextResponse.json({ processed: results.length, results })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email job processing failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleCronRequest(request)
}

export async function POST(request: NextRequest) {
  return handleCronRequest(request)
}
