'use client'

import React, { useState, useEffect, useRef } from 'react'
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
  Moon,
  Camera,
  UserRound,
  PanelLeftOpen,
  PanelLeftClose,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalAnimatedTabs,
  PortalTabTransition,
  PortalTableCard,
  PortalSelect
} from '@/components/portal/PortalUI'
import { BrandAssetLightbox } from '@/components/portal/BrandAssetLightbox'
import { useToast } from '@/components/portal/ToastProvider'
import { TwilioNumberManager } from '@/components/portal/TwilioNumberManager'
import { PortalPhoneRoleSettings } from '@/components/portal/PortalPhoneRoleSettings'

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
  const [sidebarLayout, setSidebarLayout] = useState<'expanded' | 'compact'>('expanded')
  const [notificationEmails, setNotificationEmails] = useState('booking@luxoratlaspalmas.com')
  const [profileEmail, setProfileEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false)
  const [zohoWebhookUrl, setZohoWebhookUrl] = useState('')
  const [zohoWebhookInitialized, setZohoWebhookInitialized] = useState(false)
  const [loadingZohoWebhook, setLoadingZohoWebhook] = useState(false)
  const zohoWebhookLoadAttemptedRef = useRef(false)

  useEffect(() => {
    // Try to load initial theme from local storage for fast render
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('luxor-portal-theme')
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved)
      }
      setSidebarLayout(window.localStorage.getItem('luxor-portal-sidebar') === 'compact' ? 'compact' : 'expanded')
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
        setProfileEmail(typeof data.email === 'string' ? data.email : '')
        setDisplayName(typeof data.display_name === 'string' ? data.display_name : '')
        setRoleTitle(typeof data.role_title === 'string' ? data.role_title : '')
        setAvatarUrl(typeof data.avatar_url === 'string' ? data.avatar_url : null)
      })
      .catch(err => console.error('Failed to sync settings from Supabase:', err))
  }, [])

  useEffect(() => {
    if (activeTab !== 'integrations' || zohoWebhookLoadAttemptedRef.current) return
    zohoWebhookLoadAttemptedRef.current = true
    setLoadingZohoWebhook(true)
    fetch('/api/portal/zoho-webhook-config', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'Could not load the Zoho webhook configuration.')
        setZohoWebhookUrl(typeof payload.webhookUrl === 'string' ? payload.webhookUrl : '')
        setZohoWebhookInitialized(Boolean(payload.initialized))
      })
      .catch((error) => notify({
        title: error instanceof Error ? error.message : 'Could not load the Zoho webhook configuration.',
        variant: 'error',
      }))
      .finally(() => setLoadingZohoWebhook(false))
  }, [activeTab, notify])

  const copyZohoWebhookUrl = async () => {
    if (!zohoWebhookUrl) return
    await navigator.clipboard.writeText(zohoWebhookUrl)
    notify({ title: 'Zoho webhook URL copied.', variant: 'success' })
  }

  const handleUpdateTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    window.localStorage.setItem('luxor-portal-theme', newTheme)
    document.cookie = `luxor-portal-theme=${newTheme}; path=/; max-age=31536000; samesite=lax`
    window.dispatchEvent(new Event('luxor-portal-theme'))

    // Save to Supabase
    fetch('/api/portal/user-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme })
    }).catch(err => console.error('Failed to sync theme to Supabase:', err))

    notify({ title: `Switched to ${newTheme} theme.`, variant: 'success' })
  }

  const handleUpdateSidebarLayout = (layout: 'expanded' | 'compact') => {
    setSidebarLayout(layout)
    window.localStorage.setItem('luxor-portal-sidebar', layout)
    window.dispatchEvent(new Event('luxor-portal-sidebar'))
    notify({ title: `Sidebar switched to ${layout} view.`, variant: 'success' })
  }

  // Brand Assets Management States
  const [assets, setAssets] = useState<BrandAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [assetFile, setAssetFile] = useState<File | null>(null)
  const [assetName, setAssetName] = useState('')
  const [assetCategory, setAssetCategory] = useState('general')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [previewAsset, setPreviewAsset] = useState<BrandAsset | null>(null)
  const [assetPage, setAssetPage] = useState(1)

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
        setAssetPage(1)
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
        setAssetPage((page) => Math.min(page, Math.max(1, Math.ceil((assets.length - 1) / ASSETS_PER_PAGE))))
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
          display_name: displayName,
          role_title: roleTitle,
          avatar_url: avatarUrl,
        }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to save settings.')
      }

      notify({ title: 'Settings saved successfully.', variant: 'success' })
      window.dispatchEvent(new Event('luxor:profile-updated'))
    } catch (err) {
      notify({ title: err instanceof Error ? err.message : 'Unable to save settings.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const ASSETS_PER_PAGE = 6
  const assetPageCount = Math.max(1, Math.ceil(assets.length / ASSETS_PER_PAGE))
  const visibleAssets = assets.slice((assetPage - 1) * ASSETS_PER_PAGE, assetPage * ASSETS_PER_PAGE)

  const handleProfileImageUpload = async (file: File | undefined) => {
    if (!file) return

    setUploadingProfileImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('profileImage', 'true')

      const res = await fetch('/api/portal/upload', { method: 'POST', body: formData })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Profile image upload failed.')

      setAvatarUrl(payload.url)
      notify({ title: 'Photo uploaded. Save your profile to apply it.', variant: 'success' })
    } catch (err) {
      notify({ title: err instanceof Error ? err.message : 'Profile image upload failed.', variant: 'error' })
    } finally {
      setUploadingProfileImage(false)
    }
  }

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<Settings size={18} />}
        title="System Settings"
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
        <form onSubmit={handleSave} className="w-full space-y-6">
          <PortalTabTransition activeKey={activeTab} className="space-y-6">
          {/* VENUE INFORMATION */}
          {activeTab === 'business' && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
              <div className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 space-y-5">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Venue Record</h3>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">The venue record keeps the public-facing identity separate from day-to-day CRM calling choices.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Venue', 'Luxor Event Space'],
                    ['Location', 'San Antonio, Texas'],
                    ['Primary mailbox', 'booking@luxoratlaspalmas.com'],
                    ['Public website', 'www.luxoratlaspalmas.com'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-faint)]">{label}</p>
                      <p className="mt-1.5 text-sm font-semibold text-[color:var(--portal-text)]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
                <PortalPhoneRoleSettings mode="venue" />
              </div>
            </div>
          )}

          {/* PORTAL BRANDING */}
          {activeTab === 'branding' && (
            <div className="grid gap-6 xl:grid-cols-2">
              {/* Style Guide */}
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Branding & Style Guide</h3>
                <div className="space-y-4 text-xs text-[color:var(--portal-muted)]">
                  <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                    <div>
                      <p className="font-bold text-[color:var(--portal-text)]">Primary Brand Color</p>
                      <p className="mt-0.5 text-[10px] text-[color:var(--portal-faint)]">Luxor Gold Lockup Accent</p>
                    </div>
                    <span className="font-mono text-xs font-bold text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-3 py-1 rounded">#CAA24C</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                    <div>
                      <p className="font-bold text-[color:var(--portal-text)]">Interface Fonts</p>
                      <p className="mt-0.5 text-[10px] text-[color:var(--portal-faint)]">Serif: Cormorant Garamond / Sans: Manrope</p>
                    </div>
                    <span className="text-xs font-serif text-[#caa24c] italic">Garamond Active</span>
                  </div>
                  <div className="space-y-2">
                    <p className="font-bold text-[color:var(--portal-text)]">Venue Brand Tagline</p>
                    <div className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)]">ELEGANT SPACES. UNFORGETTABLE EVENTS.</div>
                    <p className="text-[9px] text-[color:var(--portal-faint)]">Display only. Public-site copy is managed in Site Content.</p>
                  </div>
                </div>
              </div>

              {/* Appearance Settings */}
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Workspace Appearance</h3>
                <div className="space-y-3">
                  <p className="text-xs text-[color:var(--portal-muted)]">Choose your portal theme and the navigation layout you want while working.</p>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleUpdateTheme('dark')}
                      className={`flex-1 border rounded-xl p-4 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        theme === 'dark'
                          ? 'border-[#caa24c] bg-[#caa24c]/5 text-[#f1d27a]'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/35'
                      }`}
                    >
                      <Moon size={18} className={theme === 'dark' ? 'text-[#caa24c]' : 'text-[color:var(--portal-faint)]'} />
                      <span className="text-xs font-bold">Dark Mode</span>
                      <span className="text-[9px] text-[color:var(--portal-faint)]">Dark workspace</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateTheme('light')}
                      className={`flex-1 border rounded-xl p-4 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        theme === 'light'
                          ? 'border-[#caa24c] bg-[#caa24c]/5 text-[#f1d27a]'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/35'
                      }`}
                    >
                      <Sun size={18} className={theme === 'light' ? 'text-[#caa24c]' : 'text-[color:var(--portal-faint)]'} />
                      <span className="text-xs font-bold">Light Mode</span>
                      <span className="text-[9px] text-[color:var(--portal-faint)]">Light workspace</span>
                    </button>
                  </div>
                  <div className="border-t border-[color:var(--portal-border)] pt-4">
                    <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Sidebar layout on this browser</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => handleUpdateSidebarLayout('expanded')} className={`rounded-xl border p-3 text-left transition-colors ${sidebarLayout === 'expanded' ? 'border-[#caa24c] bg-[#caa24c]/8' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/35'}`}>
                        <PanelLeftOpen size={17} className="text-[#a8792f]" />
                        <span className="mt-2 block text-xs font-bold text-[color:var(--portal-text)]">Expanded</span>
                        <span className="mt-1 block text-[9px] text-[color:var(--portal-faint)]">Show icons and labels</span>
                      </button>
                      <button type="button" onClick={() => handleUpdateSidebarLayout('compact')} className={`rounded-xl border p-3 text-left transition-colors ${sidebarLayout === 'compact' ? 'border-[#caa24c] bg-[#caa24c]/8' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/35'}`}>
                        <PanelLeftClose size={17} className="text-[#a8792f]" />
                        <span className="mt-2 block text-xs font-bold text-[color:var(--portal-text)]">Compact</span>
                        <span className="mt-1 block text-[9px] text-[color:var(--portal-faint)]">Keep more room for work</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Brand Assets Manager */}
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-6 xl:col-span-2">
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
                        <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Category</label>
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
                      className="inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#a8792f] transition-colors hover:bg-[#caa24c]/20 disabled:pointer-events-none disabled:opacity-30 dark:text-[#f1d27a] cursor-pointer"
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
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">Asset Library</h4>
                  {loadingAssets ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-center text-xs text-[color:var(--portal-muted)]">
                      <Loader2 size={14} className="animate-spin text-[#caa24c]" />
                      <span>Loading library...</span>
                    </div>
                  ) : assets.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[color:var(--portal-border)] py-4 text-center text-xs italic text-[color:var(--portal-faint)]">
                      No assets in your brand library yet. Upload an image above to start.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {visibleAssets.map(asset => (
                        <div
                          key={asset.id}
                          className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] transition-all hover:-translate-y-0.5 hover:border-[#caa24c]/40 hover:shadow-lg hover:shadow-[#caa24c]/5"
                        >
                          {/* Image box */}
                          <button type="button" onClick={() => setPreviewAsset(asset)} className="relative block aspect-[4/3] w-full overflow-hidden bg-[color:var(--portal-card)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/60">
                            <img src={asset.url} alt={asset.name} className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-[1.04]" />
                          </button>

                          {/* Info */}
                          <div className="flex items-center gap-3 border-t border-[color:var(--portal-border)] p-3">
                          <div className="min-w-0 flex-1">
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
                        </div>
                      ))}
                    </div>
                  )}
                  {assets.length > ASSETS_PER_PAGE ? (
                    <div className="mt-4 flex items-center justify-between border-t border-[color:var(--portal-border)] pt-3">
                      <span className="text-[9px] font-mono text-[color:var(--portal-muted)]">{assetPage} / {assetPageCount}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setAssetPage((page) => Math.max(1, page - 1))} disabled={assetPage === 1} aria-label="Previous asset page" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/35 hover:text-[#a8792f] disabled:opacity-35">
                          <ChevronLeft size={14} />
                        </button>
                        <button type="button" onClick={() => setAssetPage((page) => Math.min(assetPageCount, page + 1))} disabled={assetPage === assetPageCount} aria-label="Next asset page" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/35 hover:text-[#a8792f] disabled:opacity-35">
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <BrandAssetLightbox asset={previewAsset} onClose={() => setPreviewAsset(null)} />

              </div>
            </div>
          )}

          {/* NOTIFICATION PREFERENCES */}
          {activeTab === 'notifications' && (
            <div className="grid gap-6 xl:grid-cols-2">
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
                  <p className="text-xs text-[color:var(--portal-muted)]">Configure target email addresses to receive branded alerts and AI-summarized dossiers when inquiries are submitted.</p>
                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Recipient Emails (comma-separated)</label>
                    <input
                      type="text"
                      value={notificationEmails}
                      onChange={e => setNotificationEmails(e.target.value)}
                      placeholder="e.g. booking@luxoratlaspalmas.com, owner@luxoratlaspalmas.com"
                      className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40 focus:ring-2 focus:ring-[#caa24c]/10"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TEAM & PERMISSIONS */}
          {activeTab === 'team' && (
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
              <div className="luxor-glass-card space-y-5 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Your Email Identity</h3>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Elena uses this profile in email drafts, outgoing signatures, and the portal header.</p>
                </div>

                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 bg-gradient-to-br from-[#f1d27a] via-[#caa24c] to-[#9b6d24] bg-cover bg-center font-serif text-xl font-bold text-[#18130d] shadow-lg"
                    style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
                  >
                    {avatarUrl ? <span className="sr-only">{displayName || 'Profile photo'}</span> : (displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || <UserRound size={24} />)}
                  </div>
                  <div className="space-y-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40">
                      {uploadingProfileImage ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} className="text-[#a8792f]" />}
                      {uploadingProfileImage ? 'Uploading...' : avatarUrl ? 'Change Photo' : 'Add Profile Photo'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploadingProfileImage} onChange={(event) => void handleProfileImageUpload(event.target.files?.[0])} />
                    </label>
                    {avatarUrl ? (
                      <button type="button" onClick={() => setAvatarUrl(null)} className="block text-[10px] font-semibold text-[color:var(--portal-muted)] hover:text-red-500">Remove photo</button>
                    ) : null}
                    <p className="text-[10px] leading-4 text-[color:var(--portal-faint)]">Square JPG, PNG, or WebP. This photo will appear in email signatures.</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Sender Name</span>
                    <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} placeholder="Your full name" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:ring-2 focus:ring-[#caa24c]/10" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Title</span>
                    <input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} maxLength={120} placeholder="Owner & Managing Director" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:ring-2 focus:ring-[#caa24c]/10" />
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Signed-in Email</span>
                  <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2.5 text-sm text-[color:var(--portal-muted)]">{profileEmail || 'Loading...'}</div>
                </label>
                <PortalPhoneRoleSettings mode="profile" />
              </div>

              <div className="luxor-glass-card space-y-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Portal Access</h3>
                <p className="text-xs leading-relaxed text-[color:var(--portal-muted)]">Portal access is controlled by the approved Zoho email list. Profile names and titles do not change anyone&apos;s permissions.</p>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-[10px] leading-relaxed text-amber-700 dark:text-amber-200">Approved users retain normal portal access, but only Arianna&apos;s approved owner login can search for and purchase new phone numbers.</div>
              </div>
            </div>
          )}

          {/* INTEGRATIONS */}
          {activeTab === 'integrations' && (
            <div className="grid items-start gap-6 xl:grid-cols-2">
            <div className="luxor-glass-card space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Real-Time Zoho Email Notifications</h3>
                  <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-[color:var(--portal-muted)]">
                    Zoho sends Luxor one signed event when an email arrives. This replaces continuous Zoho inbox polling and protects the mailbox API allowance.
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${
                  zohoWebhookInitialized
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-[#caa24c]/30 bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]'
                }`}>
                  {zohoWebhookInitialized ? 'Connected' : 'Awaiting Zoho'}
                </span>
              </div>

              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--portal-muted)]">Secure Webhook URL</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2.5 text-[10px] text-[color:var(--portal-text)]">
                    {loadingZohoWebhook ? 'Preparing secure URL…' : zohoWebhookUrl || 'Unavailable'}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyZohoWebhookUrl()}
                    disabled={!zohoWebhookUrl}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 px-3 text-[10px] font-bold text-[#8c6529] transition-colors hover:bg-[#caa24c]/15 disabled:cursor-not-allowed disabled:opacity-45 dark:text-[#f1d27a]"
                  >
                    <Copy size={13} /> Copy
                  </button>
                </div>
              </div>

              <ol className="space-y-2 text-[11px] leading-relaxed text-[color:var(--portal-muted)]">
                <li><strong className="text-[color:var(--portal-text)]">1.</strong> In Zoho Mail, open Settings → Integrations → Developer Space → Outgoing Webhooks.</li>
                <li><strong className="text-[color:var(--portal-text)]">2.</strong> Add a Mail webhook, paste the secure URL, and choose incoming mail.</li>
                <li><strong className="text-[color:var(--portal-text)]">3.</strong> Turn on Limited Data List so Zoho sends only sender, recipient, subject, and time—never the email body.</li>
                <li><strong className="text-[color:var(--portal-text)]">4.</strong> Save it. Zoho&apos;s first signed request will automatically change this status to Connected.</li>
              </ol>
            </div>
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">External API Channels</h3>
              <div className="space-y-4">
                {[
                  { name: 'Zoho Mail & Login', status: 'Available', desc: 'Used for portal login and email when server credentials are configured.' },
                  { name: 'Stripe Payment Processor', status: 'Not connected', desc: 'Online card and ACH collection has not been implemented.' },
                  { name: 'QuickBooks Bookkeeping Link', status: 'Not connected', desc: 'Bookkeeping synchronization has not been implemented.' }
                ].map((api, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="text-xs font-bold text-[color:var(--portal-text)]">{api.name}</p>
                      <p className="mt-1 max-w-sm text-[10px] leading-relaxed text-[color:var(--portal-muted)]">{api.desc}</p>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded border ${
                      api.status === 'Available' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'
                    }`}>
                      {api.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4 xl:col-span-2">
              <div><h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Twilio Phone Numbers</h3><p className="mt-1 text-[10px] leading-relaxed text-[color:var(--portal-muted)]">Search, purchase, configure, and choose the number Luxor uses for browser calls and text messages.</p></div>
              <TwilioNumberManager />
            </div>
            </div>
          )}


          {/* SITE CONTENT */}
          {activeTab === 'content' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Manage Website Content</h3>
              <p className="text-xs text-[color:var(--portal-muted)] leading-relaxed">
                Update the text, data, and layout definitions that power the public-facing pages of the Luxor event space site.
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                {['home', 'events', 'gallery', 'pricing', 'spaces', 'visit'].map(pageName => (
                  <div key={pageName} className="flex flex-col gap-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold text-[color:var(--portal-text)] capitalize">{pageName} Page</p>
                      <p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">Edit the saved content record for {pageName}</p>
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
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Venue Tour Availability Hours</h3>
              <p className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">Informational only. These hours are not currently connected to the public tour-slot calendar.</p>
              <div className="grid gap-3 font-mono text-xs lg:grid-cols-3">
                {[
                  { day: 'Monday - Thursday', hours: '9:00 AM - 5:00 PM' },
                  { day: 'Friday', hours: '9:00 AM - 3:00 PM' },
                  { day: 'Saturday - Sunday', hours: 'Events Only (Closed for Tours)' }
                ].map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                    <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{item.day}</span>
                    <span className="mt-2 block font-semibold text-[color:var(--portal-text)]">{item.hours}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          </PortalTabTransition>

          {/* Submit button */}
          {(activeTab === 'notifications' || activeTab === 'team') && <div className="pt-4 border-t border-[color:var(--portal-border)] flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#caa24c] hover:bg-[#dfbd68] text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-lg shadow-xl shadow-[#caa24c]/10 cursor-pointer disabled:opacity-40 hover:scale-105 active:scale-95 transition-all"
            >
              {saving ? 'Saving...' : activeTab === 'team' ? 'Save My Profile' : 'Save Notification Recipients'}
            </button>
          </div>}
        </form>
      </div>
    </PortalPageFrame>
  )
}
