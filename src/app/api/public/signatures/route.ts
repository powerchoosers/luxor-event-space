import { NextRequest, NextResponse } from 'next/server'
import { getLuxorSignatureRequestByToken, signLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || ''
    const signature = await getLuxorSignatureRequestByToken(token)

    if (!signature) {
      return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 })
    }

    return NextResponse.json(signature)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load signature request.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const signedName = String(body.signedName || '').trim()

    if (!signedName) {
      return NextResponse.json({ error: 'Please type your legal name.' }, { status: 400 })
    }

    if (!body.accepted) {
      return NextResponse.json({ error: 'Please accept the signing acknowledgement.' }, { status: 400 })
    }

    const signature = await signLuxorSignatureRequest({
      token: String(body.token || ''),
      signedName,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(signature)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit signature.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
