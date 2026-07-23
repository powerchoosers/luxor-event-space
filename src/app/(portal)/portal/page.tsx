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
import { listLuxorBookingsWithPayments, listAllPayments, listAllExpenses } from "@/lib/luxorBookingsServer";
import { listLuxorInquiries } from "@/lib/luxorInquiriesServer";
import { listRecentNotes } from "@/lib/luxorNotesServer";
import { listAllTasks } from "@/lib/luxorTasksServer";
import { listAllBills } from "@/lib/luxorInvoicesServer";
import { LuxorInquiry, LuxorNote, LuxorPayment, LuxorBookingExpense, LuxorTask, LuxorBill } from "@/lib/luxorInquiryTypes";
import { PortalPageFrame, PortalPageHeader, PortalStaggerGroup, PortalStaggerCard } from "@/components/portal/PortalUI";
import { CashFlowSparkline } from "@/components/portal/CashFlowSparkline";
import { ThisWeekCalendar } from "@/components/portal/ThisWeekCalendar";

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

  return (
    <PortalPageFrame className="min-h-full pb-10 group/portal space-y-6">
      <PortalPageHeader
        icon={<Activity size={18} />}
        title="Luxor Operations Hub"
        description="Live bookings, inquiries, tours, and owner operations for Luxor Event Space."
      />

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
