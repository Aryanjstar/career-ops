#!/usr/bin/env node
/**
 * Cold email generator — Azure OpenAI drafts personalized outreach.
 * Reads data/cold-email-contacts.json, data/profile-data.json, data/applications.md
 * Writes data/cold-emails/YYYY-MM-DD.md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { createLogger } from './lib/logger.mjs';
import { chatCompletionStandard } from './lib/azure-openai.mjs';
import { sendAll } from './notifier.mjs';

const log = createLogger('email-generator');
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
const PROFILE_FILE = join(ROOT, 'data', 'profile-data.json');
const APPLICATIONS_FILE = join(ROOT, 'data', 'applications.md');

const LINK_LINE =
  'Portfolio: https://aryanjaiswal.in | GitHub: https://github.com/aryanjstar | LinkedIn: https://linkedin.com/in/aryanjstar';

function parseAppliedCompanies() {
  if (!existsSync(APPLICATIONS_FILE)) return new Set();
  const applied = new Set();
  const text = readFileSync(APPLICATIONS_FILE, 'utf-8');
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const c = line.split('|').map((x) => x.trim()).filter(Boolean);
    if (c.length < 6) continue;
    const company = c[2];
    const status = c[5];
    if (['Applied', 'Interview', 'Offer'].includes(status)) {
      applied.add(company.trim().toLowerCase());
    }
  }
  return applied;
}

function loadContacts() {
  if (!existsSync(CONTACTS_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(CONTACTS_FILE, 'utf-8'));
    return Array.isArray(data.contacts) ? data.contacts : [];
  } catch {
    return [];
  }
}

function loadProfile() {
  if (!existsSync(PROFILE_FILE)) {
    log.warn('profile-data.json missing — using minimal defaults in prompts');
    return {
      name: 'Aryan Jaiswal',
      education: 'Final-year B.Tech CSE, IIIT Dharwad (graduating 2026)',
      highlights: [],
    };
  }
  try {
    return JSON.parse(readFileSync(PROFILE_FILE, 'utf-8'));
  } catch (e) {
    log.warn('profile-data.json parse error', { err: e.message });
    return {};
  }
}

function parseEmailJson(raw) {
  const text = raw.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const o = JSON.parse(jsonMatch[0]);
    if (o && typeof o.subject === 'string' && typeof o.body === 'string') return o;
  } catch { /* ignore */ }
  return null;
}

function wordCount(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function escapeMd(s) {
  return s.replace(/\r\n/g, '\n');
}

/**
 * Generates personalized cold emails and writes data/cold-emails/YYYY-MM-DD.md
 */
export async function generateColdEmails() {
  const applied = parseAppliedCompanies();
  const contacts = loadContacts();
  const profile = loadProfile();

  const toDraft = contacts.filter((c) => {
    const co = (c.company || '').trim().toLowerCase();
    if (!co) return false;
    if (applied.has(co)) return false;
    return true;
  });

  if (toDraft.length === 0) {
    log.info('No contacts to draft (empty or all skipped due to existing applications).');
    return { path: null, count: 0 };
  }

  const outDir = join(ROOT, 'data', 'cold-emails');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const day = new Date().toISOString().split('T')[0];
  const outPath = join(outDir, `${day}.md`);

  const sections = [`# Cold Email Drafts — ${day}`, ''];

  let n = 0;
  for (const contact of toDraft) {
    n++;
    const systemPrompt = `You write cold outreach for a job seeker. Output ONLY valid JSON with keys "subject" and "body" (no markdown fences, no extra text).

Rules for the email body:
- 50–125 words total, exactly 4 sentences (each sentence on its own line in the string, separated by \\n).
- Line 1: Who they are — final-year CS student at IIIT Dharwad (one sentence).
- Line 2: Why THIS company specifically — reference a concrete product, mission, or technical area they are known for (be specific; no filler).
- Line 3: One quantified credential as proof — pick the most relevant from the profile JSON.
- Line 4: Clear ask — e.g. would love a brief chat about [role] opportunities.
- Subject: under 10 words, personalized to the company (not generic).
- NEVER be generic. NEVER use the phrases "exciting opportunity" or "I'm very interested" (case-insensitive).
- Tone: confident, concise, professional but human.
- Do not include portfolio/GitHub/LinkedIn URLs in the body; those are added by the template after the body.
- The JSON string values must escape newlines as \\n in the body between sentences.`;

    const userPrompt = `Company: ${contact.company}
Contact title (hint): ${contact.title || 'Unknown'}
Role to discuss: ${contact.role || 'Software engineering'}
Contact source: ${contact.source || 'unknown'}

Candidate profile (JSON; use one quantified fact from here in sentence 3):
${JSON.stringify(profile, null, 2)}

Return JSON only:
{"subject":"...","body":"sentence one\\nsentence two\\nsentence three\\nsentence four"}`;

    let subject = `${contact.company} — quick note on ${contact.role || 'engineering'} roles`;
    let body = `I'm a final-year CS student at IIIT Dharwad.\nI admire ${contact.company}'s work and wanted to reach out.\nI've shipped production ML and full-stack systems with measurable impact.\nWould love a short chat about ${contact.role || 'engineering'} opportunities.`;

    try {
      const raw = await chatCompletionStandard(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { maxTokens: 600 }
      );
      const parsed = parseEmailJson(raw);
      if (parsed) {
        subject = parsed.subject.trim();
        body = escapeMd(parsed.body.trim());
        const wc = wordCount(body.replace(/\n/g, ' '));
        if (wc > 125 || wc < 40) {
          log.warn('Draft word count out of band', { company: contact.company, words: wc });
        }
      } else {
        log.warn('Could not parse JSON from model; using fallback draft', { company: contact.company });
      }
    } catch (e) {
      log.error('Azure OpenAI failed', { company: contact.company, err: e.message });
    }

    const name = contact.name && contact.name !== 'Unknown' ? contact.name : 'Contact';
    const block = [
      `## ${n}. ${contact.company} — ${name} (${contact.title || 'Contact'})`,
      `**To:** ${contact.email}`,
      `**Subject:** ${subject}`,
      '',
      body,
      '',
      '---',
      LINK_LINE,
      '',
      '**Status:** Draft',
      '',
      '---',
      '',
    ];
    sections.push(...block);
  }

  writeFileSync(outPath, sections.join('\n'), 'utf-8');
  log.info('Wrote cold email drafts', { path: outPath, count: n });

  await sendAll(
    `${n} cold emails drafted for today. Review at dashboard or check data/cold-emails/`
  );

  return { path: outPath, count: n };
}

async function main() {
  await generateColdEmails();
}

if (process.argv[1]?.endsWith('email-generator.mjs')) {
  main().catch((e) => {
    log.error('Fatal', { err: e.message });
    process.exit(1);
  });
}
