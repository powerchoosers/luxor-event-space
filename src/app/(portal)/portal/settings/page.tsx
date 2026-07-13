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
            { id: 'hours', label: 'Business Hours', icon: <Clock size={15} /> }
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase font-bold text-zinc-500">Venue Name</label>
                  <input
                    type="text"
                    defaultValue="Luxor Event Space"
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase font-bold text-zinc-500">Contact Email</label>
                  <input
                    type="email"
                    defaultValue="booking@luxoratlaspalmas.com"
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[9px] uppercase font-bold text-zinc-500">Venue Location Address</label>
                  <input
                    type="text"
                    defaultValue="1025 Palmas Avenue, Suite 100, Dallas, TX 75201"
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
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
                    <input
                      type="text"
                      defaultValue="ELEGANT SPACES. UNFORGETTABLE EVENTS."
                      className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                    />
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
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Brand Assets Manager</h3>
                  <p className="text-[10px] text-zinc-550 mt-1">Upload and manage image assets to use inside email campaigns and compose drawers.</p>
                </div>

                {/* Upload Form */}
                <div className="border border-[color:var(--portal-border)] bg-black/30 rounded-xl p-4 space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Upload New Asset</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* File Input */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase font-bold text-zinc-550">Image File</label>
                      <div className="relative border border-dashed border-[color:var(--portal-border)] rounded-lg bg-black/50 p-3 flex flex-col items-center justify-center text-center cursor-pointer min-h-[80px]">
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
                        <Upload size={16} className="text-zinc-550 mb-1" />
                        <p className="text-[10px] text-zinc-400 font-medium truncate max-w-full px-2">
                          {assetFile ? assetFile.name : 'Choose file...'}
                        </p>
                      </div>
                    </div>

                    {/* Meta Fields */}
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase font-bold text-zinc-550">Asset Name</label>
                        <input
                          type="text"
                          value={assetName}
                          onChange={e => setAssetName(e.target.value)}
                          placeholder="e.g. Logo Header Gold"
                          className="w-full bg-black border border-[color:var(--portal-border)] rounded-md px-3 py-1.5 text-xs text-zinc-300 outline-none"
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
                          className="flex items-center gap-3 border border-[color:var(--portal-border)] bg-black/20 rounded-xl p-3 hover:border-zinc-800 transition-colors"
                        >
                          {/* Image box */}
                          <div className="w-12 h-12 bg-black border border-zinc-900 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                            <img src={asset.url} alt={asset.name} className="max-w-full max-h-full object-contain" />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-zinc-200 truncate">{asset.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="rounded bg-zinc-950 border border-zinc-900 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-500">
                                {asset.category}
                              </span>
                              <span className="text-[8px] text-zinc-650 font-mono">
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
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-900 bg-black/40 text-zinc-400 hover:text-[#caa24c] hover:border-[#caa24c]/20 transition-all cursor-pointer"
                            >
                              {copiedId === asset.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAsset(asset.id)}
                              title="Delete Brand Asset"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-900 bg-black/40 text-zinc-400 hover:text-red-400 hover:border-red-500/20 transition-all cursor-pointer"
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
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Automated Notifications</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Notify on new lead form inquiry', desc: 'Email alerts to booking mailbox on new form entries.', checked: true },
                    { label: 'Auto-send tour reminders', desc: 'SMS/Email reminders scheduled to prospects 24 hours before tour.', checked: true },
                    { label: 'Contract signature event alerts', desc: 'Notify workspace coordinators immediately when a client signs.', checked: true },
                    { label: 'Overdue bill utility spikes alerts', desc: 'Alert maintenance when utility sensor spikes or bills exceed average.', checked: false }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 bg-zinc-950/20 border border-zinc-900 rounded-lg p-3">
                      <input
                        type="checkbox"
                        defaultChecked={item.checked}
                        className="w-4 h-4 rounded text-[#caa24c] border-zinc-800 bg-transparent cursor-pointer mt-0.5"
                      />
                      <div>
                        <p className="text-xs font-bold text-white">{item.label}</p>
                        <p className="text-[10px] text-zinc-500 mt-1 leading-normal">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Internal Notification Recipients</h3>
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
              <div className="divide-y divide-zinc-900/60 text-xs">
                {[
                  { name: 'Elena Concierge', email: 'concierge@luxoratlaspalmas.com', role: 'Full Admin' },
                  { name: 'Lewis Palma (Owner)', email: 'lewis@luxoratlaspalmas.com', role: 'Owner / CEO' }
                ].map((user, idx) => (
                  <div key={idx} className="py-3 flex justify-between items-center first:pt-0 last:pb-0">
                    <div>
                      <p className="font-bold text-white">{user.name}</p>
                      <p className="text-[10px] text-zinc-550 mt-0.5 font-mono">{user.email}</p>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-2 py-0.5 rounded">{user.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INTEGRATIONS */}
          {activeTab === 'integrations' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">External API Channels</h3>
              <div className="space-y-4">
                {[
                  { name: 'Zoho Mail Server API', status: 'Connected', desc: 'Used for mailbox synchronization and secure routing.' },
                  { name: 'Stripe Payment Processor', status: 'Connected', desc: 'Securely collects deposits and updates invoice payments.' },
                  { name: 'QuickBooks Bookkeeping Link', status: 'Disconnected', desc: 'Optional bookkeeping ledger synchronization.' }
                ].map((api, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-zinc-900 pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="text-xs font-bold text-white">{api.name}</p>
                      <p className="text-[10px] text-zinc-550 mt-1 max-w-sm leading-relaxed">{api.desc}</p>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded border ${
                      api.status === 'Connected' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/25 bg-rose-500/10 text-rose-400'
                    }`}>
                      {api.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BUSINESS HOURS */}
          {activeTab === 'hours' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Venue Tour Availability Hours</h3>
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
          <div className="pt-4 border-t border-[color:var(--portal-border)] flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#caa24c] hover:bg-[#dfbd68] text-black text-xs font-black uppercase tracking-widest px-6 py-3 rounded-lg shadow-xl shadow-[#caa24c]/10 cursor-pointer disabled:opacity-40 hover:scale-105 active:scale-95 transition-all"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </PortalPageFrame>
  )
}
