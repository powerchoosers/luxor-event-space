'use client'

import React, { useState, useEffect, Suspense, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Wrench,
  DollarSign,
  Package,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Building,
  Users,
  Eye,
  FileText,
  Calendar,
  Sparkles,
  Zap,
  TrendingUp,
  Droplet,
  Trash2,
  Clock,
  Plus,
  ChevronRight,
  Upload,
  Loader2
} from '@/lib/icons/phosphor-compat'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalAnimatedTabs,
  PortalMobileTabPicker,
  PortalMobileTabTrigger,
  PortalTabTransition,
  PortalTableCard,
  PortalStickyTable,
  PortalStickyThead,
  PortalModal,
  PortalDatePicker,
  PortalSelect,
  PortalButton,
  PortalCardSkeleton,
  PortalTableSkeleton,
  PortalStaggerGroup,
  PortalStaggerCard,
  PortalFilterBar,
  PortalStatusBadge,
} from '@/components/portal/PortalUI'
import {
  PortalBulkActionDeck,
  PortalBulkConfirmDialog,
  PortalBulkHeaderSelector,
  PortalBulkRowSelector,
  usePortalBulkSelection,
} from '@/components/portal/PortalBulkSelection'
import type { LuxorBill, LuxorInventoryItem, LuxorVendor, LuxorUtilityReading, LuxorCleaningLog, LuxorMaintenanceTask } from '@/app/api/operations/route'
import type { LuxorBillIntake } from '@/lib/luxorInquiryTypes'
import { BillsPayableLedger } from '@/components/portal/BillsPayableLedger'
import ExpenseManagement from '@/components/portal/expenses/ExpenseManagement'
import { OperationsArchivePanel } from '@/components/portal/OperationsArchivePanel'
import { LUXOR_BILL_CATEGORIES, isLuxorBillCategory, type LuxorBillCategory } from '@/lib/luxorBillCategories'
import { useToast } from '@/components/portal/ToastProvider'
import { getPortalSupabaseClient } from '@/lib/supabaseClient'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import { MagicCard } from '@/components/ui/magic-card'
import { OperationsLoadingSkeleton } from '@/app/(portal)/portal/operations/OperationsLoadingSkeleton'
import { NeedsAttentionNow } from '@/components/portal/NeedsAttentionNow'

type SubTab =
  | 'dashboard'
  | 'bills'
  | 'maintenance'
  | 'inventory'
  | 'vendors'
  | 'utilities'
  | 'cleaning'
  | 'staff'

type ReadinessTask = {
  id: string
  label: string
  checked: boolean
}

const READINESS_STORAGE_KEY = 'luxor-operations-readiness-checklist-v1'

const PREFERRED_VENDOR_TYPE_OPTIONS = [
  { value: 'Venue Maintenance', label: 'Venue Maintenance' },
  { value: 'Utilities', label: 'Utilities' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Event Rentals', label: 'Event Rentals' },
  { value: 'Decor', label: 'Decor' },
  { value: 'Entertainment', label: 'Entertainment' },
  { value: 'Catering', label: 'Catering' },
  { value: 'Cleaning', label: 'Cleaning' },
  { value: 'Security', label: 'Security' },
  { value: 'Technology', label: 'Technology' },
  { value: 'Professional Services', label: 'Professional Services' },
  { value: 'Other', label: 'Other' },
  { value: 'DJs & Music', label: 'DJs & Music' },
  { value: 'Fine Caterers', label: 'Fine Caterers' },
  { value: 'Security Crew', label: 'Security Crew' },
  { value: 'Florist Services', label: 'Florist Services' },
  { value: 'Rentals & Decor', label: 'Rentals & Decor' },
  { value: 'Valet Service', label: 'Valet Service' },
  { value: 'Bartenders', label: 'Bartenders' },
  { value: 'Photographers', label: 'Photographers' },
  { value: 'Makeup Artist', label: 'Makeup Artist' },
] as const

const portalVendorFieldClass =
  'w-full min-h-10 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45 focus:ring-2 focus:ring-[#caa24c]/10'

const operationsTabs: Array<{ id: SubTab; label: string; icon: React.ReactNode; description: string; group: string }> = [
  { id: 'dashboard', label: 'Operations Dashboard', icon: <Activity size={15} />, description: 'Facility readiness, alerts, and operational KPIs', group: 'Overview & Facility' },
  { id: 'maintenance', label: 'Maintenance Log', icon: <Wrench size={15} />, description: 'Facility work orders, repairs, and scheduled upkeep', group: 'Overview & Facility' },
  { id: 'inventory', label: 'Inventory Counts', icon: <Package size={15} />, description: 'Tables, chairs, linens, audio gear, and decor stock', group: 'Logistics & Supplies' },
  { id: 'vendors', label: 'Preferred Vendors', icon: <Users size={15} />, description: 'Approved caterers, florists, DJs, and security partners', group: 'Logistics & Supplies' },
  { id: 'utilities', label: 'Utility Sensors', icon: <Zap size={15} />, description: 'Real-time power, water, HVAC, and ambient readings', group: 'Facility & Environment' },
  { id: 'cleaning', label: 'Cleaning Checklists', icon: <Sparkles size={15} />, description: 'Sanitation rota, turn-down status, and audit logs', group: 'Facility & Environment' },
  { id: 'staff', label: 'Staff Rota', icon: <Clock size={15} />, description: 'Shift assignments, coordinator on-duty, and team schedule', group: 'Team & Staffing' },
]

type EditFormData = {
  id?: string
  service?: string
  provider?: string
  amount?: number | string
  amount_state?: 'known' | 'unknown' | 'variable' | null
  bill_category?: LuxorBillCategory | null
  frequency?: string
  due_date?: string | null
  status?: string
  title?: string
  description?: string | null
  priority?: string
  category?: 'furniture' | 'supplies' | 'decor' | 'other'
  name?: string
  count?: number
  unit?: string
  vendor_type?: string
  email?: string | null
  phone?: string | null
  rating?: string | null
  coi_active?: boolean
}

export default function OperationsPage() {
  return (
    <Suspense fallback={<OperationsLoadingSkeleton />}>
      <OperationsPageContent />
    </Suspense>
  )
}
export function OperationsPageContent({ embeddedBills = false }: { embeddedBills?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { notify, dismiss } = useToast()
  const tabParam = searchParams.get('tab') as SubTab | null
  const activeTab = embeddedBills ? 'bills' : tabParam || 'dashboard'
  const [isViewPickerOpen, setIsViewPickerOpen] = useState(false)

  useEffect(() => {
    if (!embeddedBills && tabParam === 'bills') {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('tab')
      params.set('view', 'bill-review')
      router.replace(`/portal/finances?${params.toString()}`, { scroll: false })
    }
  }, [embeddedBills, tabParam, searchParams, router])

  // Remember and restore the last visited tab
  useEffect(() => {
    if (embeddedBills) return
    if (tabParam && operationsTabs.some((t) => t.id === tabParam)) {
      try {
        window.localStorage.setItem('luxor-portal-operations-last-tab', tabParam)
      } catch {}
    } else if (!tabParam) {
      try {
        const saved = window.localStorage.getItem('luxor-portal-operations-last-tab')
        if (saved && operationsTabs.some((t) => t.id === saved) && saved !== 'dashboard') {
          router.replace(`/portal/operations?tab=${saved}`, { scroll: false })
        }
      } catch {}
    }
  }, [tabParam, router, embeddedBills])

  // Database states
  const [bills, setBills] = useState<LuxorBill[]>([])
  const [billExpenseId, setBillExpenseId] = useState<string | null>(null)
  const [importBillId, setImportBillId] = useState<string | null>(null)
  const [billRefreshKey, setBillRefreshKey] = useState(0)
  const [billIntakes, setBillIntakes] = useState<LuxorBillIntake[]>([])
  const [invoiceAnalysisConfigured, setInvoiceAnalysisConfigured] = useState<boolean | null>(null)
  const [resendReceivingConfigured, setResendReceivingConfigured] = useState<boolean | null>(null)
  const [inventory, setInventory] = useState<LuxorInventoryItem[]>([])
  const [vendors, setVendors] = useState<LuxorVendor[]>([])
  const [utilities, setUtilities] = useState<LuxorUtilityReading[]>([])
  const [cleaningLogs, setCleaningLogs] = useState<LuxorCleaningLog[]>([])
  const [maintenanceTasks, setMaintenanceTasks] = useState<LuxorMaintenanceTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals state
  const [isBillModalOpen, setIsBillModalOpen] = useState(false)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false)
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false)

  // Edit / Delete states
  const [editingItem, setEditingItem] = useState<{
    type: 'bill' | 'task' | 'inventory' | 'vendor'
    data: LuxorBill | LuxorMaintenanceTask | LuxorInventoryItem | LuxorVendor
  } | null>(null)
  const [editFormData, setEditFormData] = useState<EditFormData | null>(null)
  const [deletingItem, setDeletingItem] = useState<{ type: 'bill' | 'task' | 'inventory' | 'vendor'; id: string; name: string } | null>(null)
  const [submittingEdit, setSubmittingEdit] = useState(false)
  const [submittingDelete, setSubmittingDelete] = useState(false)
  const bulkSelection = usePortalBulkSelection<string>()
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  useEffect(() => {
    if (editingItem) {
      setEditFormData({ ...editingItem.data })
    } else {
      setEditFormData(null)
    }
  }, [editingItem])

  // Forms state
  const [billService, setBillService] = useState('')
  const [billProvider, setBillProvider] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billAmountState, setBillAmountState] = useState<'known' | 'unknown' | 'variable'>('known')
  const [billDueDate, setBillDueDate] = useState('')
  const [billFrequency, setBillFrequency] = useState('One-time')
  const [billCategory, setBillCategory] = useState<LuxorBillCategory>('Utilities')
  const [billVendorId, setBillVendorId] = useState('')
  const [billInvoiceNumber, setBillInvoiceNumber] = useState('')
  const [billIssueDate, setBillIssueDate] = useState('')
  const [billSaveBusy, setBillSaveBusy] = useState(false)
  const [billUploadFile, setBillUploadFile] = useState<File | null>(null)
  const [billUploadBusy, setBillUploadBusy] = useState(false)

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [taskDueDate, setTaskDueDate] = useState('')

  const [invCategory, setInvCategory] = useState('furniture')
  const [invName, setInvName] = useState('')
  const [invCount, setInvCount] = useState('')
  const [invUnit, setInvUnit] = useState('pcs')
  const [invStatus, setInvStatus] = useState('Good')

  const [vendorType, setVendorType] = useState('Utilities')
  const [vendorName, setVendorName] = useState('')
  const [vendorEmail, setVendorEmail] = useState('')
  const [vendorPhone, setVendorPhone] = useState('')
  const [vendorRating, setVendorRating] = useState('')
  const [vendorCoi, setVendorCoi] = useState('false')
  const [vendorSearchQuery, setVendorSearchQuery] = useState('')
  const [vendorTypeFilter, setVendorTypeFilter] = useState('all')

  // State for interactive features
  const [readinessTasks, setReadinessTasks] = useState<ReadinessTask[]>([])
  const [readinessInput, setReadinessInput] = useState('')
  const [readinessLoaded, setReadinessLoaded] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(READINESS_STORAGE_KEY)
      const parsed = stored ? JSON.parse(stored) : []
      if (Array.isArray(parsed)) {
        setReadinessTasks(parsed.filter((item): item is ReadinessTask => (
          typeof item?.id === 'string' && typeof item?.label === 'string' && typeof item?.checked === 'boolean'
        )))
      }
    } catch {
      setReadinessTasks([])
    } finally {
      setReadinessLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!readinessLoaded) return
    try {
      window.localStorage.setItem(READINESS_STORAGE_KEY, JSON.stringify(readinessTasks))
    } catch {
      // The checklist remains usable for the current session when browser storage is unavailable.
    }
  }, [readinessLoaded, readinessTasks])

  const loadOperationsData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      setError(null)
      const res = await fetch('/api/operations')
      if (!res.ok) throw new Error('Failed to load operations metrics.')
      const payload = await res.json()
      setBills(payload.bills || [])
      setBillIntakes(payload.billIntakes || [])
      setInvoiceAnalysisConfigured(typeof payload.invoiceAnalysisConfigured === 'boolean' ? payload.invoiceAnalysisConfigured : null)
      setResendReceivingConfigured(typeof payload.resendReceivingConfigured === 'boolean' ? payload.resendReceivingConfigured : null)
      setInventory(payload.inventory || [])
      setVendors(payload.vendors || [])
      setUtilities(payload.utilities || [])
      setCleaningLogs(payload.cleaning || [])
      setMaintenanceTasks(payload.tasks || [])
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Telemetry Alert: Operations offline.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOperationsData()
  }, [loadOperationsData])

  useEffect(() => {
    const supabase = getPortalSupabaseClient()
    if (!supabase) return
    let refreshTimer: number | null = null
    let active = true
    const scheduleRefresh = () => {
      if (refreshTimer !== null) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        void loadOperationsData(false)
      }, 250)
    }

    let channel: ReturnType<typeof supabase.channel> | null = null
    void fetch('/api/portal/realtime-config', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active || typeof data?.realtimeChannel !== 'string') return
        channel = supabase
          .channel(data.realtimeChannel)
          .on('broadcast', { event: 'email-arrived' }, scheduleRefresh)
          .on('broadcast', { event: 'email-status' }, scheduleRefresh)
          .on('broadcast', { event: 'bill-intake-updated' }, scheduleRefresh)
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn(`Operations realtime channel entered ${status}.`)
          })
      })
      .catch((error) => console.warn('Failed to connect operations realtime updates:', error))

    return () => {
      active = false
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [loadOperationsData])

  useEffect(() => {
    bulkSelection.clear()
  }, [activeTab, bulkSelection.clear])

  const bulkType = activeTab === 'bills' ? 'bill' : activeTab === 'maintenance' ? 'task' : activeTab === 'inventory' ? 'inventory' : activeTab === 'vendors' ? 'vendor' : null
  const activePreferredVendors = useMemo(
    () => vendors.filter((vendor) => vendor.vendor_type !== 'Service Company' && !vendor.archived_at),
    [vendors],
  )
  const vendorTypeFilterOptions = useMemo(() => {
    const types = new Set(activePreferredVendors.map((vendor) => vendor.vendor_type).filter(Boolean))
    return [
      { value: 'all', label: 'All vendor types' },
      ...Array.from(types).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })),
    ]
  }, [activePreferredVendors])
  const filteredPreferredVendors = useMemo(() => {
    const needle = vendorSearchQuery.trim().toLowerCase()
    return activePreferredVendors.filter((vendor) => {
      const matchesType = vendorTypeFilter === 'all' || vendor.vendor_type === vendorTypeFilter
      const haystack = [vendor.name, vendor.vendor_type, vendor.email, vendor.phone, vendor.rating]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return matchesType && (!needle || haystack.includes(needle))
    })
  }, [activePreferredVendors, vendorSearchQuery, vendorTypeFilter])
  const bulkRecords = bulkType === 'bill' ? bills : bulkType === 'task' ? maintenanceTasks : bulkType === 'inventory' ? inventory : bulkType === 'vendor' ? filteredPreferredVendors : []
  const bulkRecordIds = bulkRecords.map((record) => record.id)
  const bulkSelectedCount = bulkSelection.selectedCount(bulkRecordIds.length)

  const runOperationsBulkUpdate = async (updates: Record<string, unknown>, actionId: string) => {
    if (!bulkType) return
    const ids = bulkSelection.resolveIds(bulkRecordIds)
    if (!ids.length) return
    setBulkBusy(actionId)
    const updatedIds: string[] = []
    for (const id of ids) {
      const response = await fetch('/api/operations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: bulkType, id, ...updates }),
      })
      if (response.ok) updatedIds.push(id)
    }
    if (bulkType === 'bill') setBills((current) => current.map((record) => updatedIds.includes(record.id) ? { ...record, ...updates } as LuxorBill : record))
    if (bulkType === 'task') setMaintenanceTasks((current) => current.map((record) => updatedIds.includes(record.id) ? { ...record, ...updates } as LuxorMaintenanceTask : record))
    if (bulkType === 'inventory') setInventory((current) => current.map((record) => updatedIds.includes(record.id) ? { ...record, ...updates } as LuxorInventoryItem : record))
    if (bulkType === 'vendor') setVendors((current) => current.map((record) => updatedIds.includes(record.id) ? { ...record, ...updates } as LuxorVendor : record))
    bulkSelection.clear()
    setBulkBusy(null)
    if (updatedIds.length !== ids.length) notify({ title: 'Some records were not updated', description: `${updatedIds.length} of ${ids.length} records were updated. Reload the page before retrying the others.`, variant: 'warning', durationMs: 0 })
  }

  const deleteSelectedOperationsRecords = async () => {
    if (!bulkType) return
    const ids = bulkSelection.resolveIds(bulkRecordIds)
    if (!ids.length) return
    setBulkBusy('delete')
    const deletedIds: string[] = []
    for (const id of ids) {
      const response = await fetch(`/api/operations?type=${bulkType}&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (response.ok) deletedIds.push(id)
    }
    if (bulkType === 'bill') setBills((current) => current.filter((record) => !deletedIds.includes(record.id)))
    if (bulkType === 'task') setMaintenanceTasks((current) => current.filter((record) => !deletedIds.includes(record.id)))
    if (bulkType === 'inventory') setInventory((current) => current.filter((record) => !deletedIds.includes(record.id)))
    if (bulkType === 'vendor') setVendors((current) => current.filter((record) => !deletedIds.includes(record.id)))
    bulkSelection.clear()
    setConfirmBulkDelete(false)
    setBulkBusy(null)
    if (deletedIds.length !== ids.length) notify({ title: 'Some records were not deleted', description: `${deletedIds.length} of ${ids.length} records were deleted. Reload the page before retrying the others.`, variant: 'warning', durationMs: 0 })
  }

  const handleToggleReadinessTask = (id: string) => {
    setReadinessTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, checked: !t.checked } : t))
    )
  }

  const handleAddReadinessTask = (event: React.FormEvent) => {
    event.preventDefault()
    const label = readinessInput.trim()
    if (!label) return
    setReadinessTasks((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label, checked: false },
    ])
    setReadinessInput('')
  }

  const handleRemoveReadinessTask = (id: string) => {
    setReadinessTasks((current) => current.filter((task) => task.id !== id))
  }

  const clearCompletedReadinessTasks = () => {
    setReadinessTasks((current) => current.filter((task) => !task.checked))
  }

  const handleAddBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (billSaveBusy) return
    const service = billService.trim()
    const provider = billProvider.trim()
    if (!service || !provider) return
    if (billAmountState === 'known' && (billAmount === '' || !Number.isFinite(Number(billAmount)) || Number(billAmount) < 0)) return
    const draft = {
      service,
      provider,
      frequency: billFrequency,
      due_date: billDueDate || null,
      amount_state: billAmountState,
      amount: billAmountState === 'known' ? Number(billAmount) : null,
      bill_category: billCategory,
      vendor_id: billVendorId || null,
      invoice_number: billInvoiceNumber.trim() || null,
      issue_date: billIssueDate || null,
    }
    const fingerprint = JSON.stringify(draft)
    const storageKey = 'luxor-manual-bill-create'
    let requestId = crypto.randomUUID()
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as { id?: string; fingerprint?: string } | null
      if (saved?.fingerprint === fingerprint && saved.id) requestId = saved.id
    } catch { /* a fresh id is safe when stored state is unreadable */ }
    sessionStorage.setItem(storageKey, JSON.stringify({ id: requestId, fingerprint }))
    setBillSaveBusy(true)
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bill', client_request_id: requestId, status: 'unpaid', ...draft }),
      })
      const body = await res.json().catch(() => null) as { error?: string; id?: string; recurring_obligation?: string } | null
      if (!res.ok || !body?.id) throw new Error(body?.error || 'Failed to save bill.')
      sessionStorage.removeItem(storageKey)
      setBills((prev) => prev.some((bill) => bill.id === body.id) ? prev : [body as LuxorBill, ...prev])
      setIsBillModalOpen(false)
      if (body.recurring_obligation) notify({ title: 'Bill saved', description: `“${body.recurring_obligation}” is already a recurring expense for this vendor and category, so another recurring expense was not created.`, variant: 'info', durationMs: 0 })
      setBillService('')
      setBillProvider('')
      setBillAmount('')
      setBillAmountState('known')
      setBillDueDate('')
      setBillFrequency('One-time')
      setBillCategory('Utilities')
      setBillVendorId('')
      setBillInvoiceNumber('')
      setBillIssueDate('')
    } catch (err) {
      notify({ title: 'Bill could not be saved', description: err instanceof Error ? err.message : 'Save again with the same details to avoid a duplicate.', variant: 'error', durationMs: 0 })
    } finally {
      setBillSaveBusy(false)
    }
  }

  const monitorBillIntake = async (intakeId: string, toastId: string) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000))
      try {
        const response = await fetch('/api/operations', { cache: 'no-store' })
        if (!response.ok) continue
        const payload = await response.json()
        const intake = (payload.billIntakes || []).find((item: { id?: string }) => item.id === intakeId) as { status?: string } | undefined
        if (!intake || intake.status === 'received' || intake.status === 'processing') continue
        await loadOperationsData(false)
        dismiss(toastId)
        if (intake.status === 'failed') {
          notify({ title: 'Bill needs attention', description: 'AI intake could not finish. The upload is retained so it can be retried from the invoice queue.', variant: 'error' })
        } else if (intake.status === 'ignored') {
          notify({ title: 'Bill analysis stopped', description: 'The upload is retained. Open the invoice queue to review or retry it.', variant: 'warning' })
        } else if (intake.status === 'needs_review') {
          notify({ title: 'Bill ready for review', description: 'AI extracted the bill and flagged it for owner review before payment.', variant: 'warning' })
        } else if (intake.status === 'duplicate') {
          notify({ title: 'Duplicate bill detected', description: 'This upload matches a bill already in the payables ledger.', variant: 'info' })
        } else {
          notify({ title: 'Bill intake complete', description: 'AI extracted the bill and added it to the payables ledger.', variant: 'success' })
        }
        return
      } catch {
        // Leave the progress toast visible while the worker or a later poll recovers.
      }
    }
    dismiss(toastId)
    notify({ title: 'Bill intake is still processing', description: 'The worker is continuing in the background. The payables ledger will update automatically when it finishes.', variant: 'info' })
  }

  const handleBillUpload = async () => {
    if (!billUploadFile || billUploadBusy) return
    setBillUploadBusy(true)
    const toastId = notify({ title: 'Bill upload received', description: 'AI is extracting the vendor, amount, due date, and source evidence. You can keep working.', variant: 'info', durationMs: 0 })
    try {
      const form = new FormData()
      form.set('file', billUploadFile)
      const response = await fetch('/api/operations/bills/intake', { method: 'POST', body: form })
      const payload = await response.json().catch(() => ({})) as { intake?: { id?: string }; error?: string }
      if (!response.ok || !payload.intake?.id) throw new Error(payload.error || 'Bill upload could not be queued.')
      setBillUploadFile(null)
      setIsBillModalOpen(false)
      await loadOperationsData(false)
      setBillUploadBusy(false)
      void monitorBillIntake(payload.intake.id, toastId)
    } catch (error) {
      dismiss(toastId)
      notify({ title: 'Bill upload failed', description: error instanceof Error ? error.message : 'Bill upload could not be queued.', variant: 'error' })
      setBillUploadBusy(false)
    }
  }

  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskTitle) return
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'task',
          title: taskTitle,
          description: taskDescription,
          priority: taskPriority,
          due_date: taskDueDate
        })
      })
      if (!res.ok) throw new Error('Failed to save ticket.')
      const newTask = await res.json()
      setMaintenanceTasks((prev) => [newTask, ...prev])
      setIsTaskModalOpen(false)
      setTaskTitle('')
      setTaskDescription('')
      setTaskDueDate('')
    } catch (err) {
      notify({ title: 'Ticket could not be saved', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error', durationMs: 0 })
    }
  }

  const handleAddInventorySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invName || !invCount) return
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'inventory',
          category: invCategory,
          name: invName,
          count: Number(invCount),
          unit: invUnit,
          status: invStatus
        })
      })
      if (!res.ok) throw new Error('Failed to save inventory count.')
      const newInv = await res.json()
      setInventory((prev) => [newInv, ...prev])
      setIsInventoryModalOpen(false)
      setInvName('')
      setInvCount('')
    } catch (err) {
      notify({ title: 'Inventory count could not be saved', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error', durationMs: 0 })
    }
  }

  const handleAddVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vendorName) return
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vendor',
          vendor_type: vendorType,
          name: vendorName,
          email: vendorEmail,
          phone: vendorPhone,
          rating: vendorRating,
          coi_active: vendorCoi === 'true'
        })
      })
      if (!res.ok) throw new Error('Failed to save vendor profile.')
      const newVendor = await res.json()
      setVendors((prev) => [newVendor, ...prev])
      setIsVendorModalOpen(false)
      setVendorName('')
      setVendorEmail('')
      setVendorPhone('')
      setVendorRating('')
      setVendorCoi('false')
    } catch (err) {
      notify({ title: 'Provider could not be saved', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error', durationMs: 0 })
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem || !editFormData) return
    if (editingItem.type === 'bill' && editFormData.amount_state === 'known' && (editFormData.amount === '' || editFormData.amount == null || !Number.isFinite(Number(editFormData.amount)) || Number(editFormData.amount) < 0)) {
      notify({ title: 'Check the amount', description: 'Enter a valid amount, or choose unknown or variable.', variant: 'warning', durationMs: 0 })
      return
    }
    setSubmittingEdit(true)
    try {
      const payload = editingItem.type === 'bill' ? {
        type: 'bill', id: editingItem.data.id, expectedUpdatedAt: editingItem.data.updated_at, service: editFormData.service, provider: editFormData.provider,
        frequency: editFormData.frequency, due_date: editFormData.due_date || null, status: editFormData.status,
        bill_category: editFormData.bill_category || null,
        amount_state: editFormData.amount_state, ...(editFormData.amount_state === 'known' ? { amount: Number(editFormData.amount) } : {}),
      } : {
        type: editingItem.type,
        id: editingItem.data.id,
        ...editFormData
      }
      
      const res = await fetch('/api/operations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to update operations entry.')
      const updated = await res.json()
      
      if (editingItem.type === 'bill') {
        setBills(prev => prev.map(b => b.id === updated.id ? updated : b))
      } else if (editingItem.type === 'task') {
        setMaintenanceTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
      } else if (editingItem.type === 'inventory') {
        setInventory(prev => prev.map(i => i.id === updated.id ? updated : i))
      } else if (editingItem.type === 'vendor') {
        setVendors(prev => prev.map(v => v.id === updated.id ? updated : v))
      }
      
      setEditingItem(null)
    } catch (err) {
      notify({ title: 'Entry could not be updated', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error', durationMs: 0 })
    } finally {
      setSubmittingEdit(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return
    setSubmittingDelete(true)
    try {
      const { type, id } = deletingItem
      const res = await fetch(`/api/operations?type=${type}&id=${id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete operations entry.')
      
      if (type === 'bill') {
        setBills(prev => prev.filter(b => b.id !== id))
      } else if (type === 'task') {
        setMaintenanceTasks(prev => prev.filter(t => t.id !== id))
      } else if (type === 'inventory') {
        setInventory(prev => prev.filter(i => i.id !== id))
      } else if (type === 'vendor') {
        setVendors(prev => prev.filter(v => v.id !== id))
      }
      
      setDeletingItem(null)
      setEditingItem(null)
    } catch (err) {
      notify({ title: 'Entry could not be deleted', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error', durationMs: 0 })
    } finally {
      setSubmittingDelete(false)
    }
  }

  // Derive counts
  const furnitureCounts = inventory.filter((item: LuxorInventoryItem) => item.category === 'furniture')
  const suppliesCounts = inventory.filter((item: LuxorInventoryItem) => item.category === 'supplies')

  // Calculate readiness score
  const completedCount = readinessTasks.filter((t) => t.checked).length
  const readinessScore = readinessTasks.length ? Math.round((completedCount / readinessTasks.length) * 100) : 0
  const sensorsOnline = utilities.length > 0

  return (
    <PortalPageFrame bleed={embeddedBills} className={embeddedBills ? 'min-h-0 flex-1 gap-0 overflow-hidden' : 'h-full min-h-0 overflow-hidden flex flex-col gap-4 xl:gap-6'}>
      {!embeddedBills && <PortalPageHeader
        icon={<Wrench size={18} />}
        title="Venue Operations"
        actions={
          <div className="flex items-center gap-2">
            <PortalMobileTabTrigger
              tabs={operationsTabs}
              activeTab={activeTab}
              onClick={() => setIsViewPickerOpen(true)}
            />
            {activeTab === 'maintenance' ? (
              <PortalButton variant="primary" onClick={() => setIsTaskModalOpen(true)}><Plus size={14} /> New Ticket</PortalButton>
            ) : activeTab === 'inventory' ? (
              <PortalButton variant="primary" onClick={() => setIsInventoryModalOpen(true)}><Plus size={14} /> Audit Stock</PortalButton>
            ) : activeTab === 'vendors' ? (
              <PortalButton variant="primary" onClick={() => setIsVendorModalOpen(true)}><Plus size={14} /> Add Vendor</PortalButton>
            ) : null}
          </div>
        }
      />

      }
      {/* Compact navigation on tablets and mobile with modal picker */}
      {!embeddedBills && <PortalMobileTabPicker
        tabs={operationsTabs}
        activeTab={activeTab}
        open={isViewPickerOpen}
        onOpenChange={setIsViewPickerOpen}
        onTabChange={(tab) => router.push(`/portal/operations?tab=${tab}`)}
        title="Operations views"
        subtitle="Choose a venue operations workspace."
      />}

      {/* Desktop rectangular sliding tab navigation */}
      {!embeddedBills && <div className="hidden shrink-0 xl:flex">
        <PortalAnimatedTabs
          variant="slider"
          ariaLabel="Operations sections"
          tabs={operationsTabs}
          activeTab={activeTab}
          onTabChange={(tab) => router.push(`/portal/operations?tab=${tab}`)}
        />
      </div>}

      <PortalTabTransition activeKey={activeTab} className={`min-h-0 flex-1 overflow-hidden ${embeddedBills ? 'flex flex-col' : ''}`}>
      {loading ? (
        <div className="p-4 space-y-6">
          <PortalCardSkeleton count={4} />
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-8 h-64 luxor-skeleton" />
        </div>
      ) : error ? (
        <div role="alert" className="m-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
          <p className="text-sm font-semibold text-[color:var(--portal-text)]">Operations could not load</p>
          <p className="mt-1 text-sm text-[color:var(--portal-muted)]">{error}</p>
          <PortalButton type="button" onClick={() => void loadOperationsData()} className="mt-4">Try again</PortalButton>
        </div>
      ) : (
        <>
          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
        <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#caa24c]">Today at Luxor</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--portal-text)]">Operations overview</h2>
            </div>
            <p className="max-w-md text-[11px] leading-5 text-[color:var(--portal-muted)]">Current records across payments, facility work, inventory, and utilities.</p>
          </div>

          <PortalStaggerGroup className="max-w-sm">
            <PortalStaggerCard>
              <StatsCard icon={<Zap size={16} />} label="Utilities" value={sensorsOnline ? 'Reporting' : 'No data'} subtitle={sensorsOnline ? `${utilities.length} recent records` : 'Check utility setup'} tone={sensorsOnline ? 'green' : 'gold'} onClick={() => router.push('/portal/operations?tab=utilities')} />
            </PortalStaggerCard>
          </PortalStaggerGroup>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.75fr)]">
            <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={16} /></span>
                    <div>
                      <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Readiness checklist</h3>
                      <p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">Add only what applies to today&apos;s setup.</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold text-[color:var(--portal-muted)] ml-auto shrink-0">
                  <span className="tabular-nums">{completedCount} of {readinessTasks.length} complete</span>
                  <AnimatedCircularProgressBar
                    value={readinessScore}
                    size={46}
                    strokeWidth={4.5}
                    gaugePrimaryColor="#caa24c"
                    subLabel="Ready"
                  />
                </div>
              </div>

              <form onSubmit={handleAddReadinessTask} className="mt-5 flex gap-2">
                <label className="sr-only" htmlFor="readiness-item">Add a readiness item</label>
                <input
                  id="readiness-item"
                  value={readinessInput}
                  onChange={(event) => setReadinessInput(event.target.value)}
                  placeholder="Type a readiness item"
                  maxLength={120}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-xs font-medium text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45 focus:ring-2 focus:ring-[#caa24c]/10"
                />
                <PortalButton type="submit" variant="primary" disabled={!readinessInput.trim()} className="min-h-11 shrink-0 px-4"><Plus size={14} /> Add</PortalButton>
              </form>

              {!readinessTasks.length ? (
                <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 text-center">
                  <CheckCircle2 size={22} className="text-[color:var(--portal-faint)]" />
                  <p className="mt-3 text-xs font-semibold text-[color:var(--portal-text)]">No checklist yet</p>
                  <p className="mt-1 max-w-xs text-[10px] leading-4 text-[color:var(--portal-muted)]">Type the checks that matter for this event or workday. Your list stays on this browser until you remove it.</p>
                </div>
              ) : (
                <div className="mt-4 divide-y divide-[color:var(--portal-border)] overflow-hidden rounded-xl border border-[color:var(--portal-border)]">
                  {readinessTasks.map((task) => (
                    <div key={task.id} className="group flex min-h-12 items-center gap-3 bg-[color:var(--portal-card)] px-3 py-2.5 transition-colors hover:bg-[color:var(--portal-soft)]">
                      <input
                        type="checkbox"
                        checked={task.checked}
                        onChange={() => handleToggleReadinessTask(task.id)}
                        aria-label={`Mark ${task.label} ${task.checked ? 'incomplete' : 'complete'}`}
                        className="h-4 w-4 shrink-0 cursor-pointer rounded border-[color:var(--portal-border)] accent-[#a8792f]"
                      />
                      <span className={`min-w-0 flex-1 text-xs font-medium ${task.checked ? 'text-[color:var(--portal-muted)] line-through' : 'text-[color:var(--portal-text)]'}`}>{task.label}</span>
                      <button type="button" onClick={() => handleRemoveReadinessTask(task.id)} aria-label={`Remove ${task.label}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--portal-faint)] transition-colors hover:bg-rose-500/10 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}

              {completedCount ? <div className="mt-3 flex justify-end"><button type="button" onClick={clearCompletedReadinessTasks} className="min-h-9 rounded-md px-2 text-[10px] font-semibold text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]">Clear completed</button></div> : null}
            </section>

            <NeedsAttentionNow
              bills={bills}
              billIntakes={billIntakes}
              inventory={inventory}
              maintenanceTasks={maintenanceTasks}
            />
          </div>
        </div>
      )}

      {/* BILLS & PAYMENTS TAB */}
      {activeTab === 'bills' && (
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${embeddedBills ? 'gap-2' : 'h-full gap-3'}`}>
        {embeddedBills ? null : <OperationsArchivePanel type="bill" records={bills.map((bill) => ({ id: bill.id, updated_at: bill.updated_at, archived_at: bill.archived_at, label: `${bill.provider} · ${bill.service}` }))} onUpdated={() => void loadOperationsData(false)} />}
        <BillsPayableLedger
          embedded={embeddedBills}
          bills={bills}
          intakes={billIntakes}
          onOpenExpense={setBillExpenseId}
          onCreateExpense={setImportBillId}
          refreshKey={billRefreshKey}
          invoiceAnalysisConfigured={invoiceAnalysisConfigured}
          resendReceivingConfigured={resendReceivingConfigured}
          vendors={vendors}
          onVendorChanged={(vendor) => setVendors((current) => current.some((item) => item.id === vendor.id) ? current.map((item) => item.id === vendor.id ? vendor : item) : [...current, vendor])}
          onAddBill={() => setIsBillModalOpen(true)}
          onBillChanged={(bill) => setBills((current) => current.some((item) => item.id === bill.id) ? current.map((item) => item.id === bill.id ? bill : item) : [bill, ...current])}
          onIntakeChanged={(intake) => setBillIntakes((current) => current.map((item) => item.id === intake.id ? intake : item))}
          onEditBill={(bill) => setEditingItem({ type: 'bill', data: bill })}
        />
        </div>
        )}

      {/* MAINTENANCE LOG TAB */}
      {activeTab === 'maintenance' && (
        <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Facility Maintenance Task Log</h3>
            </div>

            <PortalTableCard>
              <div className="overflow-x-auto">
                <PortalStickyTable minWidth="800px">
                  <PortalStickyThead>
                    <tr className="text-[10px] uppercase font-bold text-zinc-500 tracking-[0.2em] border-b border-zinc-900 bg-[#0c0c0c]/80">
                      <th className="w-14 px-4 py-5 text-center"><PortalBulkHeaderSelector state={bulkSelection.pageSelectionState(bulkRecordIds)} onChange={() => bulkSelection.selectPage(bulkRecordIds)} /></th>
                      <th className="px-4 py-5">Task Details</th>
                      <th className="px-6 py-5">Priority</th>
                      <th className="px-6 py-5">Assigned Technician</th>
                      <th className="px-8 py-5 text-right">Lifecycle Status</th>
                    </tr>
                  </PortalStickyThead>
                  <tbody className="divide-y divide-zinc-900/30">
                    {maintenanceTasks.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-xs text-zinc-500">No active maintenance tickets logged.</td>
                      </tr>
                    ) : (
                      maintenanceTasks.map((task, rowIndex) => (
                        <tr key={task.id} className={`hover:bg-zinc-900/40 transition-colors cursor-pointer ${bulkSelection.isSelected(task.id) ? 'bg-[#caa24c]/5' : ''}`} onClick={() => setEditingItem({ type: 'task', data: task })}>
                          <td className="px-4 py-5 text-center"><PortalBulkRowSelector checked={bulkSelection.isSelected(task.id)} index={rowIndex + 1} onChange={() => bulkSelection.toggle(task.id)} label={task.title} /></td>
                          <td className="px-4 py-5">
                            <p className="text-xs font-bold text-white leading-none">{task.title}</p>
                            <p className="text-[9px] text-zinc-550 mt-1.5">Ticket ID: #{task.id.slice(0, 8)}</p>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              task.priority === 'high' || task.priority === 'urgent'
                                ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                                : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                            }`}>
                              {task.priority}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-zinc-350">Facility Operations</td>
                          <td className="px-8 py-5 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const nextStatus = task.status === 'completed' ? 'pending' : 'completed'
                                fetch('/api/operations', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ type: 'task', id: task.id, status: nextStatus })
                                })
                                  .then((res) => {
                                    if (res.ok) return res.json()
                                    throw new Error()
                                  })
                                  .then((updated) => {
                                    setMaintenanceTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
                                  })
                                  .catch(() => notify({ title: 'Status could not be updated', description: 'Please try again.', variant: 'error', durationMs: 0 }))
                              }}
                              className={`text-[9px] font-black uppercase tracking-wider border rounded-md px-2.5 py-1 transition-all cursor-pointer ${
                                task.status === 'completed'
                                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                                  : 'border-amber-500/25 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                              }`}
                            >
                              {task.status === 'completed' ? 'Completed' : 'Mark Complete'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </PortalStickyTable>
              </div>
            </PortalTableCard>
          </div>
        )}

      {/* INVENTORY TAB */}
      {activeTab === 'inventory' && (
        <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Venue Stock & Asset Audits</h3>
            {bulkRecordIds.length ? <div className="flex items-center gap-2"><PortalBulkHeaderSelector state={bulkSelection.pageSelectionState(bulkRecordIds)} onChange={() => bulkSelection.selectPage(bulkRecordIds)} /><span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">Select all inventory</span></div> : null}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Furniture Inventory */}
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#caa24c] flex items-center gap-2">
                  <Building size={16} /> Furniture Inventory Ledger
                </h3>
                <div className="space-y-4">
                  {furnitureCounts.length === 0 ? (
                    <p className="text-xs text-zinc-555 italic">No furniture items audited.</p>
                  ) : (
                    furnitureCounts.map((item, idx) => (
                      <div key={item.id || idx} className={`flex justify-between items-center border-b border-zinc-900/60 pb-3 border-dashed last:border-0 last:pb-0 cursor-pointer hover:bg-zinc-900/30 transition-colors px-2 -mx-2 rounded ${bulkSelection.isSelected(item.id) ? 'bg-[#caa24c]/5' : ''}`} onClick={() => setEditingItem({ type: 'inventory', data: item })}>
                        <div className="flex items-center gap-3">
                          <PortalBulkRowSelector checked={bulkSelection.isSelected(item.id)} index={inventory.findIndex((record) => record.id === item.id) + 1} onChange={() => bulkSelection.toggle(item.id)} label={item.name} />
                          <div>
                          <p className="text-xs font-bold text-white">{item.name}</p>
                          <p className="text-[10px] text-zinc-550 mt-0.5">Asset verification logged</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                            item.status === 'Low' || item.status === 'Out of Stock' ? 'border-rose-500/25 bg-rose-500/10 text-rose-400' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {item.status || 'Good'}
                          </span>
                          <span className="font-mono text-sm font-bold text-white">{item.count} <span className="text-xs text-zinc-500">{item.unit}</span></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Cleaning & Hospitality Supplies */}
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#caa24c] flex items-center gap-2">
                  <Package size={16} /> Hospitality Supplies Stock
                </h3>
                <div className="space-y-4">
                  {suppliesCounts.length === 0 ? (
                    <p className="text-xs text-zinc-555 italic">No supplies items audited.</p>
                  ) : (
                    suppliesCounts.map((item, idx) => (
                      <div key={item.id || idx} className={`flex justify-between items-center border-b border-zinc-900/60 pb-3 border-dashed last:border-0 last:pb-0 cursor-pointer hover:bg-zinc-900/30 transition-colors px-2 -mx-2 rounded ${bulkSelection.isSelected(item.id) ? 'bg-[#caa24c]/5' : ''}`} onClick={() => setEditingItem({ type: 'inventory', data: item })}>
                        <div className="flex items-center gap-3">
                          <PortalBulkRowSelector checked={bulkSelection.isSelected(item.id)} index={inventory.findIndex((record) => record.id === item.id) + 1} onChange={() => bulkSelection.toggle(item.id)} label={item.name} />
                          <div>
                          <p className="text-xs font-bold text-white">{item.name}</p>
                          <p className="text-[10px] text-zinc-550 mt-0.5">Audit: weekly auto-replenish</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                            item.status === 'Low' || item.status === 'Out of Stock' ? 'border-rose-500/25 bg-rose-500/10 text-rose-400' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {item.status}
                          </span>
                          <span className="font-mono text-sm font-bold text-white">{item.count} <span className="text-xs text-zinc-500">{item.unit}</span></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}      {/* PREFERRED VENDORS TAB */}
      {activeTab === 'vendors' && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="shrink-0">
            <OperationsArchivePanel type="vendor" records={vendors.map((vendor) => ({ id: vendor.id, updated_at: vendor.updated_at, archived_at: vendor.archived_at, label: vendor.name }))} onUpdated={() => void loadOperationsData(false)} />
          </div>
          <PortalTableCard
            className="min-h-0 flex-1 overflow-hidden"
            controlsClassName="rounded-t-2xl"
            controls={
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-sans text-base font-bold text-[color:var(--portal-text)] sm:text-lg">Preferred vendors</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-5 text-[color:var(--portal-muted)]">
                      Approved partners for events. Insurance (COI) status is tracked but does not hide a vendor from this list.
                    </p>
                  </div>
                  {bulkRecordIds.length ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <PortalBulkHeaderSelector state={bulkSelection.pageSelectionState(bulkRecordIds)} onChange={() => bulkSelection.selectPage(bulkRecordIds)} />
                      <span className="text-xs font-medium text-[color:var(--portal-muted)]">Select page</span>
                    </div>
                  ) : null}
                </div>
                <PortalFilterBar
                  searchValue={vendorSearchQuery}
                  onSearchChange={setVendorSearchQuery}
                  searchPlaceholder="Search name, type, email, or phone"
                  resultLabel={`${filteredPreferredVendors.length.toLocaleString()} ${filteredPreferredVendors.length === 1 ? 'vendor' : 'vendors'}`}
                  activeFilters={
                    vendorTypeFilter !== 'all'
                      ? [{ id: 'type', label: vendorTypeFilter, onRemove: () => setVendorTypeFilter('all') }]
                      : []
                  }
                  defaultExpanded={vendorTypeFilter !== 'all'}
                >
                  <PortalSelect
                    aria-label="Vendor type"
                    value={vendorTypeFilter}
                    onChange={setVendorTypeFilter}
                    options={vendorTypeFilterOptions}
                    buttonClassName="min-h-10 w-full sm:min-w-[12rem]"
                  />
                </PortalFilterBar>
              </div>
            }
          >
            <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar px-4 py-4 sm:px-5 sm:py-5">
              {filteredPreferredVendors.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-10 text-center">
                  <Users size={24} className="text-[color:var(--portal-faint)]" />
                  <p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">
                    {activePreferredVendors.length === 0 ? 'No preferred vendors yet' : 'No vendors match this search'}
                  </p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-[color:var(--portal-muted)]">
                    {activePreferredVendors.length === 0
                      ? 'Add caterers, security, DJs, and other event partners your team recommends to clients.'
                      : 'Try another vendor type or clear the search to see the full roster.'}
                  </p>
                  {activePreferredVendors.length === 0 ? (
                    <PortalButton type="button" variant="primary" className="mt-4" onClick={() => setIsVendorModalOpen(true)}>
                      <Plus size={14} /> Add vendor
                    </PortalButton>
                  ) : null}
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredPreferredVendors.map((vendor, idx) => (
                    <li key={vendor.id}>
                      <div
                        className={`flex h-full gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm transition-colors hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)] motion-reduce:transition-none ${
                          bulkSelection.isSelected(vendor.id) ? 'border-[#caa24c]/50 bg-[#caa24c]/5' : ''
                        }`}
                      >
                        <PortalBulkRowSelector
                          checked={bulkSelection.isSelected(vendor.id)}
                          index={idx + 1}
                          onChange={() => bulkSelection.toggle(vendor.id)}
                          label={vendor.name}
                        />
                        <button
                          type="button"
                          onClick={() => setEditingItem({ type: 'vendor', data: vendor })}
                          className="flex min-w-0 flex-1 flex-col gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 rounded-lg"
                        >
                          <div className="flex items-start gap-3">
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold text-[color:var(--portal-muted)]">{vendor.vendor_type}</span>
                              <span className="mt-1 block text-sm font-bold leading-snug text-[color:var(--portal-text)]">{vendor.name}</span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-[color:var(--portal-muted)]">{vendor.rating?.trim() || 'Unrated'}</span>
                          </div>
                          <div className="space-y-1 text-xs text-[color:var(--portal-muted)]">
                            <p className="break-all">Email: {vendor.email?.trim() || 'Not on file'}</p>
                            <p className="break-words">Phone: {vendor.phone?.trim() || 'Not on file'}</p>
                          </div>
                          <div className="mt-auto flex items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3">
                            <PortalStatusBadge
                              status={vendor.coi_active ? 'COI verified' : 'COI pending'}
                              tone={vendor.coi_active ? 'green' : 'gold'}
                              borderless
                            />
                            <span className="text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">Edit</span>
                          </div>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PortalTableCard>
        </div>
      )}

      {activeTab === 'utilities' && (() => {
        const electricReading = utilities.find((u: LuxorUtilityReading) => u.sensor_type === 'electric')
        const waterReading = utilities.find((u: LuxorUtilityReading) => u.sensor_type === 'water')

        return (
          <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#caa24c] flex items-center gap-2">
                  <Zap size={16} /> Electricity
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium pb-2 border-b border-[color:var(--portal-border)]">
                    <span className="text-[color:var(--portal-muted)]">Current load</span>
                    <span className="text-[color:var(--portal-text)] font-mono font-bold">{electricReading?.current_load || 'Not available'}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium pb-2 border-b border-[color:var(--portal-border)]">
                    <span className="text-[color:var(--portal-muted)]">Previous Bill Total</span>
                    <span className="text-[color:var(--portal-text)] font-mono font-bold">{electricReading?.previous_bill_total == null ? 'Not available' : `$${Number(electricReading.previous_bill_total).toFixed(2)}`}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-[color:var(--portal-muted)]">Alert Threshold Status</span>
                    <span className="text-[color:var(--portal-text)] font-semibold text-xs">{electricReading?.anomaly_status || 'Not available'}</span>
                  </div>
                </div>
              </div>

              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-blue-400 flex items-center gap-2">
                  <Droplet size={16} /> Water
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium pb-2 border-b border-[color:var(--portal-border)]">
                    <span className="text-[color:var(--portal-muted)]">Current usage rate</span>
                    <span className="text-[color:var(--portal-text)] font-mono font-bold">{waterReading?.current_load || 'Not available'}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium pb-2 border-b border-[color:var(--portal-border)]">
                    <span className="text-[color:var(--portal-muted)]">Previous Bill Total</span>
                    <span className="text-[color:var(--portal-text)] font-mono font-bold">{waterReading?.previous_bill_total == null ? 'Not available' : `$${Number(waterReading.previous_bill_total).toFixed(2)}`}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-[color:var(--portal-muted)]">Spike anomaly monitor</span>
                    <span className="text-[color:var(--portal-text)] font-semibold text-xs">
                      {waterReading?.anomaly_status || 'Not available'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* CLEANING TAB */}
      {activeTab === 'cleaning' && (
        <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
          <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-6 max-w-2xl">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Post-Event Cleaning Audit Checklist</h3>
            <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-6 text-center">
              <AlertTriangle size={28} className="mx-auto text-amber-500" />
              <p className="mt-3 text-xs font-bold text-[color:var(--portal-text)]">Event-linked cleaning audits are not connected yet.</p>
              <p className="mt-2 text-[10px] leading-relaxed text-[color:var(--portal-muted)]">The previous checklist and photo uploader were visual-only and did not save. Use maintenance tasks until cleaning records and attachments are tied to individual events.</p>
            </div>
          </div>
        </div>
      )}

      {/* STAFF TAB (FUTURE) */}
      {activeTab === 'staff' && (
        <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
          <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-center max-w-lg">
            <Users size={36} className="text-[#caa24c] mx-auto mb-3" />
            <h3 className="text-sm font-bold text-[color:var(--portal-text)] uppercase tracking-wider">Employee Scheduling & Rota Portal</h3>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              Staff availability management, timesheet submission approvals, and payroll ledger integration will be deployed in Version 2.0.
            </p>
          </div>
        </div>
      )}
      </>
      )}

      {bulkType ? (
        <>
          <PortalBulkActionDeck
            selectedCount={bulkSelectedCount}
            pageCount={bulkRecordIds.length}
            totalCount={bulkRecordIds.length}
            allMatching={bulkSelection.allMatching}
            busyAction={bulkBusy}
            noun={bulkType === 'bill' ? 'bill' : bulkType === 'task' ? 'task' : bulkType === 'inventory' ? 'item' : 'vendor'}
            onSelectAll={bulkSelection.selectAllMatching}
            onClear={bulkSelection.clear}
            onAction={(action) => {
              if (action === 'primary' && bulkType === 'task') void runOperationsBulkUpdate({ status: 'completed', completed_at: new Date().toISOString() }, action)
              if (action === 'secondary' && bulkType === 'task') void runOperationsBulkUpdate({ status: 'pending', completed_at: null }, action)
              if (action === 'primary' && bulkType === 'inventory') void runOperationsBulkUpdate({ status: 'Good' }, action)
              if (action === 'secondary' && bulkType === 'inventory') void runOperationsBulkUpdate({ status: 'Low' }, action)
              if (action === 'primary' && bulkType === 'vendor') void runOperationsBulkUpdate({ coi_active: true }, action)
              if (action === 'secondary' && bulkType === 'vendor') void runOperationsBulkUpdate({ coi_active: false }, action)
              if (action === 'delete') setConfirmBulkDelete(true)
            }}
            actions={bulkType === 'bill' ? [] : [
              { id: 'primary', label: bulkType === 'task' ? 'Complete' : bulkType === 'inventory' ? 'Stock good' : 'Verify COI', icon: <CheckCircle2 size={13} /> },
              { id: 'secondary', label: bulkType === 'task' ? 'Reopen' : bulkType === 'inventory' ? 'Mark low' : 'COI inactive', icon: bulkType === 'inventory' ? <AlertTriangle size={13} /> : <Clock size={13} /> },
              ...(bulkType === 'vendor' ? [] : [{ id: 'delete', label: 'Delete', icon: <Trash2 size={13} />, tone: 'danger' as const }]),
            ]}
          />
          <PortalBulkConfirmDialog
            open={confirmBulkDelete}
            title={`Delete ${bulkSelectedCount} selected ${bulkType === 'inventory' ? 'inventory item' : bulkType}${bulkSelectedCount === 1 ? '' : 's'}?`}
            description="This permanently removes the selected operational records from Supabase. This cannot be undone."
            confirmLabel="Delete selected records"
            busy={bulkBusy === 'delete'}
            onClose={() => setConfirmBulkDelete(false)}
            onConfirm={() => void deleteSelectedOperationsRecords()}
          />
        </>
      ) : null}

      {/* 1. New Bill Modal */}
      {importBillId ? <ExpenseManagement key={importBillId} view="business" embedded panelOnly initialBillId={importBillId} onBack={() => { setImportBillId(null); setBillRefreshKey(value => value + 1); void loadOperationsData(false) }} /> : null}
      <PortalModal isOpen={Boolean(billExpenseId)} onClose={() => { setBillExpenseId(null); setBillRefreshKey(value => value + 1); void loadOperationsData(false) }} title="Expense & payments" sidePanel headerBack animateClose maxWidth="max-w-[600px]">
        {billExpenseId ? <ExpenseManagement view="detail" expenseId={billExpenseId} embedded onBack={() => { setBillExpenseId(null); setBillRefreshKey(value => value + 1); void loadOperationsData(false) }} /> : null}
      </PortalModal>
      <PortalModal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        title="Add bill"
        sidePanel
        animateClose
        maxWidth="max-w-[600px]"
      >
        <form onSubmit={handleAddBillSubmit} className="space-y-4">
          <section className="rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/[0.07] p-4">
            <div className="flex items-start gap-3">
              <Upload size={17} className="mt-0.5 shrink-0 text-[#a8792f] dark:text-[#caa24c]" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-[color:var(--portal-text)]">Upload the actual bill</p>
                <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">AI will read the file in the background and add a reviewable bill to the ledger.</p>
              </div>
            </div>
            <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-[#caa24c]/35 bg-[color:var(--portal-card)] px-3 py-2 text-[10px] font-semibold text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/65">
              <span className="min-w-0 truncate">{billUploadFile ? billUploadFile.name : 'Choose PDF, JPG, or PNG · up to 20 MB'}</span>
              <span className="shrink-0 rounded-md bg-[#caa24c]/15 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[#a8792f] dark:text-[#dfbd68]">Browse</span>
              <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => setBillUploadFile(event.target.files?.[0] || null)} />
            </label>
            <button type="button" onClick={() => void handleBillUpload()} disabled={!billUploadFile || billUploadBusy} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#b98a3d] px-4 text-[10px] font-black uppercase tracking-wider !text-white transition-colors hover:bg-[#a8792f] disabled:cursor-not-allowed disabled:opacity-45">
              {billUploadBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {billUploadBusy ? 'Queuing bill…' : 'Upload & start AI intake'}
            </button>
            <div className="my-4 flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-faint)]"><span className="h-px flex-1 bg-[color:var(--portal-border)]" />Or enter it manually<span className="h-px flex-1 bg-[color:var(--portal-border)]" /></div>
            <p className="text-xs leading-5 text-[color:var(--portal-muted)]">AI will review the details you enter. Upload the bill above if you also want it to extract details from the original document.</p>
          </section>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-zinc-500">Service Name</label>
            <input
              type="text"
              required
              value={billService}
              onChange={(e) => setBillService(e.target.value)}
              placeholder="e.g. Electric Utility Usage"
              className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-zinc-500">Provider / Account</label>
            <PortalSelect value={billVendorId} onChange={(value) => { const vendor = vendors.find((item) => item.id === value); setBillVendorId(value); if (vendor) setBillProvider(vendor.name) }} options={[{ value: '', label: 'No saved vendor' }, ...vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))]} />
            <input
              type="text"
              required
              value={billProvider}
              onChange={(e) => setBillProvider(e.target.value)}
              placeholder="e.g. TXU Energy"
              className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-500">Amount</label>
              <PortalSelect value={billAmountState} onChange={(value) => setBillAmountState(value as 'known' | 'unknown' | 'variable')} options={[{ value: 'known', label: 'Known amount' }, { value: 'unknown', label: 'Unknown until the bill arrives' }, { value: 'variable', label: 'Variable amount' }]} />
              <input
                type="number"
                required={billAmountState === 'known'}
                disabled={billAmountState !== 'known'}
                min="0"
                step="0.01"
                value={billAmountState === 'known' ? billAmount : ''}
                onChange={(e) => setBillAmount(e.target.value)}
                placeholder={billAmountState === 'known' ? '120.00' : 'Not entered'}
                className="mt-2 w-full rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-500">Frequency</label>
              <PortalSelect
                value={billFrequency}
                onChange={setBillFrequency}
                options={[
                  { value: 'One-time', label: 'One-time' },
                  { value: 'Weekly', label: 'Weekly' },
                  { value: 'Biweekly', label: 'Biweekly' },
                  { value: 'Monthly', label: 'Monthly' },
                  { value: 'Quarterly', label: 'Quarterly' },
                  { value: 'Annually', label: 'Annually' },
                ]}
              />
              <p className="text-[10px] leading-4 text-zinc-500">This describes the bill. It does not create future bills or payments. Recurring expenses stay in Expense Management and remain unpaid until a payment is recorded.</p>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-zinc-500">Category</label>
            <PortalSelect value={billCategory} onChange={(value) => { if (isLuxorBillCategory(value)) setBillCategory(value) }} options={LUXOR_BILL_CATEGORIES.map((value) => ({ value, label: value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-500">Invoice number</label>
              <input type="text" maxLength={80} value={billInvoiceNumber} onChange={(event) => setBillInvoiceNumber(event.target.value)} placeholder="Optional" className="w-full rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-500">Issue date</label>
              <PortalDatePicker value={billIssueDate} onChange={setBillIssueDate} placeholder="Optional" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-zinc-500">Due Date</label>
            <PortalDatePicker
              value={billDueDate}
              onChange={setBillDueDate}
              placeholder="Select due date..."
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setIsBillModalOpen(false)}
              className="px-4 py-2 border border-transparent text-xs font-bold text-zinc-500 hover:text-zinc-350 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={billSaveBusy}
              className="luxor-gold-raised rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-widest !text-white transition-all disabled:cursor-not-allowed disabled:opacity-45"
            >
              {billSaveBusy ? 'Saving…' : 'Save Bill'}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* 2. New Maintenance Ticket Modal */}
      <PortalModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="New Maintenance Ticket"
      >
        <form onSubmit={handleAddTaskSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-zinc-500">Ticket Title</label>
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Repair lobby exit sign back light"
              className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-zinc-500">Description</label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="e.g. Back light has been flickering since last event load-out."
              className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none h-20 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-500">Priority</label>
              <PortalSelect
                value={taskPriority}
                onChange={setTaskPriority}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' }
                ]}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-500">Due Date</label>
              <PortalDatePicker
                value={taskDueDate}
                onChange={setTaskDueDate}
                placeholder="Select target date..."
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setIsTaskModalOpen(false)}
              className="px-4 py-2 border border-transparent text-xs font-bold text-zinc-500 hover:text-zinc-350 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="luxor-gold-raised rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition-all"
            >
              Log Ticket
            </button>
          </div>
        </form>
      </PortalModal>

      {/* 3. New Inventory Audit Modal */}
      <PortalModal
        isOpen={isInventoryModalOpen}
        onClose={() => setIsInventoryModalOpen(false)}
        title="Audit Inventory Count"
      >
        <form onSubmit={handleAddInventorySubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-zinc-500">Category</label>
            <PortalSelect
              value={invCategory}
              onChange={setInvCategory}
              options={[
                { value: 'furniture', label: 'Furniture Assets' },
                { value: 'supplies', label: 'Hospitality Supplies' },
                { value: 'decor', label: 'Decor Inventory' },
                { value: 'other', label: 'Other Items' }
              ]}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-zinc-500">Item Name</label>
            <input
              type="text"
              required
              value={invName}
              onChange={(e) => setInvName(e.target.value)}
              placeholder="e.g. Round Banquets"
              className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="text-[9px] uppercase font-bold text-zinc-500">Quantity In Stock</label>
              <input
                type="number"
                required
                value={invCount}
                onChange={(e) => setInvCount(e.target.value)}
                placeholder="250"
                className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-500">Unit</label>
              <input
                type="text"
                required
                value={invUnit}
                onChange={(e) => setInvUnit(e.target.value)}
                placeholder="pcs"
                className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-zinc-505">Status Level</label>
            <PortalSelect
              value={invStatus}
              onChange={setInvStatus}
              options={[
                { value: 'Good', label: 'Good (Adequate stock)' },
                { value: 'Low', label: 'Low (Needs replenish)' },
                { value: 'Out of Stock', label: 'Out of Stock (Replenish Urgent)' }
              ]}
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setIsInventoryModalOpen(false)}
              className="px-4 py-2 border border-transparent text-xs font-bold text-zinc-500 hover:text-zinc-350 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="luxor-gold-raised rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition-all"
            >
              Audit Item
            </button>
          </div>
        </form>
      </PortalModal>

      {/* 4. New Vendor Profile Modal */}
      <PortalModal
        isOpen={isVendorModalOpen}
        onClose={() => setIsVendorModalOpen(false)}
        title="Add Preferred Vendor"
      >
        <form onSubmit={handleAddVendorSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Vendor type</label>
            <PortalSelect
              value={vendorType}
              onChange={setVendorType}
              options={[...PREFERRED_VENDOR_TYPE_OPTIONS]}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Business name</label>
            <input
              type="text"
              required
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Prestige Valet Co."
              className={portalVendorFieldClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Email</label>
              <input
                type="email"
                value={vendorEmail}
                onChange={(e) => setVendorEmail(e.target.value)}
                placeholder="sales@prestige.com"
                className={portalVendorFieldClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Phone</label>
              <input
                type="text"
                value={vendorPhone}
                onChange={(e) => setVendorPhone(e.target.value)}
                placeholder="214-555-0100"
                className={portalVendorFieldClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Rating</label>
              <PortalSelect
                value={vendorRating}
                onChange={setVendorRating}
                options={[
                  { value: '', label: 'Unrated' },
                  { value: '5.0 ⭐', label: '5.0 ⭐' },
                  { value: '4.9 ⭐', label: '4.9 ⭐' },
                  { value: '4.8 ⭐', label: '4.8 ⭐' },
                  { value: '4.7 ⭐', label: '4.7 ⭐' },
                  { value: '4.5 ⭐', label: '4.5 ⭐' }
                ]}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[color:var(--portal-muted)]">COI on file</label>
              <PortalSelect
                value={vendorCoi}
                onChange={setVendorCoi}
                options={[
                  { value: 'true', label: 'Yes — active COI' },
                  { value: 'false', label: 'Not verified' }
                ]}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <PortalButton type="button" variant="ghost" onClick={() => setIsVendorModalOpen(false)}>Cancel</PortalButton>
            <PortalButton type="submit" variant="primary">Add vendor</PortalButton>
          </div>
        </form>
      </PortalModal>

      {/* 5. Edit Modals */}
      <PortalModal
        isOpen={Boolean(editingItem && editFormData)}
        onClose={() => setEditingItem(null)}
        sidePanel={editingItem?.type === 'bill'}
        headerBack={editingItem?.type === 'bill'}
        title={editingItem ? `Edit ${
          editingItem.type === 'bill'
            ? 'bill details'
            : editingItem.type === 'task'
            ? 'Maintenance Ticket'
            : editingItem.type === 'inventory'
            ? 'Inventory Item'
            : 'Preferred Vendor'
        }` : undefined}
      >
        {editingItem && editFormData ? (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {editingItem.type === 'bill' && (
              <>
                <div className="space-y-1">
                  <label htmlFor="edit-bill-title" className="text-xs font-semibold text-[color:var(--portal-muted)]">Bill title</label>
                  <input
                    id="edit-bill-title"
                    type="text"
                    required
                    value={editFormData.service || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, service: e.target.value })}
                    className="w-full rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-sm text-[color:var(--portal-text)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Category</label>
                  <PortalSelect aria-label="Bill category" value={editFormData.bill_category || ''} onChange={(value) => setEditFormData({ ...editFormData, bill_category: isLuxorBillCategory(value) ? value : null })} options={[{ value: '', label: 'Not categorized' }, ...LUXOR_BILL_CATEGORIES.map((value) => ({ value, label: value }))]} />
                  {editingItem.type === 'bill' && 'extracted_fields' in editingItem.data && isLuxorBillCategory(editingItem.data.extracted_fields?.category_suggestion) ? <p className="text-xs text-[color:var(--portal-muted)]">Suggested: {editingItem.data.extracted_fields.category_suggestion}. Select a category to confirm it.</p> : null}
                </div>
                <div className="space-y-1">
                  <label htmlFor="edit-bill-provider" className="text-xs font-semibold text-[color:var(--portal-muted)]">Provider / Account</label>
                  <input
                    id="edit-bill-provider"
                    type="text"
                    required
                    value={editFormData.provider || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, provider: e.target.value })}
                    className="w-full rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-sm text-[color:var(--portal-text)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="edit-bill-amount" className="text-xs font-semibold text-[color:var(--portal-muted)]">Amount (USD)</label>
                    <input
                      id="edit-bill-amount"
                      type="number"
                      min="0" step="0.01"
                      value={editFormData.amount_state === 'known' ? (editFormData.amount ?? '') : ''}
                      onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value, amount_state: e.target.value === '' ? 'unknown' : 'known' })}
                      className="w-full rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-sm text-[color:var(--portal-text)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-550">Frequency</label>
                    <PortalSelect
                      value={editFormData.frequency || 'One-time'}
                      onChange={(val) => setEditFormData({ ...editFormData, frequency: val })}
                      options={['One-time', 'Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annually', editFormData.frequency || ''].filter((value, index, list) => value && list.indexOf(value) === index).map((value) => ({ value, label: value }))}
                    />
                  </div>
                </div>
                <PortalSelect value={editFormData.amount_state || 'legacy'} onChange={(value) => setEditFormData({ ...editFormData, amount_state: value === 'legacy' ? null : value as 'known' | 'unknown' | 'variable' })} options={[{ value: 'legacy', label: 'Legacy amount not confirmed' }, { value: 'known', label: 'Known amount' }, { value: 'unknown', label: 'Unknown amount' }, { value: 'variable', label: 'Variable amount' }]} />
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Due Date</label>
                  <PortalDatePicker
                    value={editFormData.due_date ? editFormData.due_date.slice(0, 10) : ''}
                    onChange={(val) => setEditFormData({ ...editFormData, due_date: val })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Payment Status</label>
                  <PortalSelect
                    value={editFormData.status || 'unpaid'}
                    onChange={(val) => setEditFormData({ ...editFormData, status: val })}
                    options={[
                      { value: 'unpaid', label: 'Unpaid' },
                      { value: 'paid', label: 'Paid' }
                    ]}
                  />
                </div>
              </>
            )}

            {editingItem.type === 'task' && (
              <>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Ticket Title</label>
                  <input
                    type="text"
                    required
                    value={editFormData.title || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Description</label>
                  <textarea
                    value={editFormData.description || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none h-20 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-555">Priority</label>
                    <PortalSelect
                      value={editFormData.priority || 'medium'}
                      onChange={(val) => setEditFormData({ ...editFormData, priority: val })}
                      options={[
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' }
                      ]}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-555">Due Date</label>
                    <PortalDatePicker
                      value={editFormData.due_date ? editFormData.due_date.slice(0, 10) : ''}
                      onChange={(val) => setEditFormData({ ...editFormData, due_date: val })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Lifecycle Status</label>
                  <PortalSelect
                    value={editFormData.status || 'pending'}
                    onChange={(val) => setEditFormData({ ...editFormData, status: val })}
                    options={[
                      { value: 'pending', label: 'Pending / Active' },
                      { value: 'completed', label: 'Completed' }
                    ]}
                  />
                </div>
              </>
            )}

            {editingItem.type === 'inventory' && (
              <>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Category</label>
                  <PortalSelect
                    value={editFormData.category || 'furniture'}
                    onChange={(val) => setEditFormData({ ...editFormData, category: val as LuxorInventoryItem['category'] })}
                    options={[
                      { value: 'furniture', label: 'Furniture Assets' },
                      { value: 'supplies', label: 'Hospitality Supplies' },
                      { value: 'decor', label: 'Decor Inventory' },
                      { value: 'other', label: 'Other Items' }
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Item Name</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[9px] uppercase font-bold text-zinc-550">Quantity In Stock</label>
                    <input
                      type="number"
                      required
                      value={editFormData.count !== undefined ? editFormData.count : ''}
                      onChange={(e) => setEditFormData({ ...editFormData, count: Number(e.target.value) })}
                      className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-550">Unit</label>
                    <input
                      type="text"
                      required
                      value={editFormData.unit || 'pcs'}
                      onChange={(e) => setEditFormData({ ...editFormData, unit: e.target.value })}
                      className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Status Level</label>
                  <PortalSelect
                    value={editFormData.status || 'Good'}
                    onChange={(val) => setEditFormData({ ...editFormData, status: val as LuxorInventoryItem['status'] })}
                    options={[
                      { value: 'Good', label: 'Good (Adequate stock)' },
                      { value: 'Low', label: 'Low (Needs replenish)' },
                      { value: 'Out of Stock', label: 'Out of Stock (Replenish Urgent)' }
                    ]}
                  />
                </div>
              </>
            )}

            {editingItem.type === 'vendor' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Vendor type</label>
                  <PortalSelect
                    value={editFormData.vendor_type || 'DJs & Music'}
                    onChange={(val) => setEditFormData({ ...editFormData, vendor_type: val })}
                    options={[...PREFERRED_VENDOR_TYPE_OPTIONS]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Business name</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className={portalVendorFieldClass}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Email</label>
                    <input
                      type="email"
                      value={editFormData.email || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value || null })}
                      className={portalVendorFieldClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Phone</label>
                    <input
                      type="text"
                      value={editFormData.phone || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value || null })}
                      className={portalVendorFieldClass}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Rating</label>
                    <PortalSelect
                      value={editFormData.rating || ''}
                      onChange={(val) => setEditFormData({ ...editFormData, rating: val || null })}
                      options={[
                        { value: '', label: 'Unrated' },
                        ...((editFormData.rating && !['5.0 ⭐', '4.9 ⭐', '4.8 ⭐', '4.7 ⭐', '4.5 ⭐'].includes(editFormData.rating)) ? [{ value: editFormData.rating, label: editFormData.rating }] : []),
                        { value: '5.0 ⭐', label: '5.0 ⭐' },
                        { value: '4.9 ⭐', label: '4.9 ⭐' },
                        { value: '4.8 ⭐', label: '4.8 ⭐' },
                        { value: '4.7 ⭐', label: '4.7 ⭐' },
                        { value: '4.5 ⭐', label: '4.5 ⭐' }
                      ]}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--portal-muted)]">COI on file</label>
                    <PortalSelect
                      value={editFormData.coi_active !== undefined ? String(editFormData.coi_active) : 'true'}
                      onChange={(val) => setEditFormData({ ...editFormData, coi_active: val === 'true' })}
                      options={[
                        { value: 'true', label: 'Yes — active COI' },
                        { value: 'false', label: 'Not verified' }
                      ]}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 justify-between pt-2">
              {editingItem.type !== 'bill' && editingItem.type !== 'vendor' ? <button
                type="button"
                onClick={() => {
                  setDeletingItem({
                    type: editingItem.type,
                    id: editingItem.data.id,
                    name: (editingItem.type === 'bill' ? editFormData.service : editingItem.type === 'task' ? editFormData.title : editFormData.name) || ''
                  })
                }}
                className="px-4 py-2 border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 text-xs font-bold uppercase tracking-widest rounded-lg cursor-pointer transition-all"
              >
                Delete
              </button> : <span className="text-xs text-[color:var(--portal-muted)]">This record is retained for history.</span>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 border border-transparent text-xs font-bold text-zinc-500 hover:text-zinc-350 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="luxor-gold-raised rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition-all disabled:opacity-50"
                >
                  {submittingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </PortalModal>

      {/* 6. Delete Confirmation Modal */}
      <PortalModal
        isOpen={Boolean(deletingItem)}
        onClose={() => setDeletingItem(null)}
        title="Confirm Deletion"
      >
        {deletingItem ? (
          <div className="space-y-4">
            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-white">&ldquo;{deletingItem.name}&rdquo;</span>? 
              This action cannot be undone and will permanently remove the record from the venue operations database.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 border border-transparent text-xs font-bold text-zinc-550 hover:text-zinc-350 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={submittingDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg cursor-pointer transition-all disabled:opacity-50"
              >
                {submittingDelete ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        ) : null}
      </PortalModal>
      </PortalTabTransition>
    </PortalPageFrame>
  )
}

function StatsCard({
  icon,
  label,
  value,
  subtitle,
  tone = 'blue',
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle: string
  tone?: 'blue' | 'purple' | 'cyan' | 'gold' | 'green'
  onClick: () => void
}) {
  const styles = {
    blue: 'border-blue-500/15 bg-blue-500/8 text-blue-600 dark:text-blue-400',
    purple: 'border-purple-500/15 bg-purple-500/8 text-purple-600 dark:text-purple-400',
    cyan: 'border-cyan-500/15 bg-cyan-500/8 text-cyan-600 dark:text-cyan-400',
    gold: 'border-[#caa24c]/20 bg-[#caa24c]/8 text-[#9a712e] dark:text-[#dfbd68]',
    green: 'border-emerald-500/15 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400'
  }

  return (
    <button type="button" onClick={onClick} className="group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/35 rounded-xl">
      <MagicCard className="flex min-h-28 flex-col justify-between rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:border-[#caa24c]/30">
        <div className="flex items-start justify-between gap-3 w-full">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${styles[tone]}`}>{icon}</span>
          <ChevronRight size={14} className="mt-1 text-[color:var(--portal-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--portal-muted)]" />
        </div>
        <div className="mt-4 w-full">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{label}</p>
          <p className="mt-1 tabular-nums text-xl font-extrabold tracking-tight text-[color:var(--portal-text)]">{value}</p>
          <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{subtitle}</p>
        </div>
      </MagicCard>
    </button>
  )
}
