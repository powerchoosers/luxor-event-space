import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { deleteUnissuedDraftInvoice, removeDeletedDraftInvoiceFiles } from '@/lib/luxorInvoiceLifecycleServer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !['owner', 'admin'].includes(member.role) || !memberCan(member, 'finances')) {
      return NextResponse.json({ error: 'Owner or administrator finance access is required.' }, { status: 403 })
    }
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'A valid invoice ID is required.' }, { status: 400 })
    const body = await request.json().catch(() => ({})) as { confirmDraftDelete?: unknown }
    if (body.confirmDraftDelete !== true) {
      return NextResponse.json({ error: 'Explicit confirmation is required to delete a draft invoice.' }, { status: 400 })
    }

    const deleted = await deleteUnissuedDraftInvoice(id, session.email)
    if (!deleted?.deleted) return NextResponse.json({ error: 'Draft invoice could not be deleted.' }, { status: 409 })
    let cleanupPending = false
    try {
      cleanupPending = (await removeDeletedDraftInvoiceFiles(deleted.storage_paths || [])).length > 0
    } catch (cleanupError) {
      cleanupPending = true
      console.error('[invoice-delete-draft-storage-cleanup] failed', { message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) })
    }
    return NextResponse.json({
      success: true,
      storageCleanupPending: cleanupPending,
      message: cleanupPending ? 'Draft invoice deleted. Some private PDF files need storage cleanup.' : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete draft invoice.'
    const status = /not found/i.test(message) ? 404 : /only never-issued|linked financial|changed while|draft invoice/i.test(message) ? 409 : 500
    console.error('[invoice-delete-draft] failed', { message })
    return NextResponse.json({ error: message }, { status })
  }
}
