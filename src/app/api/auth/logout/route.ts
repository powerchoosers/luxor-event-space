import { NextResponse } from 'next/server'
import { LUXOR_PORTAL_SESSION_COOKIE } from '@/lib/luxorPortalAuth'

function clearPortalSession(request: Request) {
  const response = NextResponse.redirect(new URL('/portal/login', request.url), { status: 303 })
  response.cookies.set(LUXOR_PORTAL_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })

  return response
}

export async function GET(request: Request) {
  return clearPortalSession(request)
}

export async function POST(request: Request) {
  return clearPortalSession(request)
}
