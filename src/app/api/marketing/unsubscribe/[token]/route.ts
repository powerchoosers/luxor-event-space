import { NextRequest, NextResponse } from 'next/server'
import { recordMarketingUnsubscribe } from '@/lib/luxorMarketingServer'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  try {
    const recipient = await recordMarketingUnsubscribe(token, request)
    const emailLine = recipient?.email ? `<p>${recipient.email} has been removed from future Luxor marketing emails.</p>` : '<p>This email address has been removed from future Luxor marketing emails.</p>'

    return new NextResponse(
      `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Unsubscribed | Luxor Event Space</title>
          <style>
            body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #090909; color: #f4f4f5; font-family: Arial, sans-serif; }
            main { max-width: 520px; padding: 32px; text-align: center; }
            h1 { font-size: 28px; margin: 0 0 12px; }
            p { color: #a1a1aa; line-height: 1.6; }
            a { color: #caa24c; }
          </style>
        </head>
        <body>
          <main>
            <h1>You are unsubscribed.</h1>
            ${emailLine}
            <p>If this was a mistake, contact <a href="mailto:booking@luxoratlaspalmas.com">booking@luxoratlaspalmas.com</a>.</p>
          </main>
        </body>
      </html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    )
  } catch (error) {
    console.error('Luxor marketing unsubscribe failed:', error instanceof Error ? error.message : error)
    return new NextResponse('Unable to unsubscribe this address right now.', { status: 500 })
  }
}
