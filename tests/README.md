# Follow-Ups regression checks

Run the server-route regression harness with:

```bash
npm run test:follow-ups
```

The Node built-in test runner transpiles the actual `src/app/api/follow-ups/route.ts` and replaces its integrations with synthetic in-memory responses. Cases cover repeat decline without enrollment, the disposition trigger’s stop condition, stop/unsubscribe reason races, consent and overdue resume guards, selected-item skip/reschedule, and late response recording. No Supabase, email, phone, or customer records are accessed.

The same command runs `tests/notes-route.test.cjs`, which checks the existing database note-type constraint and verifies that a task-linked note is rejected unless the task belongs to the same lead. Its fetch stub uses only synthetic IDs and a reserved `.invalid` host.

For rendered browser QA, run the committed harness from the project root in an environment with Playwright and Chromium available:

```bash
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE_PATH=/path/to/chromium node tests/follow-ups-browser-qa.cjs
```

It creates and removes a temporary QA route, starts a local Next server, intercepts every API request with synthetic fixtures, and never contacts production. It checks grouping, counts, filters, duplicate-name search, and that closing the existing lead-workspace modal refreshes parent lead state, Follow-Up tasks, and selected history. Its iframe is a fixture, so this verifies parent refresh behavior and modal wiring, not the authenticated production tour/proposal controls.

Run the repository checks before publishing:

```bash
npm run typecheck
npm run lint -- --quiet
npm run build
```

The browser harness intentionally keeps its fixture route out of application source and removes it after each run; do not deploy test fixtures or route stubs.
