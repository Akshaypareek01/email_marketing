import logger from './logsCreate.js';

/** @param {Record<string, unknown>} body */
function redactBody(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...body };
  for (const key of ['password', 'pass', 'secret', 'token']) {
    if (key in copy) copy[key] = '[redacted]';
  }
  return copy;
}

export function requestLogger(req, res, next) {
  if (req.originalUrl.startsWith('/api/health') || req.originalUrl.includes('/events/stream')) {
    return next();
  }

  const start = Date.now();
  const oldJson = res.json;
  let resData;

  res.json = function (data) {
    resData = data;
    return oldJson.call(this, data);
  };

  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]({
      tag: 'http',
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      ...(Object.keys(req.body || {}).length && { payload: redactBody(req.body) }),
      ...(resData && res.statusCode >= 400 && { response: resData }),
    });
  });

  next();
}