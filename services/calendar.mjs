#!/usr/bin/env node
/**
 * Google Calendar Integration for HireForge
 * 
 * Auto-creates calendar events when interviews are scheduled.
 * Uses Google Calendar API with OAuth2.
 * 
 * Setup:
 * 1. Create OAuth2 credentials at console.cloud.google.com
 * 2. Enable Google Calendar API
 * 3. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in .env
 * 4. Run: node services/calendar.mjs auth  (one-time OAuth flow)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

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

const CALENDAR_EMAIL = process.env.GOOGLE_CALENDAR_EMAIL || 'aryanjstar3@gmail.com';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const TOKEN_FILE = join(ROOT, 'data', '.calendar-token.json');
const STATE_FILE = join(ROOT, 'data', '.calendar-state.json');

function loadState() {
  if (!existsSync(STATE_FILE)) return { createdEvents: {} };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { createdEvents: {} };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function getAccessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return null;
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    console.error('Failed to refresh Google token:', await resp.text());
    return null;
  }

  const data = await resp.json();
  return data.access_token;
}

async function createCalendarEvent(event) {
  const token = await getAccessToken();
  if (!token) {
    console.log('[DRY RUN] Calendar event:', JSON.stringify(event, null, 2));
    console.log('Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in .env');
    return null;
  }

  const resp = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!resp.ok) {
    console.error('Calendar API error:', await resp.text());
    return null;
  }

  const data = await resp.json();
  console.log(`Calendar event created: ${data.htmlLink}`);
  return data;
}

function parseTracker() {
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

async function syncInterviews() {
  const state = loadState();
  const apps = parseTracker();
  const interviews = apps.filter(a => a.status === 'Interview');

  let created = 0;

  for (const app of interviews) {
    const key = `${app.company}-${app.role}`;
    if (state.createdEvents[key]) continue;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 3);
    startDate.setHours(10, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setHours(11, 0, 0, 0);

    const event = {
      summary: `Interview: ${app.company} — ${app.role}`,
      description: [
        `Company: ${app.company}`,
        `Role: ${app.role}`,
        `Score: ${app.score}`,
        ``,
        `Prep checklist:`,
        `- Review evaluation report`,
        `- Study company tech stack`,
        `- Prepare STAR stories`,
        `- Review common interview questions`,
        ``,
        `Notes: ${app.notes}`,
      ].join('\n'),
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 120 },
          { method: 'popup', minutes: 30 },
        ],
      },
      colorId: '9',
    };

    const result = await createCalendarEvent(event);
    if (result) {
      state.createdEvents[key] = {
        eventId: result.id,
        link: result.htmlLink,
        created: new Date().toISOString(),
      };
      created++;
    } else {
      state.createdEvents[key] = {
        eventId: 'dry-run',
        created: new Date().toISOString(),
      };
    }
  }

  saveState(state);
  return created;
}

async function startAuthFlow() {
  if (!CLIENT_ID) {
    console.log(`
Google Calendar Setup Instructions:
====================================
1. Go to https://console.cloud.google.com
2. Create a new project or select existing
3. Enable "Google Calendar API"
4. Go to APIs & Services > Credentials
5. Create OAuth 2.0 Client ID (Desktop app)
6. Add these to your .env file:

   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_CALENDAR_EMAIL=aryanjstar3@gmail.com

7. Run: node services/calendar.mjs auth
8. Follow the URL to authorize, paste the code back

This is a one-time setup. The refresh token persists.
`);
    return;
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${CLIENT_ID}&` +
    `redirect_uri=urn:ietf:wg:oauth:2.0:oob&` +
    `response_type=code&` +
    `scope=https://www.googleapis.com/auth/calendar.events&` +
    `access_type=offline&` +
    `prompt=consent`;

  console.log(`Open this URL in your browser:\n\n${authUrl}\n`);
  console.log('After authorizing, paste the code here:');

  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question('Code: ', async (code) => {
    rl.close();

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code.trim(),
        grant_type: 'authorization_code',
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      }),
    });

    if (!resp.ok) {
      console.error('Token exchange failed:', await resp.text());
      return;
    }

    const data = await resp.json();
    console.log(`\nAdd this to your .env file:\n`);
    console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
    console.log(`\nCalendar integration is now ready!`);
  });
}

async function main() {
  const cmd = process.argv[2] || 'sync';

  switch (cmd) {
    case 'sync':
      console.log('Syncing interviews to Google Calendar...');
      const count = await syncInterviews();
      console.log(`${count} new event(s) created.`);
      break;

    case 'auth':
      await startAuthFlow();
      break;

    case 'test':
      console.log('Creating test calendar event...');
      await createCalendarEvent({
        summary: 'HireForge Test Event',
        description: 'This is a test event from HireForge calendar integration.',
        start: {
          dateTime: new Date(Date.now() + 3600000).toISOString(),
          timeZone: 'Asia/Kolkata',
        },
        end: {
          dateTime: new Date(Date.now() + 7200000).toISOString(),
          timeZone: 'Asia/Kolkata',
        },
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 10 }],
        },
      });
      break;

    default:
      console.log('Usage: node services/calendar.mjs [sync|auth|test]');
  }
}

main().catch(err => {
  console.error('Calendar error:', err.message);
  process.exit(1);
});
