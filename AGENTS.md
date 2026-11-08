# Luxor Event Space

These instructions apply to this entire repository. Cursor loads this file as standing workspace guidance on every turn.

## Who this is for

- Arianna Patterson is the Luxor owner and the primary day-to-day portal user. The owner login shown on `/portal/login` is `a.patterson@luxoratlaspalmas.com`.
- Lewis directs implementation and makes the edits. Do not change portal access, sender allowlists, or permissions just because a name appears in content.
- Lewis uses the connected Gmail tools to talk with Arianna about the work. That Gmail connection is for their conversation. It is not the venue mailbox, not portal login, and not the customer email system.
- The business mailbox is `booking@luxoratlaspalmas.com`, with `hello@luxoratlaspalmas.com` as an allowed alias. The display name is `Luxor at Las Palmas Events`.
- Marked test sends use `luxoratlaspalmas@gmail.com`. Do not treat that inbox as a customer or as Arianna's portal login.

## Repository

- GitHub: `https://github.com/powerchoosers/luxor-event-space`
- Git remote: `origin`
- Default and deployment branch: `main`
- Production site: `https://www.luxoratlaspalmas.com` (the apex redirects to `www`)
- This is the Luxor Event Space website and owner portal. Do not commit or push its files to the Nodal Point CRM repository.
- `AGENTS.md` is the highest-priority repo guidance. `README.md` is the human overview. If they disagree, follow this file and the source.

## Directory map

```
src/app/(site)          Public marketing site, Spanish pages under /es, payment result pages
src/app/(portal)        Signed-in owner workspace at /portal
src/app/(auth)          Portal login and activation, without the public header or Elena widget
src/app/(proposal)      Tokenized client proposal review
src/app/api             Route handlers: auth, bookings, mail, Twilio, Stripe, cron, portal data
src/app/layout-review   Tokenized layout review
src/app/planner-review  Tokenized planner review
src/app/secure-portal   Tokenized agreement signing
src/components          Public site components, plus src/components/portal for the owner UI
src/lib                 Server helpers. Prefer these over new one-off data access
src/hooks               Shared client hooks
src/types               Shared types
public                  Static images and icons
supabase/migrations     Checked-in SQL. This is how schema changes ship
tests                   Node test runner checks and disposable Postgres harnesses
docs                    Design notes that are not standing agent policy
scripts                 Local helper scripts
```

Do not treat `To Delete/`, `.next`, `tmp`, or generated `tsconfig*.tsbuildinfo` files as source.

## Source of truth

- `src/app/(site)/layout.tsx` for the public shell, fonts, and shared site chrome.
- `src/components/Header.tsx` and `src/components/Footer.tsx` for public navigation.
- `src/components/Reveal.tsx` for public-site animation policy.
- `src/app/(portal)/layout.tsx` for portal protection and redirect behavior.
- `src/app/(auth)/portal/login/page.tsx` and `src/app/api/auth/portal-login/route.ts` for owner sign-in.
- `src/lib/luxorPortalAuth.ts` for the `luxor_portal_session` cookie.
- `src/lib/luxorPortalAccess.ts` and `src/lib/luxorSupabaseAuthServer.ts` for active `@luxoratlaspalmas.com` members and Supabase Auth.
- `src/lib/luxorMailConfig.ts` for the mail provider switch, approved senders, and Resend configuration check.
- `src/lib/luxorResendMailServer.ts` and `src/lib/luxorResendApiServer.ts` for Resend delivery.
- `src/lib/luxorEmailJobsServer.ts` for the email job queue.
- `src/lib/luxorBookingsServer.ts` and `src/lib/luxorInquiryTypes.ts` for booking and inquiry data.
- `src/lib/luxorTwilioServer.ts`, `src/lib/luxorPhoneNumbersServer.ts`, and `src/lib/luxorPhoneRoutingServer.ts` for Twilio, the selected public number, and call routing.
- `src/lib/luxorCallsServer.ts`, `src/lib/luxorMessagesServer.ts`, and `src/lib/luxorTextAutomationsServer.ts` for calls, SMS history, consent, and text automations.
- Stripe routes under `src/app/api/stripe` and `src/app/api/payments` for card payments. Do not place paid charges during testing unless Lewis explicitly authorizes that action.

## Identity and mail

Zoho is no longer the portal identity provider and is no longer the intended mail system. Do not send new work back through Zoho, and do not document Zoho login as the current path.

What is current:

- Portal login is email and password at `/portal/login`, using the `(auth)` layout. `POST /api/auth/portal-login` checks an active `luxor_portal_members` row on `@luxoratlaspalmas.com`, signs in through Supabase Auth, then sets the signed `luxor_portal_session` cookie. Logout is `/api/auth/logout` and must clear that cookie before redirecting to `/portal/login`.
- Magic-link activation lives at `/api/auth/portal-magic-link` and `/portal/activate`.
- `LUXOR_MAIL_PROVIDER` defaults to `resend`. Approved senders still come from `LUXOR_MAIL_ALLOWED_SENDERS`, falling back to the older Zoho sender env names only so existing deployments keep working.
- Automated and manual Luxor mail should go through `luxor_email_jobs` and the Resend sender so it can be scheduled, deduplicated, retried, and recorded. Do not bypass the queue for an automation.
- Resend receiving, bounce handling, and the Zoho history import are in progress. Do not describe the Resend cutover as finished. Settings still expose an email-migration review. Legacy Zoho modules remain in the tree (`src/lib/zohoMailServer.ts`, `src/lib/zohoOAuthSetup.ts`, `/api/auth/zoho/login`, `/api/auth/callback/zoho`) for that unfinished migration and for historical mailbox data. Leave them in place until Lewis asks to remove them.

Env var names may appear in docs. Never write real values into tracked files or chat summaries: `RESEND_API_KEY`, `LUXOR_EMAIL_CRON_SECRET`, `LUXOR_PORTAL_SESSION_SECRET`, `LUXOR_PORTAL_PASSWORD_HASH`, Supabase service keys, Stripe secrets, and Twilio secrets. Older Zoho names (`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_ACCOUNT_ID`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ACCOUNTS_SERVER`, `ZOHO_BASE_URL`, `LUXOR_ZOHO_LOGIN_EMAIL`, `LUXOR_ZOHO_ALLOWED_SENDERS`) may still exist in environments. Do not print their values.

## Connected tools

Lewis has these connections available while working in Cursor. Use them for the Luxor work they actually cover. Do not confuse a plugin with an in-repo integration.

- Supabase plugin: production database for this repository. Lewis authorizes autonomous schema inspection, SQL, checked-in migrations, storage-related database configuration, and verification required by a requested Luxor feature. Confirm the target has Luxor tables before changing anything. Do not assume similarly named CRM tables are this project. Apply the checked-in migration, then verify columns, constraints, RLS, and relevant advisors. This does not allow exposing credentials, weakening RLS, deleting production data, resetting branches, or unrelated destructive edits.
- Vercel plugin: deployments, runtime logs, environment variables, and domain checks for this Next.js app. A push is not proof that production is serving the new commit. Verify the deployment when a task includes release.
- Gmail plugin: Lewis's channel for emailing Arianna about the product. Do not send venue, customer, invoice, or marketing mail through it.
- Resend: the in-repo mail provider (`RESEND_API_KEY`, `src/app/api/webhooks/resend`). Setup is not complete. The Resend Cursor plugin can help with API questions; it does not replace the Luxor queue.
- Stripe: customer payments and webhooks in the app. The Stripe plugin is for API and account questions, not for inventing charges.

## Public site and portal

- Public header links are `/events`, `/gallery`, `/visit`, and `/contact`, with Spanish copies under `/es`. Other real public routes include `/`, `/spaces`, `/tour`, `/terms`, `/privacy`, `/sms-signup`, and `/grand-opening-rsvp`. Point navigation at real pages. There is no `/pricing` route.
- Do not put portal login inside the `(site)` group. That layout adds the public header, footer, and the public Elena concierge.
- Desktop heroes use the centered Luxor axis lockup with centered headline, copy, and CTAs unless the page is an intentional split hero. Do not wrap above-the-fold hero content in scroll-triggered `Reveal`.
- Use `Quinceañera` and `Quinceañeras` with `ñ` everywhere user-facing.
- The gallery is a custom filtered grid and lightbox. Do not add a gallery dependency unless it clearly improves that implementation.
- For frontend changes, use the `luxor-design` skill at `C:/Users/lewis/.codex/skills/luxor-design/SKILL.md` with this file.
- The public site stays light, quiet, and warm, with restrained gold. Do not import portal dark surfaces onto public pages. Any retained dark editorial panel needs explicit light text and accessible contrast.
- Every element has to earn its place. Prefer hierarchy, spacing, and type over extra cards, badges, pills, gradients, glows, blur, or decorative motion.
- Do not add an assistant, suggestion panel, or automation affordance unless it solves a demonstrated user problem. The existing Elena surfaces are the exception already in the product: public Elena answers venue and tour questions; portal Elena is the signed-in internal assistant. Portal Elena may read business data. Any database write needs a clear user confirmation and must stay server-authorized.
- The portal supports light and dark themes. Arianna prefers light mode, so QA light mode first, then confirm dark mode. Use `--portal-*` tokens and shared portal components. Portal dropdowns and calendars use `PortalSelect` and `PortalDatePicker` from `@/components/portal/PortalUI`. Pagination uses labeled previous/next arrow buttons and a visible current page.

## Phone, cron, and workers

- `LUXOR_EMAIL_CRON_SECRET` in Vercel and `luxor_email_jobs_cron_secret` in Supabase Vault are one shared credential. Never rotate only one side. After changing either side, update both, redeploy production, call `/api/cron/email-jobs?health=1` and `/api/cron/text-jobs?health=1` with the shared secret, verify both return HTTP 200 without sending, and confirm `luxor_worker_health` has fresh authenticated check-ins.
- Email and text cron routes must keep recording those heartbeats. Preserve the no-send `health=1` path and the portal stale-worker warning.
- Twilio credentials are server-only: `LUXOR_TWILIO_ACCOUNT_SID`, `LUXOR_TWILIO_AUTH_TOKEN`, `LUXOR_TWILIO_API_KEY_SID`, `LUXOR_TWILIO_API_KEY_SECRET`. Never prefix them with `NEXT_PUBLIC_`. Business verification details live in the Git-ignored `TWILIO_PRIVATE_CONTEXT.md`. Read that file only for an explicit Twilio setup task, and never copy it into tracked files, chat, logs, or commits.
- The selected `luxor_phone_numbers` row is the public business number and outgoing caller ID. Activating a number must set voice, voice fallback, SMS, and SMS fallback webhooks together.
- Voice has a persistent browser softphone and a PSTN bridge that rings the saved physical phone first. Incoming calls may ring both. Keep status callbacks and `luxor_calls` history for both legs.
- Twilio webhooks must validate `X-Twilio-Signature`. Portal-only Twilio routes must validate `luxor_portal_session`. Normalize caller IDs, destinations, and webhook form values before trusting them.
- Use `https://www.luxoratlaspalmas.com` as the Twilio webhook base. Never point Twilio at a URL that redirects.
- Automated texts are opt-in in portal Settings and stay disabled by default. Missed-call and inbound-acknowledgment texts are deduplicated through `luxor_text_automation_events`, written to `luxor_messages`, and include Luxor identification and STOP instructions when appropriate.
- An inbound STOP-family keyword records `opted_out` in `luxor_sms_consents` and blocks manual and automated CRM texts. Only START/UNSTOP may restore sending. Do not send a second application reply when Twilio already handled the keyword.
- Do not place paid calls, send real texts, buy numbers, or activate a public number during testing unless Lewis explicitly authorizes that real-world action.

## Development

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

The app uses npm and `package-lock.json`. Do not use pnpm. If `pnpm-lock.yaml` or `pnpm-workspace.yaml` appears untracked, delete those generated files before committing. Do not add them to `.gitignore`.

Local development is `http://localhost:3000`. The stack is Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS v4. Keep new packages conservative. Prefer the Next.js, React, Tailwind, Framer Motion, and Lucide patterns already in the repo.

Do not run `npm run build` after every small change. During iteration, prefer `npm run typecheck`, `npm run lint -- --quiet`, and browser checks. Run `npm run build` before a deployment, when Lewis asks for a build, or when a change is likely to affect production compilation.

`tests/` is part of the repo. Use the npm scripts in `package.json` (`test:follow-ups`, `test:custom-workflows`, `test:payments-dashboard`, and the others) when a change touches those areas. Read `tests/README.md` before adding a harness. Do not add test-only routes under `src/app`. Disposable browser fixtures stay outside application source and must be removed before the work is finished. Do not commit `.env*`, credentials, `node_modules`, `.next`, local agent state, browser logs, or QA screenshots.

For visual QA, use Cursor's in-app browser first. Do not switch to another browser unless Lewis asks. If the in-app browser cannot hold the portal session, say so and continue with non-browser checks.

## Git and deployment

Only commit or push when Lewis explicitly asks.

1. Confirm the branch with `git status -sb`.
2. Run `npm run typecheck` and `npm run lint -- --quiet`.
3. Stage only the files in the requested change.
4. Commit with a concise message about the user-facing result.
5. Push with `git push origin main` only when he explicitly asks for a direct main-branch push.

Fetch `origin` before relying on branch history, and fetch again before describing publication. Keep uncommitted changes, local commits ahead of the remote, and remote commits ahead of the branch as three separate facts. If fetch fails, say the remote comparison is unverified. Never blind-reset, overwrite, or force-push to erase divergence. After a publish, fetch `origin/main`, confirm the intended commit is there, and report `HEAD`, `origin/main`, ahead/behind, and working-tree dirtiness separately.

Lewis's preferred release is scoped edits, local checks, a non-force push to `main` when the task authorizes it, verification of the Vercel deployment, then plain user-acceptance steps for Arianna. A push alone does not prove live behavior.

Vercel builds this repo from the root with `npm run build`. The public site can run without secrets. Portal login, Resend, Stripe, Twilio, and cron need their server-only env vars in Vercel. `vercel.json` is currently empty, so do not assume a cron schedule from that file; check the Vercel project when cron timing matters.
