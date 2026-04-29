#!/usr/bin/env node
/**
 * Cover Letter LaTeX Engine — HireForge
 *
 * Generates a tailored 1-page cover letter from a JD.
 * Researches the company, then uses AI to craft 7 purposeful paragraphs.
 * Compiles to PDF via tectonic.
 *
 * Usage:
 *   node services/cover-letter.mjs <jd-file|jd-text> <company> [role] [team]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { createLogger } from './lib/logger.mjs';
import { chatCompletionStandard } from './lib/azure-openai.mjs';
import { searchWeb } from './lib/search-web.mjs';

const log = createLogger('cover-letter');
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

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'company';
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function displayDate() {
  return new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}

function loadProfileData() {
  const p = join(ROOT, 'data', 'profile-data.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; }
}

function loadCV() {
  const p = join(ROOT, 'cv.md');
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf-8');
}

function escapeTex(s) {
  return String(s)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, m => '\\' + m)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function escapeTexLight(s) {
  return String(s)
    .replace(/[&%$#_{}]/g, m => '\\' + m)
    .replace(/~/g, '\\textasciitilde{}');
}

async function researchCompanyForCoverLetter(company, role) {
  const queries = [
    `"${company}" what does the company do products mission`,
    `"${company}" engineering culture values tech stack`,
    `"${company}" ${role} team responsibilities`,
  ];

  const allSnippets = [];
  const seenUrls = new Set();

  for (let i = 0; i < queries.length; i++) {
    log.info('Searching', { query: queries[i] });
    const results = await searchWeb(queries[i], 6);
    for (const r of results) {
      if (r.url && !seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allSnippets.push(`- ${r.title || ''}\n  ${r.snippet || ''}`);
      }
    }
    if (i < queries.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  return allSnippets.join('\n\n').slice(0, 80000);
}

async function generateCoverLetterContent(company, role, team, jdText, companyResearch, cvText, profileData) {
  const candidateName = profileData?.candidate?.name || 'Candidate';
  const experiences = (profileData?.experiences || [])
    .map(e => `${e.company} (${e.role}): ${(e.bullets || []).join(' ')}`)
    .join('\n');

  const systemPrompt = `You are a cover letter writer for ${candidateName}. Write exactly 7 paragraphs for a cover letter to ${company} for the ${role} role${team ? ` on the ${team} team` : ''}.

Each paragraph must be 2-3 sentences max. The total letter must fit ONE page when compiled in LaTeX with 11pt font and 0.75in margins.

STRUCTURE (follow exactly):
1. Opening: Show you researched the company. Mention their specific product/mission/approach that excites you. Connect it to what you want to work on.
2. Problem interest: What about this domain/problem space is intellectually interesting to you. Be specific to the JD requirements.
3. Most relevant experience: Your strongest experience with CONCRETE METRICS (numbers, percentages, scale). Must directly relate to JD requirements.
4. Broader experience: Show range across other roles/projects. Include metrics. Demonstrate breadth.
5. Technical skills: Map your skills to JD requirements. Be specific about languages, frameworks, tools.
6. If hired: What you would focus on and contribute. Forward-looking, aligned with company needs.
7. Closing: Extracurriculars, leadership, community involvement. End with enthusiasm.

RULES:
- Use \\textbf{...} for bold key phrases (3-5 per paragraph)
- Keep paragraphs SHORT (2-3 sentences each)
- Include real metrics from the candidate's CV — never invent numbers
- Be genuine, not generic. Show you understand THIS company
- Write as the candidate, first person

Return ONLY a JSON object with keys "para1" through "para7", each containing the LaTeX paragraph text with \\textbf{} markup.`;

  const userPrompt = `CANDIDATE CV:
${cvText.slice(0, 6000)}

CANDIDATE EXPERIENCES:
${experiences.slice(0, 4000)}

JOB DESCRIPTION:
${jdText.slice(0, 6000)}

COMPANY RESEARCH:
${companyResearch.slice(0, 4000)}

Generate the 7 cover letter paragraphs as JSON.`;

  const raw = await chatCompletionStandard(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 4096, temperature: 0.5 }
  );

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON for cover letter');
  return JSON.parse(jsonMatch[0]);
}

const PROTOCOL_RE = /^https?:\/\//;

function buildCoverLetterTex(company, role, team, paragraphs, profileData) {
  const candidate = profileData?.candidate || {};
  const name = candidate.name || 'Candidate';
  const firstName = name.split(' ')[0] || name;
  const location = candidate.location || 'India';
  const phone = candidate.phone || '';
  const email = candidate.email || '';
  const portfolio = candidate.portfolio || '';
  const portfolioDisplay = portfolio.replace(PROTOCOL_RE, '');

  const companyUpper = company.toUpperCase();
  const dateStr = displayDate();
  const teamLine = team ? `    \\textbf{${escapeTexLight(team)}} \\\\[1.2em]` : '';

  const tex = `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage{graphicx}
\\definecolor{nameblue}{RGB}{0, 82, 204}
\\definecolor{datecolor}{RGB}{100, 100, 100}
\\pagenumbering{gobble}
\\newcommand{\\initialcap}[2]{{\\fontsize{#1}{#1}\\selectfont #2}}
\\begin{document}

\\noindent
\\begin{minipage}[t]{0.32\\textwidth}
    \\vspace{0pt}
    {\\Huge \\textbf{\\initialcap{30pt}{${firstName.charAt(0).toUpperCase()}}\\initialcap{28pt}{${firstName.slice(1).toUpperCase()}}}}
    \\vspace{0.5em}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.63\\textwidth}
    \\vspace{0pt}
    \\rule{\\linewidth}{1.2pt} \\\\[1em]
    {\\textcolor{datecolor}{\\textbf{${dateStr}}}}
\\end{minipage}

\\vspace{0.5em}

\\noindent
\\begin{minipage}[t]{0.32\\textwidth}
    {\\textcolor{nameblue}{\\textbf{\\initialcap{16pt}{${companyUpper.charAt(0)}}\\initialcap{14pt}{${companyUpper.slice(1)}}}}} \\\\
    
    \\vspace{0.5em}
    \\rule{1cm}{0.5pt} \\\\
    
    \\vspace{0.8em}
    
${escapeTex(name)} \\\\
${escapeTex(location)} \\\\
${phone ? `{\\textcolor{nameblue}{${escapeTexLight(phone)}}} \\\\\n` : ''}{\\textcolor{nameblue}{\\href{mailto:${email}}{${escapeTexLight(email)}}}} \\\\
${portfolio ? `{\\textcolor{nameblue}{\\href{${portfolio}}{${escapeTexLight(portfolioDisplay)}}}}` : ''}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.63\\textwidth}
    \\textbf{${escapeTexLight(company)} Hiring Team} \\\\
${teamLine}

Dear Hiring Team, \\\\[0.8em]

${paragraphs.para1 || ''}

\\vspace{0.6em}

${paragraphs.para2 || ''}

\\vspace{0.6em}

${paragraphs.para3 || ''}

\\vspace{0.6em}

${paragraphs.para4 || ''}

\\vspace{0.6em}

${paragraphs.para5 || ''}

\\vspace{0.6em}

${paragraphs.para6 || ''}

\\vspace{0.6em}

${paragraphs.para7 || ''}

\\vspace{0.6em}

Sincerely, \\\\[1.2em]

{\\textcolor{nameblue}{${escapeTexLight(name)}}}
\\end{minipage}

\\end{document}`;

  return tex;
}

function findTectonic() {
  const candidates = [
    join(homedir(), '.homebrew', 'bin', 'tectonic'),
    '/opt/homebrew/bin/tectonic',
    '/usr/local/bin/tectonic',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return 'tectonic';
}

function compileCoverLetterPDF(buildDir, slug, date) {
  log.info('Compiling cover letter PDF with tectonic...');
  const tectonicPath = findTectonic();

  const result = spawnSync(tectonicPath, ['cover-letter.tex', '--outdir', '.', '--keep-logs'], {
    cwd: buildDir,
    encoding: 'utf-8',
    timeout: 120000,
    env: {
      ...process.env,
      PATH: `${join(homedir(), '.homebrew', 'bin')}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,
    },
  });

  const pdfSrc = join(buildDir, 'cover-letter.pdf');
  const outDir = join(ROOT, 'resumes', 'cover-letters');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const pdfDst = join(outDir, `${slug}-${date}.pdf`);

  if (result.status === 0 && existsSync(pdfSrc)) {
    copyFileSync(pdfSrc, pdfDst);
    log.info('Cover letter PDF compiled', { output: `resumes/cover-letters/${slug}-${date}.pdf` });
    return pdfDst;
  }

  log.error('tectonic compile failed for cover letter', { stderr: result.stderr?.slice(0, 500) });
  return null;
}

export async function generateCoverLetter(jdText, company, role, team) {
  const slug = slugify(company);
  const date = today();
  const profileData = loadProfileData();
  const cvText = loadCV();

  log.info('Researching company for cover letter', { company });
  const companyResearch = await researchCompanyForCoverLetter(company, role);

  log.info('Generating cover letter content with AI', { company, role });
  const paragraphs = await generateCoverLetterContent(company, role, team, jdText, companyResearch, cvText, profileData);

  const tex = buildCoverLetterTex(company, role, team, paragraphs, profileData);

  const buildDir = join(ROOT, 'resumes', 'cover-letters', `${slug}-${date}-src`);
  if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });
  writeFileSync(join(buildDir, 'cover-letter.tex'), tex);

  const pdfPath = compileCoverLetterPDF(buildDir, slug, date);

  return {
    success: !!pdfPath,
    pdfPath,
    slug,
    date,
    buildDir,
    paragraphSummary: Object.keys(paragraphs).map(k => paragraphs[k]?.slice(0, 100) + '...'),
  };
}

async function main() {
  const jdArg = process.argv[2];
  const company = process.argv[3] || 'Company';
  const role = process.argv[4] || 'Software Engineer';
  const team = process.argv[5] || '';

  if (!jdArg) {
    console.log('Usage: node services/cover-letter.mjs <jd-file|jd-text> <company> [role] [team]');
    process.exit(1);
  }

  const jdText = existsSync(jdArg) ? readFileSync(jdArg, 'utf-8') : jdArg;
  const result = await generateCoverLetter(jdText, company, role, team);

  if (result.success) {
    console.log(`\nCover letter ready: resumes/cover-letters/${result.slug}-${result.date}.pdf`);
  } else {
    console.log(`\nCover letter LaTeX source generated but PDF compilation failed.`);
    console.log(`Source: ${result.buildDir}/cover-letter.tex`);
  }
}

if (process.argv[1]?.endsWith('cover-letter.mjs')) {
  main().catch(e => { log.error('Fatal', { err: e.message }); process.exit(1); });
}
