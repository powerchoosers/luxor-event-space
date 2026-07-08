# Luxor Event Space

Luxor Event Space is a Next.js site for the venue public pages and the owner portal. It includes the marketing site, booking and tour flows, Zoho mail integration, and the protected `/portal` workspace.

## How This README Should Be Used

- This is a human-friendly project overview.
- Codex can use it as supporting context.
- `AGENTS.md` and the source files are the higher priority when something conflicts.
- If this README drifts from the code, trust the code and `AGENTS.md`.

## Main Areas

- Public site: `/`, `/events`, `/spaces`, `/gallery`, `/pricing`, `/visit`, `/tour`
- Portal: `/portal`, `/portal/leads`, `/portal/communications`, `/portal/invoices`, `/portal/marketing`, `/portal/calendar`
- Auth and mail: Zoho login, portal session cookies, inbox sync, email sending, and email job processing
- Booking flow: inquiries, tour slots, tour responses, signatures, and follow-up messages

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- Lucide icons
- Supabase-backed server helpers
- Zoho OAuth and Zoho Mail for portal email

## Local Development

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

The local site runs at `http://localhost:3000`.

## Practical Notes

- Keep the public site and portal separate.
- Keep the `Quinceañera` spelling with `ñ`.
- Do not add new packages unless they solve a real problem.
- Public hero content should render immediately, not after scroll-triggered reveal effects.
- Header and footer navigation should point to real pages, not hash links, unless the jump is intentional.

## Production Email Cron

- Vercel cron is configured in [vercel.json](/C:/Users/Lap3p/OneDrive/Documents/luxor-event-space/vercel.json) to call `/api/cron/luxor-email-jobs` every 5 minutes.
- Set `CRON_SECRET` in Vercel. Vercel sends it as a bearer token to the cron route.
- Run the Supabase SQL in [supabase/luxor_portal_operations_upgrade.sql](/C:/Users/Lap3p/OneDrive/Documents/luxor-event-space/supabase/luxor_portal_operations_upgrade.sql), [supabase/luxor_marketing_machine.sql](/C:/Users/Lap3p/OneDrive/Documents/luxor-event-space/supabase/luxor_marketing_machine.sql), and [supabase/luxor_email_jobs_cron.sql](/C:/Users/Lap3p/OneDrive/Documents/luxor-event-space/supabase/luxor_email_jobs_cron.sql).
- `luxor_claim_due_email_jobs` atomically claims due rows before sending so overlapping cron runs do not send the same email twice.

## Useful Files

- `src/app/(site)/layout.tsx`
- `src/app/(portal)/layout.tsx`
- `src/lib/luxorPortalAuth.ts`
- `src/lib/zohoMailServer.ts`
- `src/lib/luxorEmailJobsServer.ts`
- `src/lib/luxorBookingsServer.ts`
- `src/lib/luxorInquiryTypes.ts`
