'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Users,
  Search,
  Filter,
  Plus,
  Mail,
  Phone,
  MessageSquare,
  Sparkles,
  Download,
  Trash2,
  AlertCircle,
  MoreVertical
} from 'lucide-react'
import {
  PortalTableCard,
  PortalStickyTable,
  PortalStickyThead,
  PortalModal,
  PortalSelect,
  PortalAnimatedTabs,
  PortalButton,
  PortalContactAvatar
} from '@/components/portal/PortalUI'
import { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
import { useToast } from '@/components/portal/ToastProvider'

import { MarketingList, MarketingListMember } from '../page'

export interface ContactRecord {
  id: string
  full_name: string
  email: string
  phone: string
  event_type: string
  source: string
  submittedForm: string
  dateAdded: string
  emailStatus: string
  smsStatus: string
  tags: string[]
  avatar_url?: string | null
}

interface ContactListsTabProps {
  inquiries: LuxorInquiry[]
  marketingLists?: MarketingList[]
  initialSourceFilter?: string
  onAddContact: (contact: Partial<LuxorInquiry>) => Promise<void>
  isAddModalOpen: boolean
  onAddModalOpenChange: (isOpen: boolean) => void
}

type CategoryView = 'all' | 'subscribers' | 'leads' | 'clients' | 'archived'

function isGrandOpeningRsvp(inquiry: LuxorInquiry) {
  return inquiry.campaign_key === 'grand_opening_2026_07_25'
    || inquiry.flow === 'grand_opening_rsvp'
    || inquiry.source === 'grand_opening_rsvp'
}

export function ContactListsTab({
  inquiries,
  marketingLists = [],
  initialSourceFilter = '',
  onAddContact,
  isAddModalOpen,
  onAddModalOpenChange
}: ContactListsTabProps) {
  const { notify } = useToast()
  
  // States
  const [view, setView] = useState<CategoryView>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState(initialSourceFilter)
  const [formFilter, setFormFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [emailStatusFilter, setEmailStatusFilter] = useState('all')
  const [smsStatusFilter, setSmsStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const PAGE_SIZE = 25

  const [submittingContact, setSubmittingContact] = useState(false)

  // Add Contact Form State
  const [newFullName, setNewFullName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEventType, setNewEventType] = useState('wedding')
  const [newSource, setNewSource] = useState('Website')
  const [newFormSubmitted, setNewFormSubmitted] = useState('General Contact Form')
  const [newTags, setNewTags] = useState('')

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('add') === 'true') {
        onAddModalOpenChange(true)
        // Clean the query parameter from URL
        params.delete('add')
        const remainingStr = params.toString()
        const newUrl = window.location.pathname + (remainingStr ? `?${remainingStr}` : '')
        window.history.replaceState({}, '', newUrl)
      }
    }
  }, [onAddModalOpenChange])

  const subscriberEmails = useMemo(
    () => new Set(
      marketingLists
        .flatMap((list) => list.members.map((member) => member.email.trim().toLowerCase()))
        .filter(Boolean),
    ),
    [marketingLists],
  )

  // Map database inquiries to table contacts structure
  const dbContacts = useMemo(() => {
    return inquiries.map((inq) => {
      const emailStatus = inq.email && subscriberEmails.has(inq.email.trim().toLowerCase()) ? 'Subscribed' : 'Not subscribed'
      const smsStatus = 'Not tracked'
      const submittedForm = isGrandOpeningRsvp(inq)
        ? 'Grand Opening RSVP'
        : inq.message?.includes('Pricing') 
        ? 'Pricing Guide Download' 
        : inq.event_type 
        ? `${inq.event_type} Inquiry` 
        : 'General Contact Form'
      
      const tagList = []
      if (inq.event_type) {
        if (inq.event_type.toLowerCase() === 'quinceanera' || inq.event_type.toLowerCase() === 'quinceañera') {
          tagList.push('Quinceañeras')
        } else if (inq.event_type.toLowerCase() === 'wedding') {
          tagList.push('Weddings')
        }
      }
      if (inq.status === 'booked') tagList.push('Client')
      else if (inq.status === 'closed_lost') tagList.push('Archived')
      else if (inq.status === 'new') tagList.push('New Lead')
      else tagList.push('Hot Lead')

      return {
        id: inq.id,
        full_name: inq.full_name,
        email: inq.email || '',
        phone: inq.phone || '',
        event_type: inq.event_type || 'Event',
        source: inq.source || 'Website',
        submittedForm,
        dateAdded: new Date(inq.created_at).toLocaleString(),
        emailStatus,
        smsStatus,
        tags: tagList,
        avatar_url: (inq.metadata?.avatar_url as string) || null,
      }
    })
  }, [inquiries, subscriberEmails])

  // Extract contacts from marketing lists
  const listContacts = useMemo<ContactRecord[]>(() => {
    const listItems: ContactRecord[] = []
    for (const list of marketingLists) {
      for (const m of list.members || []) {
        const phoneVal = m.metadata && typeof m.metadata.phone === 'string' ? m.metadata.phone : ''
        const eventVal = m.metadata && typeof m.metadata.event_type === 'string' ? m.metadata.event_type : 'Newsletter'
        listItems.push({
          id: m.id || `list-${m.email}`,
          full_name: m.full_name || m.email.split('@')[0],
          email: m.email,
          phone: phoneVal,
          event_type: eventVal,
          source: m.source || 'Website',
          submittedForm: list.name || 'Newsletter Signup',
          dateAdded: m.created_at ? new Date(m.created_at).toLocaleString() : 'Date not recorded',
          emailStatus: 'Subscribed',
          smsStatus: 'Not tracked',
          tags: ['Subscriber'],
          avatar_url: (m.metadata?.avatar_url as string) || null,
        })
      }
    }
    return listItems
  }, [marketingLists])

  // Merge unique contacts by email
  const allContacts = useMemo<ContactRecord[]>(() => {
    const map = new Map<string, ContactRecord>()
    
    // First insert list members
    listContacts.forEach(c => map.set(c.email ? `email:${c.email.toLowerCase()}` : `id:${c.id}`, c))
    
    // Overwrite/merge with inquiry data (which is richer)
    dbContacts.forEach(c => {
      const emailKey = c.email ? `email:${c.email.toLowerCase()}` : `id:${c.id}`
      if (map.has(emailKey)) {
        const existing = map.get(emailKey)
        if (existing) {
          map.set(emailKey, {
            ...existing,
            ...c,
            tags: Array.from(new Set([...existing.tags, ...c.tags]))
          })
        }
      } else {
        map.set(emailKey, c)
      }
    })

    const merged = Array.from(map.values())
    return merged
  }, [dbContacts, listContacts])


  // Compute Left sidebar counts dynamically
  const formMenuCounts = useMemo(() => {
    const countsMap = new Map<string, number>()
    allContacts.forEach(c => {
      countsMap.set(c.submittedForm, (countsMap.get(c.submittedForm) || 0) + 1)
    })

    return [
      { label: 'All Forms', count: allContacts.length, filterVal: 'all' },
      { label: 'Wedding Inquiry', count: countsMap.get('Wedding Inquiry') || 0, filterVal: 'Wedding Inquiry' },
      { label: 'Quinceañera Inquiry', count: countsMap.get('Quinceañera Inquiry') || 0, filterVal: 'Quinceañera Inquiry' },
      { label: 'Venue Tour Request', count: countsMap.get('Venue Tour Request') || 0, filterVal: 'Venue Tour Request' },
      { label: 'Pricing Guide Download', count: countsMap.get('Pricing Guide Download') || 0, filterVal: 'Pricing Guide Download' },
      { label: 'VIP Newsletter Signup', count: countsMap.get('VIP Newsletter Signup') || countsMap.get('VIP Newsletter') || 0, filterVal: 'VIP Newsletter' },
      { label: 'Grand Opening RSVP', count: countsMap.get('Grand Opening RSVP') || 0, filterVal: 'Grand Opening RSVP' },
      { label: 'Vendor Application', count: countsMap.get('Vendor Application') || 0, filterVal: 'Vendor Application' },
      { label: 'General Contact Form', count: countsMap.get('General Contact Form') || 0, filterVal: 'General Contact Form' }
    ]
  }, [allContacts])

  const sourceOptions = useMemo(() => {
    const sources = Array.from(new Set(allContacts.map((contact) => contact.source).filter(Boolean))).sort()
    return [
      { value: 'all', label: 'Lead Source: All' },
      ...sources.map((source) => ({ value: source, label: source })),
    ]
  }, [allContacts])

  const categoryTabs: { id: CategoryView; label: string; count: number }[] = [
    { id: 'all', label: 'All Contacts', count: allContacts.length },
    { id: 'subscribers', label: 'Subscribers', count: allContacts.filter((contact) => contact.emailStatus === 'Subscribed').length },
    { id: 'leads', label: 'Leads', count: allContacts.filter((contact) => !contact.tags.includes('Client') && !contact.tags.includes('Archived')).length },
    { id: 'clients', label: 'Clients', count: allContacts.filter((contact) => contact.tags.includes('Client')).length },
    { id: 'archived', label: 'Archived', count: allContacts.filter((contact) => contact.tags.includes('Archived')).length },
  ]

  // Filter contacts
  const filteredContacts = useMemo(() => {
    return allContacts.filter((c) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesName = c.full_name.toLowerCase().includes(query)
        const matchesEmail = c.email.toLowerCase().includes(query)
        const matchesPhone = c.phone.includes(query)
        if (!matchesName && !matchesEmail && !matchesPhone) return false
      }

      // 2. View Category Tab
      if (view === 'subscribers') {
        if (c.emailStatus !== 'Subscribed') return false
      } else if (view === 'leads') {
        if (c.tags.includes('Client') || c.tags.includes('Archived')) return false
      } else if (view === 'clients') {
        if (!c.tags.includes('Client')) return false
      } else if (view === 'archived') {
        if (!c.tags.includes('Archived')) return false
      }

      // 3. Source Filter
      if (sourceFilter !== 'all' && sourceFilter !== '') {
        if (c.source !== sourceFilter) return false
      }

      // 4. Form Filter
      if (formFilter !== 'all') {
        if (c.submittedForm !== formFilter) return false
      }

      // 5. Tag Filter
      if (tagFilter !== 'all') {
        if (!c.tags.includes(tagFilter)) return false
      }

      // 6. Email Status Filter
      if (emailStatusFilter !== 'all') {
        if (c.emailStatus !== emailStatusFilter) return false
      }

      // 7. SMS Status Filter
      if (smsStatusFilter !== 'all') {
        if (c.smsStatus !== smsStatusFilter) return false
      }

      return true
    })
  }, [allContacts, searchQuery, view, sourceFilter, formFilter, tagFilter, emailStatusFilter, smsStatusFilter])

  // Pagination
  const totalCount = filteredContacts.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const paginatedContacts = filteredContacts.slice(startIndex, startIndex + PAGE_SIZE)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, view, sourceFilter, formFilter, tagFilter, emailStatusFilter, smsStatusFilter])

  // Bounds check
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  async function handleSubmitContact(e: React.FormEvent) {
    e.preventDefault()
    if (!newFullName.trim() || !newEmail.trim()) return

    setSubmittingContact(true)
    try {
      await onAddContact({
        full_name: newFullName,
        email: newEmail,
        phone: newPhone,
        event_type: newEventType,
        source: newSource,
        message: `Submitted Form: ${newFormSubmitted}. Tags: ${newTags}`
      })

      onAddModalOpenChange(false)
      setNewFullName('')
      setNewEmail('')
      setNewPhone('')
      setNewTags('')
      
      notify({ title: 'Contact Created', description: 'New marketing contact added successfully.', variant: 'success' })
    } catch (err) {
      notify({ title: 'Error creating contact', description: 'Failed to save contact.', variant: 'error' })
    } finally {
      setSubmittingContact(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 overflow-x-auto border-b border-[color:var(--portal-border)] pb-2 portal-scrollbar">
        <PortalAnimatedTabs
          tabs={categoryTabs}
          activeTab={view}
          onTabChange={setView}
          ariaLabel="Contact categories"
        />
      </div>

      <PortalTableCard
            controls={
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="relative min-w-0 flex-1 md:max-w-md">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name, email, or phone..."
                      className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] py-2.5 pl-10 pr-4 text-xs font-semibold text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/40"
                    />
                  </div>
                  <span className="hidden shrink-0 font-mono text-[9px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)] sm:block">
                    {totalCount.toLocaleString()} contacts found
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
                  <PortalSelect
                    value={tagFilter}
                    onChange={setTagFilter}
                    className="w-full"
                    options={[
                      { value: 'all', label: 'Segment: All' },
                      { value: 'Weddings', label: 'Weddings' },
                      { value: 'Quinceañeras', label: 'Quinceañeras' },
                      { value: 'Hot Lead', label: 'Hot Leads' },
                      { value: 'Tour Scheduled', label: 'Tour Scheduled' },
                      { value: 'Proposal Sent', label: 'Proposal Sent' },
                      { value: 'Client', label: 'Booked Clients' },
                    ]}
                  />
                  <PortalSelect
                    value={sourceFilter || 'all'}
                    onChange={(val) => setSourceFilter(val === 'all' ? '' : val)}
                    className="w-full"
                    options={sourceOptions}
                  />
                  <PortalSelect
                    value={formFilter}
                    onChange={setFormFilter}
                    className="w-full"
                    options={formMenuCounts.map((form) => ({
                      value: form.filterVal,
                      label: form.filterVal === 'all' ? 'Form: All' : form.label,
                    }))}
                  />
                  <PortalSelect
                    value={emailStatusFilter}
                    onChange={setEmailStatusFilter}
                    className="w-full"
                    options={[{ value: 'all', label: 'Email: All' }, { value: 'Subscribed', label: 'Email: Subscribed' }, { value: 'Not subscribed', label: 'Email: Not subscribed' }]}
                  />
                  <PortalSelect
                    value={smsStatusFilter}
                    onChange={setSmsStatusFilter}
                    className="w-full"
                    options={[{ value: 'all', label: 'SMS: All' }, { value: 'Not tracked', label: 'SMS: Not tracked' }]}
                  />
                </div>
              </div>
            }
            footer={
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full text-[10px] uppercase font-bold text-zinc-550 tracking-widest select-none">
                <div>
                  Showing <span className="text-zinc-350 font-mono">{totalCount === 0 ? 0 : startIndex + 1}</span> -{' '}
                  <span className="text-zinc-350 font-mono">{Math.min(startIndex + PAGE_SIZE, totalCount)}</span> of{' '}
                  <span className="text-zinc-350 font-mono">{totalCount}</span> contacts
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(currentPage - 1)}
                      className="px-3 py-1.5 rounded bg-zinc-950/85 border border-zinc-900 text-zinc-400 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed hover:bg-zinc-900 transition-all font-black uppercase tracking-wider text-[9px]"
                    >
                      Prev
                    </button>
                    <div className="flex items-center gap-1 font-mono">
                      {Array.from({ length: totalPages }).map((_, i) => {
                        const pageNum = i + 1
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${
                              currentPage === pageNum
                                ? 'bg-[#caa24c]/15 text-[#f1d27a] border-[#caa24c]/30 font-bold'
                                : 'bg-zinc-950/20 text-zinc-550 border-zinc-900/60 hover:text-zinc-355 hover:bg-zinc-900'
                            }`}
                          >
                            {pageNum}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(currentPage + 1)}
                      className="px-3 py-1.5 rounded bg-zinc-950/85 border border-zinc-900 text-zinc-400 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed hover:bg-zinc-900 transition-all font-black uppercase tracking-wider text-[9px]"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            }
          >
            <PortalStickyTable minWidth="1050px">
              <PortalStickyThead>
                <tr className="bg-zinc-950/80 text-[9px] font-black uppercase tracking-wider text-zinc-400">
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-4 py-4">Event Type</th>
                  <th className="px-4 py-4">Lead Source</th>
                  <th className="px-4 py-4">Form Submitted</th>
                  <th className="px-4 py-4">Date Added</th>
                  <th className="px-4 py-4 text-center">Email Status</th>
                  <th className="px-4 py-4 text-center">SMS Status</th>
                  <th className="px-4 py-4">Tags</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </PortalStickyThead>
              <tbody className="divide-y divide-zinc-900/60 text-xs font-semibold">
                {paginatedContacts.length > 0 ? (
                  paginatedContacts.map((contact) => {
                    return (
                      <tr key={contact.id} className="hover:bg-zinc-900/10 transition-colors border-b border-zinc-900/40">
                        <td className="px-6 py-4 flex items-center gap-3">
                          <PortalContactAvatar name={contact.full_name} avatarUrl={contact.avatar_url} size="md" />
                          <div>
                            <p className="font-bold text-white leading-tight">{contact.full_name}</p>
                            <p className="text-[10px] text-zinc-550 truncate mt-0.5">{contact.email}</p>
                            {contact.phone && <p className="text-[9px] text-zinc-650 font-mono mt-0.5">{formatPhoneDisplay(contact.phone)}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded bg-zinc-900/50 border border-zinc-800 px-2 py-0.5 text-[8.5px] font-bold text-zinc-400">
                            {contact.event_type}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-zinc-350">{contact.source}</td>
                        <td className="px-4 py-4 text-zinc-450">{contact.submittedForm}</td>
                        <td className="px-4 py-4 font-mono text-[10px] text-zinc-500">{contact.dateAdded}</td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block rounded px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                            contact.emailStatus === 'Subscribed'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                          }`}>
                            {contact.emailStatus}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block rounded px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                            contact.smsStatus === 'Subscribed'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                          }`}>
                            {contact.smsStatus}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {contact.tags.map((tag: string, tIdx: number) => (
                              <span key={tIdx} className={`rounded px-1.5 py-0.5 text-[8.5px] font-bold ${
                                tag === 'Hot Lead'
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  : tag === 'Tour Scheduled'
                                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                  : tag === 'Proposal Sent'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
                              }`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {contact.email && (
                              <button
                                onClick={() => {
                                  window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead: contact } }))
                                }}
                                className="rounded p-1 text-zinc-500 hover:text-white transition-colors"
                              >
                                <Mail size={13} />
                              </button>
                            )}
                            <button className="rounded p-1 text-zinc-650 hover:text-white transition-colors">
                              <MoreVertical size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-zinc-650 text-xs font-semibold">
                      No contacts found matching the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </PortalStickyTable>
          </PortalTableCard>

      {/* Add Contact Modal */}
      <PortalModal
        isOpen={isAddModalOpen}
        onClose={() => onAddModalOpenChange(false)}
        title="Create Marketing Contact"
        description="Add a contact to the marketing directory without creating a full sales opportunity."
      >
        <form onSubmit={handleSubmitContact} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Full Name</label>
            <input
              type="text"
              required
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder="Sarah Johnson"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Email Address</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="sarah@example.com"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Phone Number</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="(210) 555-0199"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Event Type</label>
              <PortalSelect
                value={newEventType}
                onChange={setNewEventType}
                className="w-full"
                options={[
                  { value: 'wedding', label: 'Wedding' },
                  { value: 'quinceañera', label: 'Quinceañera' },
                  { value: 'corporate', label: 'Corporate Event' },
                  { value: 'private celebration', label: 'Private Celebration' },
                  { value: 'other', label: 'Other Event' },
                ]}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Lead Source</label>
              <PortalSelect
                value={newSource}
                onChange={setNewSource}
                className="w-full"
                options={[
                  { value: 'Website', label: 'Website' },
                  { value: 'Instagram', label: 'Instagram' },
                  { value: 'Facebook', label: 'Facebook' },
                  { value: 'The Knot', label: 'The Knot' },
                  { value: 'Referral', label: 'Referral' },
                  { value: 'Manual Entry', label: 'Manual Entry' },
                ]}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Submitted Form</label>
              <PortalSelect
                value={newFormSubmitted}
                onChange={setNewFormSubmitted}
                className="w-full"
                options={[
                  { value: 'General Contact Form', label: 'General Contact Form' },
                  { value: 'Wedding Inquiry', label: 'Wedding Inquiry' },
                  { value: 'Quinceañera Inquiry', label: 'Quinceañera Inquiry' },
                  { value: 'Venue Tour Request', label: 'Venue Tour Request' },
                  { value: 'Newsletter Signup', label: 'Newsletter Signup' },
                  { value: 'Manual Entry', label: 'Manual Entry' },
                ]}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Tags</label>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="VIP, planner, referral"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-900 pt-4 mt-6">
            <PortalButton onClick={() => onAddModalOpenChange(false)}>
              Cancel
            </PortalButton>
            <PortalButton
              type="submit"
              variant="primary"
              disabled={submittingContact}
            >
              {submittingContact ? 'Saving...' : 'Add Contact'}
            </PortalButton>
          </div>
        </form>
      </PortalModal>
    </div>
  )
}
