import { NextResponse, type NextRequest } from 'next/server'

const LUXOR_PORTAL_SESSION_COOKIE = 'luxor_portal_session'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/portal') && pathname !== '/portal/login') {
    const hasSession = Boolean(request.cookies.get(LUXOR_PORTAL_SESSION_COOKIE)?.value)

    if (!hasSession) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/portal/login'
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/portal/:path*'],
}
