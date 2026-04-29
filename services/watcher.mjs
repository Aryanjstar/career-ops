#!/usr/bin/env node
/**
 * HireForge Automation Watcher
 * 
 * Runs every N minutes and:
 * 1. Checks for status changes → sends WhatsApp notifications
 * 2. Syncs interviews → creates Google Calendar events
 * 3. Generates interview prep for new interviews
 * 
 * Usage:
 *   node services/watcher.mjs           # Run once
 *   node services/watcher.mjs --loop    # Run every 15 minutes
 *   node services/watcher.mjs --loop 5  # Run every 5 minutes
 */

import { execSync } from 'child_process';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());
const args = process.argv.slice(2);
const isLoop = args.includes('--loop');
const intervalMinutes = parseInt(args[args.indexOf('--loop') + 1]) || 15;

function run(script, label) {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] Running: ${label}`);
    const output = execSync(`node ${script}`, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 120000,
    });
    if (output.trim()) console.log(output.trim());
  } catch (err) {
    console.error(`[${label}] Error: ${err.message}`);
  }
}

async function tick() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`HireForge watcher — ${new Date().toLocaleString()}`);
  console.log('='.repeat(50));

  run('services/notifier.mjs check', 'WhatsApp notifications');
  run('services/calendar.mjs sync', 'Google Calendar sync');
  run('services/interview-prep.mjs all', 'Interview prep generation');

  console.log(`\nNext check in ${intervalMinutes} minutes.`);
}

async function main() {
  if (isLoop) {
    console.log(`Starting HireForge watcher (every ${intervalMinutes} min)`);
    await tick();
    setInterval(tick, intervalMinutes * 60 * 1000);
  } else {
    await tick();
  }
}

main().catch(err => {
  console.error('Watcher error:', err.message);
  process.exit(1);
});
