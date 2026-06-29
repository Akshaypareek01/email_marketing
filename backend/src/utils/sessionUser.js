/**
 * Normalize a User document for API session responses.
 * @param {import('../models/User.js').User | object} user
 */
export function toSessionUser(user) {
  if (!user) return null;
  return {
    id: user._id ?? user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    emailVerified: Boolean(user.emailVerified),
    phone: user.phone || '',
    phoneCountryCode: user.phoneCountryCode || '',
  };
}
