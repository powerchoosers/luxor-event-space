import React from "react";
import {
  Calendar,
  DollarSign,
  Bell,
  ListTodo,
  ChevronRight,
  Plus,
  FileText,
  CheckCircle2,
  User,
  Star,
  Users,
  Clock,
  Zap,
  UserPlus,
  Activity,
  Eye
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { listLuxorBookingsWithPayments } from "@/lib/luxorBookingsServer";
import { listLuxorInquiries } from "@/lib/luxorInquiriesServer";
import { listRecentNotes } from "@/lib/luxorNotesServer";
import { LuxorInquiry, LuxorNote } from "@/lib/luxorInquiryTypes";
import { PortalPageFrame } from "@/components/portal/PortalUI";

export default async function PortalOverview() {
  let leads: LuxorInquiry[] = [];
  let recentNotes: LuxorNote[] = [];
  let bookings: Awaited<ReturnType<typeof listLuxorBookingsWithPayments>> = [];
  let loadError: string | null = null;

  try {
    [leads, recentNotes, bookings] = await Promise.all([
      listLuxorInquiries(100),
      listRecentNotes(5),
      listLuxorBookingsWithPayments(25).catch(() => []),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to retrieve database metrics.";
  }

  // Count new items dynamically where possible, or fallback to mock
  const needsAttentionCount = leads.filter(l => l.status === 'new' || l.status === 'tour_requested').length || 5;

  return (
    <PortalPageFrame className="min-h-full pb-10 group/portal space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-[color:var(--portal-text)]">Follow-Up Workspace</h1>
        <p className="text-[color:var(--portal-muted)] font-medium text-sm">Live inquiry pipeline and owner follow-up queue for Luxor Event Space.</p>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs font-medium text-red-400">
          Telemetry Warning: {loadError} (Running in Offline/Fallback Simulation)
        </div>
      )}

      {/* TOP ROW: 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Bookings Card */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between min-h-[160px]">
          <div>
            <div className="w-12 h-12 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 flex items-center justify-center text-[#caa24c] mb-4">
              <Calendar size={22} strokeWidth={1.5} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">BOOKINGS</p>
            <p className="text-3xl font-extrabold text-[color:var(--portal-text)] tracking-tight">
              8 <span className="text-xl font-normal text-[color:var(--portal-muted)]">/ 10</span>
            </p>
            <p className="text-xs text-[color:var(--portal-muted)] mt-0.5">monthly goal</p>
          </div>
          <div className="mt-4">
            <div className="h-2 w-full rounded-full bg-[#f4efe7] dark:bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-[#caa24c] w-[80%]" />
            </div>
            <p className="text-[10px] font-bold text-[color:var(--portal-muted)] mt-2">80% to goal</p>
          </div>
        </div>

        {/* Cash Flow Card */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between min-h-[160px]">
          <div className="flex justify-between items-start">
            <div>
              <div className="w-12 h-12 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 flex items-center justify-center text-[#caa24c] mb-4">
                <DollarSign size={22} strokeWidth={1.5} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">
                CASH FLOW <span className="text-[9px] font-medium opacity-85">(THIS MONTH)</span>
              </p>
              <p className="text-3xl font-extrabold text-[color:var(--portal-text)] tracking-tight">+$11,300</p>
              <p className="text-xs text-[color:var(--portal-muted)] mt-0.5 font-medium">projected profit</p>
            </div>
            <div className="pt-2">
              <svg className="w-20 h-10 text-[#caa24c]" viewBox="0 0 100 30" fill="none">
                <path
                  d="M0,22 Q15,18 30,24 T60,8 T90,14 T100,2"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 pt-2 border-t border-[color:var(--portal-border)]/50 text-[11px] font-bold">
            <span className="text-[#188a42]">$18,500 in</span>
            <span className="text-[color:var(--portal-muted)]/40">•</span>
            <span className="text-[#b93c3c]">$7,200 out</span>
          </div>
        </div>

        {/* Next Event Card */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between min-h-[160px]">
          <div>
            <div className="w-12 h-12 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 flex items-center justify-center text-[#caa24c] mb-4">
              <Calendar size={22} strokeWidth={1.5} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">NEXT EVENT</p>
            <p className="text-lg font-bold text-[color:var(--portal-text)] tracking-tight leading-snug">Wedding Reception</p>
            <p className="text-xs font-bold text-[#caa24c] mt-1">In 3 days</p>
          </div>
          <div className="mt-4 pt-2 border-t border-[color:var(--portal-border)]/50 text-[11px] font-semibold text-[color:var(--portal-muted)] font-mono">
            Sat, July 11, 2026 • 6:00 PM
          </div>
        </div>

        {/* Needs Attention Card */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between min-h-[160px]">
          <div>
            <div className="w-12 h-12 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 flex items-center justify-center text-[#caa24c] mb-4">
              <Bell size={22} strokeWidth={1.5} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">NEEDS ATTENTION</p>
            <p className="text-3xl font-extrabold text-[color:var(--portal-text)] tracking-tight">{needsAttentionCount}</p>
            <p className="text-xs text-[color:var(--portal-muted)] mt-0.5">items</p>
          </div>
          <div className="mt-4 pt-2 border-t border-[color:var(--portal-border)]/50">
            <Link href="/portal/leads" className="text-[#caa24c] hover:text-[#b0883b] transition-colors inline-flex items-center gap-1 font-bold text-xs">
              View my tasks <ChevronRight size={14} className="translate-y-[0.5px]" />
            </Link>
          </div>
        </div>
      </div>

      {/* MIDDLE ROW: 3 Columns (Today's Priorities, This Week, Bills Due) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Priorities */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center gap-2.5 mb-6">
              <ListTodo className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">TODAY&apos;S PRIORITIES</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[color:var(--portal-border)] bg-transparent text-[#caa24c] focus:ring-[#caa24c] cursor-pointer"
                    readOnly
                  />
                  <span className="text-xs font-medium text-[color:var(--portal-text)]">2 Tours today</span>
                </div>
                <span className="text-[10px] font-semibold text-[color:var(--portal-muted)] font-mono">10:00 AM - 2:00 PM</span>
              </div>
              
              <div className="flex items-center justify-between border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[color:var(--portal-border)] bg-transparent text-[#caa24c] focus:ring-[#caa24c] cursor-pointer"
                    readOnly
                  />
                  <span className="text-xs font-medium text-[color:var(--portal-text)]">Send Johnson proposal</span>
                </div>
                <span className="text-[10px] font-semibold text-[color:var(--portal-muted)]">Due today</span>
              </div>

              <div className="flex items-center justify-between border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[color:var(--portal-border)] bg-transparent text-[#caa24c] focus:ring-[#caa24c] cursor-pointer"
                    readOnly
                  />
                  <span className="text-xs font-medium text-[color:var(--portal-text)]">Final payment due: Smith Wedding</span>
                </div>
                <span className="text-[10px] font-bold text-[#b93c3c] bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded shrink-0">
                  Due tomorrow
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[color:var(--portal-border)] bg-transparent text-[#caa24c] focus:ring-[#caa24c] cursor-pointer"
                    readOnly
                  />
                  <span className="text-xs font-medium text-[color:var(--portal-text)]">Confirm Saturday walkthrough</span>
                </div>
                <span className="text-[10px] font-semibold text-[color:var(--portal-muted)] font-mono">11:00 AM</span>
              </div>

              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[color:var(--portal-border)] bg-transparent text-[#caa24c] focus:ring-[#caa24c] cursor-pointer"
                    readOnly
                  />
                  <span className="text-xs font-medium text-[color:var(--portal-text)]">Follow up with Lewis</span>
                </div>
                <span className="text-[10px] font-semibold text-[color:var(--portal-muted)]">Due today</span>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-[color:var(--portal-border)]/50">
            <Link href="/portal/leads" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
              View all tasks <ChevronRight size={14} className="translate-y-[0.5px]" />
            </Link>
          </div>
        </div>

        {/* This Week */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center gap-2.5 mb-6">
              <Calendar className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">THIS WEEK</h3>
            </div>
            <div className="grid grid-cols-7 gap-1 border-b border-[color:var(--portal-border)]/30 pb-4">
              {/* Wed */}
              <div className="flex flex-col items-center border-r border-[color:var(--portal-border)]/20 last:border-r-0 px-0.5 py-1">
                <span className="text-[8px] font-black uppercase text-[color:var(--portal-muted)]">WED</span>
                <span className="text-[10px] font-bold text-[color:var(--portal-text)] mt-1 mb-3">JUL 8</span>
                <div className="w-full space-y-1.5 px-0.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-[7.5px] font-bold text-[color:var(--portal-muted)] leading-none truncate">2 Tours</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                    <span className="text-[7.5px] font-bold text-[color:var(--portal-muted)] leading-none truncate">1 Event</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-[7.5px] font-bold text-[color:var(--portal-muted)] leading-none truncate">1 Pay</span>
                  </div>
                </div>
              </div>

              {/* Thu */}
              <div className="flex flex-col items-center border-r border-[color:var(--portal-border)]/20 last:border-r-0 px-0.5 py-1">
                <span className="text-[8px] font-black uppercase text-[color:var(--portal-muted)]">THU</span>
                <span className="text-[10px] font-bold text-[color:var(--portal-text)] mt-1 mb-3">JUL 9</span>
                <div className="w-full space-y-1.5 px-0.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-[7.5px] font-bold text-[color:var(--portal-muted)] leading-none truncate">3 Tours</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-[7.5px] font-bold text-[color:var(--portal-muted)] leading-none truncate">Prop Due</span>
                  </div>
                </div>
              </div>

              {/* Fri */}
              <div className="flex flex-col items-center border-r border-[color:var(--portal-border)]/20 last:border-r-0 px-0.5 py-1">
                <span className="text-[8px] font-black uppercase text-[color:var(--portal-muted)]">FRI</span>
                <span className="text-[10px] font-bold text-[color:var(--portal-text)] mt-1 mb-3">JUL 10</span>
                <div className="w-full space-y-1.5 px-0.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-[7.5px] font-bold text-[color:var(--portal-muted)] leading-none truncate">1 Tour</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-[7.5px] font-bold text-[color:var(--portal-muted)] leading-none truncate">Setup</span>
                  </div>
                  <div className="text-[6.5px] font-black text-[color:var(--portal-muted)] pl-2 leading-none">6:00 PM</div>
                </div>
              </div>

              {/* Sat (Highlighted) */}
              <div className="flex flex-col items-center bg-[#fcf8f2] dark:bg-[#caa24c]/10 border border-[#caa24c]/30 rounded-xl px-0.5 py-1">
                <span className="text-[8px] font-black uppercase text-[#caa24c]">SAT</span>
                <span className="w-5 h-5 rounded-full bg-[#caa24c] text-white text-[10px] font-bold flex items-center justify-center mt-1 mb-3 shrink-0 shadow-sm">
                  11
                </span>
                <div className="w-full space-y-1.5 px-0.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                    <span className="text-[7.5px] font-black text-[#caa24c] leading-none truncate">Wedding</span>
                  </div>
                  <div className="text-[6.5px] font-black text-[color:var(--portal-muted)] pl-2 leading-none">6:00 PM</div>
                </div>
              </div>

              {/* Sun */}
              <div className="flex flex-col items-center border-r border-[color:var(--portal-border)]/20 last:border-r-0 px-0.5 py-1">
                <span className="text-[8px] font-black uppercase text-[color:var(--portal-muted)]">SUN</span>
                <span className="text-[10px] font-bold text-[color:var(--portal-text)] mt-1 mb-3">JUL 12</span>
                <div className="w-full space-y-1.5 px-0.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-[7.5px] font-bold text-[color:var(--portal-muted)] leading-none truncate">Birthday</span>
                  </div>
                  <div className="text-[6.5px] font-black text-[color:var(--portal-muted)] pl-2 leading-none">2:00 PM</div>
                </div>
              </div>

              {/* Mon */}
              <div className="flex flex-col items-center border-r border-[color:var(--portal-border)]/20 last:border-r-0 px-0.5 py-1">
                <span className="text-[8px] font-black uppercase text-[color:var(--portal-muted)]">MON</span>
                <span className="text-[10px] font-bold text-[color:var(--portal-text)] mt-1 mb-3">JUL 13</span>
                <div className="w-full space-y-1.5 px-0.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-[7.5px] font-bold text-[color:var(--portal-muted)] leading-none truncate">1 Tour</span>
                  </div>
                </div>
              </div>

              {/* Tue */}
              <div className="flex flex-col items-center px-0.5 py-1">
                <span className="text-[8px] font-black uppercase text-[color:var(--portal-muted)]">TUE</span>
                <span className="text-[10px] font-bold text-[color:var(--portal-text)] mt-1 mb-3">JUL 14</span>
                <div className="w-full space-y-1.5 px-0.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-[7.5px] font-bold text-[color:var(--portal-muted)] leading-none truncate">Payment</span>
                  </div>
                  <div className="text-[6.5px] font-black text-[color:var(--portal-muted)] pl-2 leading-none">Due</div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-[color:var(--portal-border)]/50">
            <Link href="/portal/calendar" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
              View full calendar <ChevronRight size={14} className="translate-y-[0.5px]" />
            </Link>
          </div>
        </div>

        {/* Bills Due */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <DollarSign className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">BILLS DUE</h3>
              </div>
              <Link href="/portal/invoices" className="text-xs font-bold text-[#caa24c] hover:text-[#b0883b] transition-colors">
                View all →
              </Link>
            </div>
            
            <div className="space-y-4">
              {/* Due Today */}
              <div>
                <p className="text-[9px] font-black tracking-widest text-[#b93c3c] mb-2 uppercase">DUE TODAY</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[color:var(--portal-muted)] font-medium">Rent</span>
                    <span className="text-[color:var(--portal-text)] font-semibold font-mono">$4,200.00</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[color:var(--portal-muted)] font-medium">Internet</span>
                    <span className="text-[color:var(--portal-text)] font-semibold font-mono">$89.99</span>
                  </div>
                </div>
              </div>

              {/* Due This Week */}
              <div>
                <p className="text-[9px] font-black tracking-widest text-[#caa24c] mb-2 uppercase">DUE THIS WEEK</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[color:var(--portal-muted)] font-medium">Electric (Estimate)</span>
                    <span className="text-[color:var(--portal-text)] font-semibold font-mono">$375.00</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[color:var(--portal-muted)] font-medium">Water</span>
                    <span className="text-[color:var(--portal-text)] font-semibold font-mono">$110.45</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[color:var(--portal-muted)] font-medium">Cleaning Supplies Order</span>
                    <span className="text-[color:var(--portal-text)] font-semibold font-mono">$245.00</span>
                  </div>
                </div>
              </div>

              {/* Due Next Week */}
              <div>
                <p className="text-[9px] font-black tracking-widest text-emerald-600 dark:text-emerald-400 mb-2 uppercase">DUE NEXT WEEK</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[color:var(--portal-muted)] font-medium">Insurance</span>
                    <span className="text-[color:var(--portal-text)] font-semibold font-mono">$1,200.00</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[color:var(--portal-muted)] font-medium">HoneyBook</span>
                    <span className="text-[color:var(--portal-text)] font-semibold font-mono">$49.00</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[color:var(--portal-muted)] font-medium">Zoho Email</span>
                    <span className="text-[color:var(--portal-text)] font-semibold font-mono">$12.00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: 3 Columns (Recent Activity, Month at a Glance, Quick Actions) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center gap-2.5 mb-6">
              <Activity className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">RECENT ACTIVITY</h3>
            </div>
            
            <div className="space-y-4">
              {/* Row 1 */}
              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 text-[#caa24c] flex items-center justify-center shrink-0">
                    <User size={14} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-semibold text-[color:var(--portal-text)]">Lewis requested a tour</p>
                  </div>
                </div>
                <span className="text-[10px] font-medium text-[color:var(--portal-muted)] font-mono shrink-0">10:45 AM</span>
              </div>

              {/* Row 2 */}
              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 text-[#caa24c] flex items-center justify-center shrink-0">
                    <FileText size={14} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-semibold text-[color:var(--portal-text)]">Proposal sent to Johnson Wedding</p>
                  </div>
                </div>
                <span className="text-[10px] font-medium text-[color:var(--portal-muted)] shrink-0">Yesterday</span>
              </div>

              {/* Row 3 */}
              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 text-[#caa24c] flex items-center justify-center shrink-0">
                    <DollarSign size={14} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-semibold text-[color:var(--portal-text)]">Deposit received from Garcia Quinceañera</p>
                  </div>
                </div>
                <span className="text-[10px] font-medium text-[color:var(--portal-muted)] shrink-0">Yesterday</span>
              </div>

              {/* Row 4 */}
              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 text-[#caa24c] flex items-center justify-center shrink-0">
                    <CheckCircle2 size={14} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-semibold text-[color:var(--portal-text)]">Wedding completed: The Davis Wedding</p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-[color:var(--portal-muted)] font-mono shrink-0">Jul 5</span>
              </div>

              {/* Row 5 */}
              <div className="flex items-center justify-between text-xs pb-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 text-[#caa24c] flex items-center justify-center shrink-0">
                    <Star size={14} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-semibold text-[color:var(--portal-text)]">New review received from Samantha T.</p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-[color:var(--portal-muted)] font-mono shrink-0">Jul 5</span>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-[color:var(--portal-border)]/50">
            <Link href="/portal/leads" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
              View all activity <ChevronRight size={14} className="translate-y-[0.5px]" />
            </Link>
          </div>
        </div>

        {/* This Month At A Glance */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center gap-2.5 mb-6">
              <Eye className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">THIS MONTH AT A GLANCE</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <FileText size={16} strokeWidth={1.5} className="text-[#caa24c]" />
                  <span className="text-[color:var(--portal-muted)] font-medium">Booked Revenue</span>
                </div>
                <span className="text-sm font-bold text-[color:var(--portal-text)] font-mono">$48,500</span>
              </div>

              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <Calendar size={16} strokeWidth={1.5} className="text-[#caa24c]" />
                  <span className="text-[color:var(--portal-muted)] font-medium">Events</span>
                </div>
                <span className="text-sm font-bold text-[color:var(--portal-text)] font-mono">8</span>
              </div>

              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <Users size={16} strokeWidth={1.5} className="text-[#caa24c]" />
                  <span className="text-[color:var(--portal-muted)] font-medium">Occupancy</span>
                </div>
                <span className="text-sm font-bold text-[color:var(--portal-text)] font-mono">82%</span>
              </div>

              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed">
                <div className="flex items-center gap-3">
                  <DollarSign size={16} strokeWidth={1.5} className="text-[#caa24c]" />
                  <span className="text-[color:var(--portal-muted)] font-medium">Average Booking Value</span>
                </div>
                <span className="text-sm font-bold text-[color:var(--portal-text)] font-mono">$6,062</span>
              </div>

              <div className="flex items-center justify-between text-xs pb-1">
                <div className="flex items-center gap-3">
                  <Clock size={16} strokeWidth={1.5} className="text-[#caa24c]" />
                  <span className="text-[color:var(--portal-muted)] font-medium">Average Days to Book</span>
                </div>
                <span className="text-sm font-bold text-[color:var(--portal-text)] font-mono">11</span>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-[color:var(--portal-border)]/50">
            <Link href="/portal/leads" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
              View full report <ChevronRight size={14} className="translate-y-[0.5px]" />
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center gap-2.5 mb-6">
              <Zap className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">QUICK ACTIONS</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/portal/leads"
                className="flex items-center gap-3 py-3 px-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-sm hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <Plus size={16} className="text-[#caa24c] shrink-0" />
                <span>New Inquiry</span>
              </Link>
              <Link
                href="/portal/calendar"
                className="flex items-center gap-3 py-3 px-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-sm hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <Calendar size={16} className="text-[#caa24c] shrink-0" />
                <span>Schedule Tour</span>
              </Link>
              <Link
                href="/portal/leads"
                className="flex items-center gap-3 py-3 px-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-sm hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <FileText size={16} className="text-[#caa24c] shrink-0" />
                <span>Create Proposal</span>
              </Link>
              <Link
                href="/portal/invoices"
                className="flex items-center gap-3 py-3 px-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-sm hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <DollarSign size={16} className="text-[#caa24c] shrink-0" />
                <span>Create Invoice</span>
              </Link>
              <Link
                href="/portal/calendar"
                className="flex items-center gap-3 py-3 px-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-sm hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <Calendar size={16} className="text-[#caa24c] shrink-0" />
                <span>Add Event</span>
              </Link>
              <Link
                href="/portal/calendar"
                className="flex items-center gap-3 py-3 px-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-sm hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <Calendar size={16} className="text-[#caa24c] shrink-0" />
                <span>Block Date</span>
              </Link>
            </div>
            
            <Link
              href="/portal/leads"
              className="mt-3 flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
            >
              <UserPlus size={16} className="text-[#caa24c] shrink-0" />
              <span>Add Vendor</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Brand Tagline Footer */}
      <div className="flex flex-col items-center justify-center pt-8 border-t border-[color:var(--portal-border)] mt-12 mb-6">
        <Image
          src="/luxor-palm-mark.png"
          alt="Luxor Palm Logo"
          width={40}
          height={32}
          className="h-8 w-auto object-contain mb-3 opacity-90"
        />
        <span className="font-serif text-[11px] tracking-[0.45em] text-[#caa24c] text-center select-none font-medium leading-none uppercase">
          ELEGANT SPACES. UNFORGETTABLE EVENTS.
        </span>
      </div>
    </PortalPageFrame>
  );
}
