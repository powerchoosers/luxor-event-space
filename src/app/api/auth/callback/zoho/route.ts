import { NextResponse } from 'next/server'
import { exchangeZohoCodeForSetup } from '@/lib/zohoOAuthSetup'
import { createLuxorPortalSessionCookie, isAuthorizedLuxorPortalEmail } from '@/lib/luxorPortalAuth'

export const runtime = 'nodejs'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const setupMode = searchParams.get('state') === 'setup'

  if (error) {
    return NextResponse.json({ error }, { status: 400 })
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing Zoho authorization code.' }, { status: 400 })
  }

  try {
    const setup = await exchangeZohoCodeForSetup(request, code)

    if (setupMode) {
      const refreshTokenLine = setup.refreshToken
        ? `ZOHO_REFRESH_TOKEN=${setup.refreshToken}`
        : 'ZOHO_REFRESH_TOKEN=Zoho did not return one. Reopen /api/auth/zoho/login?setup=1 and approve again.'
      const envBlock = [
        `ZOHO_ACCOUNT_ID=${setup.accountId}`,
        refreshTokenLine,
        'LUXOR_ZOHO_LOGIN_EMAIL=booking@luxoratlaspalmas.com',
        'LUXOR_ZOHO_ALLOWED_SENDERS=booking@luxoratlaspalmas.com,hello@luxoratlaspalmas.com',
      ].join('\n')

      return new Response(`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Luxor Zoho Connected</title>
            <style>
              body { margin: 0; min-height: 100vh; background: #080706; color: #f7efe3; font-family: Arial, sans-serif; display: grid; place-items: center; }
              main { width: min(760px, calc(100vw - 32px)); border: 1px solid rgba(202,162,76,.32); background: #0f0d0a; padding: 28px; border-radius: 10px; }
              h1 { margin: 0 0 12px; font-size: 24px; }
              p { color: rgba(247,239,227,.74); line-height: 1.55; }
              pre { white-space: pre-wrap; word-break: break-word; background: #050505; border: 1px solid rgba(202,162,76,.22); color: #f1d27a; padding: 16px; border-radius: 8px; }
              .small { font-size: 12px; color: rgba(247,239,227,.55); }
            </style>
          </head>
          <body>
            <main>
              <h1>Luxor Zoho Mail connected</h1>
              <p>Copy these values into Vercel and your local <strong>.env.local</strong> if they are missing or outdated.</p>
              <pre>${escapeHtml(envBlock)}</pre>
              <p class="small">Redirect URI used: ${escapeHtml(setup.redirectUri)}${setup.mailboxAddress ? ` | Mailbox: ${escapeHtml(setup.mailboxAddress)}` : ''}</p>
            </main>
          </body>
        </html>`, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }

    if (!setup.userEmail || !isAuthorizedLuxorPortalEmail(setup.userEmail)) {
      return NextResponse.redirect(new URL('/portal/login?error=unauthorized', request.url))
    }

    const response = NextResponse.redirect(new URL('/portal', request.url))
    const sessionCookie = createLuxorPortalSessionCookie({
      email: setup.userEmail,
      accountId: setup.accountId,
      mailboxAddress: setup.mailboxAddress,
    })

    response.cookies.set(sessionCookie.name, sessionCookie.value, {
      httpOnly: true,
      secure: new URL(request.url).protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: sessionCookie.maxAge,
    })

    return response
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : 'Zoho setup failed.'
    return NextResponse.redirect(new URL(`/portal/login?error=${encodeURIComponent(message)}`, request.url))
  }
}
