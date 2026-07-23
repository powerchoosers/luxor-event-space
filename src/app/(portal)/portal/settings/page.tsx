'use client'

import React, { useState, useEffect } from 'react'
import {
  Settings,
  Building,
  Image,
  Mail,
  Bell,
  Cpu,
  Clock,
  Plus,
  Trash2,
  Lock,
  RefreshCw,
  AlertTriangle,
  Upload,
  Copy,
  Loader2,
  Check,
  Sun,
  Moon
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalAnimatedTabs,
  PortalTabTransition,
  PortalTableCard,
  PortalSelect
} from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import { TwilioNumberManager } from '@/components/portal/TwilioNumberManager'

const ASSET_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'logo', label: 'Logo' },
  { value: 'banner', label: 'Banner' },
  { value: 'signature', label: 'Signature' }
]

type Tab =
  | 'business'
  | 'branding'
  | 'notifications'
  | 'team'
  | 'integrations'
  | 'hours'
  | 'content'

type BrandAsset = {
  id: string
  name: string
  url: string
  category: string
  created_at: string
  metadata?: Record<string, unknown>
}

export default function SettingsPage() {
  const { notify } = useToast()
  const [activeTab, setActiveTab] = useState<Tab>('business')
  const [saving, setSaving] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [notificationEmails, setNotificationEmails] = useState('booking@luxoratlaspalmas.com')

  useEffect(() => {
    // Try to load initial theme from local storage for fast render
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('luxor-portal-theme')
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved)
      }
    }

    // Load full settings from database preferences
    fetch('/api/portal/user-preferences')
      .then(res => res.json())
      .then(data => {
        if (data.theme === 'light' || data.theme === 'dark') {
          setTheme(data.theme)
        }
        if (data.notification_emails) {
          setNotificationEmails(data.notification_emails)
        }
      })
      .catch(err => console.error('Failed to sync settings from Supabase:', err))
  }, [])

  const handleUpdateTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    window.localStorage.setItem('luxor-portal-theme', newTheme)
    window.dispatchEvent(new Event('luxor-portal-theme'))

    // Save to Supabase
    fetch('/api/portal/user-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme })
    }).catch(err => console.error('Failed to sync theme to Supabase:', err))

    notify({ title: `Switched to ${newTheme} theme.`, variant: 'success' })
  }

  // Brand Assets Management States
  const [assets, setAssets] = useState<BrandAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [assetFile, setAssetFile] = useState<File | null>(null)
  const [assetName, setAssetName] = useState('')
  const [assetCategory, setAssetCategory] = useState('general')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    void fetchAssets()
  }, [])

  const fetchAssets = async () => {
    try {
      setLoadingAssets(true)
      const res = await fetch('/api/portal/brand-assets')
      if (res.ok) {
        const data = await res.json()
        setAssets(data.assets || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingAssets(false)
    }
  }

  const handleUploadAsset = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (!assetFile) return

    try {
      setUploading(true)
      const formData = new FormData()
      formData.append('file', assetFile)
      formData.append('name', assetName.trim())
      formData.append('category', assetCategory)
      formData.append('makeBrandAsset', 'true')

      const res = await fetch('/api/portal/upload', {
        method: 'POST',
        body: formData
      })

      if (res.ok) {
        notify({ title: 'Brand asset uploaded successfully.', variant: 'success' })
        setAssetFile(null)
        setAssetName('')
        setAssetCategory('general')
        void fetchAssets()
      } else {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }
    } catch (err) {
      notify({ title: err instanceof Error ? err.message : 'Upload failed', variant: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAsset = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand asset? The file will be removed from storage.')) return

    try {
      const res = await fetch(`/api/portal/brand-assets?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        notify({ title: 'Asset deleted successfully.', variant: 'success' })
        setAssets(prev => prev.filter(a => a.id !== id))
      } else {
        throw new Error('Deletion failed')
      }
    } catch (err) {
      notify({ title: 'Failed to delete asset.', variant: 'error' })
    }
  }

  const handleCopyUrl = (id: string, url: string) => {
    void navigator.clipboard.writeText(url)
    setCopiedId(id)
    notify({ title: 'Asset URL copied to clipboard!', variant: 'success' })
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/portal/user-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme,
          notification_emails: notificationEmails,
        }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to save settings.')
      }

      notify({ title: 'Settings saved successfully.', variant: 'success' })
    } catch (err) {
      notify({ title: err instanceof Error ? err.message : 'Unable to save settings.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<Settings size={18} />}
        title="System Settings"
        description="Configure Luxor business configurations, brand assets, email automated routing, and external API channels."
      />

      {/* Sub-tab navigation */}
      <div className="flex shrink-0 gap-2 border-b border-[color:var(--portal-border)] pb-2 overflow-x-auto portal-scrollbar">
        <PortalAnimatedTabs
          tabs={[
            { id: 'business', label: 'Venue Information', icon: <Building size={15} /> },
            { id: 'branding', label: 'Portal Branding', icon: <Image size={15} /> },
            { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
            { id: 'team', label: 'Team & Permissions', icon: <Lock size={15} /> },
            { id: 'integrations', label: 'Integrations', icon: <Cpu size={15} /> },
            { id: 'hours', label: 'Business Hours', icon: <Clock size={15} /> },
            { id: 'content', label: 'Site Content', icon: <Building size={15} /> }
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as Tab)}
        />
      </div>

      {/* Settings Forms */}
      <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8">
        <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
          <PortalTabTransition activeKey={activeTab} className="space-y-6">
          {/* VENUE INFORMATION */}
          {activeTab === 'business' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Business Details</h3>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-xs font-bold text-amber-200">Business profile editing is not connected yet.</p>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">The public website remains the source of truth for the venue name, address, and contact details. This screen no longer shows editable fields that do not save.</p>
              </div>
            </div>
          )}

          {/* PORTAL BRANDING */}
          {activeTab === 'branding' && (
            <div className="space-y-6">
              {/* Style Guide */}
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Branding & Style Guide</h3>
                <div className="space-y-4 text-xs text-zinc-400">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                    <div>
                      <p className="font-bold text-white">Primary Brand Color</p>
                      <p className="text-[10px] text-zinc-550 mt-0.5">Luxor Gold Lockup Accent</p>
                    </div>
                    <span className="font-mono text-xs font-bold text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-3 py-1 rounded">#CAA24C</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                    <div>
                      <p className="font-bold text-white">Interface Fonts</p>
                      <p className="text-[10px] text-zinc-550 mt-0.5">Serif: Cormorant Garamond / Sans: Manrope</p>
                    </div>
                    <span className="text-xs font-serif text-[#caa24c] italic">Garamond Active</span>
                  </div>
                  <div className="space-y-2">
                    <p className="font-bold text-white">Venue Brand Tagline</p>
                    <div className="w-full rounded-md border border-[color:var(--portal-border)] bg-[#050505] px-3 py-2 text-xs text-zinc-300">ELEGANT SPACES. UNFORGETTABLE EVENTS.</div>
                    <p className="text-[9px] text-zinc-600">Display only. Public-site copy is managed in Site Content.</p>
                  </div>
                </div>
              </div>

              {/* Appearance Settings */}
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Appearance Settings</h3>
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">Choose your preferred workspace theme color. This setting is synced to your profile and active across devices.</p>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleUpdateTheme('dark')}
                      className={`flex-1 border rounded-xl p-4 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        theme === 'dark'
                          ? 'border-[#caa24c] bg-[#caa24c]/5 text-[#f1d27a]'
                          : 'border-zinc-800 bg-black/20 text-zinc-400 hover:border-zinc-750'
                      }`}
                    >
                      <Moon size={18} className={theme === 'dark' ? 'text-[#caa24c]' : 'text-zinc-600'} />
                      <span className="text-xs font-bold">Dark Mode</span>
                      <span className="text-[9px] text-zinc-550">Luxor forensic dashboard</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateTheme('light')}
                      className={`flex-1 border rounded-xl p-4 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        theme === 'light'
                          ? 'border-[#caa24c] bg-[#caa24c]/5 text-[#f1d27a]'
                          : 'border-zinc-800 bg-black/20 text-zinc-400 hover:border-zinc-750'
                      }`}
                    >
                      <Sun size={18} className={theme === 'light' ? 'text-[#caa24c]' : 'text-zinc-650'} />
                      <span className="text-xs font-bold">Light Mode</span>
                      <span className="text-[9px] text-zinc-500">Refined gold and sand accents</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Brand Assets Manager */}
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-6">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Brand Assets Manager</h3>
                  <p className="text-[10px] text-[color:var(--portal-muted)] mt-1">Upload and manage image assets to use inside email campaigns and compose drawers.</p>
                </div>

                {/* Upload Form */}
                <div className="border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] rounded-xl p-4 space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Upload New Asset</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* File Input */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Image File</label>
                      <div className="relative border border-dashed border-[color:var(--portal-border)] rounded-lg bg-[color:var(--portal-card)] p-3 flex flex-col items-center justify-center text-center cursor-pointer min-h-[80px]">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                              const f = e.target.files[0]
                              setAssetFile(f)
                              const base = f.name.substring(0, f.name.lastIndexOf('.')) || f.name
                              setAssetName(base.replace(/[^a-zA-Z0-9\s-_]/g, ' '))
                            }
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <Upload size={16} className="text-[color:var(--portal-muted)] mb-1" />
                        <p className="text-[10px] text-[color:var(--portal-text)] font-medium truncate max-w-full px-2">
                          {assetFile ? assetFile.name : 'Choose file...'}
                        </p>
                      </div>
                    </div>

                    {/* Meta Fields */}
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Asset Name</label>
                        <input
                          type="text"
                          value={assetName}
                          onChange={e => setAssetName(e.target.value)}
                          placeholder="e.g. Logo Header Gold"
                          className="w-full bg-[color:var(--portal-card)] border border-[color:var(--portal-border)] rounded-md px-3 py-1.5 text-xs text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase font-bold text-zinc-550">Category</label>
                        <PortalSelect
                          value={assetCategory}
                          options={ASSET_CATEGORIES}
                          onChange={setAssetCategory}
                        />
                      </div>
                    </div>

                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleUploadAsset}
                      disabled={uploading || !assetFile || !assetName.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#caa24c]/10 border border-[#caa24c]/30 hover:bg-[#caa24c]/20 text-[#f1d27a] px-4 py-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    >
                      {uploading ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Plus size={12} />
                          <span>Upload Brand Asset</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Library grid */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Asset Library</h4>
                  {loadingAssets ? (
                    <div className="text-center py-6 text-xs text-zinc-500 flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin text-[#caa24c]" />
                      <span>Loading library...</span>
                    </div>
                  ) : assets.length === 0 ? (
                    <p className="text-xs italic text-zinc-650 py-4 text-center border border-zinc-900 border-dashed rounded-xl">
                      No assets in your brand library yet. Upload an image above to start.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {assets.map(asset => (
                        <div
                          key={asset.id}
                          className="flex items-center gap-3 border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] rounded-xl p-3 hover:border-[#caa24c]/30 transition-colors"
                        >
                          {/* Image box */}
                          <div className="w-12 h-12 bg-[color:var(--portal-card)] border border-[color:var(--portal-border)] rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                            <img src={asset.url} alt={asset.name} className="max-w-full max-h-full object-contain" />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[color:var(--portal-text)] truncate">{asset.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="rounded bg-[color:var(--portal-card)] border border-[color:var(--portal-border)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">
                                {asset.category}
                              </span>
                              <span className="text-[8px] text-[color:var(--portal-faint)] font-mono">
                                {new Date(asset.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyUrl(asset.id, asset.url)}
                              title="Copy Public URL"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:text-[#caa24c] hover:border-[#caa24c]/30 transition-all cursor-pointer"
                            >
                              {copiedId === asset.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAsset(asset.id)}
                              title="Delete Brand Asset"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>

                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* NOTIFICATION PREFERENCES */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Automated Notifications</h3>
                <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                  <p className="text-xs font-bold text-[color:var(--portal-text)]">New inquiry email alerts are active when Zoho is configured.</p>
                  <p className="mt-2 text-[10px] leading-relaxed text-[color:var(--portal-muted)]">Tour emails can be queued from the calendar and client dossier. General reminder switches are hidden until each automation has a saved setting and a verified delivery job.</p>
                </div>
              </div>

              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Internal Notification Recipients</h3>
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400">Configure target email addresses to receive branded alerts and AI-summarized dossiers when inquiries are submitted.</p>
                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase font-bold text-zinc-550">Recipient Emails (comma-separated)</label>
                    <input
                      type="text"
                      value={notificationEmails}
                      onChange={e => setNotificationEmails(e.target.value)}
                      placeholder="e.g. booking@luxoratlaspalmas.com, owner@luxoratlaspalmas.com"
                      className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none focus:border-[#caa24c]/40"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TEAM & PERMISSIONS */}
          {activeTab === 'team' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Team Access Roster</h3>
              <p className="text-xs leading-relaxed text-zinc-400">Portal access is currently controlled by the approved Zoho email list in the server configuration. Named roles and per-page permissions are not implemented yet, so the portal no longer displays a fictional roster.</p>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-[10px] leading-relaxed text-amber-200">Anyone on the approved email list has broad owner-workspace access. Add role-based permissions before inviting sales, event staff, or bookkeepers.</div>
            </div>
          )}

          {/* INTEGRATIONS */}
          {activeTab === 'integrations' && (
            <div className="space-y-6">
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">External API Channels</h3>
              <div className="space-y-4">
                {[
                  { name: 'Zoho Mail & Login', status: 'Available', desc: 'Used for portal login and email when server credentials are configured.' },
                  { name: 'Stripe Payment Processor', status: 'Not connected', desc: 'Online card and ACH collection has not been implemented.' },
                  { name: 'QuickBooks Bookkeeping Link', status: 'Not connected', desc: 'Bookkeeping synchronization has not been implemented.' }
                ].map((api, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-zinc-900 pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="text-xs font-bold text-white">{api.name}</p>
                      <p className="text-[10px] text-zinc-550 mt-1 max-w-sm leading-relaxed">{api.desc}</p>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded border ${
                      api.status === 'Available' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                    }`}>
                      {api.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <div><h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Twilio Phone Numbers</h3><p className="mt-1 text-[10px] leading-relaxed text-zinc-550">Search, purchase, configure, and choose the number Luxor uses for browser calls and text messages.</p></div>
              <TwilioNumberManager />
            </div>
            </div>
          )}


          {/* SITE CONTENT */}
          {activeTab === 'content' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Manage Website Content</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Update the text, data, and layout definitions that power the public-facing pages of the Luxor event space site.
              </p>
              <div className="space-y-4">
                {['home', 'events', 'gallery', 'pricing', 'spaces', 'visit'].map(pageName => (
                  <div key={pageName} className="border border-zinc-900 rounded p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <p className="font-bold text-white capitalize">{pageName} Page</p>
                      <p className="text-[10px] text-zinc-550 mt-0.5">Edit JSON schema powering /public/{pageName}</p>
                    </div>
                    <button type="button" onClick={() => {
                        fetch('/api/public/content?page=' + pageName)
                        .then(res => res.json())
                        .then(json => {
                            const newContent = prompt(`Edit JSON for ${pageName}`, JSON.stringify(json, null, 2));
                            if(newContent) {
                                try {
                                    const parsed = JSON.parse(newContent);
                                    fetch('/api/portal/content', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ page_name: pageName, content: parsed })
                                    }).then(res => res.json()).then(() => notify({ title: 'Content updated', variant: 'success' }));
                                } catch(e) {
                                    notify({ title: 'Invalid JSON format', variant: 'error' });
                                }
                            }
                        })
                    }} className="px-3 py-1.5 border border-[#caa24c]/40 text-[#caa24c] rounded hover:bg-[#caa24c]/10 text-xs font-bold transition-colors">
                      Edit Data Map
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BUSINESS HOURS */}
          {activeTab === 'hours' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Venue Tour Availability Hours</h3>
              <p className="text-[10px] leading-relaxed text-amber-300">Informational only. These hours are not currently connected to the public tour-slot calendar.</p>
              <div className="space-y-3 font-mono text-xs">
                {[
                  { day: 'Monday - Thursday', hours: '9:00 AM - 5:00 PM' },
                  { day: 'Friday', hours: '9:00 AM - 3:00 PM' },
                  { day: 'Saturday - Sunday', hours: 'Events Only (Closed for Tours)' }
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between border-b border-zinc-900/60 pb-2.5 last:border-0 last:pb-0">
                    <span className="text-zinc-500 font-sans">{item.day}</span>
                    <span className="text-white font-semibold">{item.hours}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          </PortalTabTransition>

          {/* Submit button */}
          {activeTab === 'notifications' && <div className="pt-4 border-t border-[color:var(--portal-border)] flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#caa24c] hover:bg-[#dfbd68] text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-lg shadow-xl shadow-[#caa24c]/10 cursor-pointer disabled:opacity-40 hover:scale-105 active:scale-95 transition-all"
            >
              {saving ? 'Saving...' : 'Save Notification Recipients'}
            </button>
          </div>}
        </form>
      </div>
    </PortalPageFrame>
  )
}
