import { Plan } from '../models/Plan.js';

/** Whitelist of client-settable plan fields (prevents mass assignment of unknown keys). */
const PLAN_FIELDS = [
  'name',
  'description',
  'priceMinor',
  'currency',
  'interval',
  'monthlyEmailQuota',
  'maxContacts',
  'maxDomains',
  'maxTeamUsers',
  'attachmentMb',
  'features',
  'isActive',
  'isPublic',
  'sortOrder',
  'stripePriceId',
  'razorpayPlanId',
];

/** Pick only allowlisted fields from a request body. */
function pickPlanFields(body = {}) {
  const out = {};
  for (const key of PLAN_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

/** Public: list plans shown on the pricing page. */
export async function listPublicPlans(req, res, next) {
  try {
    const plans = await Plan.find({ isActive: true, isPublic: true }).sort({ sortOrder: 1, priceMinor: 1 });
    res.json({ plans });
  } catch (err) {
    next(err);
  }
}

/** Admin: list every plan. */
export async function listPlans(req, res, next) {
  try {
    const plans = await Plan.find().sort({ sortOrder: 1, priceMinor: 1 });
    res.json({ plans });
  } catch (err) {
    next(err);
  }
}

export async function createPlan(req, res, next) {
  try {
    const plan = await Plan.create(pickPlanFields(req.body));
    res.status(201).json({ plan });
  } catch (err) {
    next(err);
  }
}

export async function updatePlan(req, res, next) {
  try {
    const plan = await Plan.findByIdAndUpdate(req.params.id, pickPlanFields(req.body), {
      new: true,
      runValidators: true,
    });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json({ plan });
  } catch (err) {
    next(err);
  }
}

export async function deletePlan(req, res, next) {
  try {
    // Soft-deactivate rather than hard delete to preserve billing history.
    const plan = await Plan.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json({ plan });
  } catch (err) {
    next(err);
  }
}
