import { NextRequest, NextResponse } from 'next/server'
import { processDueLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'

export const dynamic = 'force-dynamic'

async function handleCronRequest(request: NextRequest) {
  const configuredSecret = process.env.LUXOR_CRON_SECRET || process.env.LUXOR_PORTAL_SESSION_SECRET
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
