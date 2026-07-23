import type { LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'
import { LUXOR_BOOKING_EMAIL, LUXOR_VENUE_ADDRESS, LUXOR_WEBSITE } from './luxorVenue'

const money = (value: number) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

export function buildLuxorPaymentRequestEmail(input: {
  invoice: LuxorInvoice
  inquiry: LuxorInquiry
  checkoutUrl: string
  paymentAmount: number
  paymentLabel: string
  paidTotal: number
  balanceDue: number
}) {
  const { invoice, inquiry, checkoutUrl, paymentAmount, paymentLabel, paidTotal, balanceDue } = input
  const firstName = inquiry.full_name.split(' ')[0] || inquiry.full_name
  const remainingAfterPayment = Math.max(0, Math.round((balanceDue - paymentAmount) * 100) / 100)
  const itemRows = invoice.line_items.map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid rgba(202,162,76,0.1);font-size:12px;line-height:1.5;color:rgba(247,239,227,0.82);">${escapeHtml(item.description)}</td>
      <td align="center" style="padding:12px 8px;border-bottom:1px solid rgba(202,162,76,0.1);font-size:12px;color:rgba(215,194,154,0.66);">${Number(item.quantity)}</td>
    </tr>`).join('')

  return {
    subject: `${paymentLabel}: ${money(paymentAmount)} for your Luxor event`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Luxor Payment Request</title>
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body, table, td, p, a, h1, h2, h3 {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    @media (prefers-color-scheme: dark) {
      body, .luxor-bg { background-color: #050505 !important; color: #f7efe3 !important; }
      .luxor-card { background-color: #0a0807 !important; border-color: rgba(202,162,76,0.22) !important; }
      .luxor-header { background-color: #080605 !important; }
      .luxor-hero { background-color: #120d0a !important; }
      .luxor-box { background-color: #0d0b09 !important; }
      .luxor-title { color: #f7efe3 !important; }
      .luxor-gold { color: #caa24c !important; }
      .luxor-muted { color: rgba(215,194,154,0.82) !important; }
    }
    [data-ogsc] .luxor-bg { background-color: #050505 !important; }
    [data-ogsc] .luxor-card { background-color: #0a0807 !important; }
    [data-ogsc] .luxor-header { background-color: #080605 !important; }
    [data-ogsc] .luxor-title { color: #f7efe3 !important; }
    [data-ogsc] .luxor-gold { color: #caa24c !important; }
  </style>
</head>
<body class="luxor-bg" style="margin:0;padding:0;background-color:#050505;color:#f7efe3;font-family:'Helvetica Neue',Arial,sans-serif;color-scheme:light dark;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505" class="luxor-bg" style="background-color:#050505;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="luxor-card" style="width:600px;max-width:600px;background-color:#0a0807;border:1px solid rgba(202,162,76,0.22);border-radius:4px;overflow:hidden;">
        <tr><td style="height:3px;background:linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24);font-size:1px;line-height:1px;">&nbsp;</td></tr>
        <tr><td class="luxor-header" style="padding:28px 48px 20px;text-align:center;background-color:#080605;border-bottom:1px solid rgba(202,162,76,0.14);">
          <p class="luxor-gold" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:600;letter-spacing:0.18em;color:#caa24c;text-transform:uppercase;">Luxor</p>
          <p style="margin:6px 0 0;font-size:8px;letter-spacing:0.42em;color:rgba(202,162,76,0.62);text-transform:uppercase;">At Las Palmas Events</p>
        </td></tr>
        <tr><td class="luxor-hero" style="padding:52px 48px 32px;text-align:center;background-color:#120d0a;background:radial-gradient(circle at 50% 0%,rgba(202,162,76,0.18),transparent 70%),linear-gradient(180deg,#120d0a,#050505);">
          <p class="luxor-gold" style="margin:0 0 16px;font-size:10px;font-weight:700;letter-spacing:0.34em;text-transform:uppercase;color:#caa24c;">Proposal & Payment Request</p>
          <h1 class="luxor-title" style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:38px;font-weight:600;line-height:1.08;color:#f7efe3;">Your Event Proposal Is Ready</h1>
          <p class="luxor-muted" style="margin:0 auto;max-width:460px;font-size:15px;line-height:1.8;color:rgba(215,194,154,0.82);">Hi ${escapeHtml(firstName)}, your Luxor proposal is attached. Review the services below, then use the secure button to make your ${escapeHtml(paymentLabel.toLowerCase())}.</p>
        </td></tr>
        <tr><td style="height:2px;background:linear-gradient(90deg,transparent,#caa24c,transparent);font-size:1px;line-height:1px;">&nbsp;</td></tr>
        <tr><td style="padding:34px 48px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="50%" style="vertical-align:top;padding-right:16px;border-right:1px solid rgba(202,162,76,0.18);"><p class="luxor-gold" style="margin:0 0 8px;font-size:9px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:#caa24c;">Event</p><p class="luxor-title" style="margin:0;font-size:14px;color:#f7efe3;">${escapeHtml(invoice.event_type || 'Private Event')}</p></td>
              <td width="50%" style="vertical-align:top;padding-left:20px;"><p class="luxor-gold" style="margin:0 0 8px;font-size:9px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:#caa24c;">Event Date</p><p class="luxor-title" style="margin:0;font-size:14px;color:#f7efe3;">${escapeHtml(inquiry.target_date || 'To be confirmed')}</p></td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 48px 10px;">
          <p class="luxor-gold" style="margin:0 0 10px;font-size:9px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:#caa24c;">Proposal Services</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:8px 0;font-size:9px;text-transform:uppercase;letter-spacing:0.16em;color:rgba(202,162,76,0.62);">Service</td><td align="center" style="padding:8px;font-size:9px;text-transform:uppercase;letter-spacing:0.16em;color:rgba(202,162,76,0.62);">Qty</td></tr>
            ${itemRows}
          </table>
        </td></tr>
        <tr><td style="padding:24px 48px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="luxor-box" style="background-color:#0d0b09;border:1px solid rgba(202,162,76,0.18);">
            <tr><td class="luxor-muted" style="padding:18px 20px;font-size:12px;color:rgba(215,194,154,0.68);">Proposal total</td><td align="right" class="luxor-title" style="padding:18px 20px;font-size:13px;color:#f7efe3;">${money(invoice.total)}</td></tr>
            <tr><td class="luxor-muted" style="padding:0 20px 18px;font-size:12px;color:rgba(215,194,154,0.68);">Previously paid</td><td align="right" class="luxor-title" style="padding:0 20px 18px;font-size:13px;color:#f7efe3;">${money(paidTotal)}</td></tr>
            <tr><td class="luxor-gold" style="padding:18px 20px;border-top:1px solid rgba(202,162,76,0.18);font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#caa24c;">${escapeHtml(paymentLabel)} due now</td><td align="right" style="padding:18px 20px;border-top:1px solid rgba(202,162,76,0.18);font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#f1d27a;">${money(paymentAmount)}</td></tr>
            ${remainingAfterPayment > 0 ? `<tr><td class="luxor-muted" style="padding:0 20px 18px;font-size:11px;color:rgba(215,194,154,0.54);">Remaining after this payment</td><td align="right" class="luxor-muted" style="padding:0 20px 18px;font-size:12px;color:rgba(215,194,154,0.72);">${money(remainingAfterPayment)}</td></tr>` : ''}
          </table>
        </td></tr>
        <tr><td align="center" style="padding:8px 48px 42px;">
          <a href="${escapeHtml(checkoutUrl)}" target="_blank" style="display:inline-block;background-color:#caa24c;color:#050505;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:15px 34px;border-radius:3px;border:1px solid rgba(241,210,122,0.5);">Pay Securely With Stripe</a>
          <p class="luxor-muted" style="margin:18px 0 0;font-size:11px;line-height:1.7;color:rgba(215,194,154,0.48);">Payments are processed securely by Stripe. Reply to this email before paying if any service or quantity needs to change.</p>
        </td></tr>
        <tr><td class="luxor-header" style="background-color:#080605;padding:30px 48px 34px;text-align:center;border-top:1px solid rgba(202,162,76,0.14);">
          <p class="luxor-gold" style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:25px;letter-spacing:0.14em;color:#caa24c;text-transform:uppercase;">Luxor</p>
          <p class="luxor-muted" style="margin:0;font-size:11px;line-height:1.9;color:rgba(215,194,154,0.5);">${escapeHtml(LUXOR_VENUE_ADDRESS)}<br /><a href="mailto:${escapeHtml(LUXOR_BOOKING_EMAIL)}" style="color:rgba(202,162,76,0.72);text-decoration:none;">${escapeHtml(LUXOR_BOOKING_EMAIL)}</a><br /><a href="${escapeHtml(LUXOR_WEBSITE)}" style="color:rgba(202,162,76,0.72);text-decoration:none;">luxoratlaspalmas.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  }
}
