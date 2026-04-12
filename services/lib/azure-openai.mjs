import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
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

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
const API_KEY = process.env.AZURE_OPENAI_API_KEY;
const DEPLOYMENT = process.env.AZURE_OPENAI_CHATGPT_DEPLOYMENT || 'gpt-4.1';
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview';

if (!ENDPOINT || !API_KEY) {
  console.error('Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY in .env');
  process.exit(1);
}

export async function chatCompletion(messages, options = {}) {
  const {
    temperature = 0.7,
    maxTokens = 4096,
    systemPrompt = null,
  } = options;

  const allMessages = [];
  if (systemPrompt) {
    allMessages.push({ role: 'system', content: systemPrompt });
  }
  allMessages.push(...messages);

  const url = `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

  const body = {
    messages: allMessages,
    temperature,
    max_tokens: maxTokens,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Azure OpenAI error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function evaluate(jdText, cvText, profileContext) {
  const systemPrompt = `You are an expert career advisor and job evaluation engine. You evaluate job descriptions against a candidate's CV and profile to produce structured scoring and recommendations.

Scoring dimensions (1-5 scale):
1. Match con CV — Skills, experience, proof points alignment
2. North Star alignment — How well the role fits target archetypes
3. Comp — Salary vs market (5=top quartile, 1=well below)
4. Cultural signals — Company culture, growth, stability, remote policy
5. Red flags — Blockers, warnings (negative adjustments)
6. Global — Weighted average

Score interpretation:
- 4.5+ → Strong match, recommend applying immediately
- 4.0-4.4 → Good match, worth applying
- 3.5-3.9 → Decent but not ideal
- Below 3.5 → Recommend against applying

Output format: Structured markdown report with blocks A-F plus a Global Score.`;

  const userPrompt = `## Candidate CV
${cvText}

## Candidate Profile Context
${profileContext}

## Job Description to Evaluate
${jdText}

Produce a full evaluation report with:
- Block A: Role Summary (archetype, level, company stage, work mode)
- Block B: CV Match Analysis (skills match, gaps, proof points)
- Block C: Level & Strategy (seniority fit, growth potential)
- Block D: Compensation Research (market range, offer positioning)
- Block E: Personalization (cover letter angles, STAR stories)
- Block F: Interview Prep (likely questions, prep topics)
- Global Score: X.X/5 with reasoning

Be specific. Cite exact lines from the CV. Use real market data.`;

  return chatCompletion(
    [{ role: 'user', content: userPrompt }],
    { systemPrompt, temperature: 0.3, maxTokens: 8192 }
  );
}

export async function generateInterviewPrep(companyName, roleName, jdText, cvText, glassdoorData) {
  const systemPrompt = `You are an expert interview coach. Generate a comprehensive, personalized interview preparation roadmap.`;

  const userPrompt = `## Company: ${companyName}
## Role: ${roleName}

## Job Description
${jdText}

## Candidate CV
${cvText}

## Interview Data from Glassdoor/Reviews
${glassdoorData || 'No interview data available.'}

Generate a detailed interview prep roadmap:
1. Company Overview (what they do, tech stack, culture, recent news)
2. Interview Process (expected rounds based on data)
3. Technical Topics to Study (prioritized by likelihood)
4. Behavioral Questions (STAR format prep for top 5 likely questions)
5. System Design Topics (if applicable)
6. Coding Practice (specific LeetCode/problem types)
7. Day-by-Day Study Plan (based on time available)
8. Questions to Ask the Interviewer
9. Red Flags to Watch For

Be specific to this company and role. Reference the candidate's actual experience.`;

  return chatCompletion(
    [{ role: 'user', content: userPrompt }],
    { systemPrompt, temperature: 0.4, maxTokens: 8192 }
  );
}

export async function tailorResume(jdText, cvText, profileContext) {
  const systemPrompt = `You are an expert resume writer specializing in ATS-optimized resumes. Tailor the candidate's resume for the specific job description while maintaining truthfulness.`;

  const userPrompt = `## Original CV
${cvText}

## Profile Context
${profileContext}

## Target Job Description
${jdText}

Produce a tailored version of the CV in markdown format:
1. Rewrite the summary to match the JD keywords
2. Reorder and emphasize relevant experience bullets
3. Inject JD keywords naturally into existing achievements
4. Keep all metrics and facts truthful — only change framing
5. Highlight the most relevant projects first

Output the complete tailored CV in markdown.`;

  return chatCompletion(
    [{ role: 'user', content: userPrompt }],
    { systemPrompt, temperature: 0.3, maxTokens: 4096 }
  );
}
