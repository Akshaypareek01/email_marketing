import { Template } from '../models/Template.js';
import { Mailbox } from '../models/Mailbox.js';
import { Domain } from '../models/Domain.js';
import { formatSenderAddress, resolveSenderDisplayName } from '../utils/senderAddress.js';
import { hasUnsubscribeFooter } from '../services/contactsImport.service.js';
import { sendEmail } from '../services/ses.service.js';
import { loadTenantForSend, assertCanSend } from '../services/sendingGuard.service.js';
import { renderMergeTags, contactMergeVars, buildUnsubscribePageUrl } from '../services/templateRender.service.js';
import { BLOCK_TEMPLATES, getBlockTemplate } from '../constants/blockTemplates.js';

/** List reusable block templates. */
export async function listBlockTemplates(req, res) {
  res.json({ blocks: BLOCK_TEMPLATES });
}

/** Create a tenant template from a block preset. */
export async function createFromBlock(req, res, next) {
  try {
    const block = getBlockTemplate(req.body.blockId);
    if (!block) return res.status(404).json({ message: 'Block template not found' });

    const template = await Template.create({
      tenantId: req.user.tenantId,
      name: req.body.name?.trim() || block.name,
      subject: block.subject,
      htmlBody: block.htmlBody,
      kind: 'block',
      blockId: block.id,
    });
    res.status(201).json({ template });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Template name already exists.' });
    next(err);
  }
}

export async function listTemplates(req, res, next) {
  try {
    const templates = await Template.find({ tenantId: req.user.tenantId }).sort({ updatedAt: -1 });
    res.json({ templates });
  } catch (err) {
    next(err);
  }
}

export async function getTemplate(req, res, next) {
  try {
    const template = await Template.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json({ template });
  } catch (err) {
    next(err);
  }
}

export async function createTemplate(req, res, next) {
  try {
    const template = await Template.create({
      tenantId: req.user.tenantId,
      name: req.body.name.trim(),
      subject: req.body.subject?.trim() || '',
      htmlBody: req.body.htmlBody || '',
    });
    res.status(201).json({ template });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Template name already exists.' });
    next(err);
  }
}

export async function updateTemplate(req, res, next) {
  try {
    const template = await Template.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!template) return res.status(404).json({ message: 'Template not found' });

    if (req.body.name != null) template.name = req.body.name.trim();
    if (req.body.subject != null) template.subject = req.body.subject.trim();
    if (req.body.htmlBody != null) template.htmlBody = req.body.htmlBody;
    template.version += 1;
    await template.save();

    res.json({ template });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Template name already exists.' });
    next(err);
  }
}

export async function deleteTemplate(req, res, next) {
  try {
    const template = await Template.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json({ template });
  } catch (err) {
    next(err);
  }
}

export async function previewTemplate(req, res, next) {
  try {
    const template = await Template.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!template) return res.status(404).json({ message: 'Template not found' });

    const sample = {
      first_name: 'Alex',
      last_name: 'Sample',
      email: 'alex@example.com',
      company: 'Acme Inc',
      unsubscribe_url: 'https://example.com/unsubscribe',
    };

    let html = template.htmlBody;
    for (const [key, val] of Object.entries(sample)) {
      html = html.replaceAll(`{{${key}}}`, val);
    }

    res.json({
      html,
      hasUnsubscribe: hasUnsubscribeFooter(template.htmlBody),
    });
  } catch (err) {
    next(err);
  }
}

/** Duplicate template. */
export async function duplicateTemplate(req, res, next) {
  try {
    const source = await Template.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!source) return res.status(404).json({ message: 'Template not found' });
    const template = await Template.create({
      tenantId: req.user.tenantId,
      name: `${source.name} (copy)`,
      subject: source.subject,
      htmlBody: source.htmlBody,
    });
    res.status(201).json({ template });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Template name already exists.' });
    next(err);
  }
}

/** Send test email to current user. */
export async function testSendTemplate(req, res, next) {
  try {
    const template = await Template.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!template) return res.status(404).json({ message: 'Template not found' });

    const tenant = await loadTenantForSend(req.user.tenantId);
    assertCanSend(tenant, 1);

    const mailbox = await Mailbox.findOne({ tenantId: req.user.tenantId }).sort({ createdAt: 1 });
    if (!mailbox) return res.status(422).json({ message: 'Add a mailbox before test sending' });

    const domain = mailbox.domainId
      ? await Domain.findOne({ _id: mailbox.domainId, tenantId: req.user.tenantId })
      : null;

    const unsub = buildUnsubscribePageUrl(req.user.email, req.user.tenantId);
    const vars = contactMergeVars(
      { email: req.user.email, firstName: req.user.name?.split(' ')[0] },
      unsub
    );
    const html = renderMergeTags(template.htmlBody, vars);
    const subject = `[Test] ${renderMergeTags(template.subject || template.name, vars)}`;

    await sendEmail({
      from: formatSenderAddress(mailbox.address, resolveSenderDisplayName(mailbox, domain)),
      to: req.user.email,
      subject,
      html,
      tenantId: String(req.user.tenantId),
    });

    res.json({ message: `Test email sent to ${req.user.email}` });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/** Sanitize a filename for Content-Disposition headers. */
function safeFilename(name) {
  return String(name || 'template')
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 80);
}

/**
 * Export template as JSON (PRD §5.6 import/export).
 */
export async function exportTemplate(req, res, next) {
  try {
    const template = await Template.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!template) return res.status(404).json({ message: 'Template not found' });

    const format = String(req.query.format || 'json').toLowerCase();
    const baseName = safeFilename(template.name);

    if (format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.html"`);
      return res.send(template.htmlBody || '');
    }

    const payload = {
      format: 'mailbox-template-v1',
      exportedAt: new Date().toISOString(),
      name: template.name,
      subject: template.subject,
      htmlBody: template.htmlBody,
      version: template.version,
      kind: template.kind,
      blockId: template.blockId,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    next(err);
  }
}

/**
 * Import template from exported JSON or raw HTML body.
 */
export async function importTemplate(req, res, next) {
  try {
    const htmlBody = String(req.body.htmlBody || '').trim();
    if (!htmlBody) {
      return res.status(400).json({ message: 'htmlBody is required' });
    }

    const name = String(req.body.name || 'Imported template').trim();
    const subject = String(req.body.subject || '').trim();

    const template = await Template.create({
      tenantId: req.user.tenantId,
      name,
      subject,
      htmlBody,
      kind: req.body.kind === 'block' ? 'block' : 'html',
      blockId: req.body.blockId || undefined,
    });

    res.status(201).json({ template });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Template name already exists.' });
    next(err);
  }
}
