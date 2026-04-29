import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(process.cwd());
const LOG_DIR = join(ROOT, 'logs');
const LOG_FILE = join(LOG_DIR, 'HireForge.log');

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const COLORS = {
  DEBUG: '\x1b[90m',   // gray
  INFO:  '\x1b[36m',   // cyan
  WARN:  '\x1b[33m',   // yellow
  ERROR: '\x1b[31m',   // red
  RESET: '\x1b[0m',
  DIM:   '\x1b[2m',
  BOLD:  '\x1b[1m',
};

function getMinLevel() {
  const env = process.env.LOG_LEVEL?.toUpperCase();
  return LEVELS[env] ?? LEVELS.INFO;
}

function write(level, service, message, meta = {}) {
  if (LEVELS[level] < getMinLevel()) return;

  const ts = new Date().toISOString();
  const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';

  // Structured JSON line for log file
  const logLine = JSON.stringify({ ts, level, service, message, ...meta }) + '\n';
  try { appendFileSync(LOG_FILE, logLine); } catch {}

  // Pretty console output
  const color = COLORS[level] || '';
  const dim = COLORS.DIM;
  const reset = COLORS.RESET;
  const bold = COLORS.BOLD;

  const prefix = `${dim}${ts.slice(11, 23)}${reset} ${color}${level.padEnd(5)}${reset} ${bold}[${service}]${reset}`;
  console.log(`${prefix} ${message}${metaStr ? `${dim}${metaStr}${reset}` : ''}`);
}

export function createLogger(service) {
  return {
    debug: (msg, meta) => write('DEBUG', service, msg, meta),
    info:  (msg, meta) => write('INFO',  service, msg, meta),
    warn:  (msg, meta) => write('WARN',  service, msg, meta),
    error: (msg, meta) => write('ERROR', service, msg, meta),
    time:  (label) => {
      const start = Date.now();
      return {
        done: (msg, meta) => {
          const ms = Date.now() - start;
          write('INFO', service, msg || label, { ...meta, ms });
        },
      };
    },
  };
}

export const log = createLogger('HireForge');
