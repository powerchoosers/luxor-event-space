'use client'

import React, { useState, useEffect, Suspense } from 'react'
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
  Upload,
  Calendar,
  Sparkles,
  Zap,
  TrendingUp,
  Droplet,
  Trash2,
  Clock,
  Plus
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalTableCard,
  PortalStickyTable,
  PortalStickyThead,
  PortalModal,
  PortalDatePicker,
  PortalSelect
} from '@/components/portal/PortalUI'
import type { LuxorBill, LuxorInventoryItem, LuxorVendor, LuxorUtilityReading, LuxorCleaningLog } from '@/app/api/operations/route'
import type { LuxorTask } from '@/lib/luxorInquiryTypes'

type SubTab =
  | 'dashboard'
  | 'bills'
  | 'maintenance'
  | 'inventory'
  | 'vendors'
  | 'utilities'
  | 'cleaning'
  | 'staff'

type EditFormData = {
  id?: string
  service?: string
  provider?: string
  amount?: number | string
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
  rating?: string
  coi_active?: boolean
}

export default function OperationsPage() {
  return (
    <Suspense fallback={null}>
      <OperationsPageContent />
    </Suspense>
  )
}

function OperationsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as SubTab | null
  const activeTab = tabParam || 'dashboard'

  // Database states
  const [bills, setBills] = useState<LuxorBill[]>([])
  const [inventory, setInventory] = useState<LuxorInventoryItem[]>([])
  const [vendors, setVendors] = useState<LuxorVendor[]>([])
  const [utilities, setUtilities] = useState<LuxorUtilityReading[]>([])
  const [cleaningLogs, setCleaningLogs] = useState<LuxorCleaningLog[]>([])
  const [maintenanceTasks, setMaintenanceTasks] = useState<LuxorTask[]>([])
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
    data: LuxorBill | LuxorTask | LuxorInventoryItem | LuxorVendor
  } | null>(null)
  const [editFormData, setEditFormData] = useState<EditFormData | null>(null)
  const [deletingItem, setDeletingItem] = useState<{ type: 'bill' | 'task' | 'inventory' | 'vendor'; id: string; name: string } | null>(null)
  const [submittingEdit, setSubmittingEdit] = useState(false)
  const [submittingDelete, setSubmittingDelete] = useState(false)

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
  const [billDueDate, setBillDueDate] = useState('')
  const [billFrequency, setBillFrequency] = useState('Monthly')

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [taskDueDate, setTaskDueDate] = useState('')

  const [invCategory, setInvCategory] = useState('furniture')
  const [invName, setInvName] = useState('')
  const [invCount, setInvCount] = useState('')
  const [invUnit, setInvUnit] = useState('pcs')
  const [invStatus, setInvStatus] = useState('Good')

  const [vendorType, setVendorType] = useState('DJs & Music')
  const [vendorName, setVendorName] = useState('')
  const [vendorEmail, setVendorEmail] = useState('')
  const [vendorPhone, setVendorPhone] = useState('')
  const [vendorRating, setVendorRating] = useState('5.0 ⭐')
  const [vendorCoi, setVendorCoi] = useState('true')

  // State for interactive features
  const [readinessTasks, setReadinessTasks] = useState([
    { id: '1', label: 'Utilities Active', checked: true },
    { id: '2', label: 'Venue Cleaned', checked: true },
    { id: '3', label: 'Bathrooms Stocked', checked: true },
    { id: '4', label: 'Chairs Counted', checked: true },
    { id: '5', label: 'Tables Set', checked: true },
    { id: '6', label: 'HVAC Working', checked: true },
    { id: '7', label: 'Exit Sign Inspection Needed', checked: false, critical: true },
    { id: '8', label: 'Inventory Count Pending', checked: false }
  ])

  const loadOperationsData = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/operations')
      if (!res.ok) throw new Error('Failed to load operations metrics.')
      const payload = await res.json()
      setBills(payload.bills || [])
      setInventory(payload.inventory || [])
      setVendors(payload.vendors || [])
      setUtilities(payload.utilities || [])
      setCleaningLogs(payload.cleaning || [])
      setMaintenanceTasks(payload.tasks || [])
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Telemetry Alert: Operations offline.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOperationsData()
  }, [])

  const handleToggleReadinessTask = (id: string) => {
    setReadinessTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, checked: !t.checked } : t))
    )
  }

  const handleAddBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!billService || !billAmount) return
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bill',
          service: billService,
          provider: billProvider || 'Other',
          amount: Number(billAmount),
          due_date: billDueDate,
          frequency: billFrequency,
          status: 'unpaid'
        })
      })
      if (!res.ok) throw new Error('Failed to save bill.')
      const newBill = await res.json()
      setBills((prev) => [newBill, ...prev])
      setIsBillModalOpen(false)
      setBillService('')
      setBillProvider('')
      setBillAmount('')
      setBillDueDate('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save bill.')
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
      alert(err instanceof Error ? err.message : 'Failed to save ticket.')
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
      alert(err instanceof Error ? err.message : 'Failed to save inventory count.')
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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save vendor profile.')
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem || !editFormData) return
    setSubmittingEdit(true)
    try {
      const payload = {
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
      alert(err instanceof Error ? err.message : 'Failed to update entry.')
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
      alert(err instanceof Error ? err.message : 'Failed to delete entry.')
    } finally {
      setSubmittingDelete(false)
    }
  }

  // Derive counts
  const furnitureCounts = inventory.filter((item: LuxorInventoryItem) => item.category === 'furniture')
  const suppliesCounts = inventory.filter((item: LuxorInventoryItem) => item.category === 'supplies')

  // Calculate readiness score
  const completedCount = readinessTasks.filter((t) => t.checked).length
  const readinessScore = Math.round((completedCount / readinessTasks.length) * 100)

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<Wrench size={18} />}
        title="Venue Operations"
        description="Core logistics command: Monitor maintenance, track facility bills, manage supply counts, and verify venue event readiness."
      />

      {/* Sub-tab navigation */}
      <div className="flex shrink-0 gap-2 border-b border-[color:var(--portal-border)] pb-2 overflow-x-auto portal-scrollbar">
        {[
          { id: 'dashboard', label: 'Operations Dashboard', icon: <Activity size={15} /> },
          { id: 'bills', label: 'Bills & Payments', icon: <DollarSign size={15} /> },
          { id: 'maintenance', label: 'Maintenance Log', icon: <Wrench size={15} /> },
          { id: 'inventory', label: 'Inventory counts', icon: <Package size={15} /> },
          { id: 'vendors', label: 'Preferred Vendors', icon: <Users size={15} /> },
          { id: 'utilities', label: 'Utility Sensors', icon: <Zap size={15} /> },
          { id: 'cleaning', label: 'Cleaning checklists', icon: <Sparkles size={15} /> },
          { id: 'staff', label: 'Staff Rota (Future)', icon: <Clock size={15} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => router.push(`/portal/operations?tab=${tab.id}`)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#caa24c]/10 border border-[#caa24c]/25 text-[#f1d27a]'
                : 'border border-transparent text-zinc-500 hover:text-zinc-350 hover:bg-zinc-950/40'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
          <div className="space-y-6">
            {/* Top row metric cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatsCard label="Readiness Score" value={`${readinessScore}%`} subtitle="Venue Status Score" tone={readinessScore > 90 ? 'green' : 'gold'} />
              <StatsCard label="Bills Due" value="$4,289.99" subtitle="Due this week" tone="gold" />
              <StatsCard label="Maintenance" value={String(maintenanceTasks.filter(t => t.status === 'pending').length)} subtitle="Unresolved issues" tone="blue" />
              <StatsCard label="Supply Alerts" value={String(suppliesCounts.filter(s => s.status === 'Low').length)} subtitle="Low stock items" tone="gold" />
              <StatsCard label="Sensors Status" value="Active" subtitle="Utilities Online" tone="green" />
            </div>

            {/* Event Day Readiness Checklist */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Readiness Details */}
              <div className="luxor-glass-card rounded-2xl p-6 lg:col-span-2 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400" /> Venue Readiness Checklists
                  </h3>
                  <span className="text-[10px] font-mono text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10 px-2 py-0.5 rounded">
                    Score: {readinessScore}%
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Interactive checklist required before hosting any event at the Luxor space. Complete all steps to guarantee guest satisfaction.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {readinessTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 bg-zinc-950/20 border border-zinc-900 rounded-lg p-3">
                      <input
                        type="checkbox"
                        checked={task.checked}
                        onChange={() => handleToggleReadinessTask(task.id)}
                        className="w-4 h-4 rounded text-[#caa24c] border-zinc-800 bg-transparent cursor-pointer"
                      />
                      <span className={`text-xs font-semibold ${task.checked ? 'line-through text-zinc-650' : 'text-zinc-200'}`}>
                        {task.label}
                      </span>
                      {!task.checked && task.critical && (
                        <span className="ml-auto text-[8px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded">Exit Sign</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Maintenance & Inventory side alert widgets */}
              <div className="space-y-6 lg:col-span-1">
                {/* Today's Maintenance list */}
                <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Critical Facility Tasks</h3>
                  <div className="space-y-3 text-xs">
                    {maintenanceTasks.filter(t => t.status === 'pending').slice(0, 3).map(task => (
                      <div key={task.id} className="flex items-start gap-3 border-b border-zinc-900/60 pb-3 border-dashed last:border-0 last:pb-0">
                        <AlertTriangle size={14} className={task.priority === 'high' ? 'text-rose-400 mt-0.5' : 'text-blue-400 mt-0.5'} />
                        <div>
                          <p className="font-bold text-zinc-300">{task.title}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">Assigned to: Facility Operations</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BILLS & PAYMENTS TAB */}
      {activeTab === 'bills' && (
        <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Facility Operational Bills</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsBillModalOpen(true)}
                  className="flex items-center gap-2 bg-[#caa24c]/15 border border-[#caa24c]/25 hover:bg-[#caa24c]/25 text-[#f1d27a] px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest cursor-pointer transition-all"
                >
                  <Plus size={14} /> Log Bill
                </button>
                <span className="text-[10px] font-mono text-zinc-550 border border-zinc-900 bg-zinc-950 px-3 py-1 rounded">Next due: Rent on Jul 15</span>
              </div>
            </div>

            <PortalTableCard>
              <div className="overflow-x-auto">
                <PortalStickyTable minWidth="800px">
                  <PortalStickyThead>
                    <tr className="text-[10px] uppercase font-bold text-zinc-550 tracking-[0.2em] border-b border-zinc-900 bg-[#0c0c0c]/80">
                      <th className="px-8 py-5">Recurring Service</th>
                      <th className="px-6 py-5">Billing Frequency</th>
                      <th className="px-6 py-5">Provider / Account</th>
                      <th className="px-8 py-5 text-right font-mono">Monthly Cost</th>
                    </tr>
                  </PortalStickyThead>
                  <tbody className="divide-y divide-zinc-900/30">
                    {bills.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-8 py-12 text-center text-xs text-zinc-500">No operational bills logged.</td>
                      </tr>
                    ) : (
                      bills.map((bill, idx) => (
                        <tr key={bill.id || idx} className="hover:bg-zinc-900/40 transition-colors cursor-pointer" onClick={() => setEditingItem({ type: 'bill', data: bill })}>
                          <td className="px-8 py-5 font-bold text-white">{bill.service}</td>
                          <td className="px-6 py-5 font-mono text-xs text-zinc-500">{bill.frequency}</td>
                          <td className="px-6 py-5 text-zinc-350">{bill.provider}</td>
                          <td className="px-8 py-5 text-right font-mono font-bold text-zinc-300">
                            ${Number(bill.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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

      {/* MAINTENANCE LOG TAB */}
      {activeTab === 'maintenance' && (
        <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Facility Maintenance Task Log</h3>
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(true)}
                className="flex items-center gap-2 bg-[#caa24c]/10 hover:bg-[#caa24c]/20 border border-[#caa24c]/25 text-[#f1d27a] px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest cursor-pointer transition-all"
              >
                <Plus size={14} /> New Maintenance Ticket
              </button>
            </div>

            <PortalTableCard>
              <div className="overflow-x-auto">
                <PortalStickyTable minWidth="800px">
                  <PortalStickyThead>
                    <tr className="text-[10px] uppercase font-bold text-zinc-500 tracking-[0.2em] border-b border-zinc-900 bg-[#0c0c0c]/80">
                      <th className="px-8 py-5">Task Details</th>
                      <th className="px-6 py-5">Priority</th>
                      <th className="px-6 py-5">Assigned Technician</th>
                      <th className="px-8 py-5 text-right">Lifecycle Status</th>
                    </tr>
                  </PortalStickyThead>
                  <tbody className="divide-y divide-zinc-900/30">
                    {maintenanceTasks.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-8 py-12 text-center text-xs text-zinc-500">No active maintenance tickets logged.</td>
                      </tr>
                    ) : (
                      maintenanceTasks.map((task) => (
                        <tr key={task.id} className="hover:bg-zinc-900/40 transition-colors cursor-pointer" onClick={() => setEditingItem({ type: 'task', data: task })}>
                          <td className="px-8 py-5">
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
                                  .catch(() => alert('Failed to update status.'))
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
            <button
              type="button"
              onClick={() => setIsInventoryModalOpen(true)}
              className="flex items-center gap-2 bg-[#caa24c]/15 border border-[#caa24c]/25 hover:bg-[#caa24c]/25 text-[#f1d27a] px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest cursor-pointer transition-all"
            >
              <Plus size={14} /> Audit Stock Item
            </button>
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
                      <div key={item.id || idx} className="flex justify-between items-center border-b border-zinc-900/60 pb-3 border-dashed last:border-0 last:pb-0 cursor-pointer hover:bg-zinc-900/30 transition-colors px-2 -mx-2 rounded" onClick={() => setEditingItem({ type: 'inventory', data: item })}>
                        <div>
                          <p className="text-xs font-bold text-white">{item.name}</p>
                          <p className="text-[10px] text-zinc-550 mt-0.5">Asset verification logged</p>
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
                      <div key={item.id || idx} className="flex justify-between items-center border-b border-zinc-900/60 pb-3 border-dashed last:border-0 last:pb-0 cursor-pointer hover:bg-zinc-900/30 transition-colors px-2 -mx-2 rounded" onClick={() => setEditingItem({ type: 'inventory', data: item })}>
                        <div>
                          <p className="text-xs font-bold text-white">{item.name}</p>
                          <p className="text-[10px] text-zinc-550 mt-0.5">Audit: weekly auto-replenish</p>
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
        <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Preferred Vendor Roster</h3>
            <button
              type="button"
              onClick={() => setIsVendorModalOpen(true)}
              className="flex items-center gap-2 bg-[#caa24c]/15 border border-[#caa24c]/25 hover:bg-[#caa24c]/25 text-[#f1d27a] px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest cursor-pointer transition-all"
            >
              <Plus size={14} /> Add Preferred Vendor
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {vendors.length === 0 ? (
                <div className="col-span-3 text-center py-12 text-xs text-zinc-505">No preferred vendors logged.</div>
              ) : (
                vendors.map((v, idx) => (
                  <div key={v.id || idx} className="luxor-glass-card rounded-2xl p-5 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-3 cursor-pointer hover:border-[#caa24c]/40 transition-all" onClick={() => setEditingItem({ type: 'vendor', data: v })}>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{v.vendor_type}</span>
                        <h4 className="text-sm font-serif text-white mt-1">{v.name}</h4>
                      </div>
                      <span className="text-[10px] font-bold text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10 px-2 py-0.5 rounded">{v.rating || '5.0 ⭐'}</span>
                    </div>
                    <div className="space-y-1 text-xs text-zinc-400">
                      <p className="truncate">Email: {v.email || 'N/A'}</p>
                      <p>Phone: {v.phone || 'N/A'}</p>
                    </div>
                    <div className="pt-2 border-t border-zinc-900 flex justify-between items-center text-[10px]">
                      <span className={v.coi_active ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {v.coi_active ? 'COI Active / Verified' : 'COI Pending / Inactive'}
                      </span>
                      <span className="text-zinc-550 font-mono">Contract locked</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'utilities' && (() => {
        const electricReading = utilities.find((u: LuxorUtilityReading) => u.sensor_type === 'electric') || { current_load: '14.5 kWh', previous_bill_total: 375.00, anomaly_status: 'Optimal' }
        const waterReading = utilities.find((u: LuxorUtilityReading) => u.sensor_type === 'water') || { current_load: '1.2 GPM', previous_bill_total: 105.80, anomaly_status: 'Optimal' }

        return (
          <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#caa24c] flex items-center gap-2">
                  <Zap size={16} /> Electrical Smart Sensor (TXU)
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium pb-2 border-b border-zinc-900">
                    <span className="text-zinc-550">Current load</span>
                    <span className="text-white font-mono font-bold">{electricReading.current_load}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium pb-2 border-b border-zinc-900">
                    <span className="text-zinc-550">Previous Bill Total</span>
                    <span className="text-white font-mono font-bold">${Number(electricReading.previous_bill_total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-zinc-550">Alert Threshold Status</span>
                    <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">{electricReading.anomaly_status}</span>
                  </div>
                </div>
              </div>

              <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-blue-400 flex items-center gap-2">
                  <Droplet size={16} /> Water Sensor (City SmartSensor)
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium pb-2 border-b border-zinc-900">
                    <span className="text-zinc-555">Current usage rate</span>
                    <span className="text-white font-mono font-bold">{waterReading.current_load}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium pb-2 border-b border-zinc-900">
                    <span className="text-zinc-555">Previous Bill Total</span>
                    <span className="text-white font-mono font-bold">${Number(waterReading.previous_bill_total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-zinc-555">Spike anomaly monitor</span>
                    <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">
                      {waterReading.anomaly_status === 'Optimal' ? 'No Leaks Detected' : waterReading.anomaly_status}
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
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Post-Event Cleaning Audit Checklist</h3>
            <div className="space-y-3">
              {[
                'Main lobby mirror buffed and dusted',
                'Bathrooms deep sanitized and soap dispenses refilled',
                'Ballroom flooring vacuumed and damp mopped',
                'Commercial kitchen counters scrubbed and trash bags replaced',
                'Round tables wiped down and stacked/aligned',
                'Outer entrance foyer and parking lot debris checkout'
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-zinc-950/20 border border-zinc-900 rounded-lg p-3">
                  <input
                    type="checkbox"
                    defaultChecked={idx < 4}
                    className="w-4 h-4 rounded text-[#caa24c] border-zinc-800 bg-transparent cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-zinc-300">{item}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-900">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Audit Photo upload</p>
              <div className="border border-dashed border-zinc-900 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-zinc-950/20 transition-all">
                <Upload className="text-zinc-650 mb-2" size={24} />
                <p className="text-xs font-bold text-zinc-400">Upload Before / After Photos</p>
                <p className="text-[9px] text-zinc-600 mt-1">Accepts PNG or JPEG up to 10MB</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAFF TAB (FUTURE) */}
      {activeTab === 'staff' && (
        <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
          <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-center max-w-lg">
            <Users size={36} className="text-[#caa24c] mx-auto mb-3" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Employee Scheduling & Rota Portal</h3>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              Staff availability management, timesheet submission approvals, and payroll ledger integration will be deployed in Version 2.0.
            </p>
          </div>
        </div>
      )}

      {/* 1. New Bill Modal */}
      <PortalModal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        title="Log Operational Bill"
      >
        <form onSubmit={handleAddBillSubmit} className="space-y-4">
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
              <label className="text-[9px] uppercase font-bold text-zinc-500">Amount (USD)</label>
              <input
                type="number"
                required
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                placeholder="120.00"
                className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-500">Frequency</label>
              <PortalSelect
                value={billFrequency}
                onChange={setBillFrequency}
                options={[
                  { value: 'Monthly', label: 'Monthly' },
                  { value: 'Quarterly', label: 'Quarterly' },
                  { value: 'Annually', label: 'Annually' }
                ]}
              />
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
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg cursor-pointer transition-all"
            >
              Save Bill
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
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg cursor-pointer transition-all"
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
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg cursor-pointer transition-all"
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
            <label className="text-[9px] uppercase font-bold text-zinc-500">Vendor Type</label>
            <PortalSelect
              value={vendorType}
              onChange={setVendorType}
              options={[
                { value: 'DJs & Music', label: 'DJs & Music' },
                { value: 'Fine Caterers', label: 'Fine Caterers' },
                { value: 'Security Crew', label: 'Security Crew' },
                { value: 'Florist Services', label: 'Florist Services' },
                { value: 'Rentals & Decor', label: 'Rentals & Decor' },
                { value: 'Valet Service', label: 'Valet Service' },
                { value: 'Bartenders', label: 'Bartenders' },
                { value: 'Photographers', label: 'Photographers' }
              ]}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-zinc-500">Business Name</label>
            <input
              type="text"
              required
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Prestige Valet Co."
              className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-550">Email</label>
              <input
                type="email"
                value={vendorEmail}
                onChange={(e) => setVendorEmail(e.target.value)}
                placeholder="sales@prestige.com"
                className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-555">Phone</label>
              <input
                type="text"
                value={vendorPhone}
                onChange={(e) => setVendorPhone(e.target.value)}
                placeholder="214-555-0100"
                className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-550">Rating</label>
              <PortalSelect
                value={vendorRating}
                onChange={setVendorRating}
                options={[
                  { value: '5.0 ⭐', label: '5.0 ⭐' },
                  { value: '4.9 ⭐', label: '4.9 ⭐' },
                  { value: '4.8 ⭐', label: '4.8 ⭐' },
                  { value: '4.7 ⭐', label: '4.7 ⭐' },
                  { value: '4.5 ⭐', label: '4.5 ⭐' }
                ]}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-bold text-zinc-550">Active COI Insurance</label>
              <PortalSelect
                value={vendorCoi}
                onChange={setVendorCoi}
                options={[
                  { value: 'true', label: 'Yes - Active COI' },
                  { value: 'false', label: 'No - Pending COI' }
                ]}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setIsVendorModalOpen(false)}
              className="px-4 py-2 border border-transparent text-xs font-bold text-zinc-500 hover:text-zinc-350 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg cursor-pointer transition-all"
            >
              Add Vendor
            </button>
          </div>
        </form>
      </PortalModal>

      {/* 5. Edit Modals */}
      {editingItem && editFormData && (
        <PortalModal
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          title={`Edit ${
            editingItem.type === 'bill'
              ? 'Operational Bill'
              : editingItem.type === 'task'
              ? 'Maintenance Ticket'
              : editingItem.type === 'inventory'
              ? 'Inventory Item'
              : 'Preferred Vendor'
          }`}
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {editingItem.type === 'bill' && (
              <>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Service Name</label>
                  <input
                    type="text"
                    required
                    value={editFormData.service || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, service: e.target.value })}
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Provider / Account</label>
                  <input
                    type="text"
                    required
                    value={editFormData.provider || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, provider: e.target.value })}
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-550">Amount (USD)</label>
                    <input
                      type="number"
                      required
                      value={editFormData.amount !== undefined ? editFormData.amount : ''}
                      onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                      className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-550">Frequency</label>
                    <PortalSelect
                      value={editFormData.frequency || 'Monthly'}
                      onChange={(val) => setEditFormData({ ...editFormData, frequency: val })}
                      options={[
                        { value: 'Monthly', label: 'Monthly' },
                        { value: 'Quarterly', label: 'Quarterly' },
                        { value: 'Annually', label: 'Annually' }
                      ]}
                    />
                  </div>
                </div>
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
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Vendor Type</label>
                  <PortalSelect
                    value={editFormData.vendor_type || 'DJs & Music'}
                    onChange={(val) => setEditFormData({ ...editFormData, vendor_type: val })}
                    options={[
                      { value: 'DJs & Music', label: 'DJs & Music' },
                      { value: 'Fine Caterers', label: 'Fine Caterers' },
                      { value: 'Security Crew', label: 'Security Crew' },
                      { value: 'Florist Services', label: 'Florist Services' },
                      { value: 'Rentals & Decor', label: 'Rentals & Decor' },
                      { value: 'Valet Service', label: 'Valet Service' },
                      { value: 'Bartenders', label: 'Bartenders' },
                      { value: 'Photographers', label: 'Photographers' }
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-zinc-550">Business Name</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-550">Email</label>
                    <input
                      type="email"
                      value={editFormData.email || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value || null })}
                      className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-550">Phone</label>
                    <input
                      type="text"
                      value={editFormData.phone || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value || null })}
                      className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-550">Rating</label>
                    <PortalSelect
                      value={editFormData.rating || '5.0 ⭐'}
                      onChange={(val) => setEditFormData({ ...editFormData, rating: val })}
                      options={[
                        { value: '5.0 ⭐', label: '5.0 ⭐' },
                        { value: '4.9 ⭐', label: '4.9 ⭐' },
                        { value: '4.8 ⭐', label: '4.8 ⭐' },
                        { value: '4.7 ⭐', label: '4.7 ⭐' },
                        { value: '4.5 ⭐', label: '4.5 ⭐' }
                      ]}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-550">Active COI Insurance</label>
                    <PortalSelect
                      value={editFormData.coi_active !== undefined ? String(editFormData.coi_active) : 'true'}
                      onChange={(val) => setEditFormData({ ...editFormData, coi_active: val === 'true' })}
                      options={[
                        { value: 'true', label: 'Yes - Active COI' },
                        { value: 'false', label: 'No - Pending COI' }
                      ]}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 justify-between pt-2">
              <button
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
              </button>
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
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg cursor-pointer transition-all disabled:opacity-50"
                >
                  {submittingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </PortalModal>
      )}

      {/* 6. Delete Confirmation Modal */}
      {deletingItem && (
        <PortalModal
          isOpen={!!deletingItem}
          onClose={() => setDeletingItem(null)}
          title="Confirm Deletion"
        >
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
        </PortalModal>
      )}
    </PortalPageFrame>
  )
}

function StatsCard({
  label,
  value,
  subtitle,
  tone = 'blue'
}: {
  label: string
  value: string
  subtitle: string
  tone?: 'blue' | 'purple' | 'cyan' | 'gold' | 'green'
}) {
  const styles = {
    blue: 'border-blue-500/10 bg-blue-500/5 text-blue-400',
    purple: 'border-purple-500/10 bg-purple-500/5 text-purple-400',
    cyan: 'border-cyan-500/10 bg-cyan-500/5 text-cyan-400',
    gold: 'border-[#caa24c]/10 bg-[#caa24c]/5 text-[#f1d27a]',
    green: 'border-emerald-500/10 bg-emerald-500/5 text-emerald-400'
  }

  return (
    <div className="luxor-glass-card rounded-xl p-4 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] flex flex-col justify-between min-h-[110px]">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        <p className="font-mono text-xl font-bold text-white mt-1.5">{value}</p>
      </div>
      <p className="text-[10px] text-zinc-500 font-medium leading-none mt-3">{subtitle}</p>
    </div>
  )
}
