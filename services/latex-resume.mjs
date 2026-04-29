#!/usr/bin/env node
/**
 * LaTeX Resume Engine — HireForge
 *
 * Tailors Aryan's exact LaTeX CV template to a specific JD.
 * Tailors summary, skills, experience bullets, and project bullets for the JD.
 * Achievements/heading stay unchanged unless you extend below.
 * All metrics (%, counts, dates, company names) must be preserved by the model.
 * Compiles with tectonic to produce a 1-page PDF.
 *
 * Usage:
 *   node services/latex-resume.mjs <jd-file|jd-text> <company> [role]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { createLogger } from './lib/logger.mjs';
import { chatCompletion, chatCompletionStandard } from './lib/azure-openai.mjs';

const log = createLogger('latex-resume');
const ROOT = resolve(process.cwd());
const CV_DIR = existsSync(join(ROOT, 'Aryan_CV')) ? join(ROOT, 'Aryan_CV') : resolve(ROOT, '../Aryan_CV');

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

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  for (let i = 0; i < text.length; i += 4000) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text.replace(/\*/g, '').replace(/_/g, '').slice(i, i + 4000), disable_web_page_preview: true }),
    }).catch(() => {});
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
async function sendAll(msg) { await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]); }

function extractKeywordsFromJD(jdText) {
  const patterns = [
    /\b(Python|TypeScript|JavaScript|Go|Golang|Java|Rust|C\+\+|C#|Ruby|Kotlin|Swift|Scala|SQL|C\b)\b/gi,
    /\b(React|Next\.js|Vue|Angular|FastAPI|Django|Flask|Spring|Express|Node\.js|Svelte)\b/gi,
    /\b(PostgreSQL|MySQL|MongoDB|Redis|Elasticsearch|Cassandra|DynamoDB|SQLite|pgvector|Pinecone)\b/gi,
    /\b(AWS|Azure|GCP|Kubernetes|Docker|Terraform|Ansible|Jenkins|GitHub Actions|CI\/CD)\b/gi,
    /\b(LangChain|LlamaIndex|RAG|LLM|GPT|Claude|Gemini|Llama|OpenAI|Anthropic|embeddings)\b/gi,
    /\b(PyTorch|TensorFlow|scikit-learn|Hugging Face|transformers|fine-tun\w+|ONNX)\b/gi,
    /\b(REST|GraphQL|gRPC|WebSocket|microservices|serverless|event-driven)\b/gi,
    /\b(Kafka|RabbitMQ|SQS|Pub\/Sub|message queue|stream processing|Celery)\b/gi,
    /\b(Prometheus|Grafana|Datadog|Splunk|observability|monitoring|tracing|ELK)\b/gi,
    /\b(MCP|tool-calling|agentic|autonomous|multi-agent|function calling|agents)\b/gi,
    /\b(vector database|Pinecone|Weaviate|Chroma|FAISS|semantic search|Milvus)\b/gi,
    /\b(data pipeline|ETL|data engineering|Spark|Airflow|dbt|BigQuery)\b/gi,
    /\b(reinforcement learning|computer vision|NLP|natural language|speech)\b/gi,
    /\b(fintech|payments|trading|risk|fraud detection|financial)\b/gi,
    /\b(embedded|firmware|device drivers|BSP|RTOS|real.?time|Linux kernel)\b/gi,
    /\b(Android|iOS|mobile|4G|5G|LTE|WiFi|Bluetooth|CDMA|GSM|UMTS)\b/gi,
    /\b(TCP|UDP|IP|SIP|RTP|socket|protocol)\b/gi,
    /\b(OOP|object.?oriented|data structures|algorithms|operating systems)\b/gi,
    /\b(Valgrind|GDB|static analysis|unit test|pytest|Jest|Cypress)\b/gi,
    /\b(OpenCV|Pandas|NumPy|SciPy|Matplotlib)\b/gi,
    /\b(SRE|site reliability|DevOps|infrastructure|platform)\b/gi,
  ];
  const found = new Set();
  for (const p of patterns)
    for (const m of jdText.matchAll(new RegExp(p.source, 'gi'))) found.add(m[0]);
  return [...found];
}

function shouldShowCGPA(jdText) {
  const t = jdText.toLowerCase();
  const cgpaKeywords = ['cgpa', 'gpa', 'academic', 'percentage', 'grade', 'minimum gpa',
    'tier 1', 'tier-1', 'iit', 'nit', 'iiit', 'college rank'];
  return cgpaKeywords.some(k => t.includes(k));
}

async function tailorSummary(currentSummary, jdText, keywords, company, role) {
  const prompt = `You are tailoring a 2-line LaTeX summary for an ATS resume.

CANDIDATE: Aryan Jaiswal, final-year CS student at IIIT Dharwad.
COMPANY: ${company} | ROLE: ${role}
JD KEYWORDS to weave in: ${keywords.slice(0, 15).join(', ')}

CURRENT SUMMARY (LaTeX):
${currentSummary}

RULES:
1. Keep it to exactly 2-3 lines, same length as current
2. Keep ALL \\textbf{} commands and LaTeX syntax intact
3. Keep factual claims: 1.5L+ monthly calls, COMSNETS 2026, Microsoft Build-a-thon winner
4. Weave in 3-5 JD keywords naturally using \\textbf{}
5. Return ONLY the LaTeX content between \\small{\\item{ and }} — no fences
6. Do NOT add any new metrics or facts — only reframe existing ones`;

  return chatCompletionStandard([
    { role: 'system', content: 'You are an ATS resume expert. Return only valid LaTeX. Never break syntax.' },
    { role: 'user', content: prompt },
  ], { maxTokens: 500 });
}

async function tailorExperienceTex(tex, jdText, keywords, company, role) {
  const prompt = `You edit the EXPERIENCE section of a LaTeX resume for ATS + a specific job.

TARGET JOB: ${role} @ ${company}
JD KEYWORDS: ${keywords.slice(0, 22).join(', ')}
JD EXCERPT: ${jdText.slice(0, 3500)}

CURRENT FILE (entire experience.tex):
${tex}

WORD-COUNT-PRESERVATION PROTOCOL — CRITICAL:
Before editing each \\resumeItem{...}, count the exact number of words in it.
After editing, the new \\resumeItem MUST have the SAME word count (±1 word max).
LaTeX commands like \\textbf{}, \\href{...}{...} count the visible text only.
Compound terms like "CI/CD" or "60,000+" count as 1 word each.

STRICT RULES:
1. Keep structure: \\section, \\resumeSubHeadingListStart, \\item headers with \\textbf{\\href...}, \\resumeItemListStart/End, \\resumeItem{...}
2. Preserve EVERY number, percentage, metric, date, company name, product name (e.g. 40%, 150,000, 8$\\times$, 30s, BlueDart, Argus, Gemini, LangGraph, nginx, Prometheus)
3. Rephrase bullets to maximize JD keyword overlap; wrap keywords with \\textbf{}
4. Use exact words/phrases from the JD wherever honest (e.g. if JD says "embedded Linux" use "embedded Linux" instead of "Linux systems")
5. Do NOT add new factual claims or fake metrics
6. Do NOT remove roles or bullets; you may tighten wording for one-page fit
7. Return the FULL file content only — no markdown fences, no explanations`;

  const out = await chatCompletion([
    { role: 'system', content: 'You are an expert ATS resume writer. Think step-by-step: first count words in each bullet, then rewrite preserving count and injecting JD keywords. Output only valid LaTeX.' },
    { role: 'user', content: prompt },
  ], { maxTokens: 4000, deployment: process.env.AZURE_OPENAI_CHATGPT_DEPLOYMENT || 'o4-mini' });
  return out.replace(/^```\w*\n?/gm, '').replace(/```$/gm, '').trim();
}

async function tailorProjectsTex(tex, jdText, keywords, company, role) {
  const prompt = `You edit the PROJECTS section of a LaTeX resume for ATS.

TARGET JOB: ${role} @ ${company}
JD KEYWORDS: ${keywords.slice(0, 22).join(', ')}
JD EXCERPT: ${jdText.slice(0, 3500)}

CURRENT FILE (entire projects.tex):
${tex}

WORD-COUNT-PRESERVATION PROTOCOL — CRITICAL:
Before editing each \\resumeItem{...}, count the exact number of words in it.
After editing, the new \\resumeItem MUST have the SAME word count (±1 word max).
LaTeX commands like \\textbf{}, \\href{...}{...} count the visible text only.
Compound terms like "CI/CD" or "500+" count as 1 word each.

STRICT RULES:
1. Keep \\resumeProjectHeading, \\href, \\resumeItemListStart/End structure
2. Preserve metrics (500+, 99%, 60%, user counts, tech stack names)
3. Reframe bullets to maximize JD keyword density; wrap keywords with \\textbf{}
4. Use exact words/phrases from the JD wherever honest
5. Do not invent metrics or deployments
6. Return the FULL file only — no fences, no explanations`;

  const out = await chatCompletion([
    { role: 'system', content: 'You are an expert ATS resume writer. Think step-by-step: first count words in each bullet, then rewrite preserving count and injecting JD keywords. Output only valid LaTeX.' },
    { role: 'user', content: prompt },
  ], { maxTokens: 3000, deployment: process.env.AZURE_OPENAI_CHATGPT_DEPLOYMENT || 'o4-mini' });
  return out.replace(/^```\w*\n?/gm, '').replace(/```$/gm, '').trim();
}

function safeTex(candidate, fallback, mustInclude) {
  const checks = Array.isArray(mustInclude) ? mustInclude : [mustInclude];
  if (!candidate || !checks.every((s) => candidate.includes(s))) return fallback;
  return candidate;
}

async function tailorSkills(currentSkills, jdText, keywords) {
  const prompt = `Reorder and optionally add 1-2 JD-specific skills to a LaTeX TECHNICAL SKILLS section.

JD KEYWORDS: ${keywords.slice(0, 20).join(', ')}

CURRENT SKILLS SECTION:
${currentSkills}

RULES:
1. Keep ALL 6 category lines (CS Fundamentals, Frontend, Backend, Cloud, Testing, AI/ML)
2. Do NOT remove any existing skills
3. Move JD-relevant skills to the front of their category
4. Add max 1-2 new skills ONLY if candidate clearly has them (e.g. add Spark if JD needs it and candidate has Python+Data experience)
5. Keep exact LaTeX formatting: \\textbf{Category}: items \\\\[1pt]
6. Return ONLY the LaTeX code between \\begin{itemize} and \\end{itemize} — no fences`;

  return chatCompletionStandard([
    { role: 'system', content: 'You are an ATS resume expert. Return only valid LaTeX.' },
    { role: 'user', content: prompt },
  ], { maxTokens: 800 });
}

function sanitizeUTF8(content) {
  return content
    .replace(/\u2013/g, '--')
    .replace(/\u2014/g, '---')
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, '`')
    .replace(/\u201C/g, '``')
    .replace(/\u201D/g, "''")
    .replace(/\u00A0/g, '~')
    .replace(/\u2026/g, '\\ldots{}');
}

function fixAchievementsBraces(content) {
  content = content.replace(/\\small\{\\item\{/g, '\\item{\\small{');
  content = content.replace(/\n\}\}\n\\end\{itemize\}/g, '\n}}}\n\\end{itemize}');
  return content;
}

async function generateLatexResume(jdText, company, role) {
  log.info('Generating tailored LaTeX resume', { company, role });
  const timer = log.time('latex-gen');

  const keywords = extractKeywordsFromJD(jdText);
  log.info('JD keywords', { count: keywords.length, sample: keywords.slice(0, 8) });

  const showCGPA = shouldShowCGPA(jdText);
  log.info('CGPA decision', { show: showCGPA, reason: showCGPA ? 'JD mentions academic criteria' : 'JD does not mention GPA' });

  // Read original source files
  const summaryEdu = readFileSync(join(CV_DIR, 'src/education.tex'), 'utf-8');
  const skillsTex = readFileSync(join(CV_DIR, 'src/skills.tex'), 'utf-8');

  // Extract current summary text
  const summaryMatch = summaryEdu.match(/\\small\{\\item\{([\s\S]*?)\}\}\s*\\end\{itemize\}/);
  const currentSummary = summaryMatch ? summaryMatch[1].trim() : '';

  const expTex = readFileSync(join(CV_DIR, 'src/experience.tex'), 'utf-8');
  const projTex = readFileSync(join(CV_DIR, 'src/projects.tex'), 'utf-8');

  // Tailor summary, skills, experience, projects in parallel
  const [tailoredSummaryContent, tailoredSkillsContent, tailoredExp, tailoredProj] = await Promise.all([
    tailorSummary(currentSummary, jdText, keywords, company, role),
    tailorSkills(skillsTex, jdText, keywords),
    tailorExperienceTex(expTex, jdText, keywords, company, role),
    tailorProjectsTex(projTex, jdText, keywords, company, role),
  ]);
  timer.done('AI tailoring done');

  // Create output directory
  const outDir = join(ROOT, 'resumes', 'latex');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const buildDir = join(outDir, `${slug}-${date}`);
  if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });
  if (!existsSync(join(buildDir, 'src'))) mkdirSync(join(buildDir, 'src'), { recursive: true });

  // Copy static sources; experience/projects written below from tailored output
  const filesToCopy = [
    'resume.tex', 'custom-commands.tex',
    'src/heading.tex',
    'src/Achievements.tex',
  ];
  for (const f of filesToCopy) {
    const src = join(CV_DIR, f);
    if (!existsSync(src)) continue;
    let content = readFileSync(src, 'utf-8');
    content = sanitizeUTF8(content);
    if (f.endsWith('Achievements.tex')) content = fixAchievementsBraces(content);
    writeFileSync(join(buildDir, f), content);
  }

  const expOut = sanitizeUTF8(
    safeTex(tailoredExp, expTex, ['\\section{\\textbf{EXPERIENCE}}', '\\resumeItem{']),
  );
  const projOut = sanitizeUTF8(
    safeTex(tailoredProj, projTex, ['\\section{\\textbf{PROJECTS}}', '\\resumeProjectHeading']),
  );
  writeFileSync(join(buildDir, 'src/experience.tex'), expOut);
  writeFileSync(join(buildDir, 'src/projects.tex'), projOut);

  // Write tailored education.tex (summary + CGPA logic)
  let eduContent = readFileSync(join(CV_DIR, 'src/education.tex'), 'utf-8');
  eduContent = sanitizeUTF8(eduContent);

  // Replace summary content
  if (tailoredSummaryContent && currentSummary) {
    let cleanTailored = tailoredSummaryContent
      .replace(/^```\w*\n?/gm, '').replace(/```$/gm, '').trim();
    eduContent = eduContent.replace(currentSummary, cleanTailored);
  }

  // CGPA logic: hide if JD doesn't care
  if (!showCGPA) {
    eduContent = eduContent.replace(
      /\{B\.Tech - Computer Science and Engineering \\textbar\\ \\textnormal\{CGPA: 7\.76\/10\}\}/,
      '{B.Tech - Computer Science and Engineering}'
    );
  }

  writeFileSync(join(buildDir, 'src/education.tex'), eduContent);

  // Write tailored skills
  let skillsOut = skillsTex;
  if (tailoredSkillsContent) {
    let cleanSkills = tailoredSkillsContent
      .replace(/^```\w*\n?/gm, '').replace(/```$/gm, '').trim();
    // If it's a complete section, use it; otherwise keep original
    if (cleanSkills.includes('\\textbf{') && cleanSkills.includes('\\\\')) {
      skillsOut = `%-----------TECHNICAL SKILLS-----------%
\\vspace{-7pt}

\\section{\\textbf{TECHNICAL SKILLS}}
\\begin{itemize}[leftmargin=0.15in, label={}]
  \\small{\\item{
${cleanSkills}
  }}
\\end{itemize}
`;
    }
  }
  writeFileSync(join(buildDir, 'src/skills.tex'), skillsOut);

  // Fix resume.tex for tectonic
  let resumeTex = readFileSync(join(buildDir, 'resume.tex'), 'utf-8');
  resumeTex = resumeTex.replace(/\\input\{glyphtounicode\}/g, '% \\input{glyphtounicode}');
  resumeTex = resumeTex.replace(/\\pdfgentounicode=1/g, '% \\pdfgentounicode=1');
  resumeTex = resumeTex.replace(
    /\\documentclass(\[.*?\])\{article\}/,
    '\\documentclass$1{article}\n\\usepackage[utf8]{inputenc}'
  );
  const header = `% Tailored for: ${company} -- ${role} | Date: ${date}\n% Keywords: ${keywords.slice(0, 12).join(', ')}\n\n`;
  writeFileSync(join(buildDir, 'resume.tex'), header + resumeTex);

  log.info('LaTeX sources written', { dir: buildDir.replace(ROOT + '/', '') });
  return { buildDir, slug, date, keywords, showCGPA };
}

async function compilePDF(buildDir, slug, date) {
  log.info('Compiling PDF with tectonic...');
  const timer = log.time('pdf-compile');

  const homeTectonic = join(homedir(), '.homebrew', 'bin', 'tectonic');
  const tectonicPath = existsSync(homeTectonic) ? homeTectonic
    : existsSync('/opt/homebrew/bin/tectonic') ? '/opt/homebrew/bin/tectonic'
    : existsSync('/usr/local/bin/tectonic') ? '/usr/local/bin/tectonic' : 'tectonic';

  const result = spawnSync(tectonicPath, ['resume.tex', '--outdir', '.', '--keep-logs'], {
    cwd: buildDir, encoding: 'utf-8', timeout: 120000,
    env: { ...process.env, PATH: `${join(homedir(), '.homebrew', 'bin')}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
  });

  const pdfSrc = join(buildDir, 'resume.pdf');
  const pdfDst = join(buildDir, '..', `${slug}-${date}.pdf`);

  if (result.status === 0 && existsSync(pdfSrc)) {
    copyFileSync(pdfSrc, pdfDst);
    timer.done('PDF compiled', { output: `resumes/latex/${slug}-${date}.pdf` });
    return pdfDst;
  }

  log.error('tectonic compile failed', { stderr: result.stderr?.slice(0, 300) });
  return null;
}

async function main() {
  const jdArg   = process.argv[2];
  const company = process.argv[3] || 'Company';
  const role    = process.argv[4] || 'Software Engineer';

  if (!jdArg) {
    console.log('Usage: node services/latex-resume.mjs <jd-file|jd-text> <company> [role]');
    process.exit(1);
  }

  const jdText = existsSync(jdArg) ? readFileSync(jdArg, 'utf-8') : jdArg;

  const { buildDir, slug, date, keywords, showCGPA } = await generateLatexResume(jdText, company, role);
  const pdfPath = await compilePDF(buildDir, slug, date);

  const msg = [
    `📄 *Resume Tailored: ${role} @ ${company}*`,
    ``,
    pdfPath ? `✅ PDF: \`resumes/latex/${slug}-${date}.pdf\`` : `⚠️ LaTeX source ready (PDF compile needs manual run)`,
    `📋 Keywords: ${keywords.slice(0, 8).join(', ')}`,
    `🎓 CGPA: ${showCGPA ? 'Shown (7.76/10)' : 'Hidden (JD does not mention academics)'}`,
  ].join('\n');

  await sendAll(msg);
  console.log(`\n✅ Resume ready: resumes/latex/${slug}-${date}/${pdfPath ? ' + PDF' : ' (LaTeX only)'}`);
}

if (process.argv[1]?.endsWith('latex-resume.mjs')) {
  main().catch(e => { log.error('Fatal', { err: e.message }); process.exit(1); });
}

export { generateLatexResume, compilePDF, extractKeywordsFromJD, shouldShowCGPA };
