import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import winston from 'winston';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../logs');
fs.mkdirSync(logsDir, { recursive: true });

const level = process.env.LOG_LEVEL || 'debug';

/**
 * Pretty-print winston info objects (our code logs structured objects, not plain strings).
 * @param {winston.Logform.TransformableInfo} info
 */
function formatLine(info) {
  if (info.message && typeof info.message === 'object') {
    return JSON.stringify(info.message, null, 2);
  }

  const meta = { ...info };
  for (const key of ['level', 'message', 'timestamp', 'splat']) {
    delete meta[key];
  }

  const keys = Object.keys(meta).filter((k) => meta[k] !== undefined && !String(k).startsWith('Symbol'));
  if (typeof info.message === 'string' && info.message) {
    return keys.length ? `${info.message}\n${JSON.stringify(meta, null, 2)}` : info.message;
  }
  if (!keys.length) return '';
  return JSON.stringify(meta, null, 2);
}

const logger = winston.createLogger({
  level,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.printf((info) => `${info.timestamp} ${info.level} ${formatLine(info)}`)
      ),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 5_000_000,
      maxFiles: 3,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  ],
});

export default logger;
