#!/usr/bin/env node
/**
 * Company interview research — web search + Azure OpenAI synthesis
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './lib/logger.mjs';
import { searchWeb } from './lib/search-web.mjs';
import { chatCompletionStandard } from './lib/azure-openai.mjs';
import { sendAll } from './notifier.mjs';

const log = createLogger('company-research');
const ROOT = resolve(process.cwd());
const OUT_DIR = join(ROOT, 'data', 'company-research');

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

function slugifyCompany(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'company';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function collectResultLines(results) {
  const lines = [];
  for (const r of results) {
    const title = r.title || '';
    const snippet = r.snippet || '';
    lines.push(`- ${title}\n  URL: ${r.url}\n  ${snippet}`.trim());
  }
  return lines.join('\n\n');
}

function parseResearchJson(text) {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const raw = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Search the web, synthesize a prep report with Azure OpenAI, save JSON.
 * @param {string} company
 * @param {string} role
 */
export async function researchCompany(company, role) {
  if (!company || !role) {
    throw new Error('researchCompany(company, role) requires both arguments');
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const queries = [
    `"${company}" interview experience ${role} glassdoor`,
    `"${company}" interview questions leetcode`,
    `"${company}" ${role} interview reddit`,
    `"${company}" engineering blog tech stack`,
    `"${company}" about company products`,
  ];

  const allResults = [];
  const seenUrls = new Set();

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    log.info('Searching', { query: q });
    const batch = await searchWeb(q, 8);
    for (const row of batch) {
      const u = row.url;
      if (u && !seenUrls.has(u)) {
        seenUrls.add(u);
        allResults.push({
          url: row.url,
          title: row.title || '',
          snippet: row.snippet || '',
        });
      }
    }
    if (i < queries.length - 1) await sleep(2000);
  }

  const sources = [...seenUrls];
  const corpus = collectResultLines(allResults);

  const systemPrompt = `You are a career research assistant. Given web search snippets about a company and role, produce accurate, helpful interview prep material. If snippets are sparse, say so and give general best-practice guidance. Always respond with ONLY valid JSON, no markdown fences.`;

  const userPrompt = `Company: ${company}
Role: ${role}

Search snippets and URLs (may be incomplete):
${corpus.slice(0, 120000)}

Return a single JSON object with exactly these keys (string values for text fields, arrays of strings for list fields):
{
  "overview": "Company Overview: what they do, products, tech stack",
  "interviewProcess": "Interview Process: typical rounds, difficulty",
  "commonQuestions": ["technical or behavioral question examples"],
  "tipsFromCandidates": ["tips inferred from snippets"],
  "keyTopics": ["topics to study"]
}`;

  const raw = await chatCompletionStandard(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 4096, temperature: 0.4 }
  );

  let parsed = parseResearchJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    log.warn('JSON parse failed, using fallback structure');
    parsed = {
      overview: raw.slice(0, 8000),
      interviewProcess: '',
      commonQuestions: [],
      tipsFromCandidates: [],
      keyTopics: [],
    };
  }

  const out = {
    company,
    role,
    lastResearched: new Date().toISOString(),
    overview: String(parsed.overview ?? ''),
    interviewProcess: String(parsed.interviewProcess ?? ''),
    commonQuestions: Array.isArray(parsed.commonQuestions) ? parsed.commonQuestions.map(String) : [],
    tipsFromCandidates: Array.isArray(parsed.tipsFromCandidates) ? parsed.tipsFromCandidates.map(String) : [],
    keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics.map(String) : [],
    sources,
  };

  const filePath = join(OUT_DIR, `${slugifyCompany(company)}.json`);
  writeFileSync(filePath, JSON.stringify(out, null, 2));
  log.info('Saved research', { file: filePath.replace(ROOT + '/', '') });

  try {
    await sendAll(
      `Company research ready: ${role} @ ${company}. Saved to data/company-research/${slugifyCompany(company)}.json`
    );
  } catch (e) {
    log.warn('Notification failed', { err: e.message });
  }

  return out;
}

async function main() {
  const company = process.argv[2];
  const role = process.argv[3];

  if (!company || !role) {
    console.log('Usage: node services/company-research.mjs <company> <role>');
    console.log('Example: node services/company-research.mjs Stripe "Software Engineer"');
    process.exit(1);
  }

  await researchCompany(company, role);
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
