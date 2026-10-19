import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { buildLuxorContractPdf } from '@/lib/luxorContractPdfServer'
import { getLuxorTestContractPreview } from '@/lib/luxorTestContractPreviewServer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function authorizedMember() {
  const session = await getLuxorPortalSession()
  if (!session) return null
  const member = await getLuxorPortalMember(session.email)
  if (!member || !['owner', 'admin'].includes(member.role) || !memberCan(member, 'settings')) return null
  return member
}

export async function GET(request: NextRequest) {
  try {
    if (!await authorizedMember()) return NextResponse.json({ error: 'Owner or admin access required.' }, { status: 403 })
    const testRunId = request.nextUrl.searchParams.get('testRunId') || ''
    if (!UUID.test(testRunId)) return NextResponse.json({ error: 'A valid test run ID is required.' }, { status: 400 })
    const preview = await getLuxorTestContractPreview(testRunId)
    const source = await buildLuxorContractPdf(preview.booking, testRunId, preview.agreement_date)
    const pdf = await PDFDocument.load(source.pdf)
    const font = await pdf.embedFont(StandardFonts.HelveticaBold)
    const watermark = 'SIMULATED PREVIEW - NOT FOR SIGNING - NO LEGAL EFFECT'
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize()
      const size = 12
      const textWidth = font.widthOfTextAtSize(watermark, size)
      const centeredX = Math.max(24, (width - textWidth) / 2)
      for (const y of [height - 26, height / 2, 18]) {
        page.drawText(watermark, {
          x: centeredX,
          y,
          size,
          font,
          color: rgb(0.72, 0.12, 0.12),
          opacity: 0.68,
        })
      }
    }
    const bytes = await pdf.save()
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Luxor-SIMULATED-Preview-${testRunId.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to prepare the simulated contract preview.' }, { status: 400 })
  }
}
