import logger from './logsCreate.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  logger.error({
    tag: 'error',
    status,
    message,
    method: req.method,
    url: req.originalUrl,
    stack: err.stack,
    ...(err.name && { name: err.name }),
  });

  // Never leak internal error details (config keys, driver/Mongoose messages) to
  // clients on 5xx — log them server-side, return a generic message.
  const clientMessage = status >= 500 ? 'Internal server error' : message;

  res.status(status).json({
    message: clientMessage,
    ...(err.code && { code: err.code }),
    ...(status < 500 && err.errors && { errors: err.errors }),
  });
}
