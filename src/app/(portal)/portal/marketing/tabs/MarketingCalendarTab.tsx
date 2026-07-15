'use client'

import React, { useState } from 'react'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Mail,
  MessageSquare,
  Sparkles,
  Share2,
  TrendingUp,
  Gift,
  Plus,
  Settings,
  MoreVertical,
  Compass,
  ArrowRight
} from 'lucide-react'
import { PortalModal, PortalSelect, PortalDatePicker } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

type CalendarEvent = {
  id: string
  title: string
  time: string
  day: number // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
  color: 'green' | 'blue' | 'purple' | 'yellow' | 'pink' | 'orange'
  type: string
  allDay?: boolean
}

export function MarketingCalendarTab() {
  const { notify } = useToast()
  
  // Date states
  const [activeView, setActiveView] = useState<'week' | 'month' | 'list'>('week')
  const [selectedEventType, setSelectedEventType] = useState('all')
  const [selectedChannel, setSelectedChannel] = useState('all')

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [scheduleType, setScheduleType] = useState('email')
  const [scheduleName, setScheduleName] = useState('')
  const [scheduleDate, setScheduleDate] = useState('2026-05-13')
  const [scheduleTime, setScheduleTime] = useState('12:00')

  // Pre-configured Calendar Events matching screenshot
  const [events, setEvents] = useState<CalendarEvent[]>([
    // All day row
    { id: '1', title: "Mother's Day", time: 'All Day', day: 0, color: 'pink', type: 'Holiday', allDay: true },
    { id: '2', title: 'Send Newsletter', time: 'All Day', day: 1, color: 'green', type: 'Email', allDay: true },
    { id: '3', title: 'National Wedding Planning Day', time: 'All Day', day: 3, color: 'purple', type: 'Automation', allDay: true },
    { id: '4', title: 'Client Tour Weekend', time: 'All Day', day: 5, color: 'yellow', type: 'Social', allDay: true },

    // Hourly events
    { id: '5', title: 'Venue Tour Reminder Email', time: '9:00 AM', day: 1, color: 'green', type: 'Email' },
    { id: '6', title: 'Re-engagement SMS', time: '9:00 AM', day: 3, color: 'blue', type: 'SMS' },
    { id: '7', title: 'Open House Reminder Email', time: '9:00 AM', day: 6, color: 'yellow', type: 'Social' },
    
    { id: '8', title: 'Autumn/Deco Email', time: '11:00 AM', day: 2, color: 'pink', type: 'Promotion' },
    { id: '9', title: 'Tour Follow-up Email', time: '11:00 AM', day: 4, color: 'green', type: 'Email' },
    { id: '10', title: 'Weekend Special Email', time: '11:00 AM', day: 5, color: 'pink', type: 'Promotion' },

    { id: '11', title: 'Follow Up SMS', time: '12:00 PM', day: 1, color: 'blue', type: 'SMS' },
    { id: '12', title: 'Grand Opening Promotion Email', time: '12:00 PM', day: 3, color: 'orange', type: 'Promotion' },

    { id: '13', title: 'Pricing Guide Email', time: '1:00 PM', day: 1, color: 'green', type: 'Email' },
    { id: '14', title: 'Social Post', time: '1:00 PM', day: 5, color: 'yellow', type: 'Social' },

    { id: '15', title: 'Wedding Inspiration Email', time: '2:00 PM', day: 1, color: 'purple', type: 'Automation' },
    { id: '16', title: 'Proposal Reminder SMS', time: '2:00 PM', day: 4, color: 'blue', type: 'SMS' },
    { id: '17', title: 'Event Vendor Spotlight Email', time: '2:00 PM', day: 6, color: 'pink', type: 'Promotion' },

    { id: '18', title: 'VIP Ad Email', time: '4:00 PM', day: 3, color: 'purple', type: 'Automation' },
    { id: '19', title: 'Flash Sale Email', time: '5:00 PM', day: 5, color: 'green', type: 'Email' },
    
    { id: '20', title: 'Social Post', time: '6:00 PM', day: 1, color: 'yellow', type: 'Social' },
    { id: '21', title: 'Thank You Email', time: '6:00 PM', day: 6, color: 'blue', type: 'SMS' }
  ])

  // Filters state mapping
  const filterTabs = [
    { label: 'Calendar View', icon: <CalendarIcon size={12} />, active: true },
    { label: 'Email Campaigns', icon: <Mail size={12} />, active: false },
    { label: 'SMS Campaigns', icon: <MessageSquare size={12} />, active: false },
    { label: 'Automations', icon: <Sparkles size={12} />, active: false },
    { label: 'Social Media', icon: <Share2 size={12} />, active: false },
    { label: 'Promotions', icon: <TrendingUp size={12} />, active: false },
    { label: 'Holidays', icon: <Gift size={12} />, active: false },
    { label: 'Birthdays', icon: <Compass size={12} />, active: false }
  ]

  // Event list matching selected filters
  const filteredEvents = events.filter(e => {
    if (selectedEventType !== 'all' && e.type !== selectedEventType) return false
    return true
  })

  // Group events by day of week
  const eventsByDay = (day: number) => filteredEvents.filter(e => e.day === day && !e.allDay)
  const allDayEventsByDay = (day: number) => filteredEvents.filter(e => e.day === day && e.allDay)

  const daysHeader = [
    { label: 'SUN', dateNum: 'May 11', dayIdx: 0 },
    { label: 'MON', dateNum: 'May 12', dayIdx: 1 },
    { label: 'TUE', dateNum: 'May 13', dayIdx: 2 },
    { label: 'WED', dateNum: 'May 14', dayIdx: 3 },
    { label: 'THU', dateNum: 'May 15', dayIdx: 4 },
    { label: 'FRI', dateNum: 'May 16', dayIdx: 5 },
    { label: 'SAT', dateNum: 'May 17', dayIdx: 6 }
  ]

  // Time slots list
  const timeSlots = [
    '8:00 AM',
    '9:00 AM',
    '10:00 AM',
    '11:00 AM',
    '12:00 PM',
    '1:00 PM',
    '2:00 PM',
    '3:00 PM',
    '4:00 PM',
    '5:00 PM',
    '6:00 PM',
    '7:00 PM',
    '8:00 PM'
  ]

  function handleScheduleEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!scheduleName.trim()) return

    const parsedDate = new Date(scheduleDate)
    const dayOfWeek = isNaN(parsedDate.getDay()) ? 3 : parsedDate.getDay()

    let color: 'green' | 'blue' | 'purple' | 'yellow' | 'pink' | 'orange' = 'green'
    if (scheduleType === 'sms') color = 'blue'
    else if (scheduleType === 'automation') color = 'purple'
    else if (scheduleType === 'social') color = 'yellow'
    else if (scheduleType === 'promotion') color = 'pink'

    const formatTime12h = (t: string) => {
      const [hStr, mStr] = t.split(':')
      const h = parseInt(hStr, 10)
      const suffix = h >= 12 ? 'PM' : 'AM'
      const formattedH = h % 12 || 12
      return `${formattedH}:${mStr} ${suffix}`
    }

    const newEvent: CalendarEvent = {
      id: String(events.length + 1),
      title: scheduleName,
      time: formatTime12h(scheduleTime),
      day: dayOfWeek,
      color,
      type: scheduleType.toUpperCase()
    }

    setEvents([...events, newEvent])
    setIsScheduleModalOpen(false)
    setScheduleName('')

    notify({
      title: 'Campaign Scheduled',
      description: `"${scheduleName}" has been added to the calendar grid.`,
      variant: 'success'
    })
  }

  return (
    <div className="space-y-6">
      {/* Top filter tabs mimicking image exactly */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-900 pb-3">
        {filterTabs.map((t, idx) => (
          <button
            key={idx}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all border ${
              t.active
                ? 'bg-[#caa24c]/10 text-[#caa24c] border-[#caa24c]/30 shadow-[0_0_15px_rgba(202,162,76,0.05)]'
                : 'border-zinc-900 bg-zinc-950/20 text-zinc-550 hover:text-zinc-300 hover:border-zinc-800'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Grid Controller Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Navigation buttons */}
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-zinc-900 bg-zinc-950/30 p-1">
            <button className="rounded p-1 text-zinc-500 hover:bg-zinc-900 hover:text-white transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button className="rounded px-2.5 py-1 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-colors font-mono">
              Today
            </button>
            <button className="rounded p-1 text-zinc-500 hover:bg-zinc-900 hover:text-white transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>

          <h3 className="text-xs font-black uppercase tracking-widest text-white font-mono">
            May 11 – May 17, 2026
          </h3>
        </div>

        {/* Dropdowns filters and Week/Month toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <PortalSelect
            value={selectedEventType}
            onChange={setSelectedEventType}
            options={[
              { value: 'all', label: 'All Event Types' },
              { value: 'EMAIL', label: 'Emails' },
              { value: 'SMS', label: 'SMS Campaigns' },
              { value: 'SOCIAL', label: 'Social Posts' },
              { value: 'PROMOTION', label: 'Promotions' }
            ]}
          />
          <PortalSelect
            value={selectedChannel}
            onChange={setSelectedChannel}
            options={[
              { value: 'all', label: 'All Channels' },
              { value: 'live', label: 'Active/Live' },
              { value: 'pending', label: 'Scheduled' }
            ]}
          />
          <button className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/30 px-3 py-1.5 text-[9px] font-black uppercase text-zinc-400 hover:text-white">
            <Filter size={11} /> Filters
          </button>

          <div className="flex items-center rounded-lg border border-zinc-900 bg-zinc-950/30 p-1 text-[9px] font-black uppercase tracking-wider text-zinc-400 font-mono">
            <button
              onClick={() => setActiveView('week')}
              className={`rounded px-3 py-1 transition-all ${
                activeView === 'week' ? 'bg-[#caa24c]/10 text-[#caa24c]' : 'hover:text-zinc-250'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setActiveView('month')}
              className={`rounded px-3 py-1 transition-all ${
                activeView === 'month' ? 'bg-[#caa24c]/10 text-[#caa24c]' : 'hover:text-zinc-250'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setActiveView('list')}
              className={`rounded px-3 py-1 transition-all ${
                activeView === 'list' ? 'bg-[#caa24c]/10 text-[#caa24c]' : 'hover:text-zinc-250'
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Main Layout containing Grid and Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[500px]">
        
        {/* Calendar Grid Sheet */}
        <div className="lg:col-span-3 border border-zinc-900 bg-zinc-950/10 rounded-2xl overflow-hidden flex flex-col min-w-0">
          
          {/* Grid Header (Day columns) */}
          <div className="grid grid-cols-8 border-b border-zinc-900 bg-zinc-950/40 text-center font-mono">
            <div className="px-2 py-3.5 text-[9px] font-black uppercase tracking-widest text-zinc-600 border-r border-zinc-900">
              TIME
            </div>
            {daysHeader.map((d, idx) => (
              <div key={idx} className="px-2 py-2 border-r border-zinc-900 last:border-r-0">
                <p className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">{d.label}</p>
                <p className="text-[11px] font-bold text-white mt-1">{d.dateNum.split(' ')[1]}</p>
              </div>
            ))}
          </div>

          {/* All Day row */}
          <div className="grid grid-cols-8 border-b border-zinc-900/60 bg-zinc-950/20">
            <div className="px-2 py-3 text-[9px] font-black uppercase tracking-wider text-zinc-600 text-center border-r border-zinc-900 flex items-center justify-center">
              All Day
            </div>
            {daysHeader.map((d) => {
              const allDayList = allDayEventsByDay(d.dayIdx)
              return (
                <div key={d.dayIdx} className="p-1 border-r border-zinc-900 last:border-r-0 space-y-1 min-h-[48px] flex flex-col justify-center">
                  {allDayList.map((e) => (
                    <EventBadge key={e.id} event={e} />
                  ))}
                </div>
              )}
            )}
          </div>

          {/* Scrollable hourly grid slots */}
          <div className="flex-1 max-h-[500px] overflow-y-auto portal-scrollbar divide-y divide-zinc-900/40">
            {timeSlots.map((time, tIdx) => (
              <div key={tIdx} className="grid grid-cols-8 min-h-[56px]">
                {/* Time Indicator column */}
                <div className="px-2 py-3 border-r border-zinc-900 text-[9px] font-mono font-bold text-zinc-650 text-center flex items-center justify-center bg-zinc-950/10">
                  {time}
                </div>

                {/* Day Columns */}
                {daysHeader.map((d) => {
                  const hourlyList = eventsByDay(d.dayIdx).filter(e => e.time === time)
                  return (
                    <div key={d.dayIdx} className="p-1.5 border-r border-zinc-900 last:border-r-0 space-y-1 relative group hover:bg-zinc-900/5 min-h-[56px] flex flex-col justify-center">
                      {hourlyList.map((e) => (
                        <EventBadge key={e.id} event={e} />
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right-hand Sidebar */}
        <div className="space-y-6">
          
          {/* Calendar Overview stats */}
          <div className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5 space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Calendar Overview</h4>
            
            <div className="grid grid-cols-2 gap-3">
              <OverviewKPI label="Emails" count="18 Scheduled" color="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" />
              <OverviewKPI label="SMS" count="7 Scheduled" color="bg-blue-500/10 text-blue-400 border border-blue-500/20" />
              <OverviewKPI label="Automations" count="6 Active" color="bg-purple-500/10 text-purple-400 border border-purple-500/20" />
              <OverviewKPI label="Social Posts" count="4 Posts" color="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" />
              <OverviewKPI label="Promotions" count="3 Live" color="bg-orange-500/10 text-orange-400 border border-orange-500/20" />
              <OverviewKPI label="Holidays" count="5 Holiday" color="bg-pink-500/10 text-pink-400 border border-pink-500/20" />
            </div>
          </div>

          {/* Mini Month widget layout */}
          <div className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-4 space-y-3 font-mono text-center">
            <div className="flex justify-between items-center text-[10px] font-bold text-white px-1">
              <span>May 2026</span>
              <div className="flex items-center gap-1.5">
                <ChevronLeft size={12} className="text-zinc-550 cursor-pointer" />
                <ChevronRight size={12} className="text-zinc-550 cursor-pointer" />
              </div>
            </div>
            
            {/* Minimal calendar grid */}
            <div className="grid grid-cols-7 gap-1 text-[8px] font-bold text-zinc-550">
              <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[9px] text-zinc-400 font-mono">
              <span className="text-zinc-800">26</span><span className="text-zinc-800">27</span><span className="text-zinc-800">28</span><span className="text-zinc-800">29</span><span className="text-zinc-800">30</span><span>1</span><span>2</span>
              <span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>
              <span>10</span><span className="bg-[#caa24c] text-black font-black rounded-full h-4 w-4 flex items-center justify-center mx-auto">11</span><span>12</span><span>13</span><span>14</span><span>15</span><span>16</span>
              <span>17</span><span>18</span><span>19</span><span>20</span><span>21</span><span>22</span><span>23</span>
              <span>24</span><span>25</span><span>26</span><span>27</span><span>28</span><span>29</span><span>30</span>
            </div>
          </div>

          {/* Upcoming Holidays */}
          <div className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5 space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Upcoming Dates</h4>
            <div className="space-y-3 text-xs">
              <HolidayDateRow title="Mother's Day" date="May 11, 2026" />
              <HolidayDateRow title="Memorial Day" date="May 25, 2026" />
              <HolidayDateRow title="Father's Day" date="June 21, 2026" />
              <HolidayDateRow title="Independence Day" date="July 4, 2026" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row Dashboard: Schedule actions and Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Quick Schedule Grid */}
        <div className="md:col-span-2 rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5 space-y-4">
          <h4 className="text-xs font-black uppercase tracking-wider text-white">Schedule New</h4>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <QuickScheduleBtn onClick={() => { setScheduleType('email'); setIsScheduleModalOpen(true); }} icon={<Mail size={14} />} label="Email" color="hover:border-emerald-500/40 text-emerald-400" />
            <QuickScheduleBtn onClick={() => { setScheduleType('sms'); setIsScheduleModalOpen(true); }} icon={<MessageSquare size={14} />} label="SMS" color="hover:border-blue-500/40 text-blue-400" />
            <QuickScheduleBtn onClick={() => { setScheduleType('automation'); setIsScheduleModalOpen(true); }} icon={<Sparkles size={14} />} label="Automation" color="hover:border-purple-500/40 text-purple-400" />
            <QuickScheduleBtn onClick={() => { setScheduleType('social'); setIsScheduleModalOpen(true); }} icon={<Share2 size={14} />} label="Social" color="hover:border-yellow-500/40 text-yellow-400" />
            <QuickScheduleBtn onClick={() => { setScheduleType('promotion'); setIsScheduleModalOpen(true); }} icon={<TrendingUp size={14} />} label="Promotion" color="hover:border-orange-500/40 text-orange-400" />
            <QuickScheduleBtn onClick={() => { setScheduleType('holiday'); setIsScheduleModalOpen(true); }} icon={<Gift size={14} />} label="Holiday Special" color="hover:border-pink-500/40 text-pink-400" />
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="luxor-glass-card rounded-2xl border border-[#caa24c]/10 bg-zinc-950/20 p-5 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-wider text-[#caa24c]">Recommended for you</span>
            <h4 className="text-xs font-bold text-white mt-1">Memorial Day Email Campaign</h4>
            <p className="text-[10px] text-zinc-500 leading-relaxed font-medium mt-1">
              Reach out to your leads lists with a promotional Memorial Day tour special.
            </p>
          </div>
          <button
            onClick={() => {
              setScheduleType('email')
              setScheduleName('Memorial Day Campaign')
              setIsScheduleModalOpen(true)
            }}
            className="flex items-center gap-1.5 justify-center rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 py-2 text-[10px] font-black uppercase tracking-widest text-[#caa24c] hover:text-white transition-all mt-4 w-full"
          >
            <span>Schedule Campaign</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* Schedule Modal */}
      <PortalModal isOpen={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)} title="Schedule Marketing Action">
        <form onSubmit={handleScheduleEvent} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 font-bold">Campaign / Action Name</label>
            <input
              type="text"
              required
              value={scheduleName}
              onChange={(e) => setScheduleName(e.target.value)}
              placeholder="e.g. Memorial Day Open House Invite"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 font-bold">Action Type</label>
              <PortalSelect
                value={scheduleType}
                onChange={setScheduleType}
                options={[
                  { value: 'email', label: 'Email Campaign' },
                  { value: 'sms', label: 'SMS Blast' },
                  { value: 'automation', label: 'Automation Workflow' },
                  { value: 'social', label: 'Social Post' },
                  { value: 'promotion', label: 'Holiday Promotion' }
                ]}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 font-bold">Schedule Time</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 font-bold">Schedule Date</label>
            <PortalDatePicker
              value={scheduleDate}
              onChange={setScheduleDate}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-900 pt-4 mt-6">
            <button
              type="button"
              onClick={() => setIsScheduleModalOpen(false)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs font-black uppercase tracking-wider text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-[#caa24c] px-5 py-2 text-xs font-black uppercase tracking-wider text-black shadow-xl shadow-[#caa24c]/10 hover:bg-[#dfbd68]"
            >
              <Plus size={12} />
              <span>Schedule</span>
            </button>
          </div>
        </form>
      </PortalModal>
    </div>
  )
}

function EventBadge({ event }: { event: CalendarEvent }) {
  const styles = {
    green: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    pink: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
    orange: 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
  }

  return (
    <div className={`rounded p-1.5 text-[9px] leading-tight font-bold border ${styles[event.color]} select-none shadow-sm relative group/badge`}>
      <p className="truncate pr-1.5 text-white/95">{event.title}</p>
      {!event.allDay && <p className="font-mono text-[8px] text-zinc-500 mt-0.5">{event.time}</p>}
    </div>
  )
}

function OverviewKPI({ label, count, color }: { label: string; count: string; color: string }) {
  return (
    <div className={`rounded-lg p-2.5 text-center flex flex-col justify-between ${color}`}>
      <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60 leading-none">{label}</span>
      <span className="text-[9px] font-black tracking-wide mt-1.5 leading-none">{count}</span>
    </div>
  )
}

function HolidayDateRow({ title, date }: { title: string; date: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-zinc-900 last:border-b-0">
      <span className="font-bold text-white/90">{title}</span>
      <span className="font-mono text-zinc-550 text-[10px]">{date}</span>
    </div>
  )
}

function QuickScheduleBtn({
  onClick,
  icon,
  label,
  color
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  color: string
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border border-zinc-900 bg-zinc-950/40 p-3 text-center flex flex-col items-center justify-center gap-2 hover:bg-zinc-900/30 hover:border-zinc-800 transition-all active:scale-95 group ${color}`}
    >
      <span className="group-hover:scale-105 transition-transform">{icon}</span>
      <span className="text-[9px] font-black uppercase tracking-wider text-zinc-450 group-hover:text-white transition-colors">{label}</span>
    </button>
  )
}
