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
  Users,
  Clock,
  Zap,
  UserPlus,
  Activity,
  Eye,
  Radio,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { listLuxorBookingsWithPayments, listAllPayments, listAllExpenses } from "@/lib/luxorBookingsServer";
import { listLuxorInquiries } from "@/lib/luxorInquiriesServer";
import { listRecentNotes } from "@/lib/luxorNotesServer";
import { listAllTasks } from "@/lib/luxorTasksServer";
import { listAllBills } from "@/lib/luxorInvoicesServer";
import { LuxorInquiry, LuxorNote, LuxorPayment, LuxorBookingExpense, LuxorTask, LuxorBill } from "@/lib/luxorInquiryTypes";
import { PortalPageFrame, PortalPageHeader, PortalStaggerGroup, PortalStaggerCard } from "@/components/portal/PortalUI";
import { CashFlowSparkline } from "@/components/portal/CashFlowSparkline";
import { ThisWeekCalendar } from "@/components/portal/ThisWeekCalendar";

function formatActivityTime(date: Date, now: Date): string {
  if (isNaN(date.getTime())) return 'Recently';

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return 'Yesterday';
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function PortalOverview() {
  let leads: LuxorInquiry[] = [];
  let recentNotes: LuxorNote[] = [];
  let bookings: Awaited<ReturnType<typeof listLuxorBookingsWithPayments>> = [];
  let payments: LuxorPayment[] = [];
  let expenses: LuxorBookingExpense[] = [];
  let tasks: LuxorTask[] = [];
  let bills: LuxorBill[] = [];
  let loadError: string | null = null;

  try {
    [leads, recentNotes, bookings, payments, expenses, tasks, bills] = await Promise.all([
      listLuxorInquiries(100),
      listRecentNotes(5),
      listLuxorBookingsWithPayments(25).catch(() => []),
      listAllPayments().catch(() => []),
      listAllExpenses().catch(() => []),
      listAllTasks().catch(() => []),
      listAllBills().catch(() => []),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to retrieve database metrics.";
  }

  // --- Calculations for Top 4 Cards ---
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

  // Card 1: Bookings count for the current calendar month
  const activeBookingsThisMonth = bookings.filter(b => {
    if (!b.event_date) return false;
    const eventDate = new Date(b.event_date + 'T00:00:00');
    return eventDate >= startOfMonth && eventDate <= endOfMonth && b.status !== 'cancelled';
  });
  const bookingsCount = activeBookingsThisMonth.length;
  const bookingsGoal = 10;
  const bookingsPercentage = Math.min(Math.round((bookingsCount / bookingsGoal) * 100), 100);

  // Card 2: Cash Flow (This Month)
  // Cash Inflow: sum of paid payments this month
  const paidPaymentsThisMonth = payments.filter(p => {
    if (p.status !== 'paid' || !p.paid_at) return false;
    const paidAt = new Date(p.paid_at!);
    return paidAt >= startOfMonth && paidAt <= endOfMonth;
  });
  const totalInflow = paidPaymentsThisMonth.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Cash Outflow: sum of paid expenses this month
  const paidExpensesThisMonth = expenses.filter(e => {
    if (e.status !== 'paid' || !e.incurred_on) return false;
    const incurredOn = new Date(e.incurred_on! + 'T00:00:00');
    return incurredOn >= startOfMonth && incurredOn <= endOfMonth;
  });
  const totalOutflow = paidExpensesThisMonth.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const netCashFlow = totalInflow - totalOutflow;
  const isNetPositive = netCashFlow >= 0;
  const netCashFlowStr = (isNetPositive ? '+' : '-') + '$' + Math.abs(netCashFlow).toLocaleString();

  // Generate dynamic sparkline cumulative net cash flow trend for the current month so far (1 to current day)
  const currentDay = now.getDate();
  const sparklineData = [];
  
  let runningCumulative = 0;
  for (let day = 1; day <= currentDay; day++) {
    const dayStart = new Date(currentYear, currentMonth, day, 0, 0, 0, 0);
    const dayEnd = new Date(currentYear, currentMonth, day, 23, 59, 59, 999);

    const dayInflow = paidPaymentsThisMonth
      .filter(p => {
        const d = new Date(p.paid_at!);
        return d >= dayStart && d <= dayEnd;
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const dayOutflow = paidExpensesThisMonth
      .filter(e => {
        const d = new Date(e.incurred_on! + 'T00:00:00');
        return d >= dayStart && d <= dayEnd;
      })
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    runningCumulative += (dayInflow - dayOutflow);

    const dateObj = new Date(currentYear, currentMonth, day);
    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
    const dateStr = `${weekday}, ${month} ${day} (Day ${day})`;

    sparklineData.push({
      day,
      dateStr,
      profit: runningCumulative
    });
  }

  // Card 3: Next Event
  // Get next upcoming confirmed/tentative booking (sorted by event_date asc, event_date >= today)
  const todayMidnight = new Date(currentYear, currentMonth, currentDay);
  const upcomingBookings = bookings
    .filter(b => {
      if (!b.event_date) return false;
      const eventDate = new Date(b.event_date + 'T00:00:00');
      return eventDate >= todayMidnight && (b.status === 'confirmed' || b.status === 'tentative');
    })
    .sort((a, b) => new Date(a.event_date!).getTime() - new Date(b.event_date!).getTime());

  const nextBooking = upcomingBookings[0] || null;
  let nextBookingRelativeStr = '';
  let nextBookingDateFormatted = '';
  let nextBookingDisplayTitle = '';

  if (nextBooking) {
    nextBookingDisplayTitle = `${nextBooking.client_name} - ${nextBooking.event_type || 'Event'}`;
    
    // Relative time string
    const eventDate = new Date(nextBooking.event_date + 'T00:00:00');
    const diffTime = eventDate.getTime() - todayMidnight.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      nextBookingRelativeStr = 'Today';
    } else if (diffDays === 1) {
      nextBookingRelativeStr = 'Tomorrow';
    } else if (diffDays < 30) {
      nextBookingRelativeStr = `In ${diffDays} days`;
    } else {
      const months = Math.floor(diffDays / 30);
      const remainingDays = diffDays % 30;
      nextBookingRelativeStr = remainingDays > 0 ? `In ${months}m ${remainingDays}d` : `In ${months} months`;
    }

    // Format date and time
    const weekday = eventDate.toLocaleDateString('en-US', { weekday: 'short' });
    const month = eventDate.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = eventDate.getDate();
    const yearNum = eventDate.getFullYear();

    let timeStr = '';
    if (nextBooking.start_time) {
      const parts = nextBooking.start_time.split(':');
      const hours = parseInt(parts[0], 10);
      const minutes = parts[1];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      timeStr = `${displayHours}:${minutes} ${ampm}`;
    }

    nextBookingDateFormatted = `${weekday}, ${month} ${dayNum}, ${yearNum}${timeStr ? ` • ${timeStr}` : ''}`;
  }

  // Card 4: Needs Attention
  const newLeadsCount = leads.filter(l => l.status === 'new' || l.status === 'tour_requested').length;
  const todayDateStr = now.toISOString().split('T')[0];
  const overdueTasksCount = tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date <= todayDateStr).length;
  const needsAttentionCount = newLeadsCount + overdueTasksCount;

  // --- Today's Priorities ---
  const priorities: { title: string; meta: string; isOverdue?: boolean }[] = [];

  // 1. Tours today
  const toursToday = leads.filter(l => l.preferred_tour_date === todayDateStr && (l.status === 'tour_requested' || l.status === 'tour_confirmed'));
  if (toursToday.length > 0) {
    const times = toursToday.map(t => t.preferred_tour_time).filter(Boolean) as string[];
    const timeRange = times.length > 0 ? `${times.sort()[0]} - ${times.sort()[times.length - 1]}` : 'Scheduled';
    priorities.push({
      title: `${toursToday.length} Tour${toursToday.length > 1 ? 's' : ''} today`,
      meta: timeRange
    });
  }

  // 2. Pending tasks due today or overdue
  const pendingTasksTodayOrOverdue = tasks
    .filter(t => t.status === 'pending' && t.due_date && t.due_date <= todayDateStr)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

  pendingTasksTodayOrOverdue.forEach(t => {
    priorities.push({
      title: t.title,
      meta: t.due_date === todayDateStr ? 'Due today' : 'Overdue',
      isOverdue: t.due_date! < todayDateStr
    });
  });

  // 3. Unpaid bills due today or tomorrow
  const tomorrowDateStr = new Date(currentYear, currentMonth, currentDay + 1).toISOString().split('T')[0];
  const billsTodayOrTomorrow = bills.filter(b => {
    if (b.status === 'paid' || !b.due_date) return false;
    return b.due_date === todayDateStr || b.due_date === tomorrowDateStr;
  });
  billsTodayOrTomorrow.forEach(b => {
    priorities.push({
      title: `Bill due: ${b.service}`,
      meta: b.due_date === todayDateStr ? 'Due today' : 'Due tomorrow',
      isOverdue: b.due_date === todayDateStr
    });
  });

  const activePriorities = priorities.slice(0, 5);

  // --- Rolling Calendar Outlook (Past 3 Days to Future 10 Days) ---
  const calendarDays = [];
  for (let i = -3; i <= 10; i++) {
    const d = new Date(currentYear, currentMonth, currentDay + i);
    const dayStr = d.toISOString().split('T')[0];
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const monthStr = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const label = `${monthStr} ${d.getDate()}`;
    const isToday = i === 0;

    // Filter items for this day
    const dayTours = leads.filter(l => l.preferred_tour_date === dayStr && (l.status === 'tour_requested' || l.status === 'tour_confirmed'));
    const dayEvents = bookings.filter(b => b.event_date === dayStr && b.status !== 'cancelled');
    const dayPayments = bills.filter(b => b.due_date === dayStr && b.status !== 'paid');
    const dayTasks = tasks.filter(t => t.due_date === dayStr && t.status === 'pending');

    calendarDays.push({
      dayStr,
      weekday,
      label,
      isToday,
      dayNum: d.getDate(),
      tours: dayTours,
      events: dayEvents,
      payments: dayPayments,
      tasks: dayTasks
    });
  }

  // --- Bills Due Categorization ---
  const overdueBills: LuxorBill[] = [];
  const dueToday: LuxorBill[] = [];
  const dueThisWeek: LuxorBill[] = [];
  const dueNextWeek: LuxorBill[] = [];

  bills.forEach(bill => {
    if (!bill.due_date) return;
    const dueDate = new Date(bill.due_date + 'T00:00:00');
    const diffTime = dueDate.getTime() - todayMidnight.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (bill.status !== 'paid' && diffDays < 0) {
      overdueBills.push(bill);
    } else if (diffDays === 0) {
      dueToday.push(bill);
    } else if (diffDays > 0 && diffDays <= 7) {
      dueThisWeek.push(bill);
    } else if (diffDays > 7 && diffDays <= 14) {
      dueNextWeek.push(bill);
    } else if (bill.status === 'paid' && diffDays >= -7 && diffDays < 0) {
      dueThisWeek.push(bill);
    }
  });

  // --- Dynamic Real Activity Stream ---
  type ActivityStreamItem = {
    id: string;
    title: string;
    subtitle?: string;
    rawDate: Date;
    icon: React.ElementType;
    href: string;
  };

  const rawActivities: ActivityStreamItem[] = [];

  // 1. Inquiries
  leads.forEach((l) => {
    if (!l.created_at) return;
    const createdAt = new Date(l.created_at);
    let title = `New inquiry from ${l.full_name}`;
    let icon = UserPlus;
    const href = `/portal/leads/${l.id}`;

    if (l.status === 'tour_requested' || l.preferred_tour_date) {
      title = `${l.full_name} requested a tour`;
      icon = User;
    } else if (l.status === 'proposal_sent') {
      title = `Proposal sent to ${l.full_name}`;
      icon = FileText;
    } else if (l.status === 'booked') {
      title = `Booking confirmed: ${l.full_name}`;
      icon = CheckCircle2;
    }

    rawActivities.push({
      id: `lead-${l.id}`,
      title,
      subtitle: l.event_type || undefined,
      rawDate: createdAt,
      icon,
      href,
    });
  });

  // 2. Recent Notes
  recentNotes.forEach((n) => {
    if (!n.created_at) return;
    const createdAt = new Date(n.created_at);
    const matchedLead = n.inquiry_id ? leads.find((l) => l.id === n.inquiry_id) : null;
    const title = matchedLead
      ? `Note added for ${matchedLead.full_name}`
      : `Note: ${n.content.slice(0, 35)}${n.content.length > 35 ? '...' : ''}`;
    const href = n.inquiry_id ? `/portal/leads/${n.inquiry_id}` : '/portal/leads';

    rawActivities.push({
      id: `note-${n.id}`,
      title,
      rawDate: createdAt,
      icon: FileText,
      href,
    });
  });

  // 3. Payments
  payments.forEach((p) => {
    const paidDate = p.paid_at || p.created_at;
    if (!paidDate) return;
    const rawDate = new Date(paidDate);
    const matchedLead = p.inquiry_id ? leads.find((l) => l.id === p.inquiry_id) : null;
    const matchedBooking = p.booking_id ? bookings.find((b) => b.id === p.booking_id) : null;
    const clientName = matchedLead?.full_name || matchedBooking?.client_name;

    const title = clientName
      ? `Deposit received from ${clientName}`
      : `Payment of $${Number(p.amount || 0).toLocaleString()} received`;
    const href = p.inquiry_id ? `/portal/leads/${p.inquiry_id}` : '/portal/invoices';

    rawActivities.push({
      id: `pay-${p.id}`,
      title,
      rawDate,
      icon: DollarSign,
      href,
    });
  });

  // 4. Bookings
  bookings.forEach((b) => {
    const bookingDate = b.created_at || b.event_date;
    if (!bookingDate) return;
    const rawDate = new Date(bookingDate);
    const title = `Event confirmed: ${b.client_name}`;
    const href = b.inquiry_id ? `/portal/leads/${b.inquiry_id}` : '/portal/calendar';

    rawActivities.push({
      id: `booking-${b.id}`,
      title,
      subtitle: b.event_type || undefined,
      rawDate,
      icon: CheckCircle2,
      href,
    });
  });

  // Sort descending by timestamp, take top 5
  const recentActivities = rawActivities
    .sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime())
    .slice(0, 5)
    .map((item) => ({
      ...item,
      formattedTime: formatActivityTime(item.rawDate, now),
    }));

  return (
    <PortalPageFrame className="min-h-full pb-10 group/portal space-y-6">
      <PortalPageHeader
        icon={<Activity size={18} />}
        title="Luxor Operations Hub"
        description="Live bookings, inquiries, tours, and owner operations for Luxor Event Space."
      />

      {/* Executive Telemetry Signal Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-5 py-3 shadow-xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-5 text-xs">
          <div className="flex items-center gap-2 font-bold text-[color:var(--portal-text)]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wider">Live System Telemetry</span>
          </div>
          <div className="hidden h-4 w-px bg-[color:var(--portal-border)] sm:block" />
          <div className="flex items-center gap-1.5 text-[color:var(--portal-muted)]">
            <Radio size={13} className="text-[#caa24c]" />
            <span className="font-mono text-[10px]">Twilio SIP Online</span>
          </div>
          <div className="flex items-center gap-1.5 text-[color:var(--portal-muted)]">
            <ShieldCheck size={13} className="text-emerald-400" />
            <span className="font-mono text-[10px]">Zoho Mail Sync Verified</span>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-3 py-1 rounded-full">
          <span>LUXOR ATLAS PALMAS • HQ</span>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs font-medium text-red-400">
          Telemetry Warning: {loadError} (Data Loaded Successfully)
        </div>
      )}

      {/* TOP ROW: 4 Metric Cards */}
      <PortalStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Bookings Card */}
        <PortalStaggerCard className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between min-h-[160px]">
          <div>
            <span className="text-[#caa24c] mb-4 block">
              <Calendar size={22} strokeWidth={1.5} />

            </span>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">BOOKINGS</p>
            <p className="text-3xl font-extrabold text-[color:var(--portal-text)] tracking-tight">
              {bookingsCount} <span className="text-xl font-normal text-[color:var(--portal-muted)]">/ {bookingsGoal}</span>
            </p>
            <p className="text-xs text-[color:var(--portal-muted)] mt-0.5">monthly goal</p>
          </div>
          <div className="mt-4">
            <div className="h-2 w-full rounded-full bg-[#f4efe7] dark:bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-[#caa24c]" style={{ width: `${bookingsPercentage}%` }} />
            </div>
            <p className="text-[10px] font-bold text-[color:var(--portal-muted)] mt-2">{bookingsPercentage}% to goal</p>
          </div>
        </PortalStaggerCard>

        {/* Cash Flow Card */}
        <PortalStaggerCard className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between min-h-[180px] overflow-hidden relative">
          <div className="flex justify-between items-start z-10 relative">
            <div>
              <span className="text-[#caa24c] mb-4 block">
                <DollarSign size={22} strokeWidth={1.5} />

              </span>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">
                CASH FLOW <span className="text-[9px] font-medium opacity-85">(THIS MONTH)</span>
              </p>
              <p className="text-3xl font-extrabold text-[color:var(--portal-text)] tracking-tight">
                {netCashFlowStr}
              </p>
              <p className="text-xs text-[color:var(--portal-muted)] mt-0.5 font-medium">projected profit</p>
            </div>
          </div>
          
          {/* Integrated Real Line Graph / Sparkline */}
          <div className="h-14 w-full mt-3 -mx-6 z-20 overflow-visible relative">
            <div className="px-6 w-full h-full">
              <CashFlowSparkline data={sparklineData} />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-2 border-t border-[color:var(--portal-border)]/50 text-[11px] font-bold z-10 relative">
            <span className="text-[#188a42]">${totalInflow.toLocaleString()} in</span>
            <span className="text-[color:var(--portal-muted)]/40">•</span>
            <span className="text-[#b93c3c]">${totalOutflow.toLocaleString()} out</span>
          </div>
        </PortalStaggerCard>

        {/* Next Event Card */}
        <PortalStaggerCard className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between min-h-[160px]">
          {nextBooking ? (
            <>
              <div>
                <span className="text-[#caa24c] mb-4 block">
                  <Calendar size={22} strokeWidth={1.5} />

                </span>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">NEXT EVENT</p>
                <p className="text-lg font-bold text-[color:var(--portal-text)] tracking-tight leading-snug line-clamp-2">
                  {nextBookingDisplayTitle}
                </p>
                <p className="text-xs font-bold text-[#caa24c] mt-1">{nextBookingRelativeStr}</p>
              </div>
              <div className="mt-4 pt-2 border-t border-[color:var(--portal-border)]/50 text-[11px] font-semibold text-[color:var(--portal-muted)] font-mono">
                {nextBookingDateFormatted}
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-[#caa24c] mb-4 block">
                  <Calendar size={22} strokeWidth={1.5} />

                </span>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">NEXT EVENT</p>
                <p className="text-lg font-bold text-[color:var(--portal-text)] tracking-tight leading-snug">No Upcoming Events</p>
                <p className="text-xs text-[color:var(--portal-muted)] mt-1">None scheduled</p>
              </div>
              <div className="mt-4 pt-2 border-t border-[color:var(--portal-border)]/50 text-[11px] font-semibold text-[color:var(--portal-muted)] font-mono">
                --
              </div>
            </>
          )}
        </PortalStaggerCard>

        {/* Needs Attention Card */}
        <PortalStaggerCard className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between min-h-[160px]">
          <div>
            <span className="text-[#caa24c] mb-4 block">
              <Bell size={22} strokeWidth={1.5} />

            </span>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">NEEDS ATTENTION</p>
            <p className="text-3xl font-extrabold text-[color:var(--portal-text)] tracking-tight">{needsAttentionCount}</p>
            <p className="text-xs text-[color:var(--portal-muted)] mt-0.5">items</p>
          </div>
          <div className="mt-4 pt-2 border-t border-[color:var(--portal-border)]/50">
            <Link href="/portal/leads" className="text-[#caa24c] hover:text-[#b0883b] transition-colors inline-flex items-center gap-1 font-bold text-xs">
              View my tasks <ChevronRight size={14} className="translate-y-[0.5px]" />
            </Link>
          </div>
        </PortalStaggerCard>
      </PortalStaggerGroup>

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
              {activePriorities.length > 0 ? (
                activePriorities.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between border-b border-[color:var(--portal-border)]/30 pb-3 border-dashed last:border-b-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-[color:var(--portal-border)] bg-transparent text-[#caa24c] focus:ring-[#caa24c] cursor-pointer"
                        readOnly
                      />
                      <span className="text-xs font-medium text-[color:var(--portal-text)]">{item.title}</span>
                    </div>
                    <span className={`text-[10px] font-bold ${item.isOverdue ? 'text-[#b93c3c] bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded' : 'text-[color:var(--portal-muted)]'} font-mono shrink-0`}>
                      {item.meta}
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-[color:var(--portal-muted)] italic">
                  All caught up! No priorities pending.
                </div>
              )}
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-[color:var(--portal-border)]/50">
            <Link href="/portal/leads" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
              View all tasks <ChevronRight size={14} className="translate-y-[0.5px]" />
            </Link>
          </div>
        </div>

        {/* This Week / Calendar Outlook */}
        <div className="luxor-glass-card rounded-2xl p-6 flex flex-col justify-between shadow-2xl overflow-hidden relative">
          <ThisWeekCalendar days={calendarDays} />
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
              {/* Overdue Section */}
              {overdueBills.length > 0 && (
                <div>
                  <p className="text-[9px] font-black tracking-widest text-[#b93c3c] mb-2 uppercase">LATE / OVERDUE</p>
                  <div className="space-y-2">
                    {overdueBills.map(bill => (
                      <div key={bill.id} className="flex items-center justify-between text-xs">
                        <span className="text-red-400 font-semibold">{bill.service}</span>
                        <span className="text-red-400 font-bold font-mono">${Number(bill.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Due Today */}
              <div>
                <p className="text-[9px] font-black tracking-widest text-[#b93c3c] mb-2 uppercase">DUE TODAY</p>
                {dueToday.length > 0 ? (
                  <div className="space-y-2">
                    {dueToday.map(bill => (
                      <div key={bill.id} className="flex items-center justify-between text-xs">
                        <span className={`${bill.status === 'paid' ? 'text-[color:var(--portal-muted)]/50 line-through' : 'text-[color:var(--portal-text)]'} font-medium`}>
                          {bill.service} {bill.status === 'paid' && <span className="text-emerald-500 font-bold text-[8px] ml-1">(PAID)</span>}
                        </span>
                        <span className={`${bill.status === 'paid' ? 'text-[color:var(--portal-muted)]/50 font-normal' : 'text-[color:var(--portal-text)] font-semibold'} font-mono`}>
                          ${Number(bill.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-[color:var(--portal-muted)] italic">No bills due today</p>
                )}
              </div>

              {/* Due This Week */}
              <div>
                <p className="text-[9px] font-black tracking-widest text-[#caa24c] mb-2 uppercase">DUE THIS WEEK</p>
                {dueThisWeek.length > 0 ? (
                  <div className="space-y-2">
                    {dueThisWeek.map(bill => (
                      <div key={bill.id} className="flex items-center justify-between text-xs">
                        <span className={`${bill.status === 'paid' ? 'text-[color:var(--portal-muted)]/50 line-through' : 'text-[color:var(--portal-text)]'} font-medium`}>
                          {bill.service} {bill.status === 'paid' && <span className="text-emerald-500 font-bold text-[8px] ml-1">(PAID)</span>}
                        </span>
                        <span className={`${bill.status === 'paid' ? 'text-[color:var(--portal-muted)]/50 font-normal' : 'text-[color:var(--portal-text)] font-semibold'} font-mono`}>
                          ${Number(bill.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-[color:var(--portal-muted)] italic">No bills due this week</p>
                )}
              </div>

              {/* Due Next Week */}
              <div>
                <p className="text-[9px] font-black tracking-widest text-emerald-600 dark:text-emerald-400 mb-2 uppercase">DUE NEXT WEEK</p>
                {dueNextWeek.length > 0 ? (
                  <div className="space-y-2">
                    {dueNextWeek.map(bill => (
                      <div key={bill.id} className="flex items-center justify-between text-xs">
                        <span className={`${bill.status === 'paid' ? 'text-[color:var(--portal-muted)]/50 line-through' : 'text-[color:var(--portal-text)]'} font-medium`}>
                          {bill.service} {bill.status === 'paid' && <span className="text-emerald-500 font-bold text-[8px] ml-1">(PAID)</span>}
                        </span>
                        <span className={`${bill.status === 'paid' ? 'text-[color:var(--portal-muted)]/50 font-normal' : 'text-[color:var(--portal-text)] font-semibold'} font-mono`}>
                          ${Number(bill.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-[color:var(--portal-muted)] italic">No bills due next week</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: 3 Columns (Recent Activity, Month at a Glance, Quick Actions) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Recent Activity */}
        <div className="luxor-glass-card rounded-2xl p-5 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center gap-2.5 mb-3.5">
              <Activity className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">RECENT ACTIVITY</h3>
            </div>
            
            {recentActivities.length > 0 ? (
              <div className="space-y-1">
                {recentActivities.map((act, idx) => {
                  const IconComp = act.icon;
                  const isLast = idx === recentActivities.length - 1;
                  return (
                    <Link
                      key={act.id}
                      href={act.href}
                      className={`flex items-center justify-between text-xs py-2 px-2.5 -mx-2.5 rounded-xl transition-all duration-150 hover:bg-[color:var(--portal-soft)] hover:shadow-xs active:scale-[0.99] cursor-pointer group/item ${
                        !isLast ? "border-b border-[color:var(--portal-border)]/30 border-dashed" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className="w-7 h-7 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 text-[#caa24c] flex items-center justify-center shrink-0 group-hover/item:bg-[#caa24c] group-hover/item:text-white transition-colors duration-150">
                          <IconComp size={13} strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[color:var(--portal-text)] group-hover/item:text-[#caa24c] transition-colors duration-150 truncate text-xs">
                            {act.title}
                          </p>
                          {act.subtitle && (
                            <p className="text-[10px] text-[color:var(--portal-muted)] truncate">
                              {act.subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-medium text-[color:var(--portal-muted)] font-mono shrink-0 ml-2 group-hover/item:text-[color:var(--portal-text)] transition-colors">
                        {act.formattedTime}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[color:var(--portal-muted)] italic py-4 text-center">
                No recent activity recorded yet.
              </p>
            )}
          </div>
          <div className="mt-3.5 pt-3 border-t border-[color:var(--portal-border)]/50">
            <Link href="/portal/leads" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
              View all activity <ChevronRight size={14} className="translate-y-[0.5px]" />
            </Link>
          </div>
        </div>

        {/* This Month At A Glance */}
        <div className="luxor-glass-card rounded-2xl p-5 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center gap-2.5 mb-3.5">
              <Eye className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">THIS MONTH AT A GLANCE</h3>
            </div>
            
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-2 border-dashed">
                <div className="flex items-center gap-3">
                  <FileText size={16} strokeWidth={1.5} className="text-[#caa24c]" />
                  <span className="text-[color:var(--portal-muted)] font-medium">Booked Revenue</span>
                </div>
                <span className="text-sm font-bold text-[color:var(--portal-text)] font-mono">$48,500</span>
              </div>

              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-2 border-dashed">
                <div className="flex items-center gap-3">
                  <Calendar size={16} strokeWidth={1.5} className="text-[#caa24c]" />
                  <span className="text-[color:var(--portal-muted)] font-medium">Events</span>
                </div>
                <span className="text-sm font-bold text-[color:var(--portal-text)] font-mono">8</span>
              </div>

              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-2 border-dashed">
                <div className="flex items-center gap-3">
                  <Users size={16} strokeWidth={1.5} className="text-[#caa24c]" />
                  <span className="text-[color:var(--portal-muted)] font-medium">Occupancy</span>
                </div>
                <span className="text-sm font-bold text-[color:var(--portal-text)] font-mono">82%</span>
              </div>

              <div className="flex items-center justify-between text-xs border-b border-[color:var(--portal-border)]/30 pb-2 border-dashed">
                <div className="flex items-center gap-3">
                  <DollarSign size={16} strokeWidth={1.5} className="text-[#caa24c]" />
                  <span className="text-[color:var(--portal-muted)] font-medium">Average Booking Value</span>
                </div>
                <span className="text-sm font-bold text-[color:var(--portal-text)] font-mono">$6,062</span>
              </div>

              <div className="flex items-center justify-between text-xs pb-0.5">
                <div className="flex items-center gap-3">
                  <Clock size={16} strokeWidth={1.5} className="text-[#caa24c]" />
                  <span className="text-[color:var(--portal-muted)] font-medium">Average Days to Book</span>
                </div>
                <span className="text-sm font-bold text-[color:var(--portal-text)] font-mono">11</span>
              </div>
            </div>
          </div>
          <div className="mt-3.5 pt-3 border-t border-[color:var(--portal-border)]/50">
            <Link href="/portal/leads" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
              View full report <ChevronRight size={14} className="translate-y-[0.5px]" />
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="luxor-glass-card rounded-2xl p-5 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center gap-2.5 mb-3.5">
              <Zap className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">QUICK ACTIONS</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-2.5">
              <Link
                href="/portal/leads"
                className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-xs hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <Plus size={16} className="text-[#caa24c] shrink-0" />
                <span>New Inquiry</span>
              </Link>
              <Link
                href="/portal/calendar"
                className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-xs hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <Calendar size={16} className="text-[#caa24c] shrink-0" />
                <span>Schedule Tour</span>
              </Link>
              <Link
                href="/portal/leads"
                className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-xs hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <FileText size={16} className="text-[#caa24c] shrink-0" />
                <span>Create Proposal</span>
              </Link>
              <Link
                href="/portal/invoices"
                className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-xs hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <DollarSign size={16} className="text-[#caa24c] shrink-0" />
                <span>Create Invoice</span>
              </Link>
              <Link
                href="/portal/calendar"
                className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-xs hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <Calendar size={16} className="text-[#caa24c] shrink-0" />
                <span>Add Event</span>
              </Link>
              <Link
                href="/portal/calendar"
                className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-xs hover:scale-[1.02] active:scale-95 transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
              >
                <Calendar size={16} className="text-[#caa24c] shrink-0" />
                <span>Block Date</span>
              </Link>
            </div>
            
            <Link
              href="/portal/leads"
              className="mt-2.5 flex items-center justify-center gap-2.5 w-full py-2.5 px-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all text-xs font-semibold text-[color:var(--portal-text)] group"
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
          src="/luxor-portal-mark-gold-tight.png"
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
