'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LUXOR_VENUE_ADDRESS } from '@/lib/luxorVenue'
import {
  Building,
  Image,
  Bell,
  Cpu,
  Bot,
  Clock,
  Plus,
  Trash2,
  Lock,
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
  ChevronDown,
  ChevronRight,
  Tag,
  BadgeDollarSign,
} from '@/lib/icons/phosphor-compat'
import {
  PortalButton,
  PortalGhostIconButton,
  PortalModal,
  PortalPagination,
  PortalSelect,
  PortalSkeleton,
  PortalSkeletonTransition,
  PortalStatusBadge,
  PortalTabTransition,
} from '@/components/portal/PortalUI'
import { BrandAssetLightbox } from '@/components/portal/BrandAssetLightbox'
import { useToast } from '@/components/portal/ToastProvider'
import { TwilioNumberManager } from '@/components/portal/TwilioNumberManager'
import { PortalPhoneRoleSettings } from '@/components/portal/PortalPhoneRoleSettings'
import { PortalPaymentSettings } from '@/components/portal/PortalPaymentSettings'
import { TourAvailabilityManager } from '@/components/portal/TourAvailabilityManager'
import { PromotionManager } from '@/components/portal/PromotionManager'
import { PortalPushNotifications } from '@/components/portal/PortalPushNotifications'
import { CustomCalendarInviteTester } from '@/components/portal/CustomCalendarInviteTester'
import { MailMigrationSettings } from '@/components/portal/MailMigrationSettings'
import { CalendarReplyReview } from '@/components/portal/CalendarReplyReview'
import { MailProviderSettings } from '@/components/portal/MailProviderSettings'
import { TeamAccessManager } from '@/components/portal/TeamAccessManager'
import { ElenaSettingsManager } from '@/components/portal/ElenaSettingsManager'
import { ProposalPricingManager } from '@/components/portal/ProposalPricingManager'
import { BrochureSettings } from '@/components/portal/BrochureSettings'

export type Tab =
  | 'business'
  | 'branding'
  | 'notifications'
  | 'team'
  | 'integrations'
  | 'hours'
  | 'promotions'
  | 'pricing'
  | 'content'
  | 'elena'

export type SettingsNavItem = {
  id: Tab
  label: string
  description: string
  icon: React.ReactNode
}

export const SETTINGS_NAVIGATION: Array<{ label: string; items: SettingsNavItem[] }> = [
  {
    label: 'Workspace',
    items: [
      { id: 'business', label: 'Venue information', description: 'Details, phone, and payments', icon: <Building size={16} /> },
      { id: 'hours', label: 'Hours & availability', description: 'Tour dates and times', icon: <Clock size={16} /> },
      { id: 'team', label: 'Team & access', description: 'Your profile and access', icon: <Lock size={16} /> },
    ],
  },
  {
    label: 'Communication',
    items: [
      { id: 'notifications', label: 'Notifications', description: 'Alerts and recipients', icon: <Bell size={16} /> },
      { id: 'elena', label: 'Elena AI', description: 'Knowledge, flows, and behavior', icon: <Bot size={16} /> },
      { id: 'integrations', label: 'Email & connections', description: 'Phone, inbox, and calendar', icon: <Cpu size={16} /> },
    ],
  },
  {
    label: 'Venue & growth',
    items: [
      { id: 'pricing', label: 'Pricing & line items', description: 'Rates used across Luxor', icon: <BadgeDollarSign size={16} /> },
      { id: 'promotions', label: 'Promotions', description: 'Offers on the website', icon: <Tag size={16} /> },
    ],
  },
  {
    label: 'Website',
    items: [
      { id: 'branding', label: 'Branding', description: 'Appearance, brochure, and assets', icon: <Image size={16} /> },
      { id: 'content', label: 'Site content', description: 'Public page records', icon: <Building size={16} /> },
    ],
  },
]

export const SETTINGS_TAB_COPY: Record<Tab, { title: string; description: string }> = {
  business: { title: 'Venue information', description: 'Manage your public venue details, website phone line, and payment setup.' },
  hours: { title: 'Hours & availability', description: 'Choose when guests can request a private venue tour.' },
  team: { title: 'Team & access', description: 'Manage your profile, calling line, and staff portal permissions.' },
  notifications: { title: 'Notifications', description: 'Choose who gets notified and how alerts arrive on your devices.' },
  integrations: { title: 'Email & connections', description: 'Manage phone numbers, email delivery, and calendar responses.' },
  promotions: { title: 'Promotions', description: 'Create and manage special offers shown on the Luxor website.' },
  pricing: { title: 'Pricing & line items', description: 'Manage the approved rates used across proposals and Elena.' },
  branding: { title: 'Branding', description: 'Set your workspace appearance, venue brochure, and brand images.' },
  content: { title: 'Site content', description: 'Edit saved content records for public Luxor pages.' },
  elena: { title: 'Elena AI', description: 'Manage Elena’s knowledge, flows, behavior, and website preview.' },
}

export const AGENT_TABS: Tab[] = ['team', 'notifications', 'branding']

export const AGENT_SETTINGS_NAVIGATION: Array<{ label: string; items: SettingsNavItem[] }> = [
  {
    label: 'Your account',
    items: [
      { id: 'team', label: 'My profile', description: 'Your name, photo, and email identity', icon: <UserRound size={16} /> },
    ],
  },
  {
    label: 'Preferences',
    items: [
      { id: 'notifications', label: 'Notifications', description: 'Alerts on this device', icon: <Bell size={16} /> },
      { id: 'branding', label: 'Appearance', description: 'Theme and navigation layout', icon: <Image size={16} /> },
    ],
  },
]

export const AGENT_TAB_COPY: Partial<Record<Tab, { title: string; description: string }>> = {
  team: { title: 'My profile', description: 'Keep your personal profile and email signature up to date.' },
  notifications: { title: 'Notifications', description: 'Choose how Luxor alerts you on this device.' },
  branding: { title: 'Appearance', description: 'Choose the workspace theme and navigation layout you prefer.' },
}

const ASSET_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'logo', label: 'Logo' },
  { value: 'banner', label: 'Banner' },
  { value: 'signature', label: 'Signature' },
]

const CARD_CLASS =
  'rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6'

const INPUT_CLASS =
  'min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#caa24c]/15'

type BrandAsset = {
  id: string
  name: string
  url: string
  category: string
  created_at: string
  metadata?: Record<string, unknown>
}

export function PortalSettingsManager({
  activeTab,
  onSelectTab,
  portalRole: propPortalRole,
  isModal = false,
}: {
  activeTab: Tab
  onSelectTab: (tab: Tab) => void
  portalRole?: 'owner' | 'admin' | 'agent'
  isModal?: boolean
}) {
  const router = useRouter()
  const { notify } = useToast()
  const [portalRole, setPortalRole] = useState<'owner' | 'admin' | 'agent'>(propPortalRole || 'agent')
  const [loadingPreferences, setLoadingPreferences] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingNotifications, setSavingNotifications] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [sidebarLayout, setSidebarLayout] = useState<'expanded' | 'compact'>('expanded')
  const [notificationEmails, setNotificationEmails] = useState('booking@luxoratlaspalmas.com')
  const [profileEmail, setProfileEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false)

  // Brand Assets Management States
  const [assets, setAssets] = useState<BrandAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(propPortalRole !== 'agent')
  const [uploading, setUploading] = useState(false)
  const [assetFile, setAssetFile] = useState<File | null>(null)
  const [assetName, setAssetName] = useState('')
  const [assetCategory, setAssetCategory] = useState('general')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [previewAsset, setPreviewAsset] = useState<BrandAsset | null>(null)
  const [assetToDelete, setAssetToDelete] = useState<BrandAsset | null>(null)
  const [deletingAsset, setDeletingAsset] = useState(false)
  const [assetPage, setAssetPage] = useState(1)

  // Integrations collapsible advanced section
  const [showMigrationTools, setShowMigrationTools] = useState(false)

  // Site Content JSON Editor Modal
  const [editingContentPage, setEditingContentPage] = useState<string | null>(null)
  const [editingContentJson, setEditingContentJson] = useState('')
  const [loadingContentPage, setLoadingContentPage] = useState(false)
  const [savingContentPage, setSavingContentPage] = useState(false)
  const [contentJsonError, setContentJsonError] = useState<string | null>(null)

  const isAgent = portalRole === 'agent'

  useEffect(() => {
    if (propPortalRole) setPortalRole(propPortalRole)
  }, [propPortalRole])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('luxor-portal-theme')
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved)
      }
      setSidebarLayout(window.localStorage.getItem('luxor-portal-sidebar') === 'compact' ? 'compact' : 'expanded')
    }

    fetch('/api/portal/user-preferences')
      .then((res) => res.json())
      .then((data) => {
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
        if (data.portal_role === 'owner' || data.portal_role === 'admin' || data.portal_role === 'agent') {
          setPortalRole(data.portal_role)
        }
      })
      .catch((err) => console.error('Failed to sync settings from Supabase:', err))
      .finally(() => setLoadingPreferences(false))
  }, [])

  useEffect(() => {
    if (!isAgent) void fetchAssets()
  }, [isAgent])

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

  const handleUpdateTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    window.localStorage.setItem('luxor-portal-theme', newTheme)
    document.cookie = `luxor-portal-theme=${newTheme}; path=/; max-age=31536000; samesite=lax`
    window.dispatchEvent(new Event('luxor-portal-theme'))

    fetch('/api/portal/user-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme }),
    }).catch((err) => console.error('Failed to sync theme to Supabase:', err))

    notify({ title: `Switched to ${newTheme} theme.`, variant: 'success' })
  }

  const handleUpdateSidebarLayout = (layout: 'expanded' | 'compact') => {
    setSidebarLayout(layout)
    window.localStorage.setItem('luxor-portal-sidebar', layout)
    document.cookie = `luxor-portal-sidebar=${layout}; path=/; max-age=31536000; samesite=lax`
    window.dispatchEvent(new Event('luxor-portal-sidebar'))
    notify({ title: `Sidebar switched to ${layout} view.`, variant: 'success' })
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
        body: formData,
      })

      if (res.ok) {
        notify({ title: 'Brand asset uploaded.', variant: 'success' })
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

  const confirmDeleteAsset = async () => {
    if (!assetToDelete) return
    setDeletingAsset(true)
    try {
      const res = await fetch(`/api/portal/brand-assets?id=${encodeURIComponent(assetToDelete.id)}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        notify({ title: 'Brand asset deleted.', variant: 'success' })
        const remainingCount = assets.filter((a) => a.id !== assetToDelete.id).length
        setAssets((prev) => prev.filter((a) => a.id !== assetToDelete.id))
        setAssetPage((page) => Math.min(page, Math.max(1, Math.ceil(remainingCount / ASSETS_PER_PAGE))))
        setAssetToDelete(null)
      } else {
        throw new Error('Deletion failed')
      }
    } catch {
      notify({ title: 'Failed to delete asset.', variant: 'error' })
    } finally {
      setDeletingAsset(false)
    }
  }

  const handleCopyUrl = (id: string, url: string) => {
    void navigator.clipboard.writeText(url)
    setCopiedId(id)
    notify({ title: 'Asset URL copied to clipboard.', variant: 'success' })
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSaveProfile = async () => {
    const cleanName = displayName.trim()
    const cleanTitle = roleTitle.trim()
    if (!cleanName) {
      notify({ title: 'Enter your sender name before saving.', variant: 'error' })
      return
    }
    if (!cleanTitle) {
      notify({ title: 'Enter your title before saving.', variant: 'error' })
      return
    }

    setSavingProfile(true)
    try {
      const res = await fetch('/api/portal/user-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme,
          display_name: cleanName,
          role_title: cleanTitle,
          avatar_url: avatarUrl,
        }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to save profile.')
      }

      notify({ title: 'Profile saved.', variant: 'success' })
      window.dispatchEvent(new Event('luxor:profile-updated'))
    } catch (err) {
      notify({ title: err instanceof Error ? err.message : 'Unable to save profile.', variant: 'error' })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSaveNotifications = async () => {
    setSavingNotifications(true)
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
        throw new Error(payload.error || 'Failed to save notification recipients.')
      }

      notify({ title: 'Notification recipients saved.', variant: 'success' })
    } catch (err) {
      notify({
        title: err instanceof Error ? err.message : 'Unable to save notification recipients.',
        variant: 'error',
      })
    } finally {
      setSavingNotifications(false)
    }
  }

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

  const openContentEditor = async (pageName: string) => {
    setEditingContentPage(pageName)
    setEditingContentJson('')
    setContentJsonError(null)
    setLoadingContentPage(true)
    try {
      const res = await fetch(`/api/public/content?page=${encodeURIComponent(pageName)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load page content.')
      setEditingContentJson(JSON.stringify(json, null, 2))
    } catch (err) {
      setContentJsonError(err instanceof Error ? err.message : 'Could not load page content.')
    } finally {
      setLoadingContentPage(false)
    }
  }

  const saveContentEditor = async () => {
    if (!editingContentPage) return
    let parsed: unknown
    try {
      parsed = JSON.parse(editingContentJson)
      setContentJsonError(null)
    } catch {
      setContentJsonError('Please enter valid JSON before saving.')
      return
    }

    setSavingContentPage(true)
    try {
      const res = await fetch('/api/portal/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_name: editingContentPage, content: parsed }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Could not save page content.')
      notify({ title: `${editingContentPage} page content updated.`, variant: 'success' })
      setEditingContentPage(null)
    } catch (err) {
      setContentJsonError(err instanceof Error ? err.message : 'Could not save page content.')
    } finally {
      setSavingContentPage(false)
    }
  }

  const ASSETS_PER_PAGE = 6
  const assetPageCount = Math.max(1, Math.ceil(assets.length / ASSETS_PER_PAGE))
  const visibleAssets = assets.slice((assetPage - 1) * ASSETS_PER_PAGE, assetPage * ASSETS_PER_PAGE)

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || ''

  return (
    <div className={`w-full ${isModal ? '' : 'max-w-3xl'} space-y-5`}>
      <PortalTabTransition activeKey={activeTab} className="space-y-5">
        {/* VENUE INFORMATION */}
        {activeTab === 'business' && (
          <div className="space-y-5">
            <section className={`${CARD_CLASS} space-y-4`}>
              <div>
                <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Venue details</h3>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                  Public business details displayed across your website and emails.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Venue name', 'Luxor at Las Palmas Events'],
                  ['City', 'San Antonio, Texas'],
                  ['Address', LUXOR_VENUE_ADDRESS],
                  ['Primary mailbox', 'booking@luxoratlaspalmas.com'],
                  ['Website', 'www.luxoratlaspalmas.com'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className={`min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3.5 ${
                      label === 'Address' || label === 'Primary mailbox' || label === 'Website' ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <p className="text-xs font-medium text-[color:var(--portal-muted)]">{label}</p>
                    <p title={value} className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className={CARD_CLASS}>
              <PortalPhoneRoleSettings mode="venue" />
            </section>

            <PortalPaymentSettings />
          </div>
        )}

        {/* BRANDING & APPEARANCE */}
        {activeTab === 'branding' && (
          <div className="space-y-5">
            {/* Appearance Settings (first per blueprint) */}
            <section className={`${CARD_CLASS} space-y-5`}>
              <div>
                <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Workspace appearance</h3>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                  Choose your portal theme and navigation layout.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleUpdateTheme('light')}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-colors cursor-pointer ${
                    theme === 'light'
                      ? 'border-[#caa24c] bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#f1d27a]'
                      : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  <Sun size={18} className={theme === 'light' ? 'text-[#a8792f] dark:text-[#caa24c]' : 'text-[color:var(--portal-muted)]'} />
                  <span className="text-xs font-bold">Light mode</span>
                  <span className="text-xs text-[color:var(--portal-muted)]">Bright daylight workspace</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateTheme('dark')}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-colors cursor-pointer ${
                    theme === 'dark'
                      ? 'border-[#caa24c] bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#f1d27a]'
                      : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  <Moon size={18} className={theme === 'dark' ? 'text-[#a8792f] dark:text-[#caa24c]' : 'text-[color:var(--portal-muted)]'} />
                  <span className="text-xs font-bold">Dark mode</span>
                  <span className="text-xs text-[color:var(--portal-muted)]">Low-glare evening workspace</span>
                </button>
              </div>

              <div className="space-y-3 border-t border-[color:var(--portal-border)] pt-4">
                <p className="text-xs font-medium text-[color:var(--portal-muted)]">Sidebar layout on this browser</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleUpdateSidebarLayout('expanded')}
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-colors cursor-pointer ${
                      sidebarLayout === 'expanded'
                        ? 'border-[#caa24c] bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#f1d27a]'
                        : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]'
                    }`}
                  >
                    <PanelLeftOpen size={18} className={sidebarLayout === 'expanded' ? 'text-[#a8792f] dark:text-[#caa24c]' : 'text-[color:var(--portal-muted)]'} />
                    <span className="text-xs font-bold">Expanded</span>
                    <span className="text-xs text-[color:var(--portal-muted)]">Show icons and labels</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateSidebarLayout('compact')}
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-colors cursor-pointer ${
                      sidebarLayout === 'compact'
                        ? 'border-[#caa24c] bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#f1d27a]'
                        : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]'
                    }`}
                  >
                    <PanelLeftClose size={18} className={sidebarLayout === 'compact' ? 'text-[#a8792f] dark:text-[#caa24c]' : 'text-[color:var(--portal-muted)]'} />
                    <span className="text-xs font-bold">Compact</span>
                    <span className="text-xs text-[color:var(--portal-muted)]">More room for work</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3">
                <p className="text-xs text-[color:var(--portal-muted)]">Check layout spacing on mobile screens</p>
                <PortalButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/portal/settings?viewport-diagnostics=1', { scroll: false })}
                >
                  Open viewport check
                </PortalButton>
              </div>
            </section>

            {/* Brochure & Brand Assets */}
            {!isAgent ? (
              <section className={`${CARD_CLASS} space-y-6`}>
                <BrochureSettings />

                <div className="space-y-4">
                  <div>
                    <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Brand assets</h3>
                    <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                      Upload logos and images to reuse inside emails and campaigns.
                    </p>
                  </div>

                  {/* Upload Form */}
                  <div className="space-y-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                    <p className="text-xs font-semibold text-[color:var(--portal-text)]">Upload new asset</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Image file</span>
                        <label className="relative flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-center transition-colors hover:border-[#caa24c]/45 focus-within:border-[#caa24c]/50 focus-within:ring-2 focus-within:ring-[#caa24c]/15">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                const f = e.target.files[0]
                                setAssetFile(f)
                                const base = f.name.substring(0, f.name.lastIndexOf('.')) || f.name
                                setAssetName(base.replace(/[^a-zA-Z0-9\s-_]/g, ' '))
                              }
                            }}
                            className="sr-only"
                          />
                          <Upload size={16} className="mb-1.5 text-[#a8792f] dark:text-[#caa24c]" />
                          <span className="max-w-full truncate px-2 text-xs font-medium text-[color:var(--portal-text)]">
                            {assetFile ? assetFile.name : 'Choose image…'}
                          </span>
                        </label>
                      </div>

                      <div className="space-y-3">
                        <label className="block space-y-1.5">
                          <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Asset name</span>
                          <input
                            type="text"
                            value={assetName}
                            onChange={(e) => setAssetName(e.target.value)}
                            placeholder="e.g. Gold header logo"
                            className={INPUT_CLASS}
                          />
                        </label>
                        <div className="space-y-1.5">
                          <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Category</span>
                          <PortalSelect
                            value={assetCategory}
                            options={ASSET_CATEGORIES}
                            onChange={setAssetCategory}
                            aria-label="Asset category"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <PortalButton
                        type="button"
                        variant="primary"
                        onClick={handleUploadAsset}
                        disabled={uploading || !assetFile || !assetName.trim()}
                        className="w-full sm:w-auto"
                      >
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {uploading ? 'Uploading…' : 'Upload brand asset'}
                      </PortalButton>
                    </div>
                  </div>

                  {/* Library grid */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-sans text-sm font-semibold text-[color:var(--portal-text)]">Asset library</h4>
                      {assets.length > 0 ? (
                        <span className="text-xs tabular-nums text-[color:var(--portal-muted)]">
                          {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
                        </span>
                      ) : null}
                    </div>

                    <PortalSkeletonTransition
                      loading={loadingAssets}
                      overlap
                      skeleton={
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {[0, 1, 2].map((index) => (
                            <div
                              key={index}
                              className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]"
                            >
                              <div className="aspect-[4/3] w-full bg-[color:var(--portal-card)] p-4">
                                <PortalSkeleton className="h-full w-full rounded-xl" />
                              </div>
                              <div className="flex items-center gap-2.5 border-t border-[color:var(--portal-border)] p-3">
                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <PortalSkeleton className="h-3.5 w-28 rounded-md" />
                                  <PortalSkeleton className="h-4 w-20 rounded-md" />
                                </div>
                                <PortalSkeleton className="h-8 w-8 rounded-xl" />
                              </div>
                            </div>
                          ))}
                        </div>
                      }
                    >
                      {assets.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-[color:var(--portal-border)] py-6 text-center text-xs text-[color:var(--portal-muted)]">
                          No assets uploaded yet.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {visibleAssets.map((asset) => (
                            <div
                              key={asset.id}
                              className="group overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] transition-colors hover:border-[#caa24c]/40"
                            >
                              <button
                                type="button"
                                onClick={() => setPreviewAsset(asset)}
                                className="relative block aspect-[4/3] w-full overflow-hidden bg-[color:var(--portal-card)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/60"
                              >
                                <img
                                  src={asset.url}
                                  alt={asset.name}
                                  className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03]"
                                />
                              </button>

                              <div className="flex items-center gap-2.5 border-t border-[color:var(--portal-border)] p-3">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold text-[color:var(--portal-text)]">{asset.name}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <PortalStatusBadge status={asset.category} borderless />
                                    <span className="text-[11px] tabular-nums text-[color:var(--portal-muted)]">
                                      {new Date(asset.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                  <PortalGhostIconButton
                                    onClick={() => handleCopyUrl(asset.id, asset.url)}
                                    title="Copy image URL"
                                    aria-label={`Copy URL for ${asset.name}`}
                                  >
                                    {copiedId === asset.id ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} />}
                                  </PortalGhostIconButton>
                                  <PortalGhostIconButton
                                    onClick={() => setAssetToDelete(asset)}
                                    title="Delete asset"
                                    aria-label={`Delete ${asset.name}`}
                                    className="hover:!text-red-500"
                                  >
                                    <Trash2 size={14} />
                                  </PortalGhostIconButton>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </PortalSkeletonTransition>

                    {assets.length > ASSETS_PER_PAGE ? (
                      <div className="flex items-center justify-between border-t border-[color:var(--portal-border)] pt-3">
                        <span className="text-xs tabular-nums text-[color:var(--portal-muted)]">
                          Page {assetPage} of {assetPageCount}
                        </span>
                        <PortalPagination
                          currentPage={assetPage}
                          totalPages={assetPageCount}
                          onPageChange={setAssetPage}
                          scrollToTop={false}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                <BrandAssetLightbox asset={previewAsset} onClose={() => setPreviewAsset(null)} />
              </section>
            ) : null}

            {/* Condensed Brand Reference */}
            {!isAgent ? (
              <section className={`${CARD_CLASS} space-y-3`}>
                <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Brand reference</h3>
                <div className="divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-xs">
                  <div className="flex items-center justify-between gap-3 py-3">
                    <span className="font-medium text-[color:var(--portal-muted)]">Primary gold</span>
                    <span className="inline-flex items-center gap-2 font-mono font-semibold text-[#a8792f] dark:text-[#f1d27a]">
                      <span className="h-3 w-3 rounded-full bg-[#caa24c]" aria-hidden="true" />
                      #CAA24C
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <span className="font-medium text-[color:var(--portal-muted)]">Typography</span>
                    <span className="font-semibold text-[color:var(--portal-text)]">Cormorant Garamond · Manrope</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="font-medium text-[color:var(--portal-muted)]">Tagline</span>
                    <span className="font-semibold text-[color:var(--portal-text)]">ELEGANT SPACES. UNFORGETTABLE EVENTS.</span>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        )}

        {/* NOTIFICATION PREFERENCES */}
        {activeTab === 'notifications' && (
          <div className="space-y-5">
            <PortalPushNotifications />

            {!isAgent ? (
              <section className={`${CARD_CLASS} space-y-4`}>
                <div>
                  <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Email alert recipients</h3>
                  <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                    Addresses that receive new inquiry and booking alerts.
                  </p>
                </div>

                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[color:var(--portal-muted)]">
                    Recipient emails (comma-separated)
                  </span>
                  <PortalSkeletonTransition
                    loading={loadingPreferences}
                    overlap
                    skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                  >
                    <input
                      type="text"
                      value={notificationEmails}
                      onChange={(e) => setNotificationEmails(e.target.value)}
                      placeholder="booking@luxoratlaspalmas.com"
                      className={INPUT_CLASS}
                    />
                  </PortalSkeletonTransition>
                  <span className="block text-xs text-[color:var(--portal-muted)]">
                    New inquiry alerts send automatically; tour emails can be queued from the Calendar or client record.
                  </span>
                </label>

                <div className="flex justify-end pt-1">
                  <PortalButton
                    type="button"
                    variant="primary"
                    disabled={loadingPreferences || savingNotifications}
                    onClick={() => void handleSaveNotifications()}
                    className="w-full sm:w-auto"
                  >
                    {savingNotifications ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {savingNotifications ? 'Saving…' : 'Save recipients'}
                  </PortalButton>
                </div>
              </section>
            ) : null}
          </div>
        )}

        {/* TEAM & PERMISSIONS */}
        {activeTab === 'team' && (
          <div className="space-y-5">
            <section className={`${CARD_CLASS} space-y-5`}>
              <div>
                <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Your profile</h3>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                  Shown in the portal header and your outgoing email signatures.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <PortalSkeletonTransition
                  loading={loadingPreferences}
                  overlap
                  className="shrink-0"
                  skeleton={<PortalSkeleton className="h-20 w-20 rounded-full" />}
                >
                  <div
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 bg-gradient-to-br from-[#f1d27a] via-[#caa24c] to-[#9b6d24] bg-cover bg-center font-serif text-xl font-bold text-[#18130d] shadow-md"
                    style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
                  >
                    {avatarUrl ? (
                      <span className="sr-only">{displayName || 'Profile photo'}</span>
                    ) : (
                      initials || <UserRound size={24} />
                    )}
                  </div>
                </PortalSkeletonTransition>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex min-h-8.5 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/30 hover:bg-[color:var(--portal-border)]/40 focus-within:ring-2 focus-within:ring-[#caa24c]/40">
                      {uploadingProfileImage ? (
                        <Loader2 size={14} className="animate-spin text-[#a8792f]" />
                      ) : (
                        <Camera size={14} className="text-[#a8792f] dark:text-[#caa24c]" />
                      )}
                      {uploadingProfileImage ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Add photo'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={uploadingProfileImage || loadingPreferences}
                        onChange={(event) => void handleProfileImageUpload(event.target.files?.[0])}
                      />
                    </label>
                    {avatarUrl ? (
                      <PortalButton type="button" variant="ghost" size="sm" onClick={() => setAvatarUrl(null)}>
                        Remove photo
                      </PortalButton>
                    ) : null}
                  </div>
                  <p className="text-xs text-[color:var(--portal-muted)]">Square JPG, PNG, or WebP.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Sender name</span>
                  <PortalSkeletonTransition
                    loading={loadingPreferences}
                    overlap
                    skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                  >
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      maxLength={100}
                      placeholder="Your full name"
                      className={INPUT_CLASS}
                    />
                  </PortalSkeletonTransition>
                </label>
                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Title</span>
                  <PortalSkeletonTransition
                    loading={loadingPreferences}
                    overlap
                    skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                  >
                    <input
                      value={roleTitle}
                      onChange={(event) => setRoleTitle(event.target.value)}
                      maxLength={120}
                      placeholder="Owner & Managing Director"
                      className={INPUT_CLASS}
                    />
                  </PortalSkeletonTransition>
                </label>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Signed-in email</span>
                <PortalSkeletonTransition
                  loading={loadingPreferences}
                  overlap
                  skeleton={<PortalSkeleton className="h-10 w-full rounded-xl" />}
                >
                  <div className="flex min-h-10 items-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 text-sm text-[color:var(--portal-muted)]">
                    {profileEmail || 'Not signed in'}
                  </div>
                </PortalSkeletonTransition>
              </div>

              <div className="flex justify-end border-t border-[color:var(--portal-border)] pt-4">
                <PortalButton
                  type="button"
                  variant="primary"
                  disabled={loadingPreferences || savingProfile}
                  onClick={() => void handleSaveProfile()}
                  className="w-full sm:w-auto"
                >
                  {savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {savingProfile ? 'Saving…' : 'Save profile'}
                </PortalButton>
              </div>
            </section>

            <section className={CARD_CLASS}>
              {!isAgent ? (
                <PortalPhoneRoleSettings mode="profile" />
              ) : (
                <div className="space-y-1.5">
                  <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Call access</h3>
                  <p className="text-xs text-[color:var(--portal-muted)]">
                    Your calling line is managed by an administrator. Contact your owner or admin if it needs updating.
                  </p>
                </div>
              )}
            </section>

            {!isAgent ? (
              <section className={CARD_CLASS}>
                <TeamAccessManager />
              </section>
            ) : null}
          </div>
        )}

        {/* ELENA AI */}
        {activeTab === 'elena' && <ElenaSettingsManager />}

        {/* INTEGRATIONS */}
        {activeTab === 'integrations' && (
          <div className="space-y-5">
            <section className={`${CARD_CLASS} space-y-4`}>
              <div>
                <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Phone numbers &amp; call routing</h3>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                  Manage Luxor phone numbers for browser calling and text messages.
                </p>
              </div>
              <TwilioNumberManager />
            </section>

            <MailProviderSettings />

            <CalendarReplyReview />

            <section className={CARD_CLASS}>
              <button
                type="button"
                aria-expanded={showMigrationTools}
                onClick={() => setShowMigrationTools((open) => !open)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Migration &amp; invite testing</h3>
                  <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                    Import legacy Zoho mail history and test calendar invitations.
                  </p>
                </div>
                <ChevronDown
                  size={18}
                  className={`shrink-0 text-[color:var(--portal-muted)] transition-transform duration-200 ${
                    showMigrationTools ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showMigrationTools ? (
                <div className="mt-5 space-y-5 border-t border-[color:var(--portal-border)] pt-5">
                  <MailMigrationSettings />
                  <CustomCalendarInviteTester defaultRecipientEmail={profileEmail} />
                </div>
              ) : null}
            </section>
          </div>
        )}

        {/* PROMOTIONS */}
        {activeTab === 'promotions' && <PromotionManager />}

        {/* PRICING */}
        {activeTab === 'pricing' && !isAgent && <ProposalPricingManager />}

        {/* SITE CONTENT */}
        {activeTab === 'content' && (
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => onSelectTab('pricing')}
              className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[#caa24c]/30 bg-[#caa24c]/10 p-4 text-left transition-colors hover:bg-[#caa24c]/15"
            >
              <span>
                <span className="block text-sm font-bold text-[color:var(--portal-text)]">
                  Pricing is managed in one catalog
                </span>
                <span className="mt-0.5 block text-xs text-[color:var(--portal-muted)]">
                  Update rental rates, deposits, and line items in Pricing &amp; line items.
                </span>
              </span>
              <ChevronRight size={17} className="shrink-0 text-[#a8792f] dark:text-[#caa24c]" />
            </button>

            <section className={`${CARD_CLASS} space-y-4`}>
              <div>
                <h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Public page records</h3>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                  Edit the saved content JSON for public website pages.
                </p>
              </div>

              <div className="divide-y divide-[color:var(--portal-border)] overflow-hidden rounded-xl border border-[color:var(--portal-border)]">
                {['home', 'events', 'gallery', 'spaces', 'visit'].map((pageName) => (
                  <div
                    key={pageName}
                    className="flex flex-col gap-3 bg-[color:var(--portal-soft)]/35 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold capitalize text-[color:var(--portal-text)]">{pageName} page</p>
                      <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                        Saved content record for /{pageName === 'home' ? '' : pageName}
                      </p>
                    </div>
                    <PortalButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void openContentEditor(pageName)}
                      className="w-full shrink-0 sm:w-auto"
                    >
                      Edit content
                    </PortalButton>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* BUSINESS HOURS */}
        {activeTab === 'hours' && (
          <section className={CARD_CLASS}>
            <TourAvailabilityManager />
          </section>
        )}
      </PortalTabTransition>

      {/* Delete Brand Asset Confirmation Modal */}
      <PortalModal
        isOpen={Boolean(assetToDelete)}
        onClose={() => !deletingAsset && setAssetToDelete(null)}
        maxWidth="max-w-md"
        title="Delete brand asset"
        description="This removes the image from your library and storage."
        footer={
          <div className="flex justify-end gap-2.5">
            <PortalButton
              type="button"
              variant="secondary"
              disabled={deletingAsset}
              onClick={() => setAssetToDelete(null)}
            >
              Cancel
            </PortalButton>
            <PortalButton
              type="button"
              variant="danger"
              disabled={deletingAsset}
              onClick={() => void confirmDeleteAsset()}
            >
              {deletingAsset ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {deletingAsset ? 'Deleting…' : 'Delete asset'}
            </PortalButton>
          </div>
        }
      >
        <p className="text-sm text-[color:var(--portal-text)]">
          Are you sure you want to delete <span className="font-semibold">{assetToDelete?.name}</span>?
        </p>
      </PortalModal>

      {/* Site Content JSON Editor Modal */}
      <PortalModal
        isOpen={Boolean(editingContentPage)}
        onClose={() => !savingContentPage && setEditingContentPage(null)}
        maxWidth="max-w-2xl"
        title={editingContentPage ? `Edit ${editingContentPage} page content` : 'Edit page content'}
        description="Update the structured JSON record stored for this page."
        footer={
          <div className="flex justify-end gap-2.5">
            <PortalButton
              type="button"
              variant="secondary"
              disabled={savingContentPage}
              onClick={() => setEditingContentPage(null)}
            >
              Cancel
            </PortalButton>
            <PortalButton
              type="button"
              variant="primary"
              disabled={loadingContentPage || savingContentPage}
              onClick={() => void saveContentEditor()}
            >
              {savingContentPage ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {savingContentPage ? 'Saving…' : 'Save content'}
            </PortalButton>
          </div>
        }
      >
        <PortalSkeletonTransition
          loading={loadingContentPage}
          overlap
          skeleton={<PortalSkeleton className="min-h-64 w-full rounded-xl" />}
        >
          <div className="space-y-3">
            <textarea
              value={editingContentJson}
              onChange={(event) => {
                setEditingContentJson(event.target.value)
                if (contentJsonError) setContentJsonError(null)
              }}
              rows={14}
              spellCheck={false}
              aria-label="Page content JSON"
              className="portal-scrollbar min-h-64 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3.5 font-mono text-xs leading-5 text-[color:var(--portal-text)] outline-none transition-colors focus:border-[#caa24c]/50 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#caa24c]/15"
            />
            {contentJsonError ? (
              <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-300">
                {contentJsonError}
              </p>
            ) : null}
          </div>
        </PortalSkeletonTransition>
      </PortalModal>
    </div>
  )
}
