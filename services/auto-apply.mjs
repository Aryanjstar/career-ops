#!/usr/bin/env node
/**
 * Headless Auto-Apply Engine — HireForge
 *
 * Supports: Greenhouse, Lever, Ashby, Workday, and generic ATS forms.
 * OFF by default — enabling may violate site ToS; use at your own risk.
 *
 * Requires: AUTO_APPLY_ENABLED=true
 *           APPLY_EMAIL, APPLY_FIRST_NAME, APPLY_LAST_NAME, APPLY_PHONE (E.164)
 *           Playwright browsers: npx playwright install chromium
 */

import { existsSync } from 'fs';
import { config } from 'dotenv';
import { createLogger } from './lib/logger.mjs';

config();

const log = createLogger('auto-apply');

function getApplyProfile() {
  return {
    email: process.env.APPLY_EMAIL || '',
    first: process.env.APPLY_FIRST_NAME || '',
    last: process.env.APPLY_LAST_NAME || '',
    phone: process.env.APPLY_PHONE || '',
    linkedin: process.env.APPLY_LINKEDIN || 'https://linkedin.com/in/aryanjstar',
    portfolio: process.env.APPLY_PORTFOLIO || 'https://aryanjaiswal.in',
    github: process.env.APPLY_GITHUB || 'https://github.com/aryanjstar',
  };
}

function detectATS(url) {
  if (/greenhouse\.io|boards\.greenhouse/i.test(url)) return 'greenhouse';
  if (/jobs\.lever\.co|lever\.co\/.*\/apply/i.test(url)) return 'lever';
  if (/jobs\.ashbyhq\.com/i.test(url)) return 'ashby';
  if (/myworkdayjobs\.com/i.test(url)) return 'workday';
  if (/naukri\.com/i.test(url)) return 'naukri';
  if (/internshala\.com/i.test(url)) return 'internshala';
  if (/indeed\.com.*\/apply|indeed\.com.*viewjob/i.test(url)) return 'indeed';
  if (/wellfound\.com|angel\.co/i.test(url)) return 'wellfound';
  if (/cutshort\.io/i.test(url)) return 'cutshort';
  return 'generic';
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (e) {
    log.error('Playwright not loadable', { err: e.message });
    return null;
  }
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

async function tryFill(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible().catch(() => true);
        if (visible) {
          await el.fill(value);
          return true;
        }
      }
    } catch {}
  }
  return false;
}

async function tryClick(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        return true;
      }
    } catch {}
  }
  return false;
}

async function uploadResume(page, pdfPath) {
  const fileSelectors = [
    'input[type="file"]',
    'input[type="file"][name*="resume"]',
    'input[type="file"][name*="cv"]',
    'input[type="file"][accept*="pdf"]',
    'input[type="file"][id*="resume"]',
    'input[type="file"][id*="cv"]',
  ];
  for (const sel of fileSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.setInputFiles(pdfPath);
        return true;
      }
    } catch {}
  }
  return false;
}

async function applyGreenhouse(page, profile, pdfPath) {
  const tried = [];

  await tryFill(page, [
    'input[name="job_application[first_name]"]',
    'input[id*="first_name"]', '#first_name',
    'input[autocomplete="given-name"]',
  ], profile.first) && tried.push('first_name');

  await tryFill(page, [
    'input[name="job_application[last_name]"]',
    'input[id*="last_name"]', '#last_name',
    'input[autocomplete="family-name"]',
  ], profile.last) && tried.push('last_name');

  await tryFill(page, [
    'input[name="job_application[email]"]',
    'input[type="email"]', '#email',
    'input[autocomplete="email"]',
  ], profile.email) && tried.push('email');

  if (profile.phone) {
    await tryFill(page, [
      'input[name="job_application[phone]"]',
      'input[type="tel"]', '#phone',
    ], profile.phone) && tried.push('phone');
  }

  if (profile.linkedin) {
    await tryFill(page, [
      'input[name*="linkedin"]', 'input[id*="linkedin"]',
      'input[placeholder*="LinkedIn"]', 'input[placeholder*="linkedin"]',
    ], profile.linkedin) && tried.push('linkedin');
  }

  if (profile.portfolio) {
    await tryFill(page, [
      'input[name*="website"]', 'input[name*="portfolio"]',
      'input[id*="website"]', 'input[placeholder*="Website"]',
    ], profile.portfolio) && tried.push('portfolio');
  }

  if (pdfPath) {
    await uploadResume(page, pdfPath) && tried.push('resume_upload');
  }

  return tried;
}

async function applyLever(page, profile, pdfPath) {
  const tried = [];

  await tryFill(page, [
    'input[name="name"]', 'input[id*="name"]',
    'input[placeholder*="Full name"]',
  ], `${profile.first} ${profile.last}`) && tried.push('name');

  await tryFill(page, [
    'input[name="email"]', 'input[type="email"]',
    'input[id*="email"]',
  ], profile.email) && tried.push('email');

  if (profile.phone) {
    await tryFill(page, [
      'input[name="phone"]', 'input[type="tel"]',
    ], profile.phone) && tried.push('phone');
  }

  if (profile.linkedin) {
    await tryFill(page, [
      'input[name="urls[LinkedIn]"]', 'input[name*="linkedin"]',
      'input[placeholder*="LinkedIn"]',
    ], profile.linkedin) && tried.push('linkedin');
  }

  if (profile.github) {
    await tryFill(page, [
      'input[name="urls[GitHub]"]', 'input[name*="github"]',
      'input[placeholder*="GitHub"]',
    ], profile.github) && tried.push('github');
  }

  if (profile.portfolio) {
    await tryFill(page, [
      'input[name="urls[Portfolio]"]', 'input[name*="website"]',
      'input[name*="portfolio"]', 'input[placeholder*="Website"]',
    ], profile.portfolio) && tried.push('portfolio');
  }

  if (pdfPath) {
    await uploadResume(page, pdfPath) && tried.push('resume_upload');
  }

  return tried;
}

async function applyAshby(page, profile, pdfPath) {
  const tried = [];

  await tryFill(page, [
    'input[name="name"]', 'input[name="_systemfield_name"]',
    'input[id*="name"]', 'input[placeholder*="name" i]',
  ], `${profile.first} ${profile.last}`) && tried.push('name');

  await tryFill(page, [
    'input[name="email"]', 'input[name="_systemfield_email"]',
    'input[type="email"]', 'input[id*="email"]',
  ], profile.email) && tried.push('email');

  if (profile.phone) {
    await tryFill(page, [
      'input[name="phone"]', 'input[name="_systemfield_phone"]',
      'input[type="tel"]',
    ], profile.phone) && tried.push('phone');
  }

  if (profile.linkedin) {
    await tryFill(page, [
      'input[name*="linkedin" i]', 'input[placeholder*="LinkedIn" i]',
    ], profile.linkedin) && tried.push('linkedin');
  }

  if (pdfPath) {
    await uploadResume(page, pdfPath) && tried.push('resume_upload');
  }

  return tried;
}

async function applyGeneric(page, profile, pdfPath) {
  const tried = [];

  const firstNameFilled = await tryFill(page, [
    'input[name*="first" i]', 'input[id*="first" i]',
    'input[placeholder*="First" i]', 'input[autocomplete="given-name"]',
  ], profile.first);

  if (firstNameFilled) {
    tried.push('first_name');
    await tryFill(page, [
      'input[name*="last" i]', 'input[id*="last" i]',
      'input[placeholder*="Last" i]', 'input[autocomplete="family-name"]',
    ], profile.last) && tried.push('last_name');
  } else {
    await tryFill(page, [
      'input[name*="name" i]', 'input[id*="name" i]',
      'input[placeholder*="name" i]', 'input[autocomplete="name"]',
    ], `${profile.first} ${profile.last}`) && tried.push('name');
  }

  await tryFill(page, [
    'input[type="email"]', 'input[name*="email" i]',
    'input[id*="email" i]', 'input[autocomplete="email"]',
  ], profile.email) && tried.push('email');

  if (profile.phone) {
    await tryFill(page, [
      'input[type="tel"]', 'input[name*="phone" i]',
      'input[id*="phone" i]', 'input[autocomplete="tel"]',
    ], profile.phone) && tried.push('phone');
  }

  if (profile.linkedin) {
    await tryFill(page, [
      'input[name*="linkedin" i]', 'input[id*="linkedin" i]',
      'input[placeholder*="linkedin" i]',
    ], profile.linkedin) && tried.push('linkedin');
  }

  if (profile.portfolio) {
    await tryFill(page, [
      'input[name*="website" i]', 'input[name*="portfolio" i]',
      'input[id*="website" i]', 'input[placeholder*="website" i]',
    ], profile.portfolio) && tried.push('portfolio');
  }

  if (pdfPath) {
    await uploadResume(page, pdfPath) && tried.push('resume_upload');
  }

  return tried;
}

async function submitForm(page) {
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'button:has-text("Submit Application")',
    'button:has-text("Submit application")',
    'a:has-text("Submit")',
  ];
  return tryClick(page, submitSelectors);
}

function checkSuccess(body) {
  return /thank you|received|success|application submitted|application has been|we'll be in touch|successfully submitted|application complete/i.test(body);
}

/**
 * Try to auto-apply to a job posting.
 * @param {Object} opts
 * @param {string} opts.url - Job posting URL
 * @param {string} [opts.pdfPath] - Path to resume PDF
 * @returns {Promise<{ok: boolean, reason?: string, ats?: string, tried?: string[], dryRun?: boolean, hint?: string}>}
 */
export async function tryAutoApply({ url, pdfPath }) {
  if (process.env.AUTO_APPLY_ENABLED !== 'true') {
    return { ok: false, reason: 'AUTO_APPLY_ENABLED not true' };
  }
  if (!url) {
    return { ok: false, reason: 'No URL provided' };
  }
  if (!pdfPath || !existsSync(pdfPath)) {
    log.error('Resume PDF is required for application', { pdfPath });
    return { ok: false, reason: 'No resume PDF available — refusing to apply without resume' };
  }
  if (!pdfPath.endsWith('.pdf')) {
    log.error('Resume must be PDF format', { pdfPath });
    return { ok: false, reason: 'Resume file is not PDF format — only PDF uploads allowed' };
  }

  const profile = getApplyProfile();
  if (!profile.email || !profile.first || !profile.last) {
    log.warn('Set APPLY_EMAIL, APPLY_FIRST_NAME, APPLY_LAST_NAME for auto-apply');
    return { ok: false, reason: 'Incomplete APPLY_* profile in env' };
  }

  const ats = detectATS(url);
  log.info('Detected ATS', { ats, url: url.slice(0, 80) });

  const browser = await launchBrowser();
  if (!browser) return { ok: false, reason: 'playwright import failed' };

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() =>
      page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    );
    await delay(4000);

    // Some ATS pages need clicking "Apply" first to get to the form
    const applyButtonClicked = await tryClick(page, [
      'a:has-text("Apply for this job")',
      'a:has-text("Apply Now")',
      'a:has-text("Apply now")',
      'button:has-text("Apply for this job")',
      'button:has-text("Apply Now")',
      'button:has-text("Apply now")',
      'a:has-text("Apply")',
      'button:has-text("Apply")',
      '[data-qa="btn-apply"]',
      '[class*="apply" i] button',
      '[class*="apply" i] a',
    ]);
    if (applyButtonClicked) {
      log.info('Clicked apply button, waiting for form...');
      await page.waitForLoadState('networkidle').catch(() => {});
      await delay(4000);
    }

    let tried;
    switch (ats) {
      case 'greenhouse':
        tried = await applyGreenhouse(page, profile, pdfPath);
        break;
      case 'lever':
        tried = await applyLever(page, profile, pdfPath);
        break;
      case 'ashby':
        tried = await applyAshby(page, profile, pdfPath);
        break;
      default:
        tried = await applyGeneric(page, profile, pdfPath);
        break;
    }

    if (tried.length === 0) {
      return { ok: false, ats, reason: 'Could not fill any form fields', tried };
    }

    if (process.env.AUTO_APPLY_DRY_RUN === 'true') {
      log.info('Dry run — not submitting', { url, ats, tried });
      return { ok: true, dryRun: true, ats, tried };
    }

    const submitted = await submitForm(page);
    if (submitted) {
      await delay(8000);
      const body = await page.content();
      const looksOk = checkSuccess(body);
      log.info('Form submitted', { ats, looksOk, tried });
      // If we filled fields AND clicked submit, count as applied even if success page not detected
      return { ok: true, ats, tried, hint: looksOk ? 'submitted' : 'submitted-unconfirmed' };
    }

    // If we filled fields but couldn't find submit button, still count as partial
    if (tried.length >= 2) {
      log.info('Fields filled but no submit button found', { ats, tried });
      return { ok: false, ats, reason: 'Could not find submit button', tried };
    }

    return { ok: false, ats, reason: 'Could not find submit button', tried };
  } catch (e) {
    log.error('Auto-apply error', { err: e.message, url, ats });
    return { ok: false, ats, reason: e.message };
  } finally {
    await browser.close();
  }
}

// Keep backward compatibility
export const tryGreenhouseStyleApply = tryAutoApply;
