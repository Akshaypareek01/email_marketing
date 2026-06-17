import {
  dismissNotice,
  listActiveNotices,
} from '../services/systemNotice.service.js';

/**
 * List active system notices for the authenticated tenant user.
 */
export async function listMyNotices(req, res, next) {
  try {
    const notices = await listActiveNotices(req.user.tenantId, req.user._id);
    res.json({ notices });
  } catch (err) {
    next(err);
  }
}

/**
 * Dismiss a notice for the current user.
 */
export async function dismissMyNotice(req, res, next) {
  try {
    const notice = await dismissNotice(req.params.id, req.user.tenantId, req.user._id);
    res.json({ notice });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}
