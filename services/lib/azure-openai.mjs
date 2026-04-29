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
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview';

// o4-mini: deep reasoning for evaluation & interview prep
const REASONING_DEPLOYMENT = process.env.AZURE_OPENAI_CHATGPT_DEPLOYMENT || 'o4-mini';
// gpt-4.1-mini: fast & cheap for summaries, notifications
const FAST_DEPLOYMENT = process.env.AZURE_OPENAI_FAST_DEPLOYMENT || 'gpt-4.1-mini';
// gpt-4.1: standard tasks
const STANDARD_DEPLOYMENT = process.env.AZURE_OPENAI_STANDARD_DEPLOYMENT || 'gpt-4.1';

if (!ENDPOINT || !API_KEY) {
  console.warn('⚠️  Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY in .env — AI features disabled');
}

export async function chatCompletion(messages, options = {}) {
  if (!ENDPOINT || !API_KEY) {
    throw new Error('Azure OpenAI not configured — set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in .env');
  }
  const {
    temperature = 0.7,
    maxTokens = 4096,
    systemPrompt = null,
    deployment = REASONING_DEPLOYMENT,
  } = options;

  const allMessages = [];
  if (systemPrompt) {
    allMessages.push({ role: 'system', content: systemPrompt });
  }
  allMessages.push(...messages);

  const url = `${ENDPOINT}/openai/deployments/${deployment}/chat/completions?api-version=${API_VERSION}`;

  // o4-mini uses max_completion_tokens and doesn't support temperature
  const isReasoningModel = deployment.startsWith('o1') || deployment.startsWith('o3') || deployment.startsWith('o4');
  const body = {
    messages: allMessages,
    ...(isReasoningModel
      ? { max_completion_tokens: maxTokens }
      : { temperature, max_tokens: maxTokens }),
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

export async function chatCompletionFast(messages, options = {}) {
  return chatCompletion(messages, { ...options, deployment: FAST_DEPLOYMENT });
}

export async function chatCompletionStandard(messages, options = {}) {
  return chatCompletion(messages, { ...options, deployment: STANDARD_DEPLOYMENT });
}

export async function evaluate(jdText, cvText, profileContext) {
  const systemPrompt = `You are an expert career advisor evaluating jobs for a FINAL-YEAR CS STUDENT graduating in May 2026, looking for fresher/new-grad/entry-level roles.

CANDIDATE PROFILE:
- Aryan Jaiswal, B.Tech CSE, IIIT Dharwad (graduating 2026)
- Production GenAI + ML + Full-stack experience (Exotel, Joveo, Infosys)
- Strong: LLMs, RAG, Python, Node.js, React, Azure, Docker, system design
- Interests: AI/ML, GenAI, Full-stack, Data Science, Fintech, Remote roles
- Open to: India (any city) + Remote international roles

Scoring dimensions (1-5 scale):
1. Skills Match — How well candidate's skills align with JD requirements
2. Level Fit — Is this genuinely open to fresh grads / 0-2yr experience?
3. Growth — Learning potential, tech stack relevance, career trajectory
4. Culture & Mode — Remote-friendly, startup vs enterprise, India presence
5. Interest — Fintech, AI-native, data science, cutting-edge tech get a boost

IMPORTANT SCORING RULES:
- Score GENEROUSLY for roles that match the candidate's skill set even partially
- Remote roles get +0.5 boost
- Fintech/payments roles get +0.3 boost
- AI/ML/GenAI-native companies get +0.5 boost
- Data science roles with Python get +0.3 boost
- If the role says "senior" or "5+ years" explicitly, score 1.0 max
- If location is US/UK-only with no remote option, score 2.0 max

Score interpretation:
- 4.0+ → Strong match, apply immediately
- 3.0-3.9 → Worth applying, good learning opportunity
- Below 3.0 → Skip

Output format: Structured markdown report with Global Score: X.X/5`;

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

  // Use o4-mini for deep evaluation reasoning
  return chatCompletion(
    [{ role: 'user', content: userPrompt }],
    { systemPrompt, maxTokens: 8192, deployment: REASONING_DEPLOYMENT }
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

  // Use o4-mini for deep reasoning on interview prep
  return chatCompletion(
    [{ role: 'user', content: userPrompt }],
    { systemPrompt, maxTokens: 8192, deployment: REASONING_DEPLOYMENT }
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

  // Use gpt-4.1 for resume tailoring (structured output, no deep reasoning needed)
  return chatCompletion(
    [{ role: 'user', content: userPrompt }],
    { systemPrompt, temperature: 0.3, maxTokens: 4096, deployment: STANDARD_DEPLOYMENT }
  );
}
