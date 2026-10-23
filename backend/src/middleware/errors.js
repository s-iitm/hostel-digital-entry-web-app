import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Wrap async route handlers so rejections reach the error middleware (Express 4). */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({
      error: `${first.path.join('.') || 'input'}: ${first.message}`,
      issues: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  if (err.code === '23505') return res.status(409).json({ error: 'That record already exists' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}
