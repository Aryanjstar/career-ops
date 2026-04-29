#!/usr/bin/env node
/**
 * Automated Job Pipeline — HireForge
 * 
 * Runs every 6 hours (via cron or watcher).
 * For each run:
 *   1. Scrape job listings from portals.yml companies via web search
 *   2. Evaluate each new JD with o4-mini
 *   3. For score ≥ 3.5: tailor LaTeX resume, generate interview prep
 *   4. Log to tracker
 *   5. Notify via Telegram + WhatsApp with full digest
 *
 * Usage:
 *   node services/auto-pipeline.mjs           (single run)
 *   node services/auto-pipeline.mjs --loop    (every 6h loop)
 *
 * Deploy: runs on Azure Container Apps on a schedule
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { createLogger } from './lib/logger.mjs';
import { evaluate, chatCompletionFast } from './lib/azure-openai.mjs';

const log = createLogger('auto-pipeline');
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

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';
const TWILIO_SID         = process.env.TWILIO_ACCOUNT_SID  || '';
const TWILIO_TOKEN       = process.env.TWILIO_AUTH_TOKEN   || '';
const TWILIO_WA_TO       = process.env.TWILIO_WHATSAPP_TO  || '';

// ── Notification helpers ───────────────────────────────────────────────────
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: chunk, parse_mode: 'Markdown' }),
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 400));
  }
}
async function sendWhatsApp(text) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA_TO) return;
  const plain = text.replace(/\*/g, '').replace(/#+ /g, '').slice(0, 1600);
  const to = `whatsapp:${TWILIO_WA_TO.startsWith('+') ? TWILIO_WA_TO : '+' + TWILIO_WA_TO}`;
  const creds = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: 'whatsapp:+14155238886', To: to, Body: plain }),
  }).catch(() => {});
}
async function notify(msg) { await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]); }

// ── State management ───────────────────────────────────────────────────────
const SEEN_FILE = join(ROOT, 'data', '.pipeline-seen.json');
function loadSeen() {
  if (!existsSync(SEEN_FILE)) return new Set();
  try { return new Set(JSON.parse(readFileSync(SEEN_FILE, 'utf-8'))); }
  catch { return new Set(); }
}
function saveSeen(seen) {
  const dir = join(ROOT, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SEEN_FILE, JSON.stringify([...seen], null, 2));
}

// ── Job discovery via web search (uses the shared multi-backend search) ──────
import { searchWeb } from './lib/search-web.mjs';

async function searchJobs(query, maxResults = 5) {
  try {
    return await searchWeb(query, maxResults);
  } catch {
    return [];
  }
}

// Fetch job page content via Jina Reader (free, no key needed)
async function fetchJobContent(url) {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const r = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain', 'User-Agent': 'HireForge/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    // Extract relevant portion (job description usually in first 3000 chars)
    return text.slice(0, 4000);
  } catch {
    return null;
  }
}

// ── Greenhouse API scraper (no auth needed) ────────────────────────────────
async function fetchGreenhouseJobs(boardSlug) {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${boardSlug}/jobs?content=true`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.jobs || []).slice(0, 10).map(j => ({
      url:     j.absolute_url,
      title:   j.title,
      content: j.content?.replace(/<[^>]+>/g, ' ').slice(0, 3000) || '',
    }));
  } catch { return []; }
}

// ── Target companies with direct APIs ─────────────────────────────────────
const GREENHOUSE_BOARDS = [
  { company: 'Postman',       slug: 'postman' },
  { company: 'BrowserStack',  slug: 'browserstack' },
  { company: 'Observe.AI',    slug: 'observeai' },
  { company: 'Adobe',         slug: 'adobe' },
  { company: 'LeadSquared',   slug: 'leadsquared' },
];

// Web-search based companies
const SEARCH_COMPANIES = [
  { company: 'Razorpay',      query: 'site:jobs.lever.co/razorpay OR razorpay.com/jobs AI engineer OR ML engineer OR GenAI 0-2 years',         role: 'AI/ML Engineer' },
  { company: 'Sarvam AI',     query: 'sarvam.ai jobs AI engineer OR ML engineer 2025 2026',                                                     role: 'AI Engineer' },
  { company: 'Swiggy',        query: 'site:careers.swiggy.com AI OR ML engineer fresher OR new grad 2025',                                      role: 'AI/ML Engineer' },
  { company: 'CRED',          query: 'site:careers.cred.club engineer AI OR ML OR data',                                                        role: 'Software Engineer' },
  { company: 'Zepto',         query: 'zepto careers AI engineer OR ML engineer OR software engineer 2025 Bangalore',                            role: 'Software Engineer' },
  { company: 'Meesho',        query: 'site:meesho.io/careers software engineer AI OR ML 0-2 years 2025',                                        role: 'Software Engineer' },
  { company: 'Yellow.ai',     query: 'site:jobs.lever.co/yellowmessenger engineer AI OR NLP 2025',                                              role: 'AI Engineer' },
  { company: 'Freshworks',    query: 'site:jobs.lever.co/freshworks engineer AI OR ML OR GenAI 2025',                                           role: 'Software Engineer' },
  { company: 'PhonePe',       query: 'phonepe careers AI OR ML engineer 2025 Bangalore',                                                        role: 'ML Engineer' },
  { company: 'Atlassian',     query: 'site:jobs.lever.co/atlassian engineer AI OR ML remote OR Bangalore 2025',                                 role: 'Software Engineer' },
  { company: 'Hasura',        query: 'site:jobs.lever.co/hasura engineer 2025 remote',                                                          role: 'Software Engineer' },
  { company: 'Krutrim',       query: 'krutrim AI jobs engineer 2025 Bangalore',                                                                 role: 'AI Engineer' },
  { company: 'Exotel',        query: 'site:jobs.lever.co/exotel OR exotel careers engineer AI OR GenAI 2025',                                   role: 'GenAI Engineer' },
  { company: 'Haptik',        query: 'haptik careers engineer AI OR NLP 2025',                                                                  role: 'AI Engineer' },
  { company: 'Vernacular.ai', query: 'vernacular.ai careers engineer 2025',                                                                     role: 'AI Engineer' },
];

// Title filter — only process relevant roles
const TITLE_POSITIVE = ['ai', 'ml', 'machine learning', 'llm', 'genai', 'generative', 'nlp', 'software engineer', 'sde', 'backend', 'full stack', 'platform', 'data scientist'];
const TITLE_NEGATIVE = ['.net', 'ios', 'android', 'php', 'embedded', 'mainframe', 'blockchain', '10+ years', '15+ years', 'senior principal', 'director', 'vp of'];

function isRelevantTitle(title) {
  const t = title.toLowerCase();
  if (TITLE_NEGATIVE.some(n => t.includes(n))) return false;
  return TITLE_POSITIVE.some(p => t.includes(p));
}

// ── Evaluate JD and decide ─────────────────────────────────────────────────
async function evaluateJob(jdText, company, role) {
  const cvText = existsSync(join(ROOT, 'cv.md')) ? readFileSync(join(ROOT, 'cv.md'), 'utf-8') : '';
  const profileYml = existsSync(join(ROOT, 'config/profile.yml')) ? readFileSync(join(ROOT, 'config/profile.yml'), 'utf-8') : '';

  const report = await evaluate(jdText, cvText, profileYml);
  const scoreMatch = report.match(/Global Score[:\s]*(\d+\.?\d*)\/5/i)
    || report.match(/(\d+\.?\d*)\/5/);
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;

  return { score, report };
}

// ── Save JD file ───────────────────────────────────────────────────────────
function saveJD(company, jdText) {
  const dir = join(ROOT, 'jds', 'auto');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const slug  = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const date  = new Date().toISOString().split('T')[0];
  const fname = join(dir, `${slug}-${date}.txt`);
  writeFileSync(fname, jdText);
  return fname;
}

// ── Append to tracker ──────────────────────────────────────────────────────
function appendToTracker(company, role, score, status, jdUrl) {
  const trackerDir = join(ROOT, 'batch', 'tracker-additions');
  if (!existsSync(trackerDir)) mkdirSync(trackerDir, { recursive: true });

  const existing = readdirSync(trackerDir).filter(f => f.endsWith('.tsv'));
  const num = existing.length + 1;
  const numStr = String(num).padStart(3, '0');
  const date  = new Date().toISOString().split('T')[0];
  const slug  = company.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + role.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const fname = join(trackerDir, `${numStr}-${slug}.tsv`);

  const row = [num, date, company, role, status, `${score}/5`, '', '', `Auto-scanned. ${jdUrl}`].join('\t');
  writeFileSync(fname, row + '\n');
}

// ── Main pipeline run ──────────────────────────────────────────────────────
async function runPipeline() {
  const runTime = new Date().toISOString();
  log.info('Pipeline run started', { time: runTime });
  const timer = log.time('pipeline-run');

  const seen = loadSeen();
  const results = { scanned: 0, evaluated: 0, highScore: [], skipped: 0, errors: 0 };

  // Start notification
  await notify([
    `🔍 *Auto-Pipeline Started*`,
    `⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    `Scanning ${GREENHOUSE_BOARDS.length + SEARCH_COMPANIES.length} companies…`,
  ].join('\n'));

  // ── Phase 1: Greenhouse API jobs ──
  log.info('Scanning Greenhouse boards…');
  for (const { company, slug } of GREENHOUSE_BOARDS) {
    try {
      const jobs = await fetchGreenhouseJobs(slug);
      for (const job of jobs) {
        results.scanned++;
        const key = `${company}:${job.url}`;
        if (seen.has(key) || !isRelevantTitle(job.title)) { results.skipped++; continue; }
        seen.add(key);

        log.info('Found relevant job', { company, title: job.title });
        await processJob(company, job.title, job.content || `${job.title} at ${company}`, job.url, results);
        await new Promise(r => setTimeout(r, 2000)); // rate limit
      }
    } catch (e) { log.error('Greenhouse scan failed', { company, err: e.message }); results.errors++; }
  }

  // ── Phase 2: Web search companies ──
  log.info('Searching web for jobs…');
  for (const { company, query, role } of SEARCH_COMPANIES) {
    try {
      const found = await searchJobs(query, 3);
      for (const item of found) {
        results.scanned++;
        const key = `${company}:${item.url}`;
        if (seen.has(key) || !isRelevantTitle(item.title || role)) { results.skipped++; continue; }
        seen.add(key);

        log.info('Found via search', { company, title: item.title?.slice(0, 60), url: item.url });

        // Fetch full JD content
        const content = await fetchJobContent(item.url);
        if (!content || content.length < 200) { results.skipped++; continue; }

        await processJob(company, item.title || role, content, item.url, results);
        await new Promise(r => setTimeout(r, 3000)); // respectful rate limiting
      }
    } catch (e) { log.error('Web search failed', { company, err: e.message }); results.errors++; }
  }

  saveSeen(seen);
  timer.done('Pipeline run complete', results);

  // Final digest
  const digest = [
    `📊 *Auto-Pipeline Complete*`,
    `⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    ``,
    `Scanned: ${results.scanned} jobs`,
    `Evaluated: ${results.evaluated} jobs`,
    `High-score (≥3.5): ${results.highScore.length}`,
    `Skipped: ${results.skipped}`,
    ``,
    results.highScore.length > 0
      ? `🎯 *Top Matches:*\n${results.highScore.map(h => `• ${h.company} — ${h.role} (${h.score}/5)`).join('\n')}`
      : '😴 No new high-score matches this run.',
    ``,
    `Next run in ~6 hours.`,
  ].join('\n');

  await notify(digest);
  return results;
}

async function processJob(company, title, jdText, url, results) {
  try {
    log.info('Evaluating', { company, title: title.slice(0, 50) });
    const { score, report } = await evaluateJob(jdText, company, title);
    results.evaluated++;

    log.info('Score', { company, score });

    if (score >= 3.5) {
      results.highScore.push({ company, role: title, score });

      // Save JD
      const jdFile = saveJD(company, jdText);

      // Append to tracker
      appendToTracker(company, title, score, 'Evaluated', url);

      // Notify immediately for high-score match
      await notify([
        `🎯 *High-Score Match Found!*`,
        `*Company:* ${company}`,
        `*Role:* ${title}`,
        `*Score:* ${score}/5`,
        `*JD URL:* ${url}`,
        ``,
        score >= 4.0
          ? `✅ *Strong match* — Resume being tailored now…`
          : `⚡ *Decent match* — Consider applying`,
      ].join('\n'));

      // Auto-tailor LaTeX resume for matches >= 3.5
      if (score >= 3.5) {
        try {
          log.info('Auto-tailoring LaTeX resume…', { company, score });
          const { spawnSync } = await import('child_process');
          const result = spawnSync('node', ['services/latex-resume.mjs', jdFile, company, title], {
            cwd: ROOT, encoding: 'utf-8', timeout: 120000,
            env: { ...process.env },
          });
          if (result.status === 0) {
            log.info('LaTeX resume tailored', { company });
          } else {
            log.warn('LaTeX tailor failed', { stderr: result.stderr?.slice(0, 200) });
          }
        } catch (e) { log.warn('LaTeX tailor error', { err: e.message }); }

        // Auto-apply if enabled
        const { existsSync: fileExists } = await import('fs');
        const { join: joinPath } = await import('path');
        const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const date = new Date().toISOString().split('T')[0];
        const pdfPath = joinPath(ROOT, 'resumes', 'latex', `${slug}-${date}.pdf`);
        let applied = false;

        if (process.env.AUTO_APPLY_ENABLED === 'true' && fileExists(pdfPath)) {
          try {
            const { tryAutoApply } = await import('./auto-apply.mjs');
            const ar = await tryAutoApply({ url, pdfPath });
            if (ar.ok && !ar.dryRun) {
              applied = true;
              log.info('Auto-applied successfully', { company, ats: ar.ats, tried: ar.tried });
              await notify([
                `✅ *Auto-Applied!*`,
                `*Company:* ${company}`,
                `*Role:* ${title}`,
                `*ATS:* ${ar.ats || 'generic'}`,
                `*Score:* ${score}/5`,
              ].join('\n'));
            }
          } catch (e) {
            log.warn('Auto-apply failed', { company, err: e.message });
          }
        }

        // Upload artifacts to Azure Blob Storage
        try {
          const { uploadJobArtifacts } = await import('./lib/azure-storage.mjs');
          await uploadJobArtifacts({ company, role: title, pdfPath: fileExists(pdfPath) ? pdfPath : null });
        } catch (e) { log.debug('Azure upload skipped', { err: e.message }); }

        if (!applied && score >= 3.0) {
          try {
            let coverLetterPath = null;
            try {
              const { generateCoverLetter } = await import('./cover-letter.mjs');
              const clResult = await generateCoverLetter(jdText, company, title, '');
              if (clResult.success && clResult.pdfPath) {
                coverLetterPath = clResult.pdfPath;
                try {
                  const { uploadToBlob } = await import('./lib/azure-storage.mjs');
                  const clSlug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                  const clDate = new Date().toISOString().split('T')[0];
                  await uploadToBlob(coverLetterPath, `cover-letters/${clDate}/${clSlug}`);
                } catch (_) {}
              }
            } catch (e) { log.warn('Cover letter generation failed', { err: e.message }); }

            const { sendJobPacket } = await import('./notifier.mjs');
            await sendJobPacket({
              company,
              role: title,
              score,
              url,
              jdText,
              pdfPath: fileExists(pdfPath) ? pdfPath : null,
              coverLetterPath,
              applyReason: `Score: ${score}/5. ${score >= 4.0 ? 'Excellent match — high priority!' : 'Good match — worth applying.'}`,
            });
          } catch (e) {
            log.warn('Job packet send failed', { company, err: e.message });
          }
        }
      }
    }
  } catch (e) {
    log.error('Job processing failed', { company, title: title.slice(0, 40), err: e.message });
    results.errors++;
  }
}

// ── Entry point ────────────────────────────────────────────────────────────
async function main() {
  const loop = process.argv.includes('--loop');
  const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  if (loop) {
    log.info('Starting 6-hour loop pipeline');
    // Run immediately, then every 6 hours
    while (true) {
      try { await runPipeline(); }
      catch (e) { log.error('Pipeline run failed', { err: e.message }); }
      log.info(`Next run in 6 hours (${new Date(Date.now() + INTERVAL_MS).toISOString()})`);
      await new Promise(r => setTimeout(r, INTERVAL_MS));
    }
  } else {
    await runPipeline();
  }
}

main().catch(e => { log.error('Fatal', { err: e.message }); process.exit(1); });
