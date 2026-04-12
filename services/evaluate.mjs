#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { evaluate } from './lib/azure-openai.mjs';

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

  console.log('Evaluating job description with Azure OpenAI...');
  const report = await evaluate(jdText, cvText, profileContext);

  const companyMatch = report.match(/(?:Company|Employer)[:\s]*([^\n]+)/i);
  const roleMatch = report.match(/(?:Role|Position|Title)[:\s]*([^\n]+)/i);
  const scoreMatch = report.match(/(\d\.\d)\/5/);

  const company = companyMatch?.[1]?.trim() || 'unknown-company';
  const role = roleMatch?.[1]?.trim() || 'unknown-role';
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
  console.log(`Report saved: reports/${reportFile}`);

  const tsvDir = join(ROOT, 'batch', 'tracker-additions');
  const tsvLine = `${num}\t${date}\t${company}\t${role}\tEvaluated\t${score}/5\t❌\t[${numStr}](reports/${reportFile})\tAuto-evaluated via Azure OpenAI`;
  writeFileSync(join(tsvDir, `${numStr}-${slug}.tsv`), tsvLine + '\n');
  console.log(`Tracker entry: batch/tracker-additions/${numStr}-${slug}.tsv`);
  console.log(`\nScore: ${score}/5 — ${parseFloat(score) >= 4.0 ? 'Worth applying!' : parseFloat(score) >= 3.5 ? 'Decent, apply if interested' : 'Below threshold, consider skipping'}`);
}

main().catch(err => {
  console.error('Evaluation failed:', err.message);
  process.exit(1);
});
