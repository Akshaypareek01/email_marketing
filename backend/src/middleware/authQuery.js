import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

/**
 * JWT auth for SSE (EventSource cannot send Authorization headers in all browsers).
 * Pass ?token=<jwt> on GET requests.
 */
export async function authenticateQuery(req, res, next) {
  try {
    const header = req.headers.authorization;
    let token = null;

    if (header?.startsWith('Bearer ')) {
      token = header.slice(7);
    } else if (typeof req.query.token === 'string' && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    const user = await User.findById(decoded.sub).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
