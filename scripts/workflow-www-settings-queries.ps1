# Signed-in browser console: paste fetch lines to confirm installed + canEdit on production.
# Run workflow-www-api-smoke.ps1 first (unauthenticated 401 smoke). These need a portal session.
$base = 'https://www.luxoratlaspalmas.com/api/marketing/system-messages'
$paths = @(
  'inquiry-confirmation',
  'payment-confirmation',
  'event-reminder',
  'tour-text?key=tour_confirmation',
  'tour-text?key=tour_reminder',
  'invoice-reminder?key=invoice_due_reminder',
  'invoice-reminder?key=invoice_overdue_reminder',
  'invoice-reminder?key=invoice_payment_request',
  'inquiry-email',
  'receipt-email?key=tour_request_received',
  'receipt-email?key=newsletter_confirmation',
  'tour-email',
  'agreement-email',
  'agreement-package',
  'calendar-messages',
  'layout-review-email',
  'planner-invitation',
  'planner-verification',
  'zelle-instructions',
  'paid-invoice-email',
  'payment-receipt',
  'agreement-client',
  'agreement-owner',
  'manual-invoice-reminder',
  'proposal-breakdown',
  'offer-email',
  'payment-request-email',
  'installment-email',
  'final-payment-email',
  'event-email',
  'tour-no-show-email',
  'brochure-delivery',
  'phone-text?kind=missed_call',
  'phone-text?kind=inbound_acknowledgment'
)
Write-Host "Paste into DevTools on www (signed in):"
Write-Host @"
(async () => {
  const paths = $($paths | ConvertTo-Json -Compress);
  const out = [];
  for (const p of paths) {
    const res = await fetch('$base/' + p, { credentials: 'include' });
    const j = res.ok ? await res.json() : { error: await res.text() };
    out.push({ p, status: res.status, installed: j.installed, canEdit: j.canEdit });
  }
  const bad = out.filter((r) => r.status !== 200 || r.canEdit === false);
  console.table(out);
  return { ok: out.length - bad.length, bad };
})();
"@
