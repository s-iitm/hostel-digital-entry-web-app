import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken({ role, id, hostelId }) {
  return jwt.sign({ role, id, hostelId }, config.jwtSecret, { expiresIn: '12h' });
}

/** Require a valid JWT; optionally restrict to one or more roles ('student' | 'warden'). */
export function auth(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not signed in' });
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'Not allowed for your role' });
      }
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Session expired, please sign in again' });
    }
  };
}
