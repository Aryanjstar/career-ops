#!/usr/bin/env node
/**
 * Lightweight API server for the dashboard.
 * Serves application tracker data from local files as JSON.
 * Runs alongside the mega-scraper in the container.
 *
 * Endpoints:
 *   GET /api/applications  — tracker data + stats
 *   GET /api/health        — health check
 *   GET /api/pipeline      — pipeline pending count
 *   GET /api/cold-emails   — latest cold-email drafts as JSON
 *   POST /api/resume/tailor — tailor resume from JD (JSON body)
 *   GET /api/resume/download/:filename — PDF from resumes/latex/
 *   GET /api/interviews    — data/interviews.json
 *   GET /api/company-research/:slug — company research JSON
 */

import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';
import { createLogger } from './lib/logger.mjs';
import { fetchTrackerFromGitHub } from './lib/tracker-github.mjs';
import { generateLatexResume, compilePDF } from './latex-resume.mjs';
import { generateCoverLetter } from './cover-letter.mjs';

const log = createLogger('api-server');
const ROOT = resolve(process.cwd());
const PORT = parseInt(process.env.PORT || '3001', 10);

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

function parseTracker() {
  const path = join(ROOT, 'data', 'applications.md');
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf-8');
  const lines = content.split('\n').filter(l => l.startsWith('|'));
  if (lines.length < 3) return [];

  return lines.slice(2).map(line => {
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 6) return null;
    return {
      id: parseInt(cols[0], 10) || 0,
      date: cols[1] || '',
      company: cols[2] || '',
      role: cols[3] || '',
      score: cols[4] || '',
      status: cols[5] || '',
      pdf: cols[6] || '',
      report: cols[7] || '',
      notes: cols[8] || '',
    };
  }).filter(Boolean);
}

function parsePending() {
  const dir = join(ROOT, 'batch', 'tracker-additions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.tsv')).map(f => {
    const content = readFileSync(join(dir, f), 'utf-8').trim();
    if (!content) return null;
    const cols = content.split('\t');
    if (cols.length < 6) return null;
    return {
      id: parseInt(cols[0], 10) || 0,
      date: cols[1] || '',
      company: cols[2] || '',
      role: cols[3] || '',
      status: cols[4] || '',
      score: cols[5] || '',
      notes: cols[8] || '',
    };
  }).filter(Boolean);
}

function parseScoreNum(score) {
  const m = String(score || '').match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : NaN;
}

/** Prefer latest row per company+role (so status updates / auto-apply rows win). */
function mergeLatestApps(all) {
  const map = new Map();
  for (const a of all) {
    const k = `${a.company}|||${a.role}`;
    const prev = map.get(k);
    if (!prev || (a.id || 0) > (prev.id || 0)) map.set(k, a);
  }
  return [...map.values()].sort((x, y) => (y.id || 0) - (x.id || 0));
}

function getStats(apps) {
  const total = apps.length;
  const byStatus = {};
  let totalScore = 0, scoredCount = 0;
  for (const app of apps) {
    byStatus[app.status] = (byStatus[app.status] || 0) + 1;
    const n = parseScoreNum(app.score);
    if (!isNaN(n)) { totalScore += n; scoredCount++; }
  }
  return {
    total, byStatus,
    avgScore: scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : '0.0',
    applied: byStatus['Applied'] || 0,
    interviews: byStatus['Interview'] || 0,
    offers: byStatus['Offer'] || 0,
    rejected: byStatus['Rejected'] || 0,
    evaluated: byStatus['Evaluated'] || 0,
  };
}

function getPipelineCount() {
  const path = join(ROOT, 'data', 'pipeline.md');
  if (!existsSync(path)) return 0;
  const content = readFileSync(path, 'utf-8');
  return (content.match(/- \[ \]/g) || []).length;
}

function parseScanHistory(limit = 40) {
  const path = join(ROOT, 'data', 'scan-history.tsv');
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').trim().split('\n');
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = lines.length - 1; i >= 1 && rows.length < limit; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 6) continue;
    rows.push({
      url: cols[0] || '',
      first_seen: cols[1] || '',
      source: cols[2] || '',
      title: cols[3] || '',
      company: cols[4] || '',
      status: cols[5] || '',
    });
  }
  return rows;
}

function readPipelineSnippet(maxChars = 6000) {
  const path = join(ROOT, 'data', 'pipeline.md');
  if (!existsSync(path)) return '';
  const content = readFileSync(path, 'utf-8');
  return content.length > maxChars ? content.slice(0, maxChars) + '\n\n…' : content;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function getMostRecentColdEmailMd() {
  const dir = join(ROOT, 'data', 'cold-emails');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  if (files.length === 0) return null;
  let best = null;
  let bestTime = 0;
  for (const f of files) {
    const p = join(dir, f);
    const t = statSync(p).mtimeMs;
    if (t >= bestTime) {
      bestTime = t;
      best = f;
    }
  }
  const date = best.replace(/\.md$/i, '');
  return { path: join(dir, best), date };
}

function parseColdEmailSection(sectionMd, index, dateStr) {
  const heading = (sectionMd.match(/^##\s+(.+)/m) || [])[1]?.trim() || '';
  const to = (sectionMd.match(/^\*\*To:\*\*\s*(.+)$/m) || [])[1]?.trim() || '';
  const subject = (sectionMd.match(/^\*\*Subject:\*\*\s*(.+)$/m) || [])[1]?.trim() || '';
  const rawStatus = (sectionMd.match(/^\*\*Status:\*\*\s*(.+)$/m) || [])[1]?.trim() || 'draft';
  let body = '';
  const lines = sectionMd.split('\n');
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('**Subject:**')) {
      i++;
      while (i < lines.length && lines[i].trim() === '') i++;
      const bodyLines = [];
      while (i < lines.length && lines[i].trim() !== '---') {
        bodyLines.push(lines[i]);
        i++;
      }
      body = bodyLines.join('\n').trim();
      break;
    }
    i++;
  }
  const emailMatch = to.match(/[\w.+-]+@[\w.-]+\.\w+/);
  const email = emailMatch ? emailMatch[0] : to;
  const contactName = to.replace(/<.*>/, '').replace(/[\w.+-]+@[\w.-]+\.\w+/, '').trim() || heading.split('—')[0]?.trim() || 'Unknown';
  const company = heading.replace(/^.*?—\s*/, '').trim() || heading.trim() || 'Unknown';
  return {
    id: index,
    company,
    contactName,
    contactTitle: '',
    email,
    subject,
    body,
    status: rawStatus.toLowerCase(),
    date: dateStr || '',
    heading,
  };
}

function parseColdEmailsMarkdown(content, dateStr) {
  const emails = [];
  const parts = content.split(/\n(?=##\s)/);
  let idx = 0;
  for (const part of parts) {
    const t = part.trim();
    if (!t.startsWith('##')) continue;
    emails.push(parseColdEmailSection(t, idx++, dateStr));
  }
  return { emails, date: dateStr };
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/api/resume/tailor') {
    (async () => {
      try {
        const body = await readJsonBody(req);
        const jd = body.jd;
        const company = body.company;
        const role = body.role || 'Software Engineer';
        if (!jd || typeof jd !== 'string' || !company || typeof company !== 'string') {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'jd and company are required' }));
          return;
        }
        const { buildDir, slug, date, keywords, showCGPA } = await generateLatexResume(jd, company, role);
        const pdfResult = await compilePDF(buildDir, slug, date);
        const relBuild = relative(ROOT, buildDir).replace(/\\/g, '/');
        const pdfName = `${slug}-${date}.pdf`;
        if (!pdfResult) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: 'PDF compilation failed — LaTeX source generated but tectonic could not compile it', buildDir: relBuild, keywords, showCGPA }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          pdfUrl: `/api/resume/download/${pdfName}`,
          keywords,
          showCGPA,
          buildDir: relBuild,
        }));
      } catch (e) {
        if (e instanceof SyntaxError) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Invalid JSON body' }));
          return;
        }
        log.warn('resume tailor failed', { err: e.message });
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message || String(e) }));
      }
    })();
    return;
  }

  const downloadMatch = url.pathname.match(/^\/api\/resume\/download\/([^/]+)$/);
  if (req.method === 'GET' && downloadMatch) {
    const filename = downloadMatch[1];
    if (!/^[a-zA-Z0-9._-]+\.pdf$/.test(filename)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid filename' }));
      return;
    }
    const pdfPath = join(ROOT, 'resumes', 'latex', filename);
    if (!existsSync(pdfPath)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.writeHead(200);
    res.end(readFileSync(pdfPath));
    return;
  }

  const companyResearchMatch = url.pathname.match(/^\/api\/company-research\/([^/]+)$/);
  if (req.method === 'GET' && companyResearchMatch) {
    const slug = companyResearchMatch[1];
    if (!/^[a-zA-Z0-9._-]+$/.test(slug)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid slug' }));
      return;
    }
    const crPath = join(ROOT, 'data', 'company-research', `${slug}.json`);
    if (!existsSync(crPath)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(200);
    res.end(readFileSync(crPath, 'utf-8'));
    return;
  }

  if (url.pathname === '/api/status') {
    const trackerPath = join(ROOT, 'data', 'applications.md');
    const pipelinePath = join(ROOT, 'data', 'pipeline.md');
    const seenPath = join(ROOT, 'data', '.mega-seen.json');
    const logPath = join(ROOT, 'logs', 'HireForge.log');

    const lastScrape = existsSync(seenPath)
      ? new Date(statSync(seenPath).mtime).toISOString()
      : null;
    const lastLog = existsSync(logPath)
      ? new Date(statSync(logPath).mtime).toISOString()
      : null;

    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'running',
      time: new Date().toISOString(),
      autoApply: process.env.AUTO_APPLY_ENABLED === 'true',
      lastScrape,
      lastLog,
      dataFiles: {
        tracker: existsSync(trackerPath),
        pipeline: existsSync(pipelinePath),
        seenCache: existsSync(seenPath),
      },
    }));
  } else if (url.pathname === '/api/applications') {
    const tracked = parseTracker();
    const pending = parsePending();
    const apps = mergeLatestApps([...tracked, ...pending]);
    const stats = getStats(apps);
    const scanHistory = parseScanHistory(50);
    const pipelinePending = getPipelineCount();
    const pipelineMarkdown = readPipelineSnippet(8000);
    res.writeHead(200);
    res.end(JSON.stringify({
      apps,
      stats,
      scanHistory,
      pipeline: { pending: pipelinePending, markdown: pipelineMarkdown },
    }));
  } else if (url.pathname === '/api/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
  } else if (url.pathname === '/api/cold-emails') {
    const latest = getMostRecentColdEmailMd();
    if (!latest) {
      res.writeHead(200);
      res.end(JSON.stringify({ emails: [], date: null }));
    } else {
      const content = readFileSync(latest.path, 'utf-8');
      const parsed = parseColdEmailsMarkdown(content, latest.date);
      res.writeHead(200);
      res.end(JSON.stringify(parsed));
    }
  } else if (url.pathname === '/api/interviews') {
    const interviewsPath = join(ROOT, 'data', 'interviews.json');
    if (!existsSync(interviewsPath)) {
      res.writeHead(200);
      res.end(JSON.stringify({ interviews: [] }));
    } else {
      try {
        const data = JSON.parse(readFileSync(interviewsPath, 'utf-8'));
        res.writeHead(200);
        res.end(JSON.stringify(data));
      } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ interviews: [] }));
      }
    }
  } else if (url.pathname === '/api/pipeline') {
    res.writeHead(200);
    res.end(JSON.stringify({ pending: getPipelineCount() }));
  } else if (url.pathname === '/api/test-notify') {
    const tracked = parseTracker();
    const applied = tracked.filter(a => a.status === 'Applied');
    const msg = [
      `HireForge Notification Test`,
      `System is LIVE and running.`,
      `Total tracked: ${tracked.length}`,
      `Applied: ${applied.length}`,
      applied.length > 0 ? `Latest: ${applied.slice(0, 3).map(a => `${a.company}`).join(', ')}` : '',
      new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    ].filter(Boolean).join('\n');
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (token && chatId) {
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(15000),
      }).then(r => r.json()).then(d => log.info('Test notify telegram', { ok: d.ok })).catch(() => {});
    }
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, message: 'Notification dispatched' }));
    return;
  } else if (req.method === 'GET' && url.pathname === '/api/test-telegram') {
    (async () => {
      try {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (!token || !chatId) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set' }));
          return;
        }
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: 'HireForge: Telegram test from Azure Container App', disable_web_page_preview: true }),
          signal: AbortSignal.timeout(15000),
        });
        const d = await r.json();
        res.writeHead(200);
        res.end(JSON.stringify({ success: d.ok, telegramResponse: d }));
      } catch (e) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    })();
    return;
  } else if (req.method === 'POST' && url.pathname === '/api/cover-letter/generate') {
    (async () => {
      try {
        const body = await readJsonBody(req);
        const jd = body.jd;
        const company = body.company;
        const role = body.role || 'Software Engineer';
        const team = body.team || '';
        if (!jd || typeof jd !== 'string' || !company || typeof company !== 'string') {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'jd and company are required' }));
          return;
        }
        const result = await generateCoverLetter(jd, company, role, team);
        if (!result.success) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: 'Cover letter PDF compilation failed', buildDir: result.buildDir }));
          return;
        }
        const pdfName = `${result.slug}-${result.date}.pdf`;
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          pdfUrl: `/api/cover-letter/download/${pdfName}`,
          paragraphSummary: result.paragraphSummary,
        }));
      } catch (e) {
        log.error('Cover letter generation failed', { err: e.message });
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    })();
    return;
  } else if (req.method === 'GET' && url.pathname.startsWith('/api/cover-letter/download/')) {
    const filename = url.pathname.split('/').pop();
    if (!/^[a-zA-Z0-9._-]+\.pdf$/.test(filename)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid filename' }));
      return;
    }
    const pdfPath = join(ROOT, 'resumes', 'cover-letters', filename);
    if (!existsSync(pdfPath)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.writeHead(200);
    res.end(readFileSync(pdfPath));
    return;
  } else if (req.method === 'GET' && url.pathname === '/api/profile') {
    try {
      const profileYmlPath = join(ROOT, 'config', 'profile.yml');
      const profileJsonPath = join(ROOT, 'data', 'profile-data.json');
      let profile = {};
      if (existsSync(profileJsonPath)) {
        try { profile = JSON.parse(readFileSync(profileJsonPath, 'utf-8')); } catch {}
      }
      if (existsSync(profileYmlPath)) {
        const yamlContent = readFileSync(profileYmlPath, 'utf-8');
        const nameMatch = yamlContent.match(/^\s*name:\s*(.+)$/m);
        const emailMatch = yamlContent.match(/^\s*email:\s*(.+)$/m);
        const locationMatch = yamlContent.match(/^\s*location:\s*(.+)$/m);
        const phoneMatch = yamlContent.match(/^\s*phone:\s*(.+)$/m);
        if (!profile.candidate) profile.candidate = {};
        if (nameMatch) profile.candidate.name = profile.candidate.name || nameMatch[1].trim().replace(/^["']|["']$/g, '');
        if (emailMatch) profile.candidate.email = profile.candidate.email || emailMatch[1].trim().replace(/^["']|["']$/g, '');
        if (locationMatch) profile.candidate.location = profile.candidate.location || locationMatch[1].trim().replace(/^["']|["']$/g, '');
        if (phoneMatch) profile.candidate.phone = profile.candidate.phone || phoneMatch[1].trim().replace(/^["']|["']$/g, '');
        const rolesMatch = yamlContent.match(/primary:\s*\n([\s\S]*?)(?=\n\s*\w|\n\s*$)/m);
        if (rolesMatch) {
          const roles = rolesMatch[1].match(/^\s*-\s*(.+)$/gm);
          if (roles) profile.targetRoles = roles.map(r => r.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''));
        }
      }
      const hasAzureOpenAI = !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY);
      const hasTelegram = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
      const hasCalendar = !!process.env.GOOGLE_CALENDAR_ID;
      profile.integrations = { azureOpenAI: hasAzureOpenAI, telegram: hasTelegram, calendar: hasCalendar };
      res.writeHead(200);
      res.end(JSON.stringify(profile));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  } else if (req.method === 'POST' && url.pathname === '/api/interviews/sync') {
    (async () => {
      try {
        const { syncFromTracker } = await import('./interview-tracker.mjs');
        await syncFromTracker();
        const interviewsPath = join(ROOT, 'data', 'interviews.json');
        const data = existsSync(interviewsPath) ? JSON.parse(readFileSync(interviewsPath, 'utf-8')) : { interviews: [] };
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, count: data.interviews.length, data }));
      } catch (e) {
        log.error('Interview sync failed', { err: e.message });
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    })();
    return;
  } else if (req.method === 'GET' && url.pathname.startsWith('/api/prep/')) {
    const slug = url.pathname.replace('/api/prep/', '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!slug) { res.writeHead(400); res.end(JSON.stringify({ error: 'slug required' })); return; }
    const prepDir = join(ROOT, 'prep');
    if (!existsSync(prepDir)) { res.writeHead(200); res.end(JSON.stringify({ content: null })); return; }
    const files = readdirSync(prepDir).filter(f => f.startsWith(slug) && f.endsWith('.md'));
    if (files.length === 0) { res.writeHead(200); res.end(JSON.stringify({ content: null })); return; }
    files.sort();
    const content = readFileSync(join(prepDir, files[files.length - 1]), 'utf-8');
    res.writeHead(200);
    res.end(JSON.stringify({ content, filename: files[files.length - 1] }));
    return;
  } else if (req.method === 'POST' && url.pathname === '/api/prep/generate') {
    (async () => {
      try {
        const body = await readJsonBody(req);
        const { company, role, days } = body;
        if (!company || !role) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'company and role are required' }));
          return;
        }
        const { spawn } = await import('child_process');
        const child = spawn('node', ['services/interview-prep.mjs', company, role, String(days || 7)], {
          cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env },
        });
        let stdout = '', stderr = '';
        child.stdout.on('data', d => stdout += d);
        child.stderr.on('data', d => stderr += d);
        child.on('close', code => {
          res.writeHead(code === 0 ? 200 : 500);
          res.end(JSON.stringify({ success: code === 0, stdout: stdout.slice(-500), stderr: stderr.slice(-500) }));
        });
        child.on('error', e => {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: e.message }));
        });
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    })();
    return;
  } else if (req.method === 'PATCH' && url.pathname === '/api/cold-emails/status') {
    (async () => {
      try {
        const body = await readJsonBody(req);
        const { heading, newStatus } = body;
        if (!heading || !newStatus) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'heading and newStatus are required' }));
          return;
        }
        const latest = getMostRecentColdEmailMd();
        if (!latest) {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, error: 'No cold email files found' }));
          return;
        }
        let content = readFileSync(latest.path, 'utf-8');
        const headingEscaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(##\\s+${headingEscaped}[\\s\\S]*?\\*\\*Status:\\*\\*\\s*)\\S+`, 'm');
        if (!regex.test(content)) {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, error: 'Could not find that email section' }));
          return;
        }
        content = content.replace(regex, `$1${newStatus}`);
        writeFileSync(latest.path, content);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    })();
    return;
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  }
});

server.listen(PORT, '0.0.0.0', async () => {
  log.info(`API server listening on port ${PORT}`);
  try {
    await fetchTrackerFromGitHub();
  } catch (e) {
    log.warn('GitHub tracker restore skipped', { err: e.message });
  }
});
