#!/usr/bin/env node
/**
 * GitHub profile scraper — HireForge
 *
 * Fetches public repos for aryanjstar, deep-scrapes READMEs for key projects,
 * writes data/github-profile.json, and notifies on completion.
 *
 * Usage (from HireForge root):
 *   node services/github-scraper.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './lib/logger.mjs';
import { sendAll } from './notifier.mjs';

const log = createLogger('github-scraper');
const ROOT = resolve(process.cwd());
const USERNAME = 'aryanjstar';
const OUT_FILE = join(ROOT, 'data', 'github-profile.json');

const KEY_REPOS = new Set([
  'Cognitive-OS',
  'AURA---THE-FINANCE-AI',
  'DevTinder',
  'AI-Career-Navigator',
  'Aryan_Jaiswal_Portfolio_V2',
  'BuzzHive',
  'Plant_Disease_Classification',
  'FreelanceGuard',
  'EV_Bidding_Algo',
  'CrackYourInternship',
  'AURA-Finance-AI',
  'VaaniGram',
]);

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function githubHeaders(accept = 'application/vnd.github+json') {
  const h = {
    Accept: accept,
    'User-Agent': 'HireForge-github-scraper',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function githubFetch(url, { accept } = {}) {
  try {
    const res = await fetch(url, { headers: githubHeaders(accept) });
    await sleep(1000);
    return res;
  } catch (e) {
    log.error('Network error', { url, err: e.message });
    throw e;
  }
}

async function fetchAllRepos() {
  const all = [];
  let page = 1;
  for (;;) {
    const url = `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}`;
    const res = await githubFetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.error('Failed to list repos', { status: res.status, body: body.slice(0, 500) });
      throw new Error(`GitHub repos API failed: ${res.status}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

async function fetchReadmeRaw(repoName) {
  const url = `https://api.github.com/repos/${USERNAME}/${encodeURIComponent(repoName)}/readme`;
  const res = await githubFetch(url, { accept: 'application/vnd.github.v3.raw' });
  if (res.status === 404) return null;
  if (!res.ok) {
    log.warn('README fetch failed', { repo: repoName, status: res.status });
    return null;
  }
  try {
    return await res.text();
  } catch (e) {
    log.warn('README read failed', { repo: repoName, err: e.message });
    return null;
  }
}

function readmeSummary(text) {
  if (text == null || typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;
  return t.length <= 500 ? t : t.slice(0, 500);
}

/**
 * Fetches non-fork repos, optional README summaries for key repos, writes JSON.
 * @returns {Promise<object>} The written profile object
 */
export async function scrapeGitHubProfile() {
  const dataDir = join(ROOT, 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  let rawRepos;
  try {
    rawRepos = await fetchAllRepos();
  } catch (e) {
    log.error('Aborting scrape', { err: e.message });
    throw e;
  }

  const nonForks = rawRepos.filter((r) => r && !r.fork);
  const repos = [];

  for (const r of nonForks) {
    const name = r.name;
    const topics = Array.isArray(r.topics) ? r.topics : [];

    let readme_summary = null;
    if (KEY_REPOS.has(name)) {
      try {
        const raw = await fetchReadmeRaw(name);
        readme_summary = readmeSummary(raw);
      } catch (e) {
        log.warn('README scrape error', { name, err: e.message });
        readme_summary = null;
      }
    }

    repos.push({
      name,
      description: r.description ?? null,
      language: r.language ?? null,
      stars: typeof r.stargazers_count === 'number' ? r.stargazers_count : 0,
      topics,
      url: r.html_url,
      fork: false,
      readme_summary,
    });
  }

  const out = {
    lastUpdated: new Date().toISOString(),
    username: USERNAME,
    repos,
  };

  try {
    writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf-8');
    log.info('Wrote github profile', { path: OUT_FILE, repoCount: repos.length });
  } catch (e) {
    log.error('Failed to write output file', { err: e.message });
    throw e;
  }

  return out;
}

async function main() {
  try {
    const out = await scrapeGitHubProfile();
    await sendAll(
      `📦 *GitHub profile scraped*\nUser: ${out.username}\nRepos (non-fork): ${out.repos.length}\nSaved: data/github-profile.json`,
    );
  } catch (e) {
    log.error('github-scraper failed', { err: e.message });
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked && resolve(invoked) === resolve(__filename)) {
  main();
}
