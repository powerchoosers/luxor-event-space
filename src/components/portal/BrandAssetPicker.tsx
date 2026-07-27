'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Search,
  Upload,
  Check,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Copy
} from 'lucide-react'
import { useToast } from './ToastProvider'
import { PortalModal, PortalSelect, PortalCloseButton } from '@/components/portal/PortalUI'
import { BrandAssetLightbox } from '@/components/portal/BrandAssetLightbox'

type BrandAsset = {
  id: string
  name: string
  url: string
  category: string
  created_at: string
}

type BrandAssetPickerProps = {
  isOpen: boolean
  onClose: () => void
  onSelect: (url: string) => void
  title?: string
}

const CATEGORIES = [
  { value: 'all', label: 'All Assets' },
  { value: 'logo', label: 'Logos' },
  { value: 'banner', label: 'Banners' },
  { value: 'signature', label: 'Signatures' },
  { value: 'general', label: 'General' }
]

const UPLOAD_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'logo', label: 'Logo' },
  { value: 'banner', label: 'Banner' },
  { value: 'signature', label: 'Signature' }
]

export function BrandAssetPicker({
  isOpen,
  onClose,
  onSelect,
  title = 'Select Image Asset'
}: BrandAssetPickerProps) {
  const { notify } = useToast()
  const [assets, setAssets] = useState<BrandAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadCategory, setUploadCategory] = useState('general')
  const [saveAsBrandAsset, setSaveAsBrandAsset] = useState(true)
  const [previewAsset, setPreviewAsset] = useState<BrandAsset | null>(null)

  useEffect(() => {
    if (isOpen) {
      void fetchAssets()
      // Reset upload states
      setUploadFile(null)
      setUploadName('')
      setUploadCategory('general')
      setSaveAsBrandAsset(true)
      setPreviewAsset(null)
    }
  }, [isOpen])

  const fetchAssets = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/portal/brand-assets')
      if (res.ok) {
        const data = await res.json()
        setAssets(data.assets || [])
      }
    } catch (err) {
      console.error(err)
      notify({ title: 'Failed to load brand assets.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setUploadFile(file)
      // Pre-fill asset name with file name without extension
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
      setUploadName(baseName.replace(/[^a-zA-Z0-9\s-_]/g, ' '))
    }
  }

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return

    try {
      setUploading(true)
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('name', uploadName.trim())
      formData.append('category', uploadCategory)
      formData.append('makeBrandAsset', String(saveAsBrandAsset))

      const res = await fetch('/api/portal/upload', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Upload failed.')
      }

      const data = await res.json()
      notify({
        title: saveAsBrandAsset ? 'Uploaded and saved to brand assets.' : 'Uploaded file successfully.',
        variant: 'success'
      })

      if (saveAsBrandAsset) {
        // Refresh library assets list
        await fetchAssets()
      }

      // Automatically select this uploaded image
      onSelect(data.url)
      onClose()
    } catch (err) {
      console.error(err)
      notify({ title: err instanceof Error ? err.message : 'Failed to upload image.', variant: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAsset = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation() // Don't trigger select
    if (!confirm('Are you sure you want to delete this asset from the library? The image file will also be deleted from storage.')) return

    try {
      const res = await fetch(`/api/portal/brand-assets?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        notify({ title: 'Asset deleted successfully.', variant: 'success' })
        setAssets(prev => prev.filter(asset => asset.id !== id))
      } else {
        throw new Error('Failed to delete asset.')
      }
    } catch (err) {
      console.error(err)
      notify({ title: 'Failed to delete asset.', variant: 'error' })
    }
  }

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || asset.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-4xl" ariaLabel={title}>
      <div className="flex h-[min(600px,calc(100dvh-2rem))] w-full flex-col overflow-hidden bg-[color:var(--portal-card)]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-[#caa24c]" />
            <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-[color:var(--portal-text)]">{title}</h3>
          </div>
          <PortalCloseButton onClick={onClose} aria-label="Close brand asset picker" />
        </div>

        {/* Content Area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto portal-scrollbar md:flex-row md:overflow-hidden">
          
          {/* Library Gallery Panel */}
          <div className="flex min-h-[24rem] min-w-0 flex-[2] flex-col border-b border-[color:var(--portal-border)] p-5 md:border-b-0 md:border-r md:p-6">
            
            {/* Search & Tabs */}
            <div className="space-y-4 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-faint)]" />
                <input
                  type="text"
                  placeholder="Search assets by name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] pl-9 pr-4 py-2 text-xs text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45"
                />
              </div>

              {/* Category tabs */}
              <div className="flex gap-1 overflow-x-auto pb-1 portal-scrollbar">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setSelectedCategory(cat.value)}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                      selectedCategory === cat.value
                        ? 'bg-[#caa24c]/15 text-[#f1d27a] border border-[#caa24c]/30'
                        : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assets Grid */}
            <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar mt-4 pr-1">
              {loading ? (
                <div className="flex h-full items-center justify-center gap-2 py-12 text-xs text-[color:var(--portal-muted)]">
                  <Loader2 className="animate-spin text-[#caa24c]" size={16} />
                  <span>Loading brand assets...</span>
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-12 text-[color:var(--portal-muted)]">
                  <ImageIcon size={32} className="mb-2 text-[color:var(--portal-faint)]" />
                  <p className="text-xs italic">No brand assets found matching filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredAssets.map(asset => (
                    <div
                      key={asset.id}
                      className="group relative flex h-[190px] flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] transition-all hover:-translate-y-0.5 hover:border-[#caa24c]/40 hover:shadow-lg hover:shadow-[#caa24c]/5"
                    >
                      {/* Image Thumbnail Container */}
                      <button type="button" onClick={() => setPreviewAsset(asset)} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[color:var(--portal-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/60">
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      </button>

                      {/* Info Footer */}
                      <div className="shrink-0 border-t border-[color:var(--portal-border)] p-3">
                        <p className="truncate text-[10px] font-bold leading-tight text-[color:var(--portal-text)]">
                          {asset.name}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="rounded bg-[color:var(--portal-card)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">
                            {asset.category}
                          </span>
                          <button type="button" onClick={() => onSelect(asset.url)} className="ml-auto rounded-lg bg-[#caa24c] px-2.5 py-2 text-[8px] font-black uppercase tracking-wider text-white transition-colors hover:bg-[#dfbd68]">
                            Use image
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteAsset(e, asset.id)}
                            aria-label="Delete asset"
                            className="rounded-lg p-2 text-[color:var(--portal-muted)] transition-colors hover:bg-red-500/8 hover:text-red-500"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Upload Sidebar Panel */}
          <div className="flex min-h-[24rem] flex-1 flex-col justify-between border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-5 md:overflow-y-auto md:border-t-0 md:border-l md:p-6 md:portal-scrollbar">
            <form onSubmit={handleUploadSubmit} className="space-y-4 flex flex-col h-full justify-between">
              
              <div className="space-y-4">
                <h4 className="border-b border-[color:var(--portal-border)] pb-2 text-[10px] font-black uppercase tracking-widest text-[#a8792f] dark:text-[#caa24c]">
                  Upload Direct Image
                </h4>

                {/* Drag-drop/file select zone */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-[color:var(--portal-muted)]">File Image</label>
                  <div className="relative flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 text-center transition-colors hover:border-[#caa24c]/45">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload size={18} className="mb-1 text-[color:var(--portal-muted)]" />
                    <p className="max-w-full truncate px-2 text-[10px] font-medium text-[color:var(--portal-text)]">
                      {uploadFile ? uploadFile.name : 'Select or drop image file'}
                    </p>
                    <p className="mt-0.5 text-[8px] text-[color:var(--portal-faint)]">JPG, PNG, GIF, WebP up to 5MB</p>
                  </div>
                </div>

                {uploadFile && (
                  <>
                    {/* Asset Name */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-[color:var(--portal-muted)]">Asset Name</label>
                      <input
                        type="text"
                        required
                        value={uploadName}
                        onChange={e => setUploadName(e.target.value)}
                        placeholder="e.g. Quinceanera promo logo"
                        className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/45"
                      />
                    </div>

                    {/* Category */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-[color:var(--portal-muted)]">Category</label>
                      <PortalSelect
                        value={uploadCategory}
                        options={UPLOAD_CATEGORIES}
                        onChange={setUploadCategory}
                      />
                    </div>

                    {/* Save to library checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer select-none group py-1">
                      <input
                        type="checkbox"
                        checked={saveAsBrandAsset}
                        onChange={e => setSaveAsBrandAsset(e.target.checked)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[#caa24c] focus:ring-0"
                      />
                      <span className="text-[10px] text-[color:var(--portal-muted)] transition-colors group-hover:text-[color:var(--portal-text)]">
                        Add to Brand Assets library
                      </span>
                    </label>
                  </>
                )}
              </div>

              {/* Submit Action */}
              <button
                type="submit"
                disabled={uploading || !uploadFile}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/15 py-2.5 font-serif text-xs font-bold uppercase tracking-wider text-[#a8792f] transition-colors hover:bg-[#caa24c]/20 disabled:pointer-events-none disabled:opacity-30 dark:text-[#f1d27a]"
              >
                {uploading ? (
                  <>
                    <Loader2 className="animate-spin text-[#caa24c]" size={12} />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Plus size={12} className="text-[#caa24c]" />
                    <span>Upload & Select</span>
                  </>
                )}
              </button>

            </form>
          </div>

        </div>

        <BrandAssetLightbox asset={previewAsset} onClose={() => setPreviewAsset(null)} />

      </div>
    </PortalModal>
  )
}
