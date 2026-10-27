'use client'

import { useState } from 'react'

export function BrochureSettings() {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  async function upload() {
    if (!file) return
    setProgress(0)
    setMessage('')
    try {
      const prepared = await fetch('/api/portal/brochure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prepare', name: file.name, size: file.size }) })
      const data = await prepared.json()
      if (!prepared.ok) throw new Error(data.error || 'Unable to prepare upload.')
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', data.signedUrl)
        xhr.setRequestHeader('Content-Type', 'application/pdf')
        xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)) }
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed. Please try again.'))
        xhr.onerror = () => reject(new Error('Upload failed. Please check your connection.'))
        xhr.send(file)
      })
      setMessage('Checking PDF and publishing…')
      const published = await fetch('/api/portal/brochure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publish', id: data.id }) })
      const result = await published.json()
      if (!published.ok) throw new Error(result.error || 'Unable to publish the brochure.')
      setMessage(`Brochure updated successfully (${result.pages} pages).`)
      setFile(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed. The current brochure is unchanged.')
    } finally { setProgress(null) }
  }

  return <section className="space-y-3 border-b border-[color:var(--portal-border)] pb-6">
    <h4 className="text-sm font-semibold text-[color:var(--portal-text)]">Venue brochure</h4>
    <p className="text-sm text-[color:var(--portal-muted)]">Replace the PDF used for website and email downloads. Maximum size: 100 MiB (104,857,600 bytes).</p>
    <a className="text-sm underline text-[color:var(--portal-text)]" href="/api/brochure/download" target="_blank" rel="noreferrer">View current brochure</a>
    <div className="flex flex-wrap items-center gap-3">
      <input aria-label="Choose brochure PDF" type="file" accept="application/pdf,.pdf" disabled={progress !== null} onChange={event => setFile(event.target.files?.[0] || null)} className="text-sm text-[color:var(--portal-text)]" />
      <button type="button" disabled={!file || progress !== null} onClick={() => void upload()} className="rounded-md border border-[color:var(--portal-border)] px-3 py-2 text-sm text-[color:var(--portal-text)] disabled:opacity-50">Upload brochure</button>
    </div>
    {progress !== null && <p role="status" className="text-sm text-[color:var(--portal-muted)]">Uploading: {progress}%</p>}
    {message && <p role="status" className="text-sm text-[color:var(--portal-text)]">{message}</p>}
  </section>
}
