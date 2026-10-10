import type { EmailBlock } from './emailCampaigns';

// Baut aus den Blöcken des Editors das fertige E-Mail-HTML (Tabellenlayout, 600 px, Inline-Stile).
// Platzhalter {{name}}, {{park}} ersetzt der Server je Empfänger; den Fuß (Absender, Adresse,
// Abmelde-Link) hängt der Server immer an.

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeUrl = (url: string) => (/^https:\/\//i.test(url.trim()) ? escape(url.trim()) : '');

export function blocksToHtml(blocks: EmailBlock[]): string {
  const rows = blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<tr><td style="padding:8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;font-weight:bold;color:#1f2933;">${escape(block.text)}</td></tr>`;
        case 'text':
          return `<tr><td style="padding:8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#33475b;">${escape(block.text).replace(/\n/g, '<br/>')}</td></tr>`;
        case 'image': {
          const url = safeUrl(block.url);
          return url
            ? `<tr><td style="padding:8px 24px;"><img src="${url}" alt="${escape(block.alt)}" width="552" style="display:block;width:100%;max-width:552px;height:auto;border:0;"/></td></tr>`
            : '';
        }
        case 'button': {
          const url = safeUrl(block.url);
          return url && block.label.trim()
            ? `<tr><td style="padding:12px 24px;"><a href="${url}" style="display:inline-block;background:#c2410c;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:6px;">${escape(block.label)}</a></td></tr>`
            : '';
        }
        case 'divider':
          return `<tr><td style="padding:12px 24px;"><div style="border-top:1px solid #dfe3eb;"></div></td></tr>`;
      }
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;"><tr><td align="center" style="padding:24px 8px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;">${rows}</table></td></tr></table>`;
}
