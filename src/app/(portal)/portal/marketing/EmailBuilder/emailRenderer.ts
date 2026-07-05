// Pure inline-HTML email renderer — produces inbox-safe HTML from EmailBlock arrays.
// Email clients strip CSS classes, so all styles must be inline.

import type { EmailBlock, HeroBlock, TextBlock, ImageTextBlock, ButtonBlock, TwoColumnBlock, DividerBlock, SpacerBlock, FooterBlock } from '../emailTemplates'

function renderHero(block: HeroBlock): string {
  const bg = block.backgroundImage
    ? `background-image:linear-gradient(rgba(0,0,0,${block.overlayOpacity}),rgba(0,0,0,${block.overlayOpacity})),url('${block.backgroundImage}');background-size:cover;background-position:center;`
    : 'background:linear-gradient(135deg,#1a1208 0%,#2d1f0a 50%,#1a1208 100%);'

  const align = block.textAlign === 'center' ? 'center' : block.textAlign === 'right' ? 'right' : 'left'

  const cta = block.ctaVisible
    ? `<tr><td style="text-align:${align};padding-top:24px;">
        <a href="${block.ctaUrl}" style="display:inline-block;background:#b8924a;color:#ffffff;font-family:Georgia,serif;font-size:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:2px;">${block.ctaLabel}</a>
      </td></tr>`
    : ''

  return `
    <tr>
      <td style="${bg}padding:80px 40px;text-align:${align};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:42px;font-weight:700;color:#f5e6c8;letter-spacing:1px;line-height:1.15;">${block.headline}</h1>
              <p style="margin:0;font-family:Arial,sans-serif;font-size:16px;color:rgba(245,230,200,0.82);line-height:1.6;max-width:520px;${align === 'center' ? 'margin:0 auto;' : ''}">${block.subheadline}</p>
            </td>
          </tr>
          ${cta}
        </table>
      </td>
    </tr>`
}

function renderText(block: TextBlock): string {
  const align = block.textAlign
  const paragraphs = block.content
    .split('\n')
    .map((line) => line.trim() ? `<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:${block.fontSize}px;color:${block.color};line-height:1.7;text-align:${align};">${line}</p>` : '<p style="margin:0 0 12px;">&nbsp;</p>')
    .join('')
  return `<tr><td style="padding:32px 40px;">${paragraphs}</td></tr>`
}

function renderImageText(block: ImageTextBlock): string {
  const imgCell = `<td style="width:45%;padding:8px;vertical-align:top;">
    ${block.imageUrl
      ? `<img src="${block.imageUrl}" alt="${block.imageAlt}" style="width:100%;border-radius:4px;display:block;" />`
      : `<div style="width:100%;height:180px;background:linear-gradient(135deg,#1a1208,#3d2a0e);border-radius:4px;display:flex;align-items:center;justify-content:center;"></div>`
    }
  </td>`
  const textCell = `<td style="width:55%;padding:8px 16px;vertical-align:top;">
    <h2 style="margin:0 0 12px;font-family:Georgia,serif;font-size:22px;color:#111111;font-weight:700;">${block.headline}</h2>
    <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:14px;color:#555555;line-height:1.7;">${block.body}</p>
    <a href="${block.ctaUrl}" style="display:inline-block;background:#b8924a;color:#ffffff;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;padding:10px 24px;border-radius:2px;">${block.ctaLabel}</a>
  </td>`

  const cells = block.imagePosition === 'left' ? `${imgCell}${textCell}` : `${textCell}${imgCell}`

  return `<tr>
    <td style="padding:32px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>${cells}</tr>
      </table>
    </td>
  </tr>`
}

function renderButton(block: ButtonBlock): string {
  const align = block.align === 'center' ? 'center' : block.align === 'right' ? 'right' : 'left'
  return `<tr>
    <td style="padding:16px 40px;text-align:${align};">
      <a href="${block.url}" style="display:inline-block;background:${block.bgColor};color:${block.textColor};font-family:Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 36px;border-radius:2px;">${block.label}</a>
    </td>
  </tr>`
}

function renderTwoColumn(block: TwoColumnBlock): string {
  return `<tr>
    <td style="padding:32px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="width:50%;padding-right:20px;vertical-align:top;border-right:1px solid #eeeeee;">
            <h3 style="margin:0 0 12px;font-family:Georgia,serif;font-size:17px;color:#111111;font-weight:700;">${block.leftHeadline}</h3>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#555555;line-height:1.7;">${block.leftBody}</p>
          </td>
          <td style="width:50%;padding-left:20px;vertical-align:top;">
            <h3 style="margin:0 0 12px;font-family:Georgia,serif;font-size:17px;color:#111111;font-weight:700;">${block.rightHeadline}</h3>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#555555;line-height:1.7;">${block.rightBody}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

function renderDivider(block: DividerBlock): string {
  return `<tr>
    <td style="padding:8px 40px;">
      <hr style="border:none;border-top:${block.thickness}px ${block.style} ${block.color};margin:0;" />
    </td>
  </tr>`
}

function renderSpacer(block: SpacerBlock): string {
  return `<tr><td style="height:${block.height}px;line-height:${block.height}px;font-size:1px;">&nbsp;</td></tr>`
}

function renderFooter(block: FooterBlock): string {
  const social = block.showSocial
    ? `<p style="margin:12px 0 0;">
        <a href="${block.instagramUrl}" style="color:#b8924a;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;margin-right:16px;">Instagram</a>
        <a href="${block.facebookUrl}" style="color:#b8924a;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;">Facebook</a>
      </p>`
    : ''

  return `<tr>
    <td style="background:#111111;padding:32px 40px;text-align:center;border-top:2px solid #b8924a;">
      <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:16px;font-weight:700;color:#f5e6c8;letter-spacing:2px;">${block.companyName.toUpperCase()}</p>
      <p style="margin:0 0 2px;font-family:Arial,sans-serif;font-size:11px;color:#888888;">${block.address}</p>
      <p style="margin:0 0 2px;font-family:Arial,sans-serif;font-size:11px;color:#888888;">${block.phone} · <a href="https://${block.website}" style="color:#888888;">${block.website}</a></p>
      ${social}
      <p style="margin:16px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#555555;">
        You received this email because you expressed interest in our event space.
        <a href="${block.unsubscribeUrl}" style="color:#555555;">Unsubscribe</a>
      </p>
    </td>
  </tr>`
}

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
  const bodyRows = blocks.map(renderBlockToHtml).join('')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${subject}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f4f4f4;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;padding:24px 0;">
    <tr>
      <td>
        <table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
          ${bodyRows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
