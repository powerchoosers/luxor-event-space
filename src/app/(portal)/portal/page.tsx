import React, { Suspense } from "react";
import { PortalOverviewSkeleton } from "./PortalOverviewSkeleton";
import { PortalHomeFrame, PortalHomeMarketingHeader } from "@/components/portal/PortalHomeFrame";
import { PortalHomeReady, PortalHomeTransition } from "@/components/portal/PortalHomeTransition";
import {
  Calendar,
  DollarSign,
  ListTodo,
  ChevronRight,
  Plus,
  FileText,
  CheckCircle2,
  Zap,
  UserPlus,
  Activity,
  Eye,
} from "@/lib/icons/phosphor-compat";
import Link from "next/link";
import Image from "next/image";
import { listLuxorBookings, listAllPayments } from "@/lib/luxorBookingsServer";
import { listAllLuxorInquiries } from "@/lib/luxorInquiriesServer";
import { listRecentNotes } from "@/lib/luxorNotesServer";
import { listAllTasks } from "@/lib/luxorTasksServer";
import { listAllBills } from "@/lib/luxorInvoicesServer";
import { isLuxorNonRevenueTestInquiry, LuxorInquiry, LuxorNote, LuxorPayment, LuxorTask, LuxorBill } from "@/lib/luxorInquiryTypes";
import { TodayPriorities } from "@/components/portal/TodayPriorities";
import { ThisWeekCalendar } from "@/components/portal/ThisWeekCalendar";
import { BillsDueCard } from "@/components/portal/BillsDueCard";
import { PortalMarketingSalesSection } from "@/components/portal/PortalMarketingSalesSection";
import { PortalHomeActionBar } from "@/components/portal/PortalHomeActionBar";
import { MagicCard } from "@/components/ui/magic-card";
import { fetchMarketingAndSalesMetrics, getDateRangeFromPreset } from "@/lib/luxorAnalyticsServer";
import { luxorTodayKey } from "@/lib/luxorTourMetrics";
import { listLuxorDailyPriorities } from "@/lib/luxorDailyPrioritiesServer";

function addDateKeyDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

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

export default function PortalOverview() {
  return (
    <PortalHomeFrame>
    <PortalHomeTransition skeleton={<PortalOverviewSkeleton />}>
      <Suspense fallback={null}>
        <PortalHomeReady><PortalOverviewContent /></PortalHomeReady>
      </Suspense>
    </PortalHomeTransition>
    </PortalHomeFrame>
  )
}

async function PortalOverviewContent() {
  let leads: LuxorInquiry[] = [];
  let recentNotes: LuxorNote[] = [];
  let bookings: Awaited<ReturnType<typeof listLuxorBookings>> = [];
  let payments: LuxorPayment[] = [];
  let tasks: LuxorTask[] = [];
  let bills: LuxorBill[] = [];
  let marketingSalesMetrics: Awaited<ReturnType<typeof fetchMarketingAndSalesMetrics>> | null = null;

  const initialRange = getDateRangeFromPreset('30d');

  try {
    const [fetchedLeads, fetchedNotes, fetchedBookings, fetchedPayments, fetchedTasks, fetchedBills, fetchedAnalytics] = await Promise.all([
      listAllLuxorInquiries(),
      listRecentNotes(5),
      listLuxorBookings(1000, true),
      listAllPayments(),
      listAllTasks(),
      listAllBills(),
      fetchMarketingAndSalesMetrics(initialRange).catch(() => null),
    ]);
    leads = fetchedLeads;
    recentNotes = fetchedNotes;
    bookings = fetchedBookings;
    payments = fetchedPayments;
    tasks = fetchedTasks;
    bills = fetchedBills;
    marketingSalesMetrics = fetchedAnalytics;
  } catch {
    return <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300">The overview could not be loaded. Refresh the page to try again.</div>;
  }

  const testInquiryIds = new Set(leads.filter(isLuxorNonRevenueTestInquiry).map((lead) => lead.id));
  const businessBookings = bookings.filter((booking) => !booking.inquiry_id || !testInquiryIds.has(booking.inquiry_id));
  const testBookingIds = new Set(bookings.filter((booking) => booking.inquiry_id && testInquiryIds.has(booking.inquiry_id)).map((booking) => booking.id));
  const businessPayments = payments.filter((payment) =>
    (!payment.inquiry_id || !testInquiryIds.has(payment.inquiry_id)) && (!payment.booking_id || !testBookingIds.has(payment.booking_id)));

  // --- Calculations for the overview ---
  const now = new Date();
  const todayDateStr = luxorTodayKey(now)
  const [currentYear, currentMonthNumber, currentDayNumber] = todayDateStr.split('-').map(Number)
  const currentMonth = currentMonthNumber - 1

  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

  // Card 1: Bookings count for the current calendar month
  const activeBookingsThisMonth = businessBookings.filter(b => {
    if (!b.event_date) return false;
    const eventDate = new Date(b.event_date + 'T00:00:00');
    return eventDate >= startOfMonth && eventDate <= endOfMonth && ['confirmed', 'tentative', 'completed'].includes(b.status);
  });
  const bookingsCount = activeBookingsThisMonth.length;

  // Card 3: Next Event
  // Only signed, active bookings belong in the next event card.
  const todayMidnight = new Date(currentYear, currentMonth, currentDayNumber);
  const upcomingBookings = businessBookings
    .filter(b => {
      if (!b.event_date) return false;
      const eventDate = new Date(b.event_date + 'T00:00:00');
      return eventDate >= todayMidnight && b.contract_status === 'signed' && (b.status === 'confirmed' || b.status === 'tentative');
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

  const businessLeads = leads.filter((lead) => !isLuxorNonRevenueTestInquiry(lead));
  const businessTasks = tasks.filter((task) => !task.inquiry_id || !testInquiryIds.has(task.inquiry_id));

  // --- Today's Priorities ---
  const priorities: { title: string; meta: string; href: string; isOverdue?: boolean; taskId?: string; bounce?: boolean; rank: number }[] = [];

  // 1. Tours today
  const toursToday = businessLeads.filter(l => l.preferred_tour_date === todayDateStr && !['attended', 'no_show', 'cancelled'].includes(l.tour_attendance_status || ''));
  if (toursToday.length > 0) {
    const times = toursToday.map(t => t.preferred_tour_time).filter(Boolean) as string[];
    const orderedTimes = times.sort();
    const timeRange = orderedTimes.length === 1 ? orderedTimes[0] : orderedTimes.length > 1 ? `${orderedTimes[0]} - ${orderedTimes[orderedTimes.length - 1]}` : 'Scheduled';
    priorities.push({
      title: `${toursToday.length} Tour${toursToday.length > 1 ? 's' : ''} today`,
      meta: timeRange,
      href: '/portal/calendar', rank: 0
    });
  }

  businessLeads.filter((lead) => lead.status === 'new' && lead.created_at && luxorTodayKey(new Date(lead.created_at)) === todayDateStr).forEach((lead) => {
    priorities.push({ title: `New inquiry · ${lead.full_name}`, meta: 'Today', href: `/portal/leads/${lead.id}`, rank: 1 });
  });

  // 2. Pending tasks due today or overdue
  const pendingTasksTodayOrOverdue = businessTasks
    .filter(t => t.status === 'pending' && t.due_date && t.due_date <= todayDateStr)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

  pendingTasksTodayOrOverdue.forEach(t => {
    const contact = t.inquiry_id ? businessLeads.find((lead) => lead.id === t.inquiry_id) : null;
    priorities.push({
      title: contact ? `${t.title} · ${contact.full_name}` : t.title,
      meta: t.due_date === todayDateStr ? 'Due today' : 'Overdue',
      href: t.inquiry_id ? `/portal/leads/${t.inquiry_id}?tab=tasks` : '/portal/leads',
      isOverdue: t.due_date! < todayDateStr,
      taskId: t.id,
      bounce: t.title === 'Review bounced email address',
      rank: t.title === 'Review bounced email address' ? 5 : t.due_date === todayDateStr ? 2 : 3
    });
  });

  // 3. Unpaid bills due today or tomorrow
  const tomorrowDateStr = addDateKeyDays(todayDateStr, 1);
  const billsTodayOrTomorrow = bills.filter(b => {
    if (b.status === 'paid' || !b.due_date) return false;
    return b.due_date === todayDateStr || b.due_date === tomorrowDateStr;
  });
  billsTodayOrTomorrow.forEach(b => {
    priorities.push({
      title: `Bill due: ${b.service}`,
      meta: b.due_date === todayDateStr ? 'Due today' : 'Due tomorrow',
      href: '/portal/operations?tab=bills',
      isOverdue: false, rank: 1
    });
  });

  const dailyPriorities = await listLuxorDailyPriorities(todayDateStr).catch(() => []);
  const activePriorities = dailyPriorities.length > 0
    ? dailyPriorities.map((item) => ({
        id: item.id,
        title: item.title,
        meta: item.meta || (item.is_overdue ? 'Overdue' : 'Due today'),
        href: item.href,
        isOverdue: item.is_overdue,
        completed: item.completed,
        reasoning: item.reasoning,
        actionType: item.action_type,
        taskId: item.target_type === 'task' ? item.target_id || undefined : undefined,
      }))
    : priorities.sort((a, b) => a.rank - b.rank).filter((item, index, items) => !item.bounce || items.findIndex((candidate) => candidate.bounce) === index).slice(0, 5);

  // --- Rolling Calendar Outlook (Past 3 Days to Future 10 Days) ---
  const calendarDays = [];
  for (let i = -3; i <= 10; i++) {
    const dayStr = addDateKeyDays(todayDateStr, i);
    const d = new Date(`${dayStr}T12:00:00Z`)
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(d).toUpperCase();
    const monthStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short' }).format(d).toUpperCase();
    const label = `${monthStr} ${Number(dayStr.slice(8, 10))}`;
    const isToday = dayStr === todayDateStr;

    // Filter items for this day
    const dayTours = businessLeads.filter(l => l.preferred_tour_date === dayStr && l.tour_attendance_status !== 'cancelled');
    const dayEvents = businessBookings.filter(b => b.event_date === dayStr && ['confirmed', 'tentative', 'completed'].includes(b.status));
    const dayPayments = bills.filter(b => b.due_date === dayStr && b.status !== 'paid');
    const dayTasks = businessTasks
      .filter(t => t.due_date === dayStr && t.status === 'pending')
      .map(t => {
        const contact = t.inquiry_id ? businessLeads.find((lead) => lead.id === t.inquiry_id) : null;
        return {
          ...t,
          client_name: contact?.full_name || null,
          event_type: contact?.event_type || null,
        };
      });

    calendarDays.push({
      dayStr,
      weekday,
      label,
      isToday,
      dayNum: Number(dayStr.slice(8, 10)),
      tours: dayTours,
      events: dayEvents,
      payments: dayPayments,
      tasks: dayTasks
    });
  }

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
  businessLeads.forEach((l) => {
    if (!l.created_at) return;
    const createdAt = new Date(l.created_at);
    const title = `Inquiry received from ${l.full_name}`;
    const href = `/portal/leads/${l.id}`;

    rawActivities.push({
      id: `lead-${l.id}`,
      title,
      subtitle: l.event_type || undefined,
      rawDate: createdAt,
      icon: UserPlus,
      href,
    });
  });

  // 2. Recent Notes
  recentNotes.forEach((n) => {
    if (!n.created_at || (n.inquiry_id && testInquiryIds.has(n.inquiry_id))) return;
    const createdAt = new Date(n.created_at);
    const matchedLead = n.inquiry_id ? leads.find((l) => l.id === n.inquiry_id) : null;
    const activityText = n.content.trim();
    let title = matchedLead
      ? `Note added for ${matchedLead.full_name}`
      : `Note: ${activityText.slice(0, 35)}${activityText.length > 35 ? '...' : ''}`;
    let subtitle: string | undefined;
    let icon = FileText;

    if (n.author === 'Proposal Portal' && /^Final proposal opened by /i.test(activityText)) {
      title = matchedLead ? `Proposal opened: ${matchedLead.full_name}` : 'Client opened a final proposal';
      subtitle = 'Secure proposal portal';
      icon = Eye;
    } else if (n.author === 'Signature Portal' && /^Event Agreement opened by /i.test(activityText)) {
      title = matchedLead ? `Agreement opened: ${matchedLead.full_name}` : 'Client opened an Event Agreement';
      subtitle = 'Secure signing portal';
      icon = Eye;
    } else if (n.author === 'Signature Portal' && /^Event Agreement signed by /i.test(activityText)) {
      title = matchedLead ? `Agreement signed: ${matchedLead.full_name}` : 'Client signed an Event Agreement';
      subtitle = 'Secure signing portal';
      icon = CheckCircle2;
    }
    const href = n.inquiry_id ? `/portal/leads/${n.inquiry_id}` : '/portal/leads';

    rawActivities.push({
      id: `note-${n.id}`,
      title,
      subtitle,
      rawDate: createdAt,
      icon,
      href,
    });
  });

  // 3. Payments
  businessPayments.filter((p) => p.status === 'paid').forEach((p) => {
    const paidDate = p.paid_at || p.received_date;
    if (!paidDate) return;
    const rawDate = new Date(paidDate);
    const matchedLead = p.inquiry_id ? leads.find((l) => l.id === p.inquiry_id) : null;
    const matchedBooking = p.booking_id ? businessBookings.find((b) => b.id === p.booking_id) : null;
    const clientName = matchedLead?.full_name || matchedBooking?.client_name;

    const title = clientName
      ? `Payment received from ${clientName}`
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
  businessBookings.forEach((b) => {
    const bookingDate = b.created_at || b.event_date;
    if (!bookingDate) return;
    const rawDate = new Date(bookingDate);
    const title = `Booking created: ${b.client_name}`;
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
    <div className="flex flex-col gap-2.5 pb-28 sm:gap-6 sm:pb-10">


      {/* MIDDLE ROW: 3 Columns (Today's Priorities, This Week, Bills Due) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 2xl:grid-cols-3">
        {/* Today's Priorities */}
        <div className="portal-card-surface flex flex-col justify-between p-6">
          <div>
            <div className="flex items-center gap-2.5 mb-6">
              <ListTodo className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">TODAY&apos;S PRIORITIES</h3>
            </div>
            <TodayPriorities items={activePriorities} />
          </div>
          <div className="mt-6 pt-4 border-t border-[color:var(--portal-border)]/50">
            <Link href="/portal/leads" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
              View leads <ChevronRight size={14} className="translate-y-[0.5px]" />
            </Link>
          </div>
        </div>

        {/* This Week / Calendar Outlook */}
        <div className="portal-card-surface relative flex flex-col justify-between overflow-hidden p-6">
          <ThisWeekCalendar days={calendarDays} />
        </div>

        {/* Bills Due */}
        <div className="portal-card-surface relative flex flex-col justify-between overflow-hidden p-6 md:col-span-2 2xl:col-span-1">
          <BillsDueCard initialBills={bills} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid auto-rows-fr grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
        {/* Bookings Card */}
        <div className="min-w-0 w-full h-full">
          <MagicCard className="flex h-full min-h-[156px] w-full flex-col justify-between rounded-2xl p-4 sm:min-h-[180px] sm:p-6">
            <div>
              <span className="text-[#caa24c] mb-3 block">
                <Calendar size={22} strokeWidth={1.5} />
              </span>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">BOOKINGS</p>
              <p data-home-reveal className="text-3xl font-extrabold text-[color:var(--portal-text)] tabular-nums tracking-tight">{bookingsCount}</p>
              <p className="text-xs text-[color:var(--portal-muted)] mt-0.5">events this month</p>
            </div>
          </MagicCard>
        </div>

        {/* Next Event Card */}
        <div className="min-w-0 w-full h-full">
          <MagicCard className="flex h-full min-h-[156px] w-full flex-col justify-between rounded-2xl p-4 sm:min-h-[180px] sm:p-6">
            {nextBooking ? (
              <>
                <div>
                  <span className="text-[#caa24c] mb-3 block">
                    <Calendar size={22} strokeWidth={1.5} />
                  </span>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">NEXT EVENT</p>
                  {nextBooking.inquiry_id ? <Link href={`/portal/leads/${nextBooking.inquiry_id}`} data-home-reveal className="line-clamp-2 text-lg font-bold leading-snug tracking-tight text-[color:var(--portal-text)] no-underline transition-colors hover:text-[#a8792f] dark:hover:text-[#f1d27a]">{nextBookingDisplayTitle}</Link> : <p data-home-reveal className="text-lg font-bold text-[color:var(--portal-text)] tracking-tight leading-snug line-clamp-2">{nextBookingDisplayTitle}</p>}
                  <p data-home-reveal className="text-xs font-bold text-[#caa24c] mt-1">{nextBookingRelativeStr}</p>
                </div>
                <div className="mt-4 pt-2 border-t border-[color:var(--portal-border)]/50 text-[11px] font-semibold text-[color:var(--portal-muted)] tabular-nums">
                  {nextBookingDateFormatted}
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-[#caa24c] mb-3 block">
                    <Calendar size={22} strokeWidth={1.5} />
                  </span>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">NEXT EVENT</p>
                  <p className="text-lg font-bold text-[color:var(--portal-text)] tracking-tight leading-snug">No upcoming signed events</p>
                  <p className="text-xs text-[color:var(--portal-muted)] mt-1">No signed bookings scheduled</p>
                </div>
                <div className="mt-4 pt-2 border-t border-[color:var(--portal-border)]/50 text-[11px] font-semibold text-[color:var(--portal-muted)] tabular-nums">
                  --
                </div>
              </>
            )}
          </MagicCard>
        </div>

      </div>

      {/* Recent activity and quick actions */}
      <div data-home-reveal className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 2xl:grid-cols-2 items-stretch">
        {/* Recent Activity */}
        <div className="portal-card-surface flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center gap-2.5 mb-3.5">
              <Activity className="h-5 w-5 text-[#caa24c]" strokeWidth={1.5} />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">RECENT ACTIVITY</h3>
            </div>
            
            {recentActivities.length > 0 ? (
              <div className="space-y-1">
                {recentActivities.map((act, idx) => {
                  const IconComp = act.icon as React.ComponentType<{ size?: number; strokeWidth?: number }>;
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
                        <div className="portal-activity-icon w-7 h-7 rounded-full bg-[#fbf5eb] dark:bg-[#caa24c]/10 text-[#caa24c] flex items-center justify-center shrink-0 group-hover/item:bg-[#caa24c] group-hover/item:text-white transition-all duration-150">
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
                      <span className="text-[10px] font-medium text-[color:var(--portal-muted)] tabular-nums shrink-0 ml-2 group-hover/item:text-[color:var(--portal-text)] transition-colors">
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

        {/* Quick Actions */}
        <div className="portal-card-surface flex flex-col justify-between p-5">
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

      {marketingSalesMetrics && (
        <section className="space-y-4 sm:space-y-6">
          <PortalHomeMarketingHeader />
          <PortalMarketingSalesSection
            initialMetrics={marketingSalesMetrics}
            initialPreset="30d"
            initialRangeLabel={initialRange.label}
            initialComparisonLabel={initialRange.comparisonLabel}
          />
        </section>
      )}

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

      <PortalHomeActionBar />
    </div>
  );
}
