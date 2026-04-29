#!/usr/bin/env node
/**
 * Notification Service — HireForge
 * Sends alerts via Telegram (primary) + WhatsApp Twilio sandbox (secondary).
 *
 * WhatsApp setup (one-time, free sandbox):
 *   1. Sign up at https://www.twilio.com (free trial)
 *   2. Go to Messaging → Try it out → Send a WhatsApp message
 *   3. Send "join <your-code>" to +14155238886 on WhatsApp
 *   4. Copy Account SID + Auth Token from console.twilio.com
 *   5. Add to .env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_TO
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('notifier');
const ROOT = resolve(process.cwd());

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

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';
const TWILIO_SID         = process.env.TWILIO_ACCOUNT_SID  || '';
const TWILIO_TOKEN       = process.env.TWILIO_AUTH_TOKEN   || '';
const TWILIO_WA_TO       = process.env.TWILIO_WHATSAPP_TO  || '';
const STATE_FILE         = join(ROOT, 'data', '.notifier-state.json');

// ── State ──────────────────────────────────────────────────────────────────
function loadState() {
  if (!existsSync(STATE_FILE)) return { lastSeen: {} };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { lastSeen: {} }; }
}
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

// ── Parsers ────────────────────────────────────────────────────────────────
function parseTracker() {
  const p = join(ROOT, 'data', 'applications.md');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8')
    .split('\n').filter(l => l.startsWith('|')).slice(2)
    .map(l => {
      const c = l.split('|').map(x => x.trim()).filter(Boolean);
      if (c.length < 9) return null;
      return { id: c[0], date: c[1], company: c[2], role: c[3], score: c[4], status: c[5], notes: c[8] || '' };
    }).filter(Boolean);
}
function parsePendingAdditions() {
  const dir = join(ROOT, 'batch', 'tracker-additions');
  if (!existsSync(dir)) return [];
  const apps = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.tsv'))) {
    const content = readFileSync(join(dir, f), 'utf-8').trim();
    for (const line of content.split('\n')) {
      const c = line.split('\t');
      if (c.length < 9) continue;
      apps.push({ id: c[0], date: c[1], company: c[2], role: c[3], status: c[4], score: c[5], notes: c[8] || '' });
    }
  }
  return apps;
}

// ── Telegram ───────────────────────────────────────────────────────────────
async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log.warn('Telegram not configured — dry run', { message: message.slice(0, 60) });
    return false;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message.replace(/\*/g, '').replace(/_/g, ''), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    if (d.ok) { log.info('Telegram sent'); return true; }
    log.error('Telegram API error', { desc: d.description });
    return false;
  } catch (e) {
    log.error('Telegram fetch failed', { err: e.message });
    return false;
  }
}

// ── WhatsApp (Twilio sandbox) ──────────────────────────────────────────────
async function sendWhatsApp(message) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WA_TO) {
    log.debug('WhatsApp Twilio not configured — skipping');
    return false;
  }
  // Strip markdown bold (*text*) for WhatsApp plain text
  const plain = message.replace(/\*/g, '');
  const from  = 'whatsapp:+14155238886';
  const to    = `whatsapp:${TWILIO_WA_TO.startsWith('+') ? TWILIO_WA_TO : '+' + TWILIO_WA_TO}`;
  const url   = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;

  const body  = new URLSearchParams({ From: from, To: to, Body: plain });
  const creds = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    if (d.sid) { log.info('WhatsApp sent', { sid: d.sid }); return true; }
    log.error('WhatsApp Twilio error', { code: d.code, msg: d.message });
    return false;
  } catch (e) {
    log.error('WhatsApp fetch failed', { err: e.message });
    return false;
  }
}

// ── Email (Gmail SMTP) ──────────────────────────────────────────────────────
const GMAIL_USER    = process.env.GMAIL_USER    || '';
const GMAIL_APP_PWD = process.env.GMAIL_APP_PWD || '';
const NOTIFY_EMAIL  = process.env.NOTIFY_EMAIL  || GMAIL_USER;

async function sendEmail(message) {
  if (!GMAIL_USER || !GMAIL_APP_PWD) return false;
  try {
    const { createTransport } = await import('nodemailer');
    const transport = createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PWD },
    });
    const subject = (message.match(/\*([^*]+)\*/) || [])[1]?.replace(/[*_]/g, '') || 'HireForge notification';
    const plain = message.replace(/\*/g, '').replace(/#+ /g, '');
    await transport.sendMail({
      from: `"HireForge" <${GMAIL_USER}>`,
      to: NOTIFY_EMAIL,
      subject: `[HireForge] ${subject}`,
      text: plain,
    });
    log.info('Email sent', { to: NOTIFY_EMAIL });
    return true;
  } catch (e) {
    log.error('Email send failed', { err: e.message });
    return false;
  }
}

async function sendTelegramDocument(filePath, caption = '') {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log.warn('Telegram not configured — skipping document send');
    return false;
  }
  try {
    const { createReadStream } = await import('fs');
    const { basename } = await import('path');

    const formParts = [];
    const boundary = '----HireForge' + Date.now();

    const addField = (name, value) => {
      formParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    };
    addField('chat_id', TELEGRAM_CHAT_ID);
    if (caption) addField('caption', caption.replace(/\*/g, '').replace(/_/g, ''));

    const fileData = readFileSync(filePath);
    const fileName = basename(filePath);
    formParts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`
    );

    const header = Buffer.from(formParts.join(''));
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileData, footer]);

    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(30000),
    });
    const d = await r.json();
    if (d.ok) { log.info('Telegram document sent', { file: fileName }); return true; }
    log.error('Telegram document API error', { desc: d.description });
    return false;
  } catch (e) {
    log.error('Telegram document send failed', { err: e.message });
    return false;
  }
}

async function sendJobPacket({ company, role, score, url, jdText, pdfPath, coverLetterPath, applyReason, applicationQuestions }) {
  const lines = [
    `🎯 MANUAL APPLICATION NEEDED`,
    ``,
    `Company: ${company}`,
    `Role: ${role}`,
    `Score: ${score}/5`,
    ``,
    `APPLY HERE: ${url}`,
    ``,
    `--- WHY YOU SHOULD APPLY ---`,
    applyReason || `Strong match at ${score}/5. Worth applying.`,
    ``,
  ];

  if (applicationQuestions && applicationQuestions.length > 0) {
    lines.push(`--- APPLICATION QUESTIONS ---`);
    for (const qa of applicationQuestions) {
      lines.push(`Q: ${qa.question}`);
      lines.push(`A: ${qa.answer}`);
      lines.push(``);
    }
  }

  lines.push(`--- JOB DESCRIPTION ---`);
  lines.push(jdText?.slice(0, 3000) || 'No JD text available');

  const message = lines.join('\n');

  await sendTelegram(message);

  if (pdfPath && existsSync(pdfPath)) {
    await sendTelegramDocument(pdfPath, `Resume for ${company} - ${role}`);
  }
  if (coverLetterPath && existsSync(coverLetterPath)) {
    await sendTelegramDocument(coverLetterPath, `Cover Letter for ${company} - ${role}`);
  }

  log.info('Job packet sent to Telegram', { company, role });
}

async function sendAll(message) {
  const t = sendTelegram(message);
  const w = sendWhatsApp(message);
  const e = sendEmail(message);
  await Promise.all([t, w, e]);
}

// ── getChatId helper ───────────────────────────────────────────────────────
async function getChatId() {
  if (!TELEGRAM_BOT_TOKEN) { log.error('TELEGRAM_BOT_TOKEN not set'); process.exit(1); }
  log.info('Fetching Telegram updates…');
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
  const d = await r.json();
  if (!d.ok || !d.result.length) {
    log.warn('No messages found. Open Telegram, find your bot, and send it any message first.');
    return;
  }
  const chatId = d.result[0].message?.chat?.id;
  const name   = d.result[0].message?.chat?.first_name || 'you';
  log.info(`Found chat with ${name}`);
  console.log(`\nAdd this to your .env:\nTELEGRAM_CHAT_ID=${chatId}\n`);
}

// ── Status change checker ──────────────────────────────────────────────────
async function checkForUpdates() {
  log.info('Checking for application status changes…');
  const timer = log.time('check');
  const state = loadState();
  const apps  = dedup([...parseTracker(), ...parsePendingAdditions()]);
  let changes = 0;

  for (const app of apps) {
    const key  = `${app.company}-${app.role}`;
    const prev = state.lastSeen[key];

    if (!prev) {
      state.lastSeen[key] = app.status;
      if (app.status !== 'Evaluated') {
        await sendAll(`📋 *New Application*\n*Company:* ${app.company}\n*Role:* ${app.role}\n*Status:* ${app.status}\n*Score:* ${app.score}`);
        changes++;
      }
    } else if (prev !== app.status) {
      state.lastSeen[key] = app.status;
      changes++;
      log.info('Status changed', { company: app.company, from: prev, to: app.status });

      if (app.status === 'Interview') {
        await sendAll(`🎯 *Interview Scheduled!*\n*Company:* ${app.company}\n*Role:* ${app.role}\n*Score:* ${app.score}\n\nPrep roadmap is being generated. Check the dashboard.`);
      } else if (app.status === 'Offer') {
        await sendAll(`🎉 *Offer Received!*\n*Company:* ${app.company}\n*Role:* ${app.role}\n\nReview offer details in the dashboard.`);
      } else if (app.status === 'Rejected') {
        await sendAll(`❌ *Application Update*\n*Company:* ${app.company}\n*Role:* ${app.role}\nStatus: Rejected\n\nMore applications in the pipeline.`);
      } else {
        await sendAll(`📊 *Status Update*\n*Company:* ${app.company}\n*Role:* ${app.role}\n${prev} → ${app.status}`);
      }
    }
  }

  saveState(state);
  timer.done('Check complete', { changes });
  return changes > 0;
}

function dedup(apps) {
  const seen = new Set();
  return apps.filter(a => { const k = `${a.company}-${a.role}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ── Daily digest ──────────────────────────────────────────────────────────
async function sendDailyDigest() {
  log.info('Sending daily digest…');
  const apps   = dedup([...parseTracker(), ...parsePendingAdditions()]);
  const today  = new Date().toISOString().split('T')[0];
  const weekAgo= new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const msg = [
    `📊 *Daily Digest — ${today}*`, ``,
    `Total tracked: ${apps.length}`,
    `This week: ${apps.filter(a => a.date >= weekAgo).length} new`,
    `Today: ${apps.filter(a => a.date === today).length} new`, ``,
    `🎯 Active interviews: ${apps.filter(a => a.status === 'Interview').length}`,
    `🎉 Offers: ${apps.filter(a => a.status === 'Offer').length}`,
    apps.filter(a => a.status === 'Interview').length > 0
      ? `\nUpcoming: ${apps.filter(a => a.status === 'Interview').map(a => `${a.company} (${a.role})`).join(', ')}`
      : '\nNo upcoming interviews yet.',
  ].join('\n');

  await sendAll(msg);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const cmd = process.argv[2] || 'check';
  switch (cmd) {
    case 'getchatid': await getChatId(); break;
    case 'check': {
      const changed = await checkForUpdates();
      log.info(changed ? 'Notifications sent.' : 'No changes detected.');
      break;
    }
    case 'digest': await sendDailyDigest(); break;
    case 'test':
      log.info('Sending test notification…');
      await sendAll(`✅ *HireForge test*\nNotifications working!\nTelegram ✓${TWILIO_SID ? ' | WhatsApp ✓' : ''}`);
      break;
    default:
      console.log('Usage: node services/notifier.mjs [check|digest|test|getchatid]');
  }
}

export { sendTelegram, sendTelegramDocument, sendJobPacket, sendWhatsApp, sendEmail, sendAll, checkForUpdates, sendDailyDigest };

if (process.argv[1]?.endsWith('notifier.mjs')) {
  main().catch(e => { log.error('Fatal', { err: e.message }); process.exit(1); });
}
