// Luxor-branded inline-HTML email renderer.
// Produces inbox-safe HTML that mirrors the website's dark-and-gold aesthetic.
// All styles are inline — email clients strip CSS classes.

import type {
  EmailBlock,
  HeroBlock,
  TextBlock,
  ImageTextBlock,
  ButtonBlock,
  TwoColumnBlock,
  DividerBlock,
  SpacerBlock,
  FooterBlock,
} from '../emailTemplates'

// Absolute base URL for hosted static assets (logo images, etc.)
// In production this resolves to the deployed Vercel URL.
const SITE_BASE_URL = 'https://luxor-event-space.vercel.app'

// ─── Brand tokens (mirroring globals.css) ─────────────────────────────────────
const B = {
  bg:          '#050505',
  surface:     '#0b0a08',
  surfaceSoft: '#15100d',
  card:        '#0a0807',
  gold:        '#caa24c',
  goldBright:  '#f1d27a',
  goldDim:     '#9b6d24',
  cream:       '#f7efe3',
  muted:       '#d7c29a',
  mutedDim:    'rgba(215,194,154,0.70)',
  border:      'rgba(202,162,76,0.18)',
  borderSoft:  'rgba(202,162,76,0.12)',
  ink:         '#050505',
  // Fonts — email-safe stacks matching the site
  serif:   '"Cormorant Garamond", "Cormorant", Georgia, "Times New Roman", serif',
  sans:    '"Manrope", "Helvetica Neue", Arial, Helvetica, sans-serif',
  mono:    '"Courier New", Courier, monospace',
}

// ─── Email chrome ─────────────────────────────────────────────────────────────

/** Wraps a table row with the outer email container. Not used per-block — used in renderEmailToHtml. */
function wrapEmail(rows: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Manrope:wght@400;600;700;800&display=swap');
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; display: block; }
    a { color: #caa24c; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#050505;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <!-- Email container: 600px, dark-and-gold brand -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
          style="width:600px;max-width:600px;background-color:#0a0807;border:1px solid rgba(202,162,76,0.22);border-radius:4px;overflow:hidden;">
          ${rows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Block renderers ──────────────────────────────────────────────────────────

function renderHero(block: HeroBlock): string {
  const bg = block.backgroundImage
    ? `background-image:linear-gradient(rgba(5,5,5,${block.overlayOpacity}),rgba(5,5,5,${block.overlayOpacity + 0.1})),url('${block.backgroundImage}');background-size:cover;background-position:center;background-color:#0b0a08;`
    : `background:radial-gradient(circle at 50% 0%,rgba(202,162,76,0.18),transparent 70%),linear-gradient(180deg,#120d0a,#050505);`

  const align = block.textAlign

  const cta = block.ctaVisible
    ? `<tr><td align="${align}" style="padding-top:28px;">
        <a href="${block.ctaUrl}" target="_blank"
          style="display:inline-block;background-color:#caa24c;color:#050505;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;text-decoration:none;padding:14px 36px;border-radius:3px;border:1px solid rgba(241,210,122,0.5);box-shadow:0 18px 36px -20px rgba(202,162,76,0.6);">
          ${block.ctaLabel}
        </a>
      </td></tr>`
    : ''

  const labelHtml = `<p style="margin:0 0 16px;font-family:'Manrope','Courier New',monospace;font-size:9px;font-weight:700;letter-spacing:0.38em;text-transform:uppercase;color:#caa24c;">LUXOR EVENT SPACE</p>`

  const headlineAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'

  return `
  <!-- Hero Block -->
  <tr>
    <td style="${bg}padding:72px 48px 64px;text-align:${headlineAlign};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="${headlineAlign}">${labelHtml}</td></tr>
        <tr>
          <td>
            <h1 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:46px;font-weight:600;line-height:1.05;color:#f7efe3;letter-spacing:0.02em;text-align:${headlineAlign};">${block.headline}</h1>
            <p style="margin:0;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:400;line-height:1.75;color:rgba(215,194,154,0.82);text-align:${headlineAlign};max-width:480px;${align === 'center' ? 'margin-left:auto;margin-right:auto;' : ''}">${block.subheadline}</p>
          </td>
        </tr>
        ${cta}
      </table>
    </td>
  </tr>
  <!-- Gold rule below hero -->
  <tr>
    <td style="height:2px;background:linear-gradient(90deg,transparent,#caa24c,transparent);font-size:1px;line-height:1px;">&nbsp;</td>
  </tr>`
}

function renderText(block: TextBlock): string {
  const align = block.textAlign
  const lines = block.content.split('\n')
  const paragraphs = lines.map((line) => {
    if (!line.trim()) return `<p style="margin:0 0 6px;">&nbsp;</p>`
    return `<p style="margin:0 0 14px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:${block.fontSize}px;font-weight:400;line-height:1.8;color:${block.color};text-align:${align};">${line}</p>`
  }).join('')

  return `
  <!-- Text Block -->
  <tr>
    <td style="padding:36px 48px;">
      ${paragraphs}
    </td>
  </tr>`
}

function renderImageText(block: ImageTextBlock): string {
  const imgSrc = block.imageUrl || ''
  const imgCell = `<td width="220" style="width:220px;padding:0;vertical-align:top;">
    ${imgSrc
      ? `<img src="${imgSrc}" alt="${block.imageAlt}" width="220" style="display:block;width:220px;border-radius:3px;border:1px solid rgba(202,162,76,0.14);" />`
      : `<div style="width:220px;height:160px;background:linear-gradient(135deg,#120d0a,#1e1409);border:1px solid rgba(202,162,76,0.14);border-radius:3px;display:table-cell;text-align:center;vertical-align:middle;">
          <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:rgba(202,162,76,0.4);letter-spacing:0.2em;">LUXOR</span>
         </div>`
    }
  </td>`

  const textCell = `<td style="padding-${block.imagePosition === 'left' ? 'left' : 'right'}:28px;vertical-align:top;">
    <p style="margin:0 0 10px;font-family:'Manrope','Courier New',monospace;font-size:9px;font-weight:700;letter-spacing:0.38em;text-transform:uppercase;color:#caa24c;">FEATURED</p>
    <h2 style="margin:0 0 14px;font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:600;line-height:1.1;color:#f7efe3;">${block.headline}</h2>
    <p style="margin:0 0 24px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:400;line-height:1.8;color:rgba(215,194,154,0.78);">${block.body}</p>
    <a href="${block.ctaUrl}" target="_blank"
      style="display:inline-block;background-color:#caa24c;color:#050505;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:11px 26px;border-radius:3px;border:1px solid rgba(241,210,122,0.45);">
      ${block.ctaLabel}
    </a>
  </td>`

  const cells = block.imagePosition === 'left'
    ? `${imgCell}${textCell}`
    : `${textCell}${imgCell}`

  return `
  <!-- Image + Text Block -->
  <tr>
    <td style="padding:36px 48px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>${cells}</tr>
      </table>
    </td>
  </tr>`
}

function renderButton(block: ButtonBlock): string {
  const isGold = !block.bgColor || block.bgColor === '#caa24c' || block.bgColor === '#b8924a'
  const bg = isGold ? '#caa24c' : block.bgColor
  const fg = isGold ? '#050505' : block.textColor
  const border = isGold ? '1px solid rgba(241,210,122,0.5)' : `1px solid ${bg}`
  const shadow = isGold ? 'box-shadow:0 18px 36px -20px rgba(202,162,76,0.5);' : ''
  const alignMap = { left: 'left', center: 'center', right: 'right' }
  const align = alignMap[block.align] ?? 'center'

  return `
  <!-- Button Block -->
  <tr>
    <td align="${align}" style="padding:16px 48px 28px;">
      <a href="${block.url}" target="_blank"
        style="display:inline-block;background-color:${bg};color:${fg};font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;text-decoration:none;padding:15px 42px;border-radius:3px;${border ? `border:${border};` : ''}${shadow}">
        ${block.label}
      </a>
    </td>
  </tr>`
}

function renderTwoColumn(block: TwoColumnBlock): string {
  return `
  <!-- Two Column Block -->
  <tr>
    <td style="padding:36px 48px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="48%" style="width:48%;vertical-align:top;padding-right:16px;border-right:1px solid rgba(202,162,76,0.18);">
            <p style="margin:0 0 10px;font-family:'Manrope','Courier New',monospace;font-size:9px;font-weight:700;letter-spacing:0.34em;text-transform:uppercase;color:#caa24c;">01</p>
            <h3 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;line-height:1.15;color:#f7efe3;">${block.leftHeadline}</h3>
            <p style="margin:0;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:400;line-height:1.8;color:rgba(215,194,154,0.75);">${block.leftBody}</p>
          </td>
          <td width="4%" style="width:4%;"></td>
          <td width="48%" style="width:48%;vertical-align:top;padding-left:16px;">
            <p style="margin:0 0 10px;font-family:'Manrope','Courier New',monospace;font-size:9px;font-weight:700;letter-spacing:0.34em;text-transform:uppercase;color:#caa24c;">02</p>
            <h3 style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;line-height:1.15;color:#f7efe3;">${block.rightHeadline}</h3>
            <p style="margin:0;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:400;line-height:1.8;color:rgba(215,194,154,0.75);">${block.rightBody}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

function renderDivider(block: DividerBlock): string {
  // If color is the brand gold, use the decorative diamond divider from the site
  const isGold = block.color === '#caa24c' || block.color === '#e0c97c' || block.color === '#d4a0e0'
  if (isGold && block.style === 'solid') {
    return `
  <!-- Decorative Gold Divider -->
  <tr>
    <td style="padding:8px 48px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="border-top:1px solid rgba(202,162,76,0.35);height:1px;"></td>
          <td width="20" style="width:20px;text-align:center;padding:0 12px;">
            <span style="display:inline-block;width:7px;height:7px;background-color:#caa24c;transform:rotate(45deg);margin-top:-4px;font-size:1px;">&nbsp;</span>
          </td>
          <td style="border-top:1px solid rgba(202,162,76,0.35);height:1px;"></td>
        </tr>
      </table>
    </td>
  </tr>`
  }

  return `
  <!-- Divider Block -->
  <tr>
    <td style="padding:8px 48px;">
      <div style="height:${block.thickness}px;background-color:${block.color};border-style:${block.style};"></div>
    </td>
  </tr>`
}

function renderSpacer(block: SpacerBlock): string {
  return `
  <!-- Spacer Block -->
  <tr><td style="height:${block.height}px;line-height:${block.height}px;font-size:1px;">&nbsp;</td></tr>`
}

function renderFooter(block: FooterBlock): string {
  const palmMarkUrl = `${SITE_BASE_URL}/luxor-palm-mark.png`

  const social = block.showSocial
    ? `<tr><td align="center" style="padding-top:20px;">
        <a href="${block.instagramUrl}" target="_blank" style="font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:#caa24c;text-decoration:none;">Instagram</a>
        <span style="color:rgba(202,162,76,0.35);font-size:10px;margin:0 16px;">&#9670;</span>
        <a href="${block.facebookUrl}" target="_blank" style="font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:#caa24c;text-decoration:none;">Facebook</a>
      </td></tr>`
    : ''

  return `
  <!-- Decorative gold divider before footer -->
  <tr>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="border-top:1px solid rgba(202,162,76,0.25);height:1px;"></td>
          <td width="32" style="width:32px;text-align:center;padding:0 10px;vertical-align:middle;">
            <div style="width:7px;height:7px;background-color:#caa24c;transform:rotate(45deg);display:inline-block;font-size:1px;">&nbsp;</div>
          </td>
          <td style="border-top:1px solid rgba(202,162,76,0.25);height:1px;"></td>
        </tr>
      </table>
    </td>
  </tr>
  <!-- Footer Block -->
  <tr>
    <td style="background-color:#080605;padding:44px 48px 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

        <!-- Palm mark logo — same image used in the website header -->
        <tr>
          <td align="center" style="padding-bottom:18px;">
            <img
              src="${palmMarkUrl}"
              alt="Luxor Event Space"
              width="56"
              height="42"
              style="display:inline-block;width:56px;height:42px;object-fit:contain;"
            />
          </td>
        </tr>

        <!-- LUXOR wordmark text — mirrors site luxor-wordmark class -->
        <tr>
          <td align="center" style="padding-bottom:6px;">
            <p style="margin:0;font-family:'Cormorant Garamond','Cormorant',Georgia,'Times New Roman',serif;font-size:30px;font-weight:500;letter-spacing:0.14em;color:#caa24c;text-transform:uppercase;line-height:1;">LUXOR</p>
          </td>
        </tr>

        <!-- AT LAS PALMAS EVENTS subline — mirrors site luxor-subline class -->
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <p style="margin:0;font-family:'Cormorant Garamond','Cormorant',Georgia,serif;font-size:8px;font-weight:500;letter-spacing:0.55em;color:rgba(202,162,76,0.72);text-transform:uppercase;">AT LAS PALMAS EVENTS</p>
          </td>
        </tr>

        <!-- Contact info — real address from the site footer -->
        <tr>
          <td align="center" style="padding-bottom:4px;">
            <p style="margin:0;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:400;color:rgba(215,194,154,0.52);line-height:1.9;">
              803 Castroville Rd #402, San Antonio, TX 78237<br />
              Private venue tours by appointment.<br />
              <a href="https://luxoratlaspalmas.com" style="color:rgba(202,162,76,0.65);text-decoration:none;">luxoratlaspalmas.com</a>
            </p>
          </td>
        </tr>

        ${social}

        <!-- Tagline marquee (static in email) -->
        <tr>
          <td align="center" style="padding-top:20px;">
            <p style="margin:0;font-family:'Manrope','Courier New',monospace;font-size:8px;font-weight:600;letter-spacing:0.46em;text-transform:uppercase;color:rgba(202,162,76,0.38);">
              Timeless &nbsp;&#9670;&nbsp; Elegant &nbsp;&#9670;&nbsp; Celebratory &nbsp;&#9670;&nbsp; Luxurious
            </p>
          </td>
        </tr>

        <!-- Unsubscribe -->
        <tr>
          <td align="center" style="padding-top:20px;border-top:0;">
            <p style="margin:0;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:400;color:rgba(215,194,154,0.28);line-height:1.7;">
              You received this email because you expressed interest in Luxor Event Space.
              <a href="${block.unsubscribeUrl}" style="color:rgba(202,162,76,0.38);text-decoration:underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>`
}

// ─── Preheader / header band ──────────────────────────────────────────────────


function renderEmailHeader(): string {
  const palmMarkUrl = `${SITE_BASE_URL}/luxor-palm-mark.png`
  return `
  <!-- Top gold shimmer bar -->
  <tr>
    <td style="height:3px;background:linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24);font-size:1px;line-height:1px;">&nbsp;</td>
  </tr>
  <!-- Header: Palm mark + LUXOR wordmark — mirrors site header lockup -->
  <tr>
    <td style="background-color:#080605;padding:22px 48px 20px;border-bottom:1px solid rgba(202,162,76,0.14);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">
              <tr>
                <!-- Palm mark image -->
                <td style="vertical-align:middle;padding-right:10px;">
                  <img
                    src="${palmMarkUrl}"
                    alt=""
                    width="36"
                    height="27"
                    style="display:block;width:36px;height:27px;object-fit:contain;"
                  />
                </td>
                <!-- LUXOR text + subline -->
                <td style="vertical-align:middle;">
                  <p style="margin:0;font-family:'Cormorant Garamond','Cormorant',Georgia,'Times New Roman',serif;font-size:22px;font-weight:500;letter-spacing:0.115em;color:#caa24c;text-transform:uppercase;line-height:1;">LUXOR</p>
                  <p style="margin:2px 0 0;font-family:'Cormorant Garamond','Cormorant',Georgia,serif;font-size:6px;font-weight:500;letter-spacing:0.5em;color:rgba(202,162,76,0.6);text-transform:uppercase;">AT LAS PALMAS EVENTS</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function renderBlockToHtml(block: EmailBlock): string {
  switch (block.type) {
    case 'hero':        return renderHero(block)
    case 'text':        return renderText(block)
    case 'image_text':  return renderImageText(block)
    case 'button':      return renderButton(block)
    case 'two_column':  return renderTwoColumn(block)
    case 'divider':     return renderDivider(block)
    case 'spacer':      return renderSpacer(block)
    case 'footer':      return renderFooter(block)
    default:            return ''
  }
}

export function renderEmailToHtml(subject: string, blocks: EmailBlock[]): string {
  const rows = [
    renderEmailHeader(),
    ...blocks.map(renderBlockToHtml),
  ].join('\n')

  return wrapEmail(rows)
}

// Re-export brand tokens for use in the builder UI (block previews)
export { B as LUXOR_BRAND }
