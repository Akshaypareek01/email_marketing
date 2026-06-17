import { Tenant } from '../models/Tenant.js';
import { Contact } from '../models/Contact.js';
import { ContactList } from '../models/ContactList.js';
import { Suppression } from '../models/Suppression.js';
import { mapRowToContact, parseEmail, contactsToCsv } from '../services/contactsImport.service.js';
import { isDisposableEmail } from '../services/listHygiene.service.js';

/**
 * Enforce tenant maxContacts quota from subscription snapshot.
 * @param {import('mongoose').Types.ObjectId} tenantId
 */
async function assertContactQuota(tenantId, additional = 1) {
  const tenant = await Tenant.findById(tenantId).lean();
  const max = tenant?.subscription?.maxContacts ?? 0;
  if (max <= 0) return;

  const current = await Contact.countDocuments({ tenantId });
  if (current + additional > max) {
    const err = new Error(`Contact limit reached (${max}). Upgrade your plan.`);
    err.status = 403;
    throw err;
  }
}

/**
 * Load suppressed emails for tenant (global + tenant-specific).
 * @param {import('mongoose').Types.ObjectId} tenantId
 */
async function suppressedSet(tenantId) {
  const rows = await Suppression.find({
    $or: [{ tenantId: null }, { tenantId }],
  }).lean();
  return new Set(rows.map((r) => r.email));
}

export async function listContacts(req, res, next) {
  try {
    const { listId, status, q, page = 1, limit = 50 } = req.query;
    const filter = { tenantId: req.user.tenantId };
    if (listId) filter.listIds = listId;
    if (status) filter.status = status;
    if (q) {
      const rx = new RegExp(String(q).trim(), 'i');
      filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }, { company: rx }];
    }

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
    const take = Math.min(100, Math.max(1, Number(limit)));

    const [contacts, total] = await Promise.all([
      Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(take),
      Contact.countDocuments(filter),
    ]);

    res.json({ contacts, total, page: Number(page), limit: take });
  } catch (err) {
    next(err);
  }
}

export async function contactStats(req, res, next) {
  try {
    const tenantId = req.user.tenantId;
    const [total, subscribed, lists] = await Promise.all([
      Contact.countDocuments({ tenantId }),
      Contact.countDocuments({ tenantId, status: 'subscribed' }),
      ContactList.countDocuments({ tenantId }),
    ]);
    res.json({ total, subscribed, lists });
  } catch (err) {
    next(err);
  }
}

export async function createContact(req, res, next) {
  try {
    const parsed = parseEmail(req.body.email);
    if (!parsed.ok) return res.status(400).json({ message: parsed.error });

    await assertContactQuota(req.user.tenantId);

    const suppressed = await suppressedSet(req.user.tenantId);
    if (suppressed.has(parsed.email)) {
      return res.status(409).json({ message: 'Address is suppressed and cannot be added.' });
    }

    const contact = await Contact.create({
      tenantId: req.user.tenantId,
      email: parsed.email,
      firstName: req.body.firstName?.trim() || '',
      lastName: req.body.lastName?.trim() || '',
      company: req.body.company?.trim() || '',
      tags: req.body.tags || [],
      source: req.body.source || 'manual',
      listIds: req.body.listIds || [],
    });

    res.status(201).json({ contact });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Contact already exists.' });
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

export async function deleteContact(req, res, next) {
  try {
    const contact = await Contact.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    res.json({ contact });
  } catch (err) {
    next(err);
  }
}

/**
 * Update contact fields or list membership.
 */
export async function updateContact(req, res, next) {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!contact) return res.status(404).json({ message: 'Contact not found' });

    const { firstName, lastName, company, tags, status, listIds, consent } = req.body;
    if (firstName != null) contact.firstName = String(firstName).trim();
    if (lastName != null) contact.lastName = String(lastName).trim();
    if (company != null) contact.company = String(company).trim();
    if (tags != null) contact.tags = tags;
    if (status != null) contact.status = status;
    if (listIds != null) contact.listIds = listIds;
    if (consent != null) contact.consent = String(consent).trim();

    await contact.save();
    res.json({ contact });
  } catch (err) {
    next(err);
  }
}

export async function importContacts(req, res, next) {
  try {
    const { rows, mapping, listId } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'rows array is required' });
    }

    const suppressed = await suppressedSet(req.user.tenantId);
    const results = { imported: 0, skipped: 0, errors: [], suppressed: 0 };

    let list = null;
    if (listId) {
      list = await ContactList.findOne({ _id: listId, tenantId: req.user.tenantId });
      if (!list) return res.status(404).json({ message: 'List not found' });
    }

    for (let i = 0; i < rows.length; i++) {
      const mapped = mapRowToContact(rows[i], mapping || { email: 'email' });
      const parsed = parseEmail(mapped.email);
      if (!parsed.ok) {
        results.errors.push({ row: i + 1, email: mapped.email, reason: parsed.error });
        results.skipped++;
        continue;
      }

      if (suppressed.has(parsed.email)) {
        results.errors.push({ row: i + 1, email: parsed.email, reason: 'Suppressed address' });
        results.suppressed++;
        results.skipped++;
        continue;
      }

      if (isDisposableEmail(parsed.email)) {
        results.errors.push({ row: i + 1, email: parsed.email, reason: 'Disposable email domain' });
        results.skipped++;
        continue;
      }

      try {
        await assertContactQuota(req.user.tenantId);
        const update = {
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          company: mapped.company,
          source: 'csv',
          consent: req.body.consent || 'imported',
        };
        if (mapped.tags.length) update.tags = mapped.tags;

        const contact = await Contact.findOneAndUpdate(
          { tenantId: req.user.tenantId, email: parsed.email },
          {
            $set: update,
            $setOnInsert: { tenantId: req.user.tenantId, email: parsed.email, status: 'subscribed' },
            ...(list ? { $addToSet: { listIds: list._id } } : {}),
          },
          { upsert: true, new: true }
        );

        if (list && !contact.listIds.some((id) => String(id) === String(list._id))) {
          await Contact.updateOne({ _id: contact._id }, { $addToSet: { listIds: list._id } });
        }

        results.imported++;
      } catch (err) {
        if (err.status === 403) {
          results.errors.push({ row: i + 1, email: parsed.email, reason: err.message });
          break;
        }
        results.errors.push({ row: i + 1, email: parsed.email, reason: err.message });
        results.skipped++;
      }
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
}

export async function exportContacts(req, res, next) {
  try {
    const filter = { tenantId: req.user.tenantId };
    if (req.query.listId) filter.listIds = req.query.listId;

    const contacts = await Contact.find(filter).sort({ email: 1 }).lean();
    const csv = contactsToCsv(contacts);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

export async function listContactLists(req, res, next) {
  try {
    const lists = await ContactList.find({ tenantId: req.user.tenantId }).sort({ name: 1 });
    const withCounts = await Promise.all(
      lists.map(async (list) => {
        const count = await Contact.countDocuments({ tenantId: req.user.tenantId, listIds: list._id });
        return { ...list.toObject(), contactCount: count };
      })
    );
    res.json({ lists: withCounts });
  } catch (err) {
    next(err);
  }
}

export async function createContactList(req, res, next) {
  try {
    const list = await ContactList.create({
      tenantId: req.user.tenantId,
      name: req.body.name.trim(),
      description: req.body.description?.trim() || '',
    });
    res.status(201).json({ list: { ...list.toObject(), contactCount: 0 } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'List name already exists.' });
    next(err);
  }
}

export async function deleteContactList(req, res, next) {
  try {
    const list = await ContactList.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!list) return res.status(404).json({ message: 'List not found' });
    await Contact.updateMany({ tenantId: req.user.tenantId }, { $pull: { listIds: list._id } });
    res.json({ list });
  } catch (err) {
    next(err);
  }
}
