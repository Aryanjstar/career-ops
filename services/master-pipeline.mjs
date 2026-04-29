#!/usr/bin/env node
/**
 * Master Pipeline Orchestrator — HireForge
 *
 * Single entry point that runs the FULL automation loop every 6 hours:
 *   1. Mega Scraper → discovers jobs from ATS APIs + web search
 *   2. Portal Scanner → scans portals.yml companies via Greenhouse/Lever/Ashby APIs
 *   3. Auto Pipeline → evaluates JDs, tailors resumes, auto-applies
 *   4. API Server → serves dashboard data
 *
 * Usage:
 *   node services/master-pipeline.mjs              # single run of full pipeline
 *   node services/master-pipeline.mjs --loop       # runs every 6 hours with API server
 *   node services/master-pipeline.mjs --api-only   # just start the API server
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { spawn, spawnSync } from 'child_process';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('master-pipeline');
const ROOT = resolve(process.cwd());
const INTERVAL_MS = 6 * 60 * 60 * 1000;

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function runScript(scriptPath, args = [], label = '', timeout = 600000) {
  return new Promise((resolve) => {
    log.info(`Starting: ${label || scriptPath}`, { args });
    const start = Date.now();
    const child = spawn('node', [scriptPath, ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
      timeout,
    });

    child.on('close', (code) => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      if (code === 0) {
        log.info(`Completed: ${label || scriptPath}`, { elapsed: `${elapsed}s` });
      } else {
        log.warn(`Exited with code ${code}: ${label || scriptPath}`, { elapsed: `${elapsed}s` });
      }
      resolve(code);
    });

    child.on('error', (err) => {
      log.error(`Failed to start: ${label || scriptPath}`, { err: err.message });
      resolve(1);
    });
  });
}

function startApiServer() {
  log.info('Starting API server in background…');
  const child = spawn('node', ['services/api-server.mjs'], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
    detached: false,
  });

  child.on('error', (err) => {
    log.error('API server failed', { err: err.message });
  });

  return child;
}

async function runFullPipeline() {
  const runTime = new Date();
  log.info('═══════════════════════════════════════════════════════');
  log.info('FULL PIPELINE RUN STARTED', { time: runTime.toISOString() });
  log.info('═══════════════════════════════════════════════════════');

  const results = { scan: null, scrape: null, pipeline: null, interviews: null, coldEmails: null };

  // Phase 1: Portal Scanner (fast, API-only, no AI tokens)
  log.info('Phase 1/5: Portal Scanner (Greenhouse/Lever/Ashby APIs)');
  results.scan = await runScript('scan.mjs', [], 'portal-scanner', 120000);

  // Phase 2: Mega Scraper (ATS + web search, evaluates with AI, auto-applies)
  log.info('Phase 2/5: Mega Scraper (ATS + web search + evaluate + auto-apply)');
  results.scrape = await runScript('services/mega-scraper.mjs', [], 'mega-scraper', 1800000);

  // Phase 3: Auto Pipeline (catches anything mega-scraper missed)
  log.info('Phase 3/5: Auto Pipeline (evaluate + tailor + auto-apply backfill)');
  results.pipeline = await runScript('services/auto-pipeline.mjs', [], 'auto-pipeline', 1200000);

  // Phase 4: Interview Tracker (sync from tracker, research companies with interviews)
  log.info('Phase 4/5: Interview Tracker + Company Research');
  results.interviews = await runScript('services/interview-tracker.mjs', [], 'interview-tracker', 300000);

  // Phase 5: Cold Email Pipeline (scrape contacts + generate emails)
  log.info('Phase 5/5: Cold Email Pipeline');
  results.coldEmails = await runScript('services/email-generator.mjs', [], 'cold-emails', 600000);

  const elapsed = ((Date.now() - runTime.getTime()) / 1000 / 60).toFixed(1);
  log.info('═══════════════════════════════════════════════════════');
  log.info('FULL PIPELINE RUN COMPLETE', {
    elapsed: `${elapsed} min`,
    scan: results.scan === 0 ? 'OK' : `exit ${results.scan}`,
    scrape: results.scrape === 0 ? 'OK' : `exit ${results.scrape}`,
    pipeline: results.pipeline === 0 ? 'OK' : `exit ${results.pipeline}`,
    interviews: results.interviews === 0 ? 'OK' : `exit ${results.interviews}`,
    coldEmails: results.coldEmails === 0 ? 'OK' : `exit ${results.coldEmails}`,
  });
  log.info('═══════════════════════════════════════════════════════');

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const isLoop = args.includes('--loop');
  const apiOnly = args.includes('--api-only');

  if (apiOnly) {
    startApiServer();
    return;
  }

  if (isLoop) {
    log.info('Starting HireForge master pipeline (6-hour loop + API server)');

    // Start API server
    const apiProcess = startApiServer();
    await sleep(2000);

    // Run pipeline immediately, then every 6 hours
    while (true) {
      try {
        await runFullPipeline();
      } catch (e) {
        log.error('Pipeline run failed', { err: e.message });
      }
      log.info(`Next run at ${new Date(Date.now() + INTERVAL_MS).toISOString()}`);
      await sleep(INTERVAL_MS);
    }
  } else {
    await runFullPipeline();
  }
}

main().catch(e => { log.error('Fatal', { err: e.message }); process.exit(1); });
