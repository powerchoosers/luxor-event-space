import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { sendLuxorWebPush } from '@/lib/luxorWebPushServer'

export async function POST() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const result = await sendLuxorWebPush('booking', {
      title: 'Luxor notifications are ready',
      body: 'This device will receive the portal alerts you selected.',
      url: '/portal/settings',
      tag: 'luxor-push-test',
    }, { userEmail: session.email })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not send the test notification.' }, { status: 500 })
  }
}
