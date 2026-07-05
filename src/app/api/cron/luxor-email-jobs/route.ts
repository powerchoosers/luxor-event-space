import { NextRequest, NextResponse } from 'next/server'
import { processDueLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET
  const providedSecret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret')

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
