'use client'

import type { ReactNode } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PortalButton,
  PortalSelect,
  PortalStatusBadge,
} from '@/components/portal/PortalUI'
import {
  LUXOR_CREATED_DOCUMENT_TYPES,
  LUXOR_CREATED_DOCUMENT_TYPE_LABELS,
  type LuxorCreatedDocumentRow,
  type LuxorCreatedDocumentType,
} from '@/lib/luxorDocumentCreatorTypes'
import { Bold, Italic, List, ListTodo, Underline as UnderlineIcon } from '@/lib/icons/phosphor-compat'

const typeOptions = LUXOR_CREATED_DOCUMENT_TYPES.map((value) => ({
  value,
  label: LUXOR_CREATED_DOCUMENT_TYPE_LABELS[value],
}))

const steps: Array<{ id: string; label: string; disabled?: boolean; hint?: string }> = [
  { id: 'create', label: 'Create' },
  { id: 'fields', label: 'Fields', disabled: true, hint: 'Coming soon' },
  { id: 'send', label: 'Send', disabled: true, hint: 'Coming soon' },
]

const editorFieldClass =
  'w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45 focus:ring-2 focus:ring-[#caa24c]/10'

type Props = {
  initial?: LuxorCreatedDocumentRow | null
  onSaved?: (document: LuxorCreatedDocumentRow) => void
  onPreviewRequest?: (document: LuxorCreatedDocumentRow) => void
  previewBusy?: boolean
}

export function DocumentCreatorEditor({ initial, onSaved, onPreviewRequest, previewBusy }: Props) {
  const [title, setTitle] = useState(initial?.title || '')
  const [documentType, setDocumentType] = useState<LuxorCreatedDocumentType>(initial?.document_type || 'venue_use_agreement')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [record, setRecord] = useState<LuxorCreatedDocumentRow | null>(initial ?? null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Placeholder.configure({ placeholder: 'Paste or type agreement text. Formatting is preserved; text is not rewritten.' }),
    ],
    content: initial?.body_json || { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      attributes: {
        class: 'min-h-[320px] px-3 py-3 text-sm leading-relaxed text-[color:var(--portal-text)] outline-none focus:outline-none [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
      },
    },
    onUpdate: () => {
      dirtyRef.current = true
      setSaveState('idle')
    },
    immediatelyRender: false,
  })

  const payload = useCallback(() => {
    if (!editor) return null
    return {
      title,
      documentType,
      bodyJson: editor.getJSON() as Record<string, unknown>,
      bodyHtml: editor.getHTML(),
    }
  }, [documentType, editor, title])

  const persist = useCallback(async (asTemplate: boolean) => {
    const body = payload()
    if (!body || !body.title.trim()) {
      setSaveError('Add a title before saving.')
      setSaveState('error')
      return null
    }
    setSaveState('saving')
    setSaveError('')
    try {
      if (!record) {
        const response = await fetch('/api/operations/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: body.title,
            documentType: body.documentType,
            bodyJson: body.bodyJson,
            bodyHtml: body.bodyHtml,
            isTemplate: asTemplate,
          }),
        })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'Document could not be saved.')
        setRecord(json.document)
        dirtyRef.current = false
        setSaveState('saved')
        onSaved?.(json.document)
        return json.document as LuxorCreatedDocumentRow
      }
      const response = await fetch(`/api/operations/documents/${encodeURIComponent(record.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedUpdatedAt: record.updated_at,
          title: body.title,
          documentType: body.documentType,
          bodyJson: body.bodyJson,
          bodyHtml: body.bodyHtml,
          isTemplate: asTemplate,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Document could not be saved.')
      setRecord(json.document)
      dirtyRef.current = false
      setSaveState('saved')
      onSaved?.(json.document)
      return json.document as LuxorCreatedDocumentRow
    } catch (error) {
      setSaveState('error')
      setSaveError(error instanceof Error ? error.message : 'Document could not be saved.')
      return null
    }
  }, [onSaved, payload, record])

  useEffect(() => {
    if (!record || !dirtyRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      void persist(false)
    }, 4500)
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [title, documentType, editor, persist, record])

  const autosaveLabel = useMemo(() => {
    if (saveState === 'saving') return 'Saving…'
    if (saveState === 'saved' && record) return `Saved · v${record.version}`
    if (saveState === 'error') return 'Save failed'
    if (dirtyRef.current) return 'Unsaved changes'
    return record ? `Draft · v${record.version}` : 'New draft'
  }, [record, saveState])

  const runHeading = (level: 1 | 2 | 3) => {
    editor?.chain().focus().toggleHeading({ level }).run()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ol className="flex flex-wrap items-center gap-2" aria-label="Document steps">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                step.id === 'create'
                  ? 'border-[#caa24c]/35 bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]'
                  : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] opacity-70'
              }`}
              aria-disabled={step.disabled || undefined}
            >
              <span className="tabular-nums">{index + 1}</span>
              {step.label}
              {step.hint ? <span className="font-normal text-[10px] uppercase tracking-wide">{step.hint}</span> : null}
            </span>
            {index < steps.length - 1 ? <span className="hidden text-[color:var(--portal-faint)] sm:inline">→</span> : null}
          </li>
        ))}
      </ol>

      <section className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[color:var(--portal-text)]">Create document</h2>
            <PortalStatusBadge status={autosaveLabel} tone="neutral" />
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--portal-muted)]">Title</span>
            <input className={editorFieldClass} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--portal-muted)]">Document type</span>
            <PortalSelect value={documentType} onChange={(value) => setDocumentType(value as LuxorCreatedDocumentType)} options={typeOptions} aria-label="Document type" />
          </label>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1">
              <ToolbarButton label="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={14} /></ToolbarButton>
              <ToolbarButton label="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={14} /></ToolbarButton>
              <ToolbarButton label="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={14} /></ToolbarButton>
              <ToolbarButton label="Heading 1" active={editor?.isActive('heading', { level: 1 })} onClick={() => runHeading(1)}>H1</ToolbarButton>
              <ToolbarButton label="Heading 2" active={editor?.isActive('heading', { level: 2 })} onClick={() => runHeading(2)}>H2</ToolbarButton>
              <ToolbarButton label="Heading 3" active={editor?.isActive('heading', { level: 3 })} onClick={() => runHeading(3)}>H3</ToolbarButton>
              <ToolbarButton label="Bullet list" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={14} /></ToolbarButton>
              <ToolbarButton label="Numbered list" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListTodo size={14} /></ToolbarButton>
            </div>
            <fieldset className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]">
              <legend className="sr-only">Agreement body</legend>
              <EditorContent editor={editor} />
            </fieldset>
          </div>

          {saveError ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{saveError}</p> : null}

          <div className="flex flex-wrap gap-2">
            <PortalButton variant="primary" type="button" disabled={saveState === 'saving'} onClick={() => void persist(false)}>Save draft</PortalButton>
            <PortalButton variant="secondary" type="button" disabled={saveState === 'saving'} onClick={() => void persist(true)}>Save as template</PortalButton>
            {record ? (
              <PortalButton
                variant="secondary"
                type="button"
                disabled={previewBusy}
                onClick={async () => {
                  const saved = dirtyRef.current ? await persist(false) : record
                  if (saved) onPreviewRequest?.(saved)
                }}
              >
                Refresh PDF preview
              </PortalButton>
            ) : null}
          </div>
      </section>
    </div>
  )
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${
        active
          ? 'bg-[#caa24c]/20 text-[#8c6529] dark:text-[#f1d27a]'
          : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)]'
      }`}
    >
      {children}
    </button>
  )
}