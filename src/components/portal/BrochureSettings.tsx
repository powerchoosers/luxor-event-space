'use client'

import { useState } from 'react'
import { ExternalLink, FileText, Loader2, Upload } from '@/lib/icons/phosphor-compat'
import { PortalButton } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

export function BrochureSettings() {
  const { notify } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  async function upload() {
    if (!file) return
    setProgress(0)
    setMessage('')
    setIsError(false)
    try {
      const prepared = await fetch('/api/portal/brochure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare', name: file.name, size: file.size }),
      })
      const data = await prepared.json()
      if (!prepared.ok) throw new Error(data.error || 'Unable to prepare upload.')
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', data.signedUrl)
        xhr.setRequestHeader('Content-Type', 'application/pdf')
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100))
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed. Please try again.')))
        xhr.onerror = () => reject(new Error('Upload failed. Please check your connection.'))
        xhr.send(file)
      })
      setMessage('Checking PDF and publishing…')
      const published = await fetch('/api/portal/brochure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', id: data.id }),
      })
      const result = await published.json()
      if (!published.ok) throw new Error(result.error || 'Unable to publish the brochure.')
      const successText = `Brochure updated (${result.pages} pages).`
      setMessage(successText)
      setFile(null)
      notify({ title: 'Venue brochure updated', description: successText, variant: 'success' })
    } catch (error) {
      const errText = error instanceof Error ? error.message : 'Upload failed. The current brochure is unchanged.'
      setIsError(true)
      setMessage(errText)
      notify({ title: 'Brochure upload failed', description: errText, variant: 'error' })
    } finally {
      setProgress(null)
    }
  }

  return (
    <section className="space-y-4 border-b border-[color:var(--portal-border)] pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Venue brochure</h3>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
            PDF downloaded by guests on the website and in emails (max 100 MB).
          </p>
        </div>
        <a
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[#a8792f] transition-colors hover:bg-[color:var(--portal-soft)] hover:underline dark:text-[#f1d27a]"
          href="/api/brochure/download"
          target="_blank"
          rel="noreferrer"
        >
          View current PDF
          <ExternalLink size={13} />
        </a>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2.5 transition-colors hover:border-[#caa24c]/45 focus-within:border-[#caa24c]/50 focus-within:ring-2 focus-within:ring-[#caa24c]/15">
          <input
            aria-label="Choose brochure PDF"
            type="file"
            accept="application/pdf,.pdf"
            disabled={progress !== null}
            onChange={(event) => {
              setMessage('')
              setIsError(false)
              setFile(event.target.files?.[0] || null)
            }}
            className="sr-only"
          />
          <FileText size={16} className="shrink-0 text-[#a8792f] dark:text-[#caa24c]" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[color:var(--portal-text)]">
            {file ? file.name : 'Choose a PDF file…'}
          </span>
          <span className="shrink-0 text-xs font-semibold text-[color:var(--portal-muted)]">Browse</span>
        </label>

        <PortalButton
          type="button"
          variant="primary"
          disabled={!file || progress !== null}
          onClick={() => void upload()}
          className="w-full shrink-0 sm:w-auto"
        >
          {progress !== null ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {progress !== null ? `Uploading ${progress}%` : 'Upload brochure'}
        </PortalButton>
      </div>

      {progress !== null ? (
        <div className="space-y-1.5" role="status">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-soft)]">
            <div
              className="h-full rounded-full bg-[#caa24c] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs tabular-nums text-[color:var(--portal-muted)]">Uploading PDF: {progress}%</p>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={`text-xs font-medium ${isError ? 'text-red-600 dark:text-red-300' : 'text-[color:var(--portal-text)]'}`}>
          {message}
        </p>
      ) : null}
    </section>
  )
}
