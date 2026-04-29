#!/usr/bin/env node
/**
 * Email scraper — finds HR/founder/hiring contacts via web search + domain patterns.
 * Writes data/cold-email-contacts.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { createLogger } from './lib/logger.mjs';
import { searchWeb } from './lib/search-web.mjs';
import { sendAll } from './notifier.mjs';

const log = createLogger('email-scraper');
const ROOT = resolve(process.cwd());

function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const CONTACTS_FILE = join(ROOT, 'data', 'cold-email-contacts.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ATS_HOST = /greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|job-boards\.greenhouse|boards\.greenhouse/i;

function timeoutSignal(ms) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function isDisposableOrFakeEmail(email) {
  const lower = email.toLowerCase();
  if (/(example|test|sample|noreply|no-reply|donotreply|privacy|mailer-daemon|sentry)/i.test(lower)) return true;
  if (/\.(png|jpg|jpeg|gif|webp|svg|pdf)$/i.test(lower)) return true;
  return false;
}

function extractEmails(text) {
  const out = new Set();
  if (!text) return out;
  const re = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  for (const m of text.matchAll(re)) {
    const e = m[0].replace(/[),.;]+$/, '');
    if (!isDisposableOrFakeEmail(e)) out.add(e);
  }
  return out;
}

function extractLinkedInUrl(text) {
  const m = text?.match(/https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9\-_%/]+/i);
  return m ? m[0].split(/[\s)\]}>'"]/)[0] : '';
}

function guessEmailDomain(company, jobUrl) {
  try {
    const host = new URL(jobUrl).hostname.replace(/^www\./, '');
    if (host && !ATS_HOST.test(host)) return host;
  } catch { /* ignore */ }
  const slug = company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^the/, '');
  return slug ? `${slug}.com` : '';
}

function titleForQuery(q) {
  if (/CTO/i.test(q)) return 'CTO / Leadership';
  if (/hiring manager/i.test(q)) return 'Hiring Manager';
  if (/HR|recruiter/i.test(q)) return 'HR/Recruiting';
  return 'Contact';
}

async function fetchJinaText(url) {
  const target = url.startsWith('http') ? url : `https://${url}`;
  try {
    const r = await fetch(`https://r.jina.ai/${target}`, {
      headers: { Accept: 'text/plain' },
      signal: timeoutSignal(20000),
    });
    if (!r.ok) return '';
    return await r.text();
  } catch (e) {
    log.warn('Jina fetch failed', { url: target.slice(0, 80), err: e.message });
    return '';
  }
}

function loadExistingContacts() {
  if (!existsSync(CONTACTS_FILE)) return { lastUpdated: null, contacts: [] };
  try {
    const data = JSON.parse(readFileSync(CONTACTS_FILE, 'utf-8'));
    return {
      lastUpdated: data.lastUpdated || null,
      contacts: Array.isArray(data.contacts) ? data.contacts : [],
    };
  } catch {
    return { lastUpdated: null, contacts: [] };
  }
}

function saveContacts(contacts) {
  const dir = join(ROOT, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const payload = {
    lastUpdated: new Date().toISOString(),
    contacts,
  };
  writeFileSync(CONTACTS_FILE, JSON.stringify(payload, null, 2));
}

/**
 * @param {{ company: string, role: string, url: string }[]} companies
 */
export async function scrapeEmails(companies) {
  if (!Array.isArray(companies) || companies.length === 0) {
    log.warn('scrapeEmails: empty companies');
    return loadExistingContacts();
  }

  const existing = loadExistingContacts();
  const byEmail = new Map();
  for (const c of existing.contacts) {
    if (c?.email) byEmail.set(String(c.email).toLowerCase(), { ...c });
  }

  const maxPagesPerQuery = 4;

  for (const row of companies) {
    const { company, role, url } = row;
    if (!company) continue;

    const queries = [
      `"${company}" hiring manager email engineering`,
      `"${company}" CTO LinkedIn`,
      `"${company}" HR recruiter contact`,
    ];

    for (const query of queries) {
      const titleHint = titleForQuery(query);
      let blob = '';

      try {
        const results = await searchWeb(query, 8);
        const ddg = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        blob += await fetchJinaText(ddg);

        for (const hit of results.slice(0, maxPagesPerQuery)) {
          blob += `\n${await fetchJinaText(hit.url)}`;
        }
      } catch (e) {
        log.warn('searchWeb / fetch chain failed', { company, err: e.message });
      }

      const li = extractLinkedInUrl(blob);
      for (const email of extractEmails(blob)) {
        const key = email.toLowerCase();
        if (byEmail.has(key)) continue;
        byEmail.set(key, {
          name: 'Unknown',
          title: titleHint,
          company,
          email,
          source: 'search-result',
          linkedinUrl: li || '',
          role: role || '',
          lastContact: null,
        });
      }

      await sleep(2000);
    }

    const domain = guessEmailDomain(company, url || '');
    if (domain) {
      const patterns = [`hr@${domain}`, `careers@${domain}`, `recruiting@${domain}`];
      for (const email of patterns) {
        const key = email.toLowerCase();
        if (byEmail.has(key)) continue;
        byEmail.set(key, {
          name: 'Unknown',
          title: 'HR/Recruiting',
          company,
          email,
          source: 'pattern-guess',
          linkedinUrl: '',
          role: role || '',
          lastContact: null,
        });
      }
    }
  }

  const contacts = [...byEmail.values()];
  saveContacts(contacts);
  log.info('scrapeEmails complete', { contacts: contacts.length });

  return { lastUpdated: new Date().toISOString(), contacts };
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: node services/email-scraper.mjs <companies.json>');
    console.error('companies.json: [{ "company": "...", "role": "...", "url": "..." }, ...]');
    process.exit(1);
  }
  const p = resolve(fileArg);
  if (!existsSync(p)) {
    log.error('File not found', { p });
    process.exit(1);
  }
  let companies;
  try {
    companies = JSON.parse(readFileSync(p, 'utf-8'));
  } catch (e) {
    log.error('Invalid JSON', { err: e.message });
    process.exit(1);
  }
  if (!Array.isArray(companies)) {
    log.error('companies.json must be a JSON array');
    process.exit(1);
  }
  await scrapeEmails(companies);
}

export { sendAll };

if (process.argv[1]?.endsWith('email-scraper.mjs')) {
  main().catch((e) => {
    log.error('Fatal', { err: e.message });
    process.exit(1);
  });
}
