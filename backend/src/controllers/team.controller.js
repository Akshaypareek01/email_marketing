import { User } from '../models/User.js';
import { Tenant } from '../models/Tenant.js';
import { inviteTeamMember } from '../services/team.service.js';
import { assertCanAddTeamUser } from '../services/planLimits.service.js';
import { writeAuditLog, auditContext } from '../services/audit.service.js';

/**
 * List users in the current tenant.
 */
export async function listTeamUsers(req, res, next) {
  try {
    const users = await User.find({ tenantId: req.user.tenantId })
      .select('name email role createdAt emailVerified')
      .sort({ createdAt: 1 });
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

/**
 * Invite a team member (tenant admin only).
 */
export async function inviteUser(req, res, next) {
  try {
    const { email, name, role = 'user' } = req.body;
    if (!email?.trim() || !name?.trim()) {
      return res.status(400).json({ message: 'email and name are required' });
    }

    // Enforce trial window + plan seat allowance before creating the user.
    const tenant = await Tenant.findById(req.user.tenantId);
    if (!tenant) return res.status(404).json({ message: 'Account not found' });
    const userCount = await User.countDocuments({ tenantId: req.user.tenantId });
    assertCanAddTeamUser(tenant, userCount);

    const result = await inviteTeamMember(req.user, { email, name, role });

    await writeAuditLog({
      ...auditContext(req),
      action: 'team.invite',
      targetType: 'user',
      targetId: String(result.user._id),
      metadata: { email: result.user.email, role: result.user.role },
    });

    res.status(201).json({
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
      tempPassword: result.tempPassword,
      message: 'Team member invited. They will receive login instructions by email when configured.',
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/**
 * Remove a team user from the tenant.
 */
export async function removeTeamUser(req, res, next) {
  try {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot remove yourself' });
    }

    const user = await User.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ tenantId: req.user.tenantId, role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot remove the last admin' });
      }
    }

    await user.deleteOne();
    res.json({ removed: true });
  } catch (err) {
    next(err);
  }
}
