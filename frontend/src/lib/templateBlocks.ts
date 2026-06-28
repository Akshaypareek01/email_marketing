/**
 * No-code email template model.
 *
 * A template is a list of friendly "blocks" (logo, heading, text, image, button…)
 * plus a few global style settings. We render those to email-safe, table-based,
 * inline-styled HTML for sending — and round-trip the original block data by
 * embedding it as a base64 HTML comment at the top of the saved HTML, so the
 * visual editor can reopen exactly what the user built.
 */

export type Align = 'left' | 'center' | 'right';

export type TemplateBlock =
  | { id: string; type: 'logo'; src: string; href: string; width: number; align: Align }
  | { id: string; type: 'heading'; text: string; align: Align; color: string }
  | { id: string; type: 'text'; text: string; align: Align; color: string }
  | { id: string; type: 'image'; src: string; alt: string; href: string; width: number; align: Align }
  | { id: string; type: 'button'; text: string; href: string; bg: string; color: string; align: Align }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; height: number }
  | { id: string; type: 'html'; html: string };

export type BlockType = TemplateBlock['type'];

export interface TemplateDesign {
  bg: string;
  card: string;
  font: string;
  showUnsub: boolean;
  blocks: TemplateBlock[];
}

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Sans (Helvetica)', value: "Helvetica, Arial, sans-serif" },
  { label: 'Modern (Segoe/Roboto)', value: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { label: 'Classic (Georgia)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Monospace', value: "'Courier New', Courier, monospace" },
];

export const DEFAULT_DESIGN: TemplateDesign = {
  bg: '#f1f5f9',
  card: '#ffffff',
  font: FONT_OPTIONS[0].value,
  showUnsub: true,
  blocks: [],
};

let idCounter = 0;
function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  idCounter += 1;
  return `b_${idCounter}_${Date.now()}`;
}

/** Friendly labels + helper text for the "add block" toolbar. */
export const BLOCK_META: Record<BlockType, { label: string; icon: string }> = {
  logo: { label: 'Logo', icon: '🏷️' },
  heading: { label: 'Heading', icon: 'H' },
  text: { label: 'Text', icon: '¶' },
  image: { label: 'Image', icon: '🖼️' },
  button: { label: 'Button', icon: '🔘' },
  divider: { label: 'Divider', icon: '―' },
  spacer: { label: 'Space', icon: '↕' },
  html: { label: 'HTML', icon: '</>' },
};

/** Create a fresh block of the given type with sensible defaults. */
export function createBlock(type: BlockType): TemplateBlock {
  switch (type) {
    case 'logo':
      return { id: makeId(), type, src: '', href: '', width: 140, align: 'center' };
    case 'heading':
      return { id: makeId(), type, text: 'Your headline here', align: 'left', color: '#0f172a' };
    case 'text':
      return {
        id: makeId(),
        type,
        text: 'Write your message here. Tell your customers what’s new.',
        align: 'left',
        color: '#334155',
      };
    case 'image':
      return { id: makeId(), type, src: '', alt: '', href: '', width: 520, align: 'center' };
    case 'button':
      return { id: makeId(), type, text: 'Shop now', href: 'https://', bg: '#4f46e5', color: '#ffffff', align: 'left' };
    case 'divider':
      return { id: makeId(), type };
    case 'spacer':
      return { id: makeId(), type, height: 24 };
    case 'html':
      return { id: makeId(), type, html: '<p>Your custom HTML…</p>' };
  }
}

/** A pleasant starter layout for brand-new templates. */
export function starterDesign(): TemplateDesign {
  return {
    ...DEFAULT_DESIGN,
    blocks: [
      { id: makeId(), type: 'logo', src: '', href: '', width: 140, align: 'center' },
      { id: makeId(), type: 'heading', text: 'Hi {{first_name}}, welcome! 👋', align: 'left', color: '#0f172a' },
      {
        id: makeId(),
        type: 'text',
        text: 'Thanks for joining us. Here’s what you can expect — useful updates, no spam, and an easy way to opt out anytime.',
        align: 'left',
        color: '#334155',
      },
      { id: makeId(), type: 'button', text: 'Get started', href: 'https://', bg: '#4f46e5', color: '#ffffff', align: 'left' },
    ],
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s: string): string {
  return esc(s).replace(/"/g, '&quot;');
}
function nl2br(s: string): string {
  return esc(s).replace(/\n/g, '<br/>');
}

function renderBlock(b: TemplateBlock): string {
  switch (b.type) {
    case 'logo':
    case 'image': {
      if (!b.src) {
        return `<div style="text-align:${b.align};margin:0 0 16px;"><div style="display:inline-block;padding:24px 32px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:8px;color:#94a3b8;font-size:12px;">${
          b.type === 'logo' ? 'Your logo' : 'Your image'
        }</div></div>`;
      }
      const alt = b.type === 'image' ? escAttr(b.alt) : 'logo';
      const img = `<img src="${escAttr(b.src)}" alt="${alt}" width="${b.width}" style="width:${b.width}px;max-width:100%;height:auto;display:inline-block;border:0;border-radius:6px;" />`;
      const wrapped = b.href ? `<a href="${escAttr(b.href)}" target="_blank" rel="noopener">${img}</a>` : img;
      return `<div style="text-align:${b.align};margin:0 0 16px;">${wrapped}</div>`;
    }
    case 'heading':
      return `<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:${b.color};text-align:${b.align};">${nl2br(
        b.text
      )}</h1>`;
    case 'text':
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${b.color};text-align:${b.align};">${nl2br(
        b.text
      )}</p>`;
    case 'button':
      return `<div style="text-align:${b.align};margin:4px 0 20px;"><a href="${escAttr(
        b.href
      )}" target="_blank" rel="noopener" style="display:inline-block;background:${b.bg};color:${b.color};text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:600;font-size:14px;">${esc(
        b.text
      )}</a></div>`;
    case 'divider':
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />`;
    case 'spacer':
      return `<div style="height:${b.height}px;line-height:${b.height}px;font-size:1px;">&nbsp;</div>`;
    case 'html':
      // Raw, author-controlled HTML (e.g. an imported or block-library template).
      return b.html;
  }
}

/** Pull the inner content out of a full HTML document so it nests cleanly. */
function extractInnerHtml(raw: string): string {
  const body = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) return body[1].trim();
  return raw.replace(/<\/?(html|head|body|!doctype)[^>]*>/gi, '').trim();
}

/**
 * Build a design from existing template HTML.
 * - Visually-built templates (with our metadata comment) restore exactly.
 * - Raw/imported HTML is preserved as a single editable "HTML" block instead of
 *   being discarded, so switching to Design never resets the template.
 * - Empty input gets the friendly starter layout.
 */
export function designFromHtml(html: string): TemplateDesign {
  if (!html || !html.trim()) return starterDesign();
  const parsed = parseDesign(html);
  if (parsed) return parsed;
  return {
    ...DEFAULT_DESIGN,
    showUnsub: false, // the imported template likely has its own unsubscribe link
    blocks: [{ id: makeId(), type: 'html', html: extractInnerHtml(html) }],
  };
}

/** Render a design to email-safe HTML (no design metadata included). */
export function blocksToHtml(design: TemplateDesign): string {
  const body = design.blocks.map(renderBlock).join('\n');
  const footer = design.showUnsub
    ? `\n  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:8px auto 0;">
    <tr><td style="padding:16px 32px 4px;text-align:center;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">You’re receiving this email because you subscribed.<br/>
      <a href="{{unsubscribe_url}}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a></p>
    </td></tr>
  </table>`
    : '';

  return `<div style="margin:0;padding:24px 12px;background:${design.bg};font-family:${design.font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${design.card};border-radius:12px;">
    <tr><td style="padding:32px;">
${body || '<p style="color:#94a3b8;font-size:14px;text-align:center;margin:0;">Add blocks on the left to start designing.</p>'}
    </td></tr>
  </table>${footer}
</div>`;
}

const MARKER_PREFIX = '<!--mbx:';
const MARKER_SUFFIX = '-->';

/** Saveable HTML = design metadata (base64 comment) + rendered HTML. */
export function serializeDesign(design: TemplateDesign): string {
  let payload = '';
  try {
    payload = btoa(encodeURIComponent(JSON.stringify(design)));
  } catch {
    payload = '';
  }
  return `${MARKER_PREFIX}${payload}${MARKER_SUFFIX}\n${blocksToHtml(design)}`;
}

/** Recover a design from saved HTML, or null if it wasn't built visually. */
export function parseDesign(html: string): TemplateDesign | null {
  if (!html) return null;
  const trimmed = html.trimStart();
  if (!trimmed.startsWith(MARKER_PREFIX)) return null;
  const end = trimmed.indexOf(MARKER_SUFFIX);
  if (end < 0) return null;
  const payload = trimmed.slice(MARKER_PREFIX.length, end);
  try {
    const json = decodeURIComponent(atob(payload));
    const parsed = JSON.parse(json) as TemplateDesign;
    if (!parsed || !Array.isArray(parsed.blocks)) return null;
    return { ...DEFAULT_DESIGN, ...parsed };
  } catch {
    return null;
  }
}
