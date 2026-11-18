'use client'

import type { ReactNode } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import {
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

const editorFieldClass =
  'w-full min-h-11 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45 focus:ring-2 focus:ring-[#caa24c]/10'

export type DocumentCreatorEditorHandle = {
  saveDraft: () => Promise<LuxorCreatedDocumentRow | null>
  saveTemplate: () => Promise<LuxorCreatedDocumentRow | null>
  isSaving: boolean
}

type Props = {
  initial?: LuxorCreatedDocumentRow | null
  onSaved?: (document: LuxorCreatedDocumentRow) => void
  onFormChange?: (form: { title: string; documentType: LuxorCreatedDocumentType; bodyHtml: string }) => void
}

export const DocumentCreatorEditor = forwardRef<DocumentCreatorEditorHandle, Props>(function DocumentCreatorEditor(
  { initial, onSaved, onFormChange },
  ref,
) {
  const [title, setTitle] = useState(initial?.title || '')
  const [documentType, setDocumentType] = useState<LuxorCreatedDocumentType>(initial?.document_type || 'venue_use_agreement')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [record, setRecord] = useState<LuxorCreatedDocumentRow | null>(initial ?? null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const titleRef = useRef(title)
  const documentTypeRef = useRef(documentType)
  titleRef.current = title
  documentTypeRef.current = documentType

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
        class: 'min-h-[240px] px-3 py-3 text-sm leading-relaxed text-[color:var(--portal-text)] outline-none focus:outline-none [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
      },
    },
    onUpdate: ({ editor: tiptap }) => {
      dirtyRef.current = true
      setSaveState('idle')
      onFormChange?.({
        title: titleRef.current,
        documentType: documentTypeRef.current,
        bodyHtml: tiptap.getHTML(),
      })
    },
    immediatelyRender: false,
  })

  const emitFormChange = useCallback(() => {
    if (!editor) return
    onFormChange?.({
      title,
      documentType,
      bodyHtml: editor.getHTML(),
    })
  }, [documentType, editor, onFormChange, title])

  useEffect(() => {
    emitFormChange()
  }, [emitFormChange])

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

  useImperativeHandle(ref, () => ({
    saveDraft: () => persist(false),
    saveTemplate: () => persist(true),
    isSaving: saveState === 'saving',
  }), [persist, saveState])

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

  const autosaveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'saved' && record
        ? `Saved · v${record.version}`
        : saveState === 'error'
          ? 'Save failed'
          : dirtyRef.current
            ? 'Unsaved changes'
            : record
              ? `Draft · v${record.version}`
              : 'New draft'

  const runHeading = (level: 1 | 2 | 3) => {
    editor?.chain().focus().toggleHeading({ level }).run()
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[color:var(--portal-text)]">Create</h2>
        <PortalStatusBadge status={autosaveLabel} tone="neutral" />
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-[color:var(--portal-muted)]">Title</span>
        <input
          className={editorFieldClass}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            queueMicrotask(emitFormChange)
          }}
          maxLength={300}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-[color:var(--portal-muted)]">Document type</span>
        <PortalSelect
          value={documentType}
          onChange={(value) => {
            setDocumentType(value as LuxorCreatedDocumentType)
            queueMicrotask(emitFormChange)
          }}
          options={typeOptions}
          aria-label="Document type"
        />
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
    </div>
  )
})

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