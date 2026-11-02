export const LUXOR_PLANNER_TIME_ZONE = 'America/Chicago'

export function luxorPlannerDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LUXOR_PLANNER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
