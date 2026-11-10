# Finance workspace consolidation

## The jobs and the records

- **Bills** are actual invoices received or entered by the owner. A bill can be one-off or recur. Review extracted facts, resolve duplicates, and approve it before treating it as ready.
- **Recurring costs** describe expected future charges, such as rent or internet. A schedule is not an invoice and a scheduled charge is not a payment. Match an arriving bill to its expected period instead of counting both as separate costs.
- **Expenses and payments** are the ledger used to establish balances and cash reporting. Recording a payment must use the existing expense payment flow; setting a bill status alone is insufficient.
- **Companies** supply identity, contact details, websites, and documents within bill or cost details. They do not need a separate primary navigation destination.
- **Preferred event vendors** belong to Operations. Event expenses remain distinguishable from the venue's operating costs, even when a company is involved in both.

## Implemented workspace

- Payables now exposes Bills and Recurring costs directly. The legacy Providers URL opens Recurring costs; company information is a secondary panel rather than another primary page.
- Bills use shared filters, concise rows, and one review panel at every viewport. Editing, duplicate review, approval, and expense/payment details stay in panels. Archived bills no longer leak into active counts, reminders, or lists.
- Recurring costs use one searchable, paginated list. A schedule opens its amount, cycle, next expected date, and paginated expected charges in a panel. Setup, editing, and expected-charge detail stay in that workspace.
- Company records open their bills and schedules in panels. Company profiles are limited to existing finance references, rather than displaying the entire preferred event-vendor roster. New recurring costs cannot acquire event-vendor links; historical associations are preserved.
- Nested panels have Back controls, retained content during their closing animation, and one background dim. Collapsed content is excluded from focus trapping. Validation messages appear inside the panel performing the action.

Navigation and visual consolidation do not establish a separate finance-provider data model or prove that AI uploads are deployed. Verification of the rendered journey and backend work must be reported independently.

## Current AI behavior and limitations

- Bill intake extracts invoice facts. Exact file duplicates are detected by SHA256; the insert RPC also flags matching normalized company and invoice numbers. Its locking and uniqueness protections must be preserved.
- The provider-document upload classifies bills, contracts, other documents, or uncertain files. Low confidence requests a document-type choice. A contract may receive an explicitly extracted, unverified end date; renewal terms and automatic schedule creation are not implemented.
- Sensitive or unreadable document classifications do not receive a save ticket. The model sees the document through OpenRouter before it can make that judgment, so this is probabilistic flagging, not local redaction or a guarantee that sensitive content is never transmitted.
- Signed analysis tickets bind the assessment to the file hash, actor, and provider. A shared destination claim prevents the same request switching between bill and document storage on retry.
- Migration `20261110060105_provider_document_scan.sql` was applied to the Luxor Supabase project on November 10, 2026. Read-only verification confirmed the nullable owner-attestation field, scan metadata, immutable destination claims, FK index, RLS, and service-role-only SELECT/INSERT grants. No upload or financial test records were created in production. Passing mocked tests do not prove live model behavior, storage writes, or database concurrency.
- A provider upload records provider context in mail metadata, but the bill worker does not treat that context as a confirmed company link. Imported approval still requires confirmed company identity, category, known amount, and resolved duplicate/arithmetic checks.
- Reviewed historical bills can yield a recurring-cost suggestion. Automatic creation is unfinished: a schedule currently generates future expense records, and cross-schedule identity/deduplication plus reliable future-cycle evidence are needed before background creation is safe.

## Data boundaries still requiring coordinated work

Finance providers and preferred event vendors share historical vendor records. Existing bill-to-schedule matching uses vendor IDs in UI filters, database guards, and transactional reconciliation. A durable separation requires an explicit role model and a legacy classification path. Do not guess roles from names/categories, discard old links, or weaken reconciliation checks merely to simplify the UI.

## Source responsibilities

| Concern | Source |
| --- | --- |
| Finance navigation and legacy view handling | `src/app/(portal)/portal/finances/page.tsx` |
| Bill list and shared review/approval content | `src/components/portal/BillsPayableLedger.tsx` |
| Recurring costs and expense ledger | `src/components/portal/expenses/ExpenseManagement.tsx` |
| Existing company grouping and details | `ProvidersWorkspace.tsx`, `VendorBillsProfile.tsx`, `VendorBusinessDetails.tsx` |
| Shared panels, controls, and transitions | `src/components/portal/PortalUI.tsx` |
| Document UI and classification | `VendorDocuments.tsx`, `luxorProviderDocumentAnalysis.ts`, `luxorProviderUploadDestination.ts`, provider document API routes |
| Invoice extraction and duplicate-aware intake | `src/lib/luxorBillIntakeServer.ts`, `luxor_insert_intake_bill` migrations |
| Approval and confirmed identity | Operations bill review and company-link routes |
| Recurring evidence and reconciliation | `luxorRecurringCostEvidence.ts`, `RecurringBillMatch.tsx`, expense matching routes and migrations |

No payment, historic vendor reassignment, or live financial record mutation is required to validate the navigation redesign.

## Upload verification

The focused Node tests cover classification and ticket validation, sensitive/uncertain response handling, destination conflicts, storage-failure retries, actor-bound polling, exact file duplicates, already-saved intake replay, and a duplicate detected by the insert RPC. Run the `luxor-provider-*.test.cjs`, `luxor-bill-intake-*.test.cjs`, and `luxor-phase5-bills.test.cjs` tests. All integrations use synthetic data and mocked network/database responses.

The classifier's instruction lives in the system message; file content remains untrusted user evidence. Malformed responses, impossible dates, invalid confidence, expired tickets, and unavailable destination storage fail closed.

On November 10, the real classifier processed two synthetic PDFs generated only in memory. A service agreement returned `contract`, `sensitive=none`, confidence `0.99`, and the correct explicit end date (`2027-12-31`). A tax-form fixture with a neutral filename returned `other`, `sensitive=possible`, confidence `0.95`, and no end date. No file, storage object, or database record was saved. These samples verify the live model path, not universal classification accuracy. Private storage round-trip and rendered upload/review flows at target sizes still need acceptance coverage.

## November 10 local verification

- Full typecheck and quiet lint passed. The focused bill, upload/classification, access-control, duplicate, and recurring-cost checks passed: 54 tests.
- In-app browser layout checks covered 1532 × 811 desktop, 834 × 1112 iPad portrait, and 390 × 844 mobile. Checked light mode first and dark mode; restored light mode afterward. The mobile document width remained 390 px with a full-height panel.
- Exercised bill details/edit/back, filters and empty results, schedule edit/back, expected-charge pagination, expected-charge details, and company-to-record drill-down without submitting changes. Browser console reported no errors.
- Attempted an isolated browser upload with intercepted API responses, but the in-app file chooser timed out. No file was selected and no upload request occurred. Interception was cleared afterward. This does not count as a rendered upload acceptance pass.
- No payments, financial records, or uploaded documents were created in the live account. Application source remains local and uncommitted; the applied schema migration is separately verified above.
