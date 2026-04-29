#!/usr/bin/env node
/**
 * Mega Job Scraper — HireForge
 *
 * Scrapes jobs from: LinkedIn, Indeed, Naukri, Internshala, Glassdoor,
 * Wellfound, Lever, Greenhouse, Ashby + Google/Bing search.
 * Targets FRESHER / New Grad / 0-2yr experience AI + SDE roles.
 *
 * Outputs: data/pipeline.md + data/scan-history.tsv + data/applications.md
 *
 * Usage:
 *   node services/mega-scraper.mjs              # single run
 *   node services/mega-scraper.mjs --loop       # every 6h
 *   node services/mega-scraper.mjs --portals    # also scrape portals.yml ATS APIs
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { createLogger } from './lib/logger.mjs';
import { evaluate } from './lib/azure-openai.mjs';
import { searchWeb } from './lib/search-web.mjs';
import { pushTrackerToGitHub } from './lib/tracker-github.mjs';
import { sendAll as notifySendAll } from './notifier.mjs';

const log = createLogger('mega-scraper');
const ROOT = resolve(process.cwd());

function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

async function notify(msg) { await notifySendAll(msg); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── State management ─────────────────────────────────────────────────────
const SEEN_FILE = join(ROOT, 'data', '.mega-seen.json');
function loadSeen() {
  if (!existsSync(SEEN_FILE)) return new Set();
  try { return new Set(JSON.parse(readFileSync(SEEN_FILE, 'utf-8'))); }
  catch { return new Set(); }
}
function saveSeen(seen) {
  const dir = join(ROOT, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SEEN_FILE, JSON.stringify([...seen].slice(-5000), null, 0));
}

// ── FRESHER TITLE FILTER ─────────────────────────────────────────────────
const POSITIVE_KEYWORDS = [
  // AI/ML specific
  'ai engineer', 'ml engineer', 'machine learning', 'llm', 'genai', 'generative ai', 'nlp engineer',
  'deep learning', 'data scientist', 'applied scientist', 'research engineer', 'ai developer',
  'computer vision', 'mlops', 'llmops',
  // Software Engineering
  'software engineer', 'software developer', 'sde', 'sde-1', 'sde 1', 'sde1',
  'swe', 'backend engineer', 'backend developer', 'full stack', 'fullstack',
  'frontend engineer', 'frontend developer', 'platform engineer', 'devops engineer', 'cloud engineer',
  'web developer', 'api developer', 'systems engineer',
  // Tech-specific titles
  'python developer', 'node.js developer', 'react developer', 'typescript developer',
  'java developer', 'golang developer',
  // Additional role types user wants
  'data engineer', 'data analyst', 'site reliability', 'sre',
  'devops', 'infrastructure engineer', 'cloud engineer', 'fde',
  'fintech', 'payments engineer',
  // Embedded, firmware, Android roles
  'embedded engineer', 'embedded developer', 'firmware engineer',
  'android developer', 'android engineer',
  // Freelance / contract
  'freelance developer', 'contract engineer', 'freelance engineer',
  // Fresher-specific tech roles
  'associate software', 'associate engineer', 'associate developer',
  'junior engineer', 'junior developer', 'entry level engineer', 'entry level developer',
  'new grad engineer', 'new grad developer', 'fresher engineer', 'fresher developer',
  'graduate engineer', 'graduate developer', 'trainee engineer',
  'mts-1', 'mts 1', 'mts-i', 'member of technical staff',
];

const NEGATIVE_KEYWORDS = [
  'sde-2', 'sde-3', 'sde 2', 'sde 3', 'sde ii', 'sde iii',
  'mts-2', 'mts-3', 'mts 2', 'mts 3', 'mts ii', 'mts iii',
  'senior', 'sr.', 'sr ', 'lead', 'principal', 'staff', 'architect',
  'manager', 'director', 'vp', 'head of', 'chief',
  '5+ years', '6+ years', '7+ years', '8+ years', '10+ years', '15+ years',
  '5-7 years', '5-8 years', '7-10 years', '8-12 years',
  '.net', 'ios', 'swift', 'kotlin', 'objective-c',
  'php', 'ruby on rails', 'mainframe', 'cobol',
  'sap ', 'oracle ebs', 'blockchain', 'web3', 'crypto',
  'bpo', 'voice process', 'non-voice', 'telecaller',
  'intern only', // we want full time, not internships
  // Non-tech "associate" roles
  'operations associate', 'compliance associate', 'sales associate',
  'marketing associate', 'finance associate', 'hr associate', 'legal associate',
  'content associate', 'customer', 'support associate', 'account',
  'quality associate', 'fraud', 'kyc', 'aml', 'risk associate',
  'communications associate', 'business associate',
];

const SENIORITY_BOOST = [
  'entry', 'associate', 'junior', 'new grad', 'fresher', 'graduate',
  '0-1 year', '0-2 year', '1-2 year', '1-3 year', '0-3 year',
  'campus hire', 'early career', 'sde-1', 'sde 1', 'mts-1', 'mts 1',
  'level 1', 'l3', 'l4', 'e3', 'e4', 'ic1', 'ic2',
];

function isRelevantTitle(title) {
  const t = title.toLowerCase();
  if (NEGATIVE_KEYWORDS.some(n => t.includes(n))) return false;
  return POSITIVE_KEYWORDS.some(p => t.includes(p));
}

function isFresherFriendly(title) {
  const t = title.toLowerCase();
  return SENIORITY_BOOST.some(s => t.includes(s));
}

// ── Jina Reader (free JD fetcher) ────────────────────────────────────────
async function fetchJobContent(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    return (await r.text()).slice(0, 5000);
  } catch { clearTimeout(timer); return null; }
}

// ── ATS API Scrapers (Greenhouse, Lever, Ashby) ──────────────────────────
async function fetchGreenhouseJobs(slug) {
  try {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.jobs || []).map(j => ({
      url: j.absolute_url,
      title: j.title,
      location: j.location?.name || '',
      content: j.content?.replace(/<[^>]+>/g, ' ').slice(0, 4000) || '',
    }));
  } catch { return []; }
}

async function fetchLeverJobs(org) {
  try {
    const r = await fetch(`https://api.lever.co/v0/postings/${org}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    if (!Array.isArray(d)) return [];
    return d.map(j => ({
      url: j.hostedUrl || '',
      title: j.text || '',
      location: j.categories?.location || '',
      content: j.descriptionPlain?.slice(0, 4000) || '',
    }));
  } catch { return []; }
}

async function fetchAshbyJobs(org) {
  try {
    const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.jobs || []).map(j => ({
      url: j.jobUrl || '',
      title: j.title || '',
      location: j.location || '',
      content: j.descriptionPlain?.slice(0, 4000) || '',
    }));
  } catch { return []; }
}

// ── COMPANY DATABASES ────────────────────────────────────────────────────
// Organized by source type for maximum coverage

const GREENHOUSE_COMPANIES = [
  // India Product Startups
  { company: 'Postman', slug: 'postman' },
  { company: 'BrowserStack', slug: 'browserstack' },
  { company: 'Observe.AI', slug: 'observeai' },
  { company: 'LeadSquared', slug: 'leadsquared' },
  { company: 'Ramp', slug: 'ramp' },
  { company: 'Notion', slug: 'notion' },
  { company: 'Figma', slug: 'figma' },
  { company: 'GitLab', slug: 'gitlab' },
  { company: 'Coinbase', slug: 'coinbase' },
  { company: 'Stripe', slug: 'stripe' },
  { company: 'Datadog', slug: 'datadog' },
  { company: 'MongoDB', slug: 'mongodb' },
  { company: 'Scale AI', slug: 'scaleai' },
  { company: 'Anthropic', slug: 'anthropic' },
  { company: 'Cohere', slug: 'cohere' },
  { company: 'Mistral AI', slug: 'mistralai' },
  { company: 'Anyscale', slug: 'anyscale' },
  { company: 'Hugging Face', slug: 'huggingface' },
  { company: 'Together AI', slug: 'togetherai' },
  { company: 'Replicate', slug: 'replicate' },
  { company: 'Weights & Biases', slug: 'wandb' },
  { company: 'Pinecone', slug: 'pinecone' },
  { company: 'Weaviate', slug: 'weaviate' },
  { company: 'LangChain', slug: 'langchain' },
  { company: 'OpenAI', slug: 'openai' },
  { company: 'Adobe', slug: 'adobe' },
  { company: 'Vercel', slug: 'vercel' },
  { company: 'Supabase', slug: 'supabase' },
  { company: 'Neon', slug: 'neondatabase' },
  { company: 'PlanetScale', slug: 'planetscale' },
  { company: 'Railway', slug: 'railway' },
  { company: 'Fly.io', slug: 'flyio' },
  { company: 'Retool', slug: 'retool' },
  { company: 'Linear', slug: 'linear' },
  { company: 'Loom', slug: 'loom' },
  { company: 'Coda', slug: 'coda' },
  { company: 'Airtable', slug: 'airtable' },
  { company: 'Intercom', slug: 'intercom' },
  { company: 'Mixpanel', slug: 'mixpanel' },
  { company: 'Amplitude', slug: 'amplitude' },
  { company: 'Segment', slug: 'segment' },
  { company: 'Sentry', slug: 'sentry' },
  { company: 'CircleCI', slug: 'circleci' },
  { company: 'Sourcegraph', slug: 'sourcegraph' },
  { company: 'Cockroach Labs', slug: 'cockroachlabs' },
  { company: 'Grafana Labs', slug: 'grafanalabs' },
  { company: 'HashiCorp', slug: 'hashicorp' },
  { company: 'Kong', slug: 'kong' },
  { company: 'Temporal', slug: 'temporal' },
  { company: 'dbt Labs', slug: 'dbtlabsinc' },
  { company: 'Stripe', slug: 'stripe' },
  { company: 'Cloudflare', slug: 'cloudflare' },
  { company: 'Twilio', slug: 'twilio' },
  { company: 'Elastic', slug: 'elastic' },
  { company: 'Confluent', slug: 'confluent' },
  { company: 'Snyk', slug: 'snyk' },
  { company: 'LaunchDarkly', slug: 'launchdarkly' },
  { company: 'Airbyte', slug: 'airbyte' },
  { company: 'Fivetran', slug: 'fivetran' },
  { company: 'Databricks', slug: 'databricks' },
  { company: 'Snowflake', slug: 'snowflake' },
  { company: 'Palantir', slug: 'palantir' },
  { company: 'Rubrik', slug: 'rubrik' },
  { company: 'Zscaler', slug: 'zscaler' },
  { company: 'CrowdStrike', slug: 'crowdstrike' },
  { company: 'Palo Alto Networks', slug: 'paloaltonetworks' },
  { company: 'Okta', slug: 'okta' },
  { company: 'Splunk', slug: 'splunk' },
  { company: 'Nutanix', slug: 'nutanix' },
  { company: 'Freshworks India', slug: 'freshworksofficial' },
  { company: 'Sprinklr', slug: 'sprinklr' },
  { company: 'Druva', slug: 'druva' },
  { company: 'Cred', slug: 'cred' },
  { company: 'Meesho', slug: 'meesho' },
  { company: 'Groww', slug: 'groww' },
  { company: 'PhonePe', slug: 'phonepe' },
  { company: 'Zerodha', slug: 'zerodha' },
  { company: 'Swiggy', slug: 'swiggy' },
  { company: 'Zomato', slug: 'zomato' },
  { company: 'Ola', slug: 'olacabs' },
  { company: 'Flipkart', slug: 'flipkart' },
  { company: 'Paytm', slug: 'paytm' },
  { company: 'ShareChat', slug: 'sharechat' },
  { company: 'Unacademy', slug: 'unacademy' },
  { company: 'BYJU\'S', slug: 'byjus' },
  { company: 'Turing', slug: 'turing' },
  { company: 'Hasura', slug: 'hasura' },
  { company: 'Postman India', slug: 'postmanindia' },
];

const LEVER_COMPANIES = [
  { company: 'Razorpay', org: 'razorpay' },
  { company: 'Freshworks', org: 'freshworks' },
  { company: 'Yellow.ai', org: 'yellowmessenger' },
  { company: 'Atlassian', org: 'atlassian' },
  { company: 'Hasura', org: 'hasura' },
  { company: 'PayPal', org: 'paypal' },
  { company: 'Netflix', org: 'netflix' },
  { company: 'Spotify', org: 'spotify' },
  { company: 'Twitch', org: 'twitch' },
  { company: 'Snap', org: 'snap' },
  { company: 'Lyft', org: 'lyft' },
  { company: 'Affirm', org: 'affirm' },
  { company: 'Robinhood', org: 'robinhood' },
  { company: 'Plaid', org: 'plaid' },
  { company: 'Brex', org: 'brex' },
  { company: 'Rippling', org: 'rippling' },
  { company: 'Calendly', org: 'calendly' },
  { company: 'Gusto', org: 'gusto' },
  { company: 'Lattice', org: 'lattice' },
  { company: 'Grammarly', org: 'grammarly' },
  { company: 'Canva', org: 'canva' },
  { company: 'Miro', org: 'miro' },
  { company: 'Webflow', org: 'webflow' },
  { company: 'Zapier', org: 'zapier' },
  { company: 'Exotel', org: 'exotel' },
  { company: 'CleverTap', org: 'clevertap' },
  { company: 'Chargebee', org: 'chargebee' },
  { company: 'Zoho', org: 'zohocorp' },
  { company: 'Dream11', org: 'dream11' },
  { company: 'Jupiter', org: 'jupiter-money' },
  { company: 'Uni Cards', org: 'uni' },
  { company: 'Open Financial', org: 'open-financial' },
  { company: 'Niyo', org: 'niyo' },
  { company: 'Rupeek', org: 'rupeek' },
  { company: 'Notion', org: 'notion' },
  { company: 'Figma', org: 'figma' },
  { company: 'Vercel', org: 'vercel' },
  { company: 'Supabase', org: 'supabase' },
  { company: 'Linear', org: 'linear' },
  { company: 'Descript', org: 'descript' },
  { company: 'Loom', org: 'loom' },
  { company: 'Deel', org: 'deel' },
  { company: 'Remote', org: 'remote' },
  { company: 'Oyster', org: 'oyster' },
  { company: 'Turing', org: 'turing' },
  { company: 'Toptal', org: 'toptal' },
  { company: 'Upwork', org: 'upwork' },
  { company: 'Coda', org: 'coda' },
  { company: 'Airtable', org: 'airtable' },
];

const ASHBY_COMPANIES = [
  { company: 'Perplexity AI', org: 'perplexity' },
  { company: 'Cursor', org: 'cursor' },
  { company: 'Runway', org: 'runway' },
  { company: 'ElevenLabs', org: 'elevenlabs' },
  { company: 'Midjourney', org: 'midjourney' },
  { company: 'Character.ai', org: 'character' },
  { company: 'Stability AI', org: 'stability' },
  { company: 'Replit', org: 'replit' },
  { company: 'Jasper', org: 'jasper' },
  { company: 'Copy.ai', org: 'copy-ai' },
  { company: 'Writer', org: 'writer' },
];

// Web search queries — covering LinkedIn, Naukri, Indeed, Internshala, etc.
const SEARCH_QUERIES = [
  // LinkedIn India — top priority
  'site:linkedin.com/jobs "AI Engineer" OR "ML Engineer" OR "GenAI" India fresher OR "new grad" 2026',
  'site:linkedin.com/jobs "Software Engineer" OR "SDE" OR "SDE-1" India fresher OR "entry level" 2026',
  'site:linkedin.com/jobs "Full Stack" OR "Backend Developer" OR "Python" India fresher 2026',

  // LinkedIn Remote / International
  'site:linkedin.com/jobs "AI Engineer" OR "ML Engineer" remote "new grad" OR junior 2026',

  // Naukri (India's largest)
  'site:naukri.com "AI engineer" OR "ML engineer" OR "GenAI" fresher Bangalore OR Mumbai OR remote 2026',
  'site:naukri.com "software engineer" OR "SDE" OR "SDE-1" fresher Bangalore OR Pune OR Delhi 2026',

  // Indeed India
  'site:indeed.com "AI engineer" OR "software engineer" India fresher OR "new grad" 2026',

  // Internshala
  'site:internshala.com "AI" OR "ML" OR "software developer" fresher full-time 2026',

  // Glassdoor India
  'site:glassdoor.co.in "AI engineer" OR "software engineer" OR "SDE-1" fresher 2026',

  // Wellfound (startups)
  'site:wellfound.com "AI engineer" OR "software engineer" India OR remote junior 2026',

  // CutShort + Instahyre
  'site:cutshort.io "AI engineer" OR "GenAI" OR "SDE" fresher 2026',
  'site:instahyre.com "AI engineer" OR "ML" OR "SDE" fresher 2026',

  // Indian AI companies direct
  'sarvam.ai OR krutrim.com careers engineer AI ML 2026',

  // International remote
  '"AI Engineer" OR "ML Engineer" remote junior OR "new grad" "open worldwide" 2026',

  // Additional LinkedIn queries
  'site:linkedin.com/jobs "Data Scientist" OR "Data Engineer" India fresher OR "entry level" 2026',
  'site:linkedin.com/jobs "DevOps Engineer" OR "Cloud Engineer" OR "SRE" India fresher 2026',
  'site:linkedin.com/jobs "Software Engineer" OR "SDE-1" Bangalore OR Hyderabad OR Pune 2026',

  // Additional Naukri queries
  'site:naukri.com "full stack developer" OR "backend developer" OR "frontend developer" fresher 2026',
  'site:naukri.com "data scientist" OR "data engineer" OR "DevOps" fresher 2026',

  // Glassdoor US
  'site:glassdoor.com "AI engineer" OR "ML engineer" OR "software engineer" "new grad" 2026',

  // HackerEarth / HackerRank jobs
  'site:hackerearth.com OR site:hackerrank.com "software engineer" OR "AI" fresher 2026',

  // Direct company career pages
  'careers.google.com "software engineer" OR "AI" "new grad" OR "university" 2026',
  'amazon.jobs "software development engineer" OR "SDE" "new grad" OR "entry level" India 2026',
  'careers.microsoft.com "software engineer" OR "AI" "new grad" India 2026',
  'meta.com/careers "software engineer" OR "ML" "new grad" 2026',

  // More Indian platforms
  'site:naukri.com "DevOps" OR "SRE" OR "site reliability" OR "cloud engineer" fresher 2026',
  'site:naukri.com "embedded" OR "firmware" OR "Android developer" fresher 2026',
  'site:internshala.com "software developer" OR "web developer" OR "full stack" full-time 2026',
  'site:linkedin.com/jobs "freelance" OR "contract" "AI" OR "ML" OR "full stack" remote India 2026',
  'site:linkedin.com/jobs "embedded engineer" OR "firmware" OR "Android" India fresher 2026',
  'site:linkedin.com/jobs "SRE" OR "site reliability" OR "DevOps" India fresher OR "entry level" 2026',

  // YC startups hiring
  'site:ycombinator.com/companies "hiring" "engineer" OR "developer" India OR remote 2026',
  '"Y Combinator" hiring "software engineer" OR "AI engineer" India OR remote fresher 2026',

  // Foundit (Monster India)
  'site:foundit.in "AI engineer" OR "software engineer" OR "SDE" fresher 2026',
  'site:foundit.in "DevOps" OR "cloud" OR "full stack" fresher 2026',

  // iimjobs / hirist (premium)
  'site:iimjobs.com OR site:hirist.tech "software engineer" OR "AI" OR "ML" 0-2 years 2026',

  // Indian MNC careers
  'infosys.com careers "software engineer" OR "SDE" fresher 2026',
  'wipro.com careers "software engineer" OR "AI" fresher 2026',
  'tcs.com careers "software engineer" OR "developer" fresher 2026',
];

// ── Data files ─────────────────────────────────────────────────────────────
const DATA_DIR = join(ROOT, 'data');

function ensureDataFiles() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  if (!existsSync(join(DATA_DIR, 'pipeline.md'))) {
    writeFileSync(join(DATA_DIR, 'pipeline.md'), `# Job Pipeline\n\n## Pendientes\n\n## Procesadas\n`);
  }
  if (!existsSync(join(DATA_DIR, 'applications.md'))) {
    writeFileSync(join(DATA_DIR, 'applications.md'),
      `# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n`
    );
  }
  if (!existsSync(join(DATA_DIR, 'scan-history.tsv'))) {
    writeFileSync(join(DATA_DIR, 'scan-history.tsv'), 'url\tfirst_seen\tsource\ttitle\tcompany\tstatus\n');
  }
}

function appendToTracker(id, date, company, role, score, status, pdfRef, reportRef, notes) {
  const trackerPath = join(DATA_DIR, 'applications.md');
  const line = `| ${id} | ${date} | ${company} | ${role} | ${score} | ${status} | ${pdfRef} | ${reportRef} | ${notes} |\n`;
  appendFileSync(trackerPath, line);
}

function appendToPipeline(offers) {
  const pipelinePath = join(DATA_DIR, 'pipeline.md');
  let text = readFileSync(pipelinePath, 'utf-8');
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) return;
  const afterMarker = idx + marker.length;
  const nextSection = text.indexOf('\n## ', afterMarker);
  const insertAt = nextSection === -1 ? text.length : nextSection;
  const block = '\n' + offers.map(o =>
    `- [ ] ${o.url} | ${o.company} | ${o.title} | ${o.location || ''}`
  ).join('\n') + '\n';
  text = text.slice(0, insertAt) + block + text.slice(insertAt);
  writeFileSync(pipelinePath, text);
}

function appendToScanHistory(offers, date) {
  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`
  ).join('\n') + '\n';
  appendFileSync(join(DATA_DIR, 'scan-history.tsv'), lines);
}

function getNextTrackerId() {
  const trackerPath = join(DATA_DIR, 'applications.md');
  if (!existsSync(trackerPath)) return 1;
  const content = readFileSync(trackerPath, 'utf-8');
  const matches = content.match(/^\| (\d+) /gm);
  if (!matches) return 1;
  const ids = matches.map(m => parseInt(m.replace('| ', '').trim(), 10)).filter(n => !isNaN(n));
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

// ── MAIN PIPELINE ────────────────────────────────────────────────────────
async function runScrape() {
  const runTime = new Date();
  const date = runTime.toISOString().split('T')[0];
  log.info('Mega scrape started', { time: runTime.toISOString() });
  const timer = log.time('mega-scrape');

  ensureDataFiles();
  const seen = loadSeen();
  const stats = { atsJobs: 0, searchJobs: 0, relevant: 0, evaluated: 0, highScore: [], errors: 0 };
  const newOffers = [];

  await notify([
    `🔍 *Mega Scraper Started*`,
    `⏰ ${runTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    `Scanning ${GREENHOUSE_COMPANIES.length + LEVER_COMPANIES.length + ASHBY_COMPANIES.length} ATS boards + ${SEARCH_QUERIES.length} search queries`,
    `Target: Fresher / New Grad / 0-2yr AI + SDE roles`,
  ].join('\n'));

  // ── Phase 1: Greenhouse APIs ──
  log.info(`Scanning ${GREENHOUSE_COMPANIES.length} Greenhouse boards…`);
  for (const { company, slug } of GREENHOUSE_COMPANIES) {
    try {
      const jobs = await fetchGreenhouseJobs(slug);
      stats.atsJobs += jobs.length;
      for (const job of jobs) {
        const key = `gh:${slug}:${job.url}`;
        if (seen.has(key)) continue;
        if (!isRelevantTitle(job.title)) continue;
        seen.add(key);
        stats.relevant++;
        newOffers.push({ ...job, company, source: 'greenhouse' });
      }
      await sleep(200);
    } catch { stats.errors++; }
  }

  // ── Phase 2: Lever APIs ──
  log.info(`Scanning ${LEVER_COMPANIES.length} Lever boards…`);
  for (const { company, org } of LEVER_COMPANIES) {
    try {
      const jobs = await fetchLeverJobs(org);
      stats.atsJobs += jobs.length;
      for (const job of jobs) {
        const key = `lever:${org}:${job.url}`;
        if (seen.has(key)) continue;
        if (!isRelevantTitle(job.title)) continue;
        seen.add(key);
        stats.relevant++;
        newOffers.push({ ...job, company, source: 'lever' });
      }
      await sleep(200);
    } catch { stats.errors++; }
  }

  // ── Phase 3: Ashby APIs ──
  log.info(`Scanning ${ASHBY_COMPANIES.length} Ashby boards…`);
  for (const { company, org } of ASHBY_COMPANIES) {
    try {
      const jobs = await fetchAshbyJobs(org);
      stats.atsJobs += jobs.length;
      for (const job of jobs) {
        const key = `ashby:${org}:${job.url}`;
        if (seen.has(key)) continue;
        if (!isRelevantTitle(job.title)) continue;
        seen.add(key);
        stats.relevant++;
        newOffers.push({ ...job, company, source: 'ashby' });
      }
      await sleep(200);
    } catch { stats.errors++; }
  }

  // ── Phase 4: Web search queries ──
  log.info(`Running ${SEARCH_QUERIES.length} web searches…`);
  for (const query of SEARCH_QUERIES) {
    try {
      const results = await searchWeb(query, 5);
      stats.searchJobs += results.length;
      for (const item of results) {
        const key = `search:${item.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Fetch content for relevance check
        const content = await fetchJobContent(item.url);
        if (!content || content.length < 100) continue;
        // Extract title from content
        const titleMatch = content.match(/^#?\s*(.+?)[\n\r]/);
        const title = titleMatch?.[1]?.slice(0, 120) || item.title || 'Unknown Role';
        if (!isRelevantTitle(title)) continue;
        stats.relevant++;
        newOffers.push({ url: item.url, title, content, company: 'Unknown', location: '', source: 'search' });
      }
      await sleep(1500); // respect rate limits for search
    } catch { stats.errors++; }
  }

  log.info('Scraping complete', { atsJobs: stats.atsJobs, searchJobs: stats.searchJobs, relevant: stats.relevant });

  // Save pipeline + scan history
  if (newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  // ── Phase 5: Evaluate top candidates and tailor resume ──
  const cvText = existsSync(join(ROOT, 'cv.md')) ? readFileSync(join(ROOT, 'cv.md'), 'utf-8') : '';
  const profileYml = existsSync(join(ROOT, 'config/profile.yml'))
    ? readFileSync(join(ROOT, 'config/profile.yml'), 'utf-8') : '';
  let nextId = getNextTrackerId();

  // Score relevance: AI/ML titles > SDE titles > generic; fresher-boost; ATS > search
  function relevanceScore(offer) {
    const t = offer.title.toLowerCase();
    let score = 0;
    if (/\b(ai|ml|llm|genai|nlp|deep learning|machine learning)\b/i.test(t)) score += 20;
    if (/\b(software engineer|sde|swe|backend|fullstack|full stack|frontend)\b/i.test(t)) score += 15;
    if (/\b(data scientist|applied scientist|research)\b/i.test(t)) score += 15;
    if (/\b(python|node\.?js|react|typescript|java)\b/i.test(t)) score += 10;
    if (isFresherFriendly(t)) score += 10;
    if (offer.source !== 'search') score += 5;
    return score;
  }
  const sorted = newOffers.sort((a, b) => relevanceScore(b) - relevanceScore(a));

  // Evaluate ALL relevant roles — no cap
  const toEvaluate = sorted;
  log.info(`Evaluating ${toEvaluate.length} candidates (all relevant roles)…`);

  for (const offer of toEvaluate) {
    try {
      const jdText = offer.content || `${offer.title} at ${offer.company}. Location: ${offer.location}. URL: ${offer.url}`;

      log.info('Evaluating', { company: offer.company, title: offer.title.slice(0, 50) });
      const report = await evaluate(jdText, cvText, profileYml);
      stats.evaluated++;

      const scoreMatch = report.match(/Global Score[:\s]*(\d+\.?\d*)\/5/i)
        || report.match(/(\d+\.?\d*)\/5/);
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;

      // Save report
      const reportsDir = join(ROOT, 'reports');
      if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
      const slug = offer.company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const reportFile = `${String(nextId).padStart(3, '0')}-${slug}-${date}.md`;
      writeFileSync(join(reportsDir, reportFile), report);

      // Threshold: score >= 2.0 gets evaluated + auto-apply attempted (cast a wider net)
      const status = score >= 2.0 ? 'Evaluated' : 'SKIP';
      appendToTracker(nextId, date, offer.company, offer.title.slice(0, 60), `${score}/5`, status, '', `[📋](reports/${reportFile})`, `Auto-scanned. ${offer.url}`);
      nextId++;

      if (score >= 2.0) {
        stats.highScore.push({ company: offer.company, role: offer.title, score, url: offer.url });

        await notify([
          `🎯 *Match Found: ${score}/5*`,
          `*Company:* ${offer.company}`,
          `*Role:* ${offer.title.slice(0, 60)}`,
          `*URL:* ${offer.url}`,
          score >= 4.0 ? `✅ *Strong match* — auto-applying` : score >= 3.0 ? `⚡ *Good match* — auto-applying` : `📝 *Decent match* — auto-applying`,
        ].join('\n'));

        // Auto-tailor LaTeX resume and apply for all evaluated roles
        if (score >= 2.0) {
          try {
            const jdDir = join(ROOT, 'jds', 'auto');
            if (!existsSync(jdDir)) mkdirSync(jdDir, { recursive: true });
            const jdFile = join(jdDir, `${slug}-${date}.txt`);
            writeFileSync(jdFile, jdText);

            const { spawnSync } = await import('child_process');
            spawnSync('node', ['services/latex-resume.mjs', jdFile, offer.company, offer.title.slice(0, 40)], {
              cwd: ROOT, encoding: 'utf-8', timeout: 420000,
            });
            log.info('Resume tailored', { company: offer.company });

            const pdfPath = join(ROOT, 'resumes', 'latex', `${slug}-${date}.pdf`);
            let applied = false;
            if (process.env.AUTO_APPLY_ENABLED === 'true') {
              try {
                const pdfExists = existsSync(pdfPath);
                if (!pdfExists) {
                  log.error('Tailored PDF not generated, skipping auto-apply', { company: offer.company, pdfPath });
                } else {
                  const { tryAutoApply } = await import('./auto-apply.mjs');
                  const ar = await tryAutoApply({ url: offer.url, pdfPath });
                  if (ar.ok && !ar.dryRun) {
                    applied = true;
                    appendToTracker(
                      nextId,
                      date,
                      offer.company,
                      offer.title.slice(0, 60),
                      `${score}/5`,
                      'Applied',
                      '[auto]',
                      `[📋](reports/${reportFile})`,
                      `Auto-applied (${ar.ats || 'generic'}). ${offer.url}`,
                    );
                    nextId++;
                    log.info('Auto-apply recorded', { company: offer.company, ats: ar.ats });

                    await notify([
                      `✅ *Auto-Applied!*`,
                      `*Company:* ${offer.company}`,
                      `*Role:* ${offer.title.slice(0, 60)}`,
                      `*ATS:* ${ar.ats || 'generic'}`,
                      `*Fields filled:* ${(ar.tried || []).join(', ')}`,
                      `*Score:* ${score}/5`,
                    ].join('\n'));
                  } else if (!ar.ok) {
                    log.info('Auto-apply skipped', { company: offer.company, reason: ar.reason, ats: ar.ats });
                  }
                }
              } catch (e) {
                log.warn('Auto-apply failed', { err: e.message });
              }
            }
            if (!applied && score >= 3.0) {
              try {
                let coverLetterPath = null;
                try {
                  const { generateCoverLetter } = await import('./cover-letter.mjs');
                  const clResult = await generateCoverLetter(offer.jdText || '', offer.company, offer.title, '');
                  if (clResult.success && clResult.pdfPath) coverLetterPath = clResult.pdfPath;
                } catch (e) { log.warn('Cover letter gen failed for packet', { err: e.message }); }

                const { sendJobPacket } = await import('./notifier.mjs');
                await sendJobPacket({
                  company: offer.company,
                  role: offer.title,
                  score,
                  url: offer.url,
                  jdText: offer.jdText || '',
                  pdfPath: existsSync(pdfPath) ? pdfPath : null,
                  coverLetterPath,
                  applyReason: `Score: ${score}/5. ${score >= 4.0 ? 'Excellent match!' : 'Good match.'}`,
                });
              } catch (e) {
                log.warn('Job packet send failed', { err: e.message });
              }
            }
          } catch (e) { log.warn('Resume tailor failed', { err: e.message }); }
        }
      }

      await sleep(1000); // brief pause between evaluations
    } catch (e) {
      log.error('Evaluation failed', { company: offer.company, err: e.message });
      stats.errors++;
    }
  }

  saveSeen(seen);
  try {
    await pushTrackerToGitHub();
  } catch (e) {
    log.warn('GitHub tracker push skipped', { err: e.message });
  }
  timer.done('Mega scrape complete', stats);

  // Final digest
  await notify([
    `📊 *Mega Scraper Complete*`,
    `⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    ``,
    `ATS boards scanned: ${GREENHOUSE_COMPANIES.length + LEVER_COMPANIES.length + ASHBY_COMPANIES.length}`,
    `Search queries run: ${SEARCH_QUERIES.length}`,
    `Total jobs found: ${stats.atsJobs + stats.searchJobs}`,
    `Relevant (fresher AI/SDE): ${stats.relevant}`,
    `Evaluated: ${stats.evaluated}`,
    `Score ≥ 3.0: ${stats.highScore.length}`,
    ``,
    stats.highScore.length > 0
      ? `🎯 *Top Matches:*\n${stats.highScore.map(h => `• ${h.company} — ${h.role.slice(0, 40)} (${h.score}/5)`).join('\n')}`
      : '😴 No high-score matches this run.',
    ``,
    `Next run in ~6 hours.`,
  ].join('\n'));

  return stats;
}

// ── Entry point ─────────────────────────────────────────────────────────
async function main() {
  const loop = process.argv.includes('--loop');
  const INTERVAL = 6 * 60 * 60 * 1000; // every 6 hours

  if (loop) {
    log.info('Starting 6-hour mega scraper loop');
    while (true) {
      try { await runScrape(); }
      catch (e) { log.error('Scrape run failed', { err: e.message }); }
      log.info(`Next run at ${new Date(Date.now() + INTERVAL).toISOString()}`);
      await sleep(INTERVAL);
    }
  } else {
    await runScrape();
  }
}

main().catch(e => { log.error('Fatal', { err: e.message }); process.exit(1); });
