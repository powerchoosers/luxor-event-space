import React from "react";
import { Calendar as CalendarIcon, Clock, MapPin, User, ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { listLuxorTourRequests } from "@/lib/luxorInquiriesServer";
import { LuxorInquiry } from "@/lib/luxorInquiryTypes";
import { PortalPageFrame, PortalPageHeader } from "@/components/portal/PortalUI";

export default async function CalendarPage() {
  let tourRequests: LuxorInquiry[] = [];
  let loadError: string | null = null;

  try {
    tourRequests = await listLuxorTourRequests(100);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load Luxor tour requests.";
  }

  const groupedTours = groupToursByDate(tourRequests);
  const upcomingTours = Object.entries(groupedTours);

  return (
    <PortalPageFrame className="max-w-6xl">
      <PortalPageHeader
        icon={<CalendarIcon size={18} />}
        title="Event Calendar"
        description="Live tour requests from the public Luxor booking flow."
        actions={
          <div className="rounded-lg border border-zinc-900 bg-black/60 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-400">
            {tourRequests.length} active tour requests
          </div>
        }
      />

      <div className="nodal-void-card portal-scrollbar min-h-0 flex-1 overflow-y-auto rounded-2xl border border-zinc-900 bg-black/40 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="mb-8 flex items-center justify-between border-b border-zinc-900/50 pb-6">
          <div>
            <p className="text-zinc-500 font-medium uppercase tracking-widest text-xs">CRM Schedule</p>
            <h2 className="mt-2 text-2xl font-bold text-white font-serif tracking-tight">Requested Tours</h2>
          </div>
          <CalendarIcon className="h-6 w-6 text-blue-500" />
        </div>

        {loadError ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-200">
            {loadError}
          </div>
        ) : upcomingTours.length === 0 ? (
          <div className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-10 text-center">
            <CalendarIcon size={42} className="mx-auto text-zinc-800" />
            <h3 className="mt-5 text-xl font-bold text-white">No requested tours yet</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">
              When someone submits the homepage, visit page, or tour page form with a preferred tour date, it will show up here.
            </p>
          </div>
        ) : (
          <div className="relative ml-4 space-y-8 border-l-2 border-zinc-900/70 py-2">
            {upcomingTours.map(([date, tours]) => (
              <section key={date} className="relative pl-10">
                <div className="absolute -left-[9px] top-2 h-4 w-4 rounded-full bg-[#002FA7] shadow-[0_0_16px_#002FA7]" />
                <h3 className="text-2xl font-bold text-white font-serif">{formatCalendarDate(date)}</h3>

                <div className="mt-4 grid gap-4">
                  {tours.map((tour) => (
                    <article key={tour.id} className="nodal-module-glass rounded-xl border border-zinc-800/50 p-6 transition-all hover:bg-zinc-900/40 hover:border-zinc-700/60 group">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div>
                          <Link href={`/portal/leads/${tour.id}`} className="inline-flex items-center gap-2 group/title">
                            <h4 className="text-xl font-bold text-white group-hover/title:text-blue-400 transition-colors">{tour.full_name}</h4>
                            <ExternalLink size={14} className="text-zinc-600 group-hover/title:text-blue-400 transition-colors" />
                          </Link>
                          <div className="flex flex-wrap gap-3 text-zinc-400 font-mono text-sm mt-2">
                            <span className="flex items-center gap-1.5 rounded bg-black/50 border border-zinc-800 px-2.5 py-1">
                              <Clock size={14} className="text-[#caa24c]" />
                              {tour.preferred_tour_time ?? "Flexible time"}
                            </span>
                            <span className="flex items-center gap-1.5 rounded bg-black/50 border border-zinc-800 px-2.5 py-1">
                              <User size={14} className="text-[#caa24c]" />
                              {tour.guest_count ? `${tour.guest_count} guests` : "Guest count needed"}
                            </span>
                          </div>
                        </div>
                        <span className="max-w-fit rounded bg-zinc-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 border border-zinc-850">
                          {tour.event_type ?? "Event type needed"}
                        </span>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-6 border-t border-zinc-800/50 pt-5 text-sm">
                        <div className="flex items-center gap-2 text-zinc-500 font-medium">
                          <MapPin size={16} className="text-zinc-650" /> Luxor Event Space
                        </div>
                        <div className="text-zinc-500 font-medium font-mono text-xs">
                          {tour.email ?? tour.phone ?? "Contact method needed"}
                        </div>
                      </div>

                      {tour.message ? (
                        <p className="mt-4 rounded-lg border border-zinc-900 bg-black/30 p-4 text-sm leading-6 text-zinc-400">
                          {tour.message}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </PortalPageFrame>
  );
}

function groupToursByDate(tours: LuxorInquiry[]) {
  return tours.reduce<Record<string, LuxorInquiry[]>>((groups, tour) => {
    if (!tour.preferred_tour_date) return groups;

    groups[tour.preferred_tour_date] = [...(groups[tour.preferred_tour_date] ?? []), tour];
    return groups;
  }, {});
}

function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
