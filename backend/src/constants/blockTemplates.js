/** Reusable HTML block templates for quick campaign creation (PRD §5.6). */
export const BLOCK_TEMPLATES = [
  {
    id: 'welcome',
    name: 'Welcome email',
    subject: 'Welcome to {{company}}',
    description: 'Simple welcome with CTA button',
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h1 style="color:#111">Welcome, {{first_name}}!</h1>
  <p>Thanks for joining {{company}}. We're glad you're here.</p>
  <p><a href="#" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Get started</a></p>
  <p style="font-size:12px;color:#666;margin-top:32px"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</div>`,
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    subject: '{{company}} newsletter',
    description: 'Header + two-column content blocks',
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#111">{{company}} Newsletter</h2>
  <p>Hi {{first_name}}, here's what's new this week.</p>
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="48%" style="vertical-align:top;padding:8px;background:#f8fafc;border-radius:8px">
      <strong>Update 1</strong><p style="font-size:14px;color:#444">Your first story or feature highlight.</p>
    </td>
    <td width="4%"></td>
    <td width="48%" style="vertical-align:top;padding:8px;background:#f8fafc;border-radius:8px">
      <strong>Update 2</strong><p style="font-size:14px;color:#444">Another highlight or testimonial.</p>
    </td>
  </tr></table>
  <p style="font-size:12px;color:#666;margin-top:32px"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</div>`,
  },
  {
    id: 'promo',
    name: 'Promotional offer',
    subject: 'Special offer for {{first_name}}',
    description: 'Discount callout with urgency',
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;text-align:center">
  <p style="letter-spacing:2px;text-transform:uppercase;color:#4f46e5;font-size:12px">Limited time</p>
  <h1 style="color:#111;font-size:32px">20% off for you</h1>
  <p>Hi {{first_name}}, use code <strong>SAVE20</strong> at checkout.</p>
  <p><a href="#" style="display:inline-block;background:#111;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none">Shop now</a></p>
  <p style="font-size:12px;color:#666;margin-top:32px"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</div>`,
  },
  {
    id: 'plain',
    name: 'Plain text style',
    subject: 'Message from {{company}}',
    description: 'Minimal personal note',
    htmlBody: `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px;color:#222">
  <p>Hi {{first_name}},</p>
  <p>Just a quick note from {{company}}. Replace this with your message.</p>
  <p>Best,<br/>The team</p>
  <p style="font-size:12px;color:#666;margin-top:32px"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</div>`,
  },
];

/**
 * Find a block template by id.
 * @param {string} blockId
 */
export function getBlockTemplate(blockId) {
  return BLOCK_TEMPLATES.find((b) => b.id === blockId) || null;
}
