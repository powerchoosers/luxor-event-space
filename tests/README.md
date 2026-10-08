# Follow-Ups regression checks

Run the server-route regression harness with:

```bash
npm run test:follow-ups
```

The Node built-in test runner transpiles the actual `src/app/api/follow-ups/route.ts` and replaces its integrations with synthetic in-memory responses. Cases cover repeat decline without enrollment, the disposition trigger’s stop condition, stop/unsubscribe reason races, consent and overdue resume guards, selected-item skip/reschedule, and late response recording. No Supabase, email, phone, or customer records are accessed.

Run the repository checks before publishing:

```bash
npm run typecheck
npm run lint -- --quiet
npm run build
```

Rendered browser QA in this change used Playwright with synthetic fixtures and intercepted API calls. The temporary fixture route and browser script are kept outside the repository; do not deploy test fixtures or route stubs.
