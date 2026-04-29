#!/usr/bin/env node
/**
 * Resume Tailoring Service — HireForge
 *
 * Given a JD, extracts keywords and rewrites cv.md to match.
 * Saves a tailored version per company in resumes/ folder.
 * Each version has JD keywords injected naturally.
 *
 * Usage:
 *   node services/tailor-resume.mjs <jd-file-or-url> [company-name]
 *   node services/tailor-resume.mjs jds/razorpay.txt Razorpay
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { createLogger } from './lib/logger.mjs';
import { tailorResume } from './lib/azure-openai.mjs';

const log = createLogger('tailor-resume');
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

function extractJDKeywords(jdText) {
  // Extract tech stack, skills, and role-specific terms from JD
  const techPatterns = [
    /\b(Python|Node\.js|TypeScript|JavaScript|Go|Java|Rust|C\+\+|C#|Ruby)\b/gi,
    /\b(React|Next\.js|Vue|Angular|Svelte|FastAPI|Django|Flask|Spring|Express)\b/gi,
    /\b(PostgreSQL|MySQL|MongoDB|Redis|Elasticsearch|Cassandra|DynamoDB|SQLite)\b/gi,
    /\b(AWS|Azure|GCP|Kubernetes|Docker|Terraform|Ansible|Jenkins|GitHub Actions)\b/gi,
    /\b(LangChain|LlamaIndex|RAG|LLM|GPT|Claude|Gemini|Llama|OpenAI|Anthropic)\b/gi,
    /\b(PyTorch|TensorFlow|scikit-learn|Hugging Face|transformers|embeddings)\b/gi,
    /\b(REST|GraphQL|gRPC|WebSocket|API|microservices|serverless)\b/gi,
    /\b(Kafka|RabbitMQ|SQS|Pub\/Sub|event-driven|message queue)\b/gi,
    /\b(Prometheus|Grafana|Datadog|Splunk|observability|monitoring)\b/gi,
    /\b(CI\/CD|DevOps|MLOps|LLMOps|GitOps)\b/gi,
  ];
  const found = new Set();
  for (const pattern of techPatterns) {
    for (const m of jdText.matchAll(new RegExp(pattern.source, 'gi'))) {
      found.add(m[0]);
    }
  }
  return [...found];
}

async function main() {
  const jdArg     = process.argv[2];
  const companyArg= process.argv[3] || 'Company';

  if (!jdArg) {
    console.log('Usage: node services/tailor-resume.mjs <jd-file> [company-name]');
    console.log('Example: node services/tailor-resume.mjs jds/razorpay.txt Razorpay');
    process.exit(1);
  }

  let jdText = '';
  if (existsSync(jdArg)) {
    jdText = readFileSync(jdArg, 'utf-8');
  } else {
    jdText = jdArg; // treat as raw text
  }

  const cvText = existsSync(join(ROOT, 'cv.md'))
    ? readFileSync(join(ROOT, 'cv.md'), 'utf-8')
    : '';

  if (!cvText) { log.error('cv.md not found'); process.exit(1); }

  const profileYml = existsSync(join(ROOT, 'config/profile.yml'))
    ? readFileSync(join(ROOT, 'config/profile.yml'), 'utf-8')
    : '';

  const keywords = extractJDKeywords(jdText);
  log.info('Extracted JD keywords', { count: keywords.length, keywords: keywords.slice(0, 10) });

  const profileContext = `Profile YAML:\n${profileYml}\n\nExtracted JD keywords to inject: ${keywords.join(', ')}`;

  log.info('Generating tailored resume with gpt-4.1…', { company: companyArg });
  const timer = log.time('tailoring');

  const tailored = await tailorResume(jdText, cvText, profileContext);
  timer.done('Resume tailored');

  const resumesDir = join(ROOT, 'resumes');
  if (!existsSync(resumesDir)) mkdirSync(resumesDir, { recursive: true });

  const date  = new Date().toISOString().split('T')[0];
  const slug  = companyArg.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const fname = join(resumesDir, `${slug}-${date}.md`);

  const header = `<!-- Tailored for: ${companyArg} | Date: ${date} | Keywords: ${keywords.slice(0, 8).join(', ')} -->\n\n`;
  writeFileSync(fname, header + tailored);

  log.info('Tailored resume saved', { file: `resumes/${slug}-${date}.md` });
  log.info('Key terms injected', { terms: keywords.slice(0, 15) });

  console.log(`\n✅ Tailored resume saved: resumes/${slug}-${date}.md`);
  console.log(`   Keywords injected: ${keywords.slice(0, 8).join(', ')}`);
  console.log(`   Copy to your favourite PDF converter or use: npm run pdf`);
}

main().catch(e => { log.error('Fatal', { err: e.message }); process.exit(1); });
