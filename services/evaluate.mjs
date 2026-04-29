#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { evaluate } from './lib/azure-openai.mjs';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('evaluate');

const ROOT = resolve(process.cwd());

function readFile(path) {
  const full = resolve(ROOT, path);
  return existsSync(full) ? readFileSync(full, 'utf-8') : '';
}

function getNextReportNumber() {
  const reportsDir = join(ROOT, 'reports');
  if (!existsSync(reportsDir)) return 1;
  const files = readdirSync(reportsDir).filter(f => f.endsWith('.md'));
  let max = 0;
  for (const f of files) {
    const num = parseInt(f.split('-')[0], 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return max + 1;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main() {
  const jdInput = process.argv[2];
  if (!jdInput) {
    console.error('Usage: node services/evaluate.mjs <jd-file-or-url>');
    console.error('  jd-file: path to a .txt/.md file with the job description');
    console.error('  url: a URL to fetch the JD from');
    process.exit(1);
  }

  let jdText;
  if (existsSync(jdInput)) {
    jdText = readFileSync(jdInput, 'utf-8');
  } else {
    jdText = jdInput;
  }

  const cvText = readFile('cv.md');
  if (!cvText) {
    console.error('Error: cv.md not found. Run onboarding first.');
    process.exit(1);
  }

  const profileYml = readFile('config/profile.yml');
  const profileMd = readFile('modes/_profile.md');
  const sharedMd = readFile('modes/_shared.md');
  const profileContext = `${sharedMd}\n\n---\n\n${profileMd}\n\n---\n\nProfile YAML:\n${profileYml}`;

  log.info('Evaluating JD with o4-mini (deep reasoning)…', { jd: jdInput.slice(0, 60) });
  const timer = log.time('evaluation');
  const report = await evaluate(jdText, cvText, profileContext);
  timer.done('Evaluation complete');

  const scoreMatch = report.match(/Global Score[:\s]*(\d+\.?\d*)\/5/i) ||
                     report.match(/(\d+\.?\d*)\/5\s*[—–-]/i) ||
                     report.match(/(\d\.\d)\/5/);

  // Extract company/role from JD text first (most reliable)
  let company = 'unknown';
  let role = 'unknown';

  // Try JD header patterns: "Company Name\nRole Title" or "Role at Company"
  const jdCompanyMatch = jdText.match(/^(?:Company|Employer|Organization)[:\s]+(.+)/im) ||
                         jdText.match(/^#\s*(.+?)\s*[-–|]/m);
  const jdRoleMatch = jdText.match(/^(?:Job Title|Position|Role)[:\s]+(.+)/im) ||
                      jdText.match(/^(?:We are hiring|We're hiring|Hiring)[:\s]+(?:a\s+)?(.+?)(?:\s+at\s+|\s+@\s+)/im);

  if (jdCompanyMatch) company = jdCompanyMatch[1].trim().replace(/[*#]/g, '').slice(0, 50);
  if (jdRoleMatch) role = jdRoleMatch[1].trim().replace(/[*#]/g, '').slice(0, 60);

  // Fallback: extract from Block A of the report
  if (company === 'unknown' || role === 'unknown') {
    const blockA = report.match(/(?:Block A|A\.|# A)[^\n]*\n([\s\S]*?)(?=\n#|\n##|\nBlock B|\nB\.)/i)?.[1] || '';
    if (company === 'unknown') {
      const m = blockA.match(/(?:company|employer|organization)[:\s*]+([A-Z][A-Za-z0-9\s.&'-]+?)(?:\s*[-–(,\n]|$)/im) ||
                report.match(/(?:Razorpay|Flipkart|Zepto|Meesho|Swiggy|Zomato|CRED|PhonePe|Paytm|Ola|Uber|Google|Microsoft|Amazon|Meta|Apple|Netflix|Atlassian|Freshworks|Zoho|Infosys|TCS|Wipro|HCL|Accenture|Capgemini|Deloitte|McKinsey|Bain|BCG)/i);
      if (m) company = m[1]?.trim() || m[0]?.trim();
    }
    if (role === 'unknown') {
      const m = blockA.match(/(?:role|position|title|archetype)[:\s*]+([A-Z][A-Za-z0-9\s/.-]+?)(?:\s*[-–(,\n]|$)/im);
      if (m) role = m[1].trim().slice(0, 60);
    }
  }

  // Last resort: scan full report for known company names
  if (company === 'unknown') {
    const knownCompanies = ['Razorpay','Flipkart','Zepto','Meesho','Swiggy','Zomato','CRED','PhonePe','Paytm','Ola','Uber','Google','Microsoft','Amazon','Meta','Apple','Netflix','Atlassian','Freshworks','Zoho','Infosys','TCS','Wipro','HCL','Accenture','Capgemini','Deloitte','Exotel','Juspay','Setu','Cashfree','BrowserStack','Postman','Chargebee','Hasura','Dgraph','Unacademy','Byju','Vedantu','Lenskart','Nykaa','Myntra','Ajio','Groww','Zerodha','Upstox','Angel','Sharekhan','Policybazaar','Coverfox','Acko','Digit'];
    for (const c of knownCompanies) {
      if (report.includes(c)) { company = c; break; }
    }
  }

  const score = scoreMatch?.[1] || '0.0';

  const num = getNextReportNumber();
  const numStr = String(num).padStart(3, '0');
  const date = new Date().toISOString().split('T')[0];
  const slug = slugify(company);
  const reportFile = `${numStr}-${slug}-${date}.md`;

  const fullReport = `# Evaluation Report #${numStr}

**Company:** ${company}
**Role:** ${role}
**Score:** ${score}/5
**Date:** ${date}
**URL:** ${jdInput.startsWith('http') ? jdInput : 'local file'}

---

${report}`;

  const reportsDir = join(ROOT, 'reports');
  writeFileSync(join(reportsDir, reportFile), fullReport);
  log.info('Report saved', { file: `reports/${reportFile}`, score, company, role });

  const tsvDir = join(ROOT, 'batch', 'tracker-additions');
  const tsvLine = `${num}\t${date}\t${company}\t${role}\tEvaluated\t${score}/5\t❌\t[${numStr}](reports/${reportFile})\tAuto-evaluated via Azure OpenAI`;
  writeFileSync(join(tsvDir, `${numStr}-${slug}.tsv`), tsvLine + '\n');
  log.info('Tracker entry saved', { file: `batch/tracker-additions/${numStr}-${slug}.tsv` });
  const verdict = parseFloat(score) >= 4.0 ? '✅ Worth applying!' : parseFloat(score) >= 3.5 ? '⚡ Decent, apply if interested' : '❌ Below threshold';
  log.info(`Score: ${score}/5 — ${verdict}`);
}

main().catch(err => {
  console.error('Evaluation failed:', err.message);
  process.exit(1);
});
