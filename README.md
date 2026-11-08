# Luxor Event Space

Next.js site for the Luxor at Las Palmas public pages and the private owner portal. Arianna Patterson uses the portal day to day. Lewis builds and ships it.

`AGENTS.md` is the working agreement for agents. This README is the shorter map for people. If they disagree, trust `AGENTS.md` and the code.

## What it is

- Public site: home, events, gallery, visit, contact, spaces, and tour. Spanish pages live under `/es`. Header links are Events, Gallery, Visit, and Contact.
- Owner portal at `/portal`: leads, calendar, planner, calls, texts, email, marketing, finances, invoices, operations, reports, and settings.
- Client links outside the portal shell: proposal review, agreement signing, tour response, layout review, and planner review.
- Records live in Supabase. Card payments go through Stripe. Calls and texts go through Twilio. Mail is moving to Resend and is not finished.

## Sign-in and mail

Portal sign-in is an email and password at `/portal/login` for an active `@luxoratlaspalmas.com` member, checked with Supabase Auth. The session cookie is `luxor_portal_session`. Arianna's owner login is `a.patterson@luxoratlaspalmas.com`.

Customer and owner mail is sent from `booking@luxoratlaspalmas.com` through the email job queue. The intended provider is Resend. Bounce handling, inbound mail, and the import of older mailbox history are still in progress. Zoho login and Zoho mail are no longer the path to use. A few Zoho files remain only so that unfinished migration can still read old history.

Gmail is how Lewis writes to Arianna about the work. It is not the venue inbox. Practice sends for marked test leads go to `luxoratlaspalmas@gmail.com`.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- Framer Motion and Lucide on the public site
- Supabase for data, Auth for portal passwords, and checked-in SQL in `supabase/migrations`
- Resend for mail delivery, behind `src/lib/luxorResendMailServer.ts` and `luxor_email_jobs`
- Stripe for payments
- Twilio for voice and SMS
- Vercel for production at `https://www.luxoratlaspalmas.com`

## Local development

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

The dev server is `http://localhost:3000`. Use npm and `package-lock.json`.

Useful checks when you touch those areas:

```bash
npm run test:follow-ups
npm run test:custom-workflows
npm run test:payments-dashboard
```

See `tests/README.md` for what those cover. They do not hit production mail, phone, or customer records.

## Where to look

| Area | Path |
| --- | --- |
| Public pages | `src/app/(site)` |
| Owner portal | `src/app/(portal)/portal` |
| Login and activation | `src/app/(auth)/portal` |
| API routes | `src/app/api` |
| Server helpers | `src/lib` |
| Portal UI | `src/components/portal` |
| Public UI | `src/components` |
| Database migrations | `supabase/migrations` |
| Tests | `tests` |

Start with `src/lib/luxorPortalAuth.ts` for the session cookie, `src/lib/luxorMailConfig.ts` for senders and the Resend provider switch, `src/lib/luxorEmailJobsServer.ts` for queued mail, and `src/lib/luxorBookingsServer.ts` for inquiries and bookings.

## Deployment

Vercel builds from the repository root with `npm run build`. Portal, Resend, Stripe, Twilio, and cron routes need server-only environment variables. Do not prefix secrets with `NEXT_PUBLIC_`.

`LUXOR_EMAIL_CRON_SECRET` in Vercel and `luxor_email_jobs_cron_secret` in Supabase Vault are the same value. Rotate both together, redeploy, then hit `/api/cron/email-jobs?health=1` and `/api/cron/text-jobs?health=1` and confirm `luxor_worker_health` recorded the check without sending.

Web push uses one stable VAPID pair: `LUXOR_WEB_PUSH_PUBLIC_KEY`, `LUXOR_WEB_PUSH_PRIVATE_KEY`, and `LUXOR_WEB_PUSH_SUBJECT` (`mailto:` or an HTTPS URL). Keep the same pair across deployments.

## Practical notes

- Keep the public site visually separate from the portal. The public site is light and warm. The portal has its own light and dark themes.
- Spell `Quinceañera` with `ñ`.
- Public hero content should be visible on first paint, not after a scroll animation.
- Do not add a package unless the current stack cannot do the job.
- Never commit `.env*`, credentials, or `TWILIO_PRIVATE_CONTEXT.md`.
