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
import { PortalSelect } from '@/components/portal/PortalUI'

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

  useEffect(() => {
    if (isOpen) {
      void fetchAssets()
      // Reset upload states
      setUploadFile(null)
      setUploadName('')
      setUploadCategory('general')
      setSaveAsBrandAsset(true)
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm luxor-soft-enter">
      <div className="flex h-[600px] w-full max-w-4xl flex-col rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-[#caa24c]" />
            <h3 className="font-serif text-sm font-bold text-white uppercase tracking-wider">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--portal-muted)] hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 min-h-0">
          
          {/* Library Gallery Panel */}
          <div className="flex-[2] flex flex-col min-w-0 border-r border-[color:var(--portal-border)] p-6">
            
            {/* Search & Tabs */}
            <div className="space-y-4 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search assets by name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md pl-9 pr-4 py-2 text-xs text-zinc-300 outline-none"
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
                        : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-white'
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
                <div className="flex h-full items-center justify-center py-12 text-xs text-zinc-500 gap-2">
                  <Loader2 className="animate-spin text-[#caa24c]" size={16} />
                  <span>Loading brand assets...</span>
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-12 text-zinc-500">
                  <ImageIcon size={32} className="text-zinc-700 mb-2" />
                  <p className="text-xs italic">No brand assets found matching filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredAssets.map(asset => (
                    <div
                      key={asset.id}
                      onClick={() => onSelect(asset.url)}
                      className="group relative cursor-pointer rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 hover:border-[#caa24c]/40 transition-all flex flex-col h-[140px]"
                    >
                      {/* Image Thumbnail Container */}
                      <div className="flex-1 rounded-lg bg-black overflow-hidden flex items-center justify-center relative">
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="max-w-full max-h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="rounded bg-[#caa24c] px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-white shadow-lg">
                            Use Image
                          </span>
                        </div>
                      </div>

                      {/* Info Footer */}
                      <div className="mt-2 shrink-0 min-w-0">
                        <p className="truncate text-[10px] font-bold text-zinc-300 leading-tight">
                          {asset.name}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-500">
                            {asset.category}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteAsset(e, asset.id)}
                            aria-label="Delete asset"
                            className="text-zinc-650 hover:text-red-400 transition-colors p-1 cursor-pointer"
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
          <div className="flex-1 bg-[#030303]/40 p-6 flex flex-col justify-between">
            <form onSubmit={handleUploadSubmit} className="space-y-4 flex flex-col h-full justify-between">
              
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c] border-b border-zinc-900 pb-2">
                  Upload Direct Image
                </h4>

                {/* Drag-drop/file select zone */}
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-500">File Image</label>
                  <div className="relative border border-dashed border-[color:var(--portal-border)] hover:border-[#caa24c]/45 rounded-xl bg-black/40 p-4 transition-colors flex flex-col items-center justify-center text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload size={18} className="text-zinc-500 mb-1" />
                    <p className="text-[10px] text-zinc-400 truncate max-w-full font-medium px-2">
                      {uploadFile ? uploadFile.name : 'Select or drop image file'}
                    </p>
                    <p className="text-[8px] text-zinc-600 mt-0.5">JPG, PNG, GIF, WebP up to 5MB</p>
                  </div>
                </div>

                {uploadFile && (
                  <>
                    {/* Asset Name */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Asset Name</label>
                      <input
                        type="text"
                        required
                        value={uploadName}
                        onChange={e => setUploadName(e.target.value)}
                        placeholder="e.g. Quinceanera promo logo"
                        className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                      />
                    </div>

                    {/* Category */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Category</label>
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
                        className="rounded border-[color:var(--portal-border)] bg-black text-[#caa24c] focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="text-[10px] text-zinc-400 group-hover:text-white transition-colors">
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
                className="w-full rounded-xl bg-[#caa24c]/15 hover:bg-[#caa24c]/20 border border-[#caa24c]/30 text-white font-serif py-2.5 text-xs font-bold uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center justify-center gap-2 cursor-pointer"
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

      </div>
    </div>
  )
}
