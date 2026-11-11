# Elena live inbound calls

The live phone flow and the `817` rehearsal use separate call scopes, tokens,
tools and endpoints. The rehearsal cannot create a lead or reserve a tour.
The live implementation is disabled unless `LUXOR_ELENA_LIVE_INBOUND_ENABLED`
is exactly `true`. Its configured number and number SID must match the sole
selected public Luxor phone row and the owned Twilio number. No source edit
changes carrier routing or enables the live flow by itself.

## Live behavior

Elena introduces herself by name and answers honestly if asked whether she is AI. Her voice and Arianna's
availability come from the owner settings. Availability is checked when a
transfer is prepared and again when the caller confirms it.

Before a human transfer, Elena reads back the caller's name and callback number,
asks to save them, and waits for an affirmative answer in a later caller turn.
The server saves the confirmed details before preparing the transfer. A second
short readback authorizes the actual attempt. The destination is always the
saved physical ring-to number, never a number supplied in conversation. Owned
Luxor numbers are rejected as transfer destinations.

When Arianna is unavailable, Elena captures the name, number, email and best
callback time. A caller may decline email. A failed connection retains the
confirmed contact and appends a callback-needed note to the call without
replacing owner-written notes. Elena does not promise a callback deadline or
claim Arianna answered without carrier progress.

Live tour booking uses only currently published times at least 24 hours ahead.
It requires a confirmed name, phone and email, a unique matching customer, and
an explicit later answer to the full date/time/contact readback. The booking
transaction uses the existing calendar, visit, capacity and receipt system.
When the caller approves an invitation, its email is queued for immediate
dispatch; other queued reminders are cancelled. Provider acceptance, delivery,
and reading are distinct. An existing tour,
ambiguous customer match or changed slot is sent to Arianna for review. A venue
tour does not reserve the event date or book a phone meeting.

## Data and call proof

Live calls use `metadata.scope = elena_live_inbound`; rehearsal calls use
`elena_phone_test`. A signed Twilio inbound request issues a short-lived,
single-use SIP ticket for the authenticated PSTN parent. The signed OpenAI
event can accept only the session bound to that ticket. Hosted tool access is
signed, expires, and is bound to the exact parent and session. Terminal calls
cannot perform customer actions.

Contact capture runs in a service-only transaction. It locks the call and
canonical phone matching. A single existing live inquiry is linked without
overwriting that inquiry's identity, status or consent. Multiple existing
matches retain the confirmed details on the call for owner review, without
creating another duplicate. Retries of the same capture return the existing
result. Subsequent caller-confirmed contact and event changes use a separate
version-checked transaction and preserve owner edits. Protected test phone/email
identifiers are rejected. Marketing consent is never inferred from a phone conversation.

Caller-requested informational emails require a complete readback of the
confirmed recipient, subject and message before the job is queued. The queue
verifies the approved snapshot before delivery and uses provider idempotency.

Only a signed SIP child `in-progress`/`answered` callback proves Elena's phone
connection answered. Both that proof and the persisted OpenAI acceptance are
required before the once-per-call owner notice becomes unread. Short-call and
out-of-order callbacks are supported. A parent that never reaches Elena is
recorded as missed; a late valid answer proof corrects the outcome. The signed
terminal callback can recover a missed-call stub after an initial database
outage. It cannot create a voice authorization ticket.

SIP and human legs use explicit signed callback URLs, so a late SIP completion
cannot replace the human transfer's call identifier. Recording and transcription
start only after the caller explicitly agrees and can be stopped on request.
Audio before consent is not recorded. Approved recordings are copied to private
storage under the existing retention policy; transcription depends on provider
availability. Audio quality, playback, transcription and a human answer require
a real caller acceptance test after deployment.

## Server configuration

Required existing credentials stay server-only: `OPENAI_API_KEY`,
`OPENAI_PROJECT_ID`, `OPENAI_VOICE_WEBHOOK_SECRET`,
`LUXOR_TWILIO_ACCOUNT_SID`, and `LUXOR_TWILIO_AUTH_TOKEN`.
The live opt-in additionally requires `LUXOR_ELENA_LIVE_NUMBER` and
`LUXOR_ELENA_LIVE_NUMBER_SID`.

The public incoming route delegates conditionally to
`handleElenaLiveIncoming` from `luxorElenaInboundServer.ts`. The OpenAI webhook
dispatches only the distinct live SIP ticket header to the live acceptor.
Parent status callbacks use `/api/elena-inbound/status`. SIP and transfer child
callbacks include their explicit `leg` and signed parent identifier. The
carrier callback change must be snapshotted and rollbackable independently of
the application gate. Disabling the gate stops new live handoffs; signed
callbacks may still finish the history of existing calls.

Settings → Elena → Incoming calls controls the live voice and Arianna's availability. The default is Brise and unavailable. Both options persist for future calls; changing these settings alone does not activate public routing.

Deploy migrations and code before enabling the gate. The public number keeps the existing `/api/twilio/incoming` voice URL. To prepare its status callback, first run the callback setup script without `--apply`; it verifies the selected number, existing voice routing, and unsigned callback rejection. The apply mode snapshots prior carrier settings outside the repository and changes only the status callback.

```powershell
node --env-file=.env.local scripts/elena-live-callback-setup.cjs
node --env-file=.env.local scripts/elena-live-callback-setup.cjs --apply
```

To restore legacy routing, disable the live gate in the production environment and redeploy; environment changes alone do not update an existing deployment. Restore the prior status callback from the saved snapshot if needed. Review current routing before applying rollback. The callback script does not change voice fallback or SMS settings.

```powershell
node --env-file=.env.local scripts/elena-live-callback-setup.cjs --rollback <snapshot-path>
node --env-file=.env.local scripts/elena-live-callback-setup.cjs --rollback <snapshot-path> --apply
```

## Verification

`node --test tests/elena-live-inbound.test.cjs` checks authorization,
confirmation tokens, availability, transfer loops and races, separate call
legs, short-call ordering, failed-transfer follow-up, and missed-call recovery.
All fixtures are synthetic and no provider requests are sent.

`tests/postgres/elena-inbound-capture.integration.sql` runs the actual capture
migration in a fresh disposable PostgreSQL database and rolls back its schema
and records. It verifies ACLs, replay, normalized duplicate matching, protected
test identifiers, identity preservation and transaction rollback. Run it with
`psql -v ON_ERROR_STOP=1 -f tests/postgres/elena-inbound-capture.integration.sql`.
Never run this fixture against the hosted Luxor database.
