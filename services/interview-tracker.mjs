#!/usr/bin/env node
/**
 * Interview round tracker — syncs from applications.md, persists to data/interviews.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './lib/logger.mjs';
import { sendAll } from './notifier.mjs';

const log = createLogger('interview-tracker');
const ROOT = resolve(process.cwd());
const DATA_FILE = join(ROOT, 'data', 'interviews.json');

function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'unknown';
}

function extractUrlFromNotes(notes) {
  const m = String(notes || '').match(/https?:\/\/[^\s\])'"]+/);
  return m ? m[0].replace(/[),.]+$/, '') : '';
}

function defaultStore() {
  return { lastUpdated: new Date().toISOString(), interviews: [] };
}

function loadStore() {
  if (!existsSync(DATA_FILE)) return defaultStore();
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    if (!Array.isArray(raw.interviews)) return defaultStore();
    return { lastUpdated: raw.lastUpdated || new Date().toISOString(), interviews: raw.interviews };
  } catch {
    return defaultStore();
  }
}

function saveStore(store) {
  const dir = join(ROOT, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  store.lastUpdated = new Date().toISOString();
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function parseApplicationsMd() {
  const trackerPath = join(ROOT, 'data', 'applications.md');
  if (!existsSync(trackerPath)) return [];

  const content = readFileSync(trackerPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.startsWith('|'));
  if (lines.length < 3) return [];

  return lines.slice(2).map(line => {
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 9) return null;
    return {
      id: cols[0],
      date: cols[1],
      company: cols[2],
      role: cols[3],
      score: cols[4],
      status: cols[5],
      notes: cols[8] || '',
    };
  }).filter(Boolean);
}

function makeInterviewId(company, date, role) {
  const base = `${slugify(company)}-${date}`;
  return `${base}-${slugify(role)}`;
}

function newInterviewRecord(app) {
  const id = makeInterviewId(app.company, app.date, app.role);
  const startDate = app.date || new Date().toISOString().slice(0, 10);
  return {
    id,
    company: app.company,
    role: app.role,
    url: extractUrlFromNotes(app.notes),
    score: app.score,
    status: 'active',
    startDate,
    rounds: [
      {
        number: 1,
        type: 'Technical',
        date: null,
        status: 'pending',
        notes: '',
        prepDone: false,
      },
    ],
    nextRound: 1,
    result: null,
  };
}

/**
 * Read applications.md, create interview entries for rows with status "Interview".
 */
export async function syncFromTracker() {
  const store = loadStore();
  const apps = parseApplicationsMd().filter(a => a.status === 'Interview');
  const existingIds = new Set(store.interviews.map(i => i.id));

  for (const app of apps) {
    const id = makeInterviewId(app.company, app.date, app.role);
    if (existingIds.has(id)) continue;

    const record = newInterviewRecord(app);
    store.interviews.push(record);
    existingIds.add(record.id);

    log.info('New interview synced from tracker', { id: record.id, company: record.company });
    try {
      await sendAll(
        `New interview detected: ${record.role} @ ${record.company}. Track rounds and prep at the dashboard.`
      );
    } catch (e) {
      log.warn('Notification failed', { err: e.message });
    }
  }

  saveStore(store);
  return store;
}

/**
 * @param {string} interviewId
 * @param {object} roundData — number, type, date, status, notes, prepDone (partial ok)
 */
export function addRound(interviewId, roundData) {
  const store = loadStore();
  const iv = store.interviews.find(i => i.id === interviewId);
  if (!iv) throw new Error(`Interview not found: ${interviewId}`);

  const maxNum = iv.rounds.reduce((m, r) => Math.max(m, r.number), 0);
  const number = roundData.number != null ? Number(roundData.number) : maxNum + 1;

  const round = {
    number,
    type: roundData.type ?? 'Technical',
    date: roundData.date ?? null,
    status: roundData.status ?? 'pending',
    notes: roundData.notes ?? '',
    prepDone: Boolean(roundData.prepDone),
  };

  iv.rounds.push(round);
  iv.rounds.sort((a, b) => a.number - b.number);
  const pending = iv.rounds.filter(r => r.status === 'pending');
  const maxAfter = iv.rounds.reduce((m, r) => Math.max(m, r.number), 0);
  iv.nextRound = pending.length ? Math.min(...pending.map(r => r.number)) : maxAfter + 1;

  saveStore(store);
  return iv;
}

/**
 * @param {string} interviewId
 * @param {number} roundNumber
 * @param {object} updates — partial fields for the round
 */
export function updateRound(interviewId, roundNumber, updates) {
  const store = loadStore();
  const iv = store.interviews.find(i => i.id === interviewId);
  if (!iv) throw new Error(`Interview not found: ${interviewId}`);

  const round = iv.rounds.find(r => r.number === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found for ${interviewId}`);

  if (updates.status != null) round.status = updates.status;
  if (updates.notes != null) round.notes = updates.notes;
  if (updates.date !== undefined) round.date = updates.date;
  if (updates.type != null) round.type = updates.type;
  if (updates.prepDone != null) round.prepDone = Boolean(updates.prepDone);

  saveStore(store);
  return iv;
}

/**
 * @param {string} interviewId
 * @param {'passed'|'failed'} result
 */
export function markResult(interviewId, result) {
  if (result !== 'passed' && result !== 'failed') {
    throw new Error('result must be "passed" or "failed"');
  }
  const store = loadStore();
  const iv = store.interviews.find(i => i.id === interviewId);
  if (!iv) throw new Error(`Interview not found: ${interviewId}`);

  iv.result = result;
  iv.status = 'completed';

  saveStore(store);
  return iv;
}

export function getActiveInterviews() {
  const store = loadStore();
  return store.interviews.filter(i => i.status === 'active');
}

/**
 * Days until the next scheduled round (earliest future round with a date).
 * @returns {number|null} whole days, or null if none scheduled
 */
export function getDaysUntil(interviewId) {
  const store = loadStore();
  const iv = store.interviews.find(i => i.id === interviewId);
  if (!iv) throw new Error(`Interview not found: ${interviewId}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const candidates = iv.rounds
    .filter(r => r.date)
    .map(r => {
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    })
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (candidates.length === 0) return null;

  const next = candidates.find(d => d >= today);
  if (!next) return null;

  const diffMs = next - today;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

async function main() {
  log.info('Running syncFromTracker');
  await syncFromTracker();
  log.info('Active interviews', { count: getActiveInterviews().length });
}

const isDirectRun = () => {
  try {
    const executed = fileURLToPath(import.meta.url);
    const invoked = resolve(process.argv[1] ?? '');
    return executed === invoked;
  } catch {
    return false;
  }
};

if (isDirectRun()) {
  main().catch(e => {
    log.error('Fatal', { err: e.message });
    process.exit(1);
  });
}
