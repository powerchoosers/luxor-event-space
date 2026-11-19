'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import type { DocumentCreatorStep } from '@/components/portal/DocumentCreatorStepper'
import { DocumentCreatorWorkbench } from '@/components/portal/DocumentCreatorWorkbench'
import { PortalCardSkeleton, PortalPageFrame } from '@/components/portal/PortalUI'
import type { LuxorCreatedDocumentRow } from '@/lib/luxorDocumentCreatorTypes'
import { takeCreatedDocumentHandoff } from '@/lib/luxorDocumentCreatorHandoff'

export default function EditCreatedDocumentPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const stepParam = searchParams.get('step')
  const initialStep: DocumentCreatorStep = stepParam === 'fields' ? 'fields' : 'create'
  const [document, setDocument] = useState<LuxorCreatedDocumentRow | null>(() => takeCreatedDocumentHandoff(params.id))
  const [error, setError] = useState('')

  useEffect(() => {
    if (document) return
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
  }, [document, params.id])

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
  return (
    <DocumentCreatorWorkbench
      initial={document}
      initialStep={initialStep}
      onStepChange={(step) => {
        const params = new URLSearchParams(searchParams.toString())
        if (step === 'create') params.delete('step')
        else params.set('step', step)
        router.replace(`/portal/operations/documents/${encodeURIComponent(document.id)}?${params.toString()}`, { scroll: false })
      }}
    />
  )
}