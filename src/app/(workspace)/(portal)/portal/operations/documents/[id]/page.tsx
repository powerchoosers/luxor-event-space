'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { DocumentCreatorWorkbench } from '@/components/portal/DocumentCreatorWorkbench'
import { PortalCardSkeleton, PortalPageFrame } from '@/components/portal/PortalUI'
import type { LuxorCreatedDocumentRow } from '@/lib/luxorDocumentCreatorTypes'

export default function EditCreatedDocumentPage() {
  const params = useParams<{ id: string }>()
  const [document, setDocument] = useState<LuxorCreatedDocumentRow | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/operations/documents/${encodeURIComponent(params.id)}`, { cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Document could not be loaded.')
        if (!cancelled) setDocument(body.document)
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Document could not be loaded.')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [params.id])

  if (error) {
    return (
      <PortalPageFrame>
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      </PortalPageFrame>
    )
  }
  if (!document) {
    return (
      <PortalPageFrame>
        <PortalCardSkeleton count={3} />
      </PortalPageFrame>
    )
  }
  return <DocumentCreatorWorkbench initial={document} />
}