#!/usr/bin/env node
/**
 * Interview Prep Engine — HireForge
 *
 * Given a company + role + JD, generates a full prep guide:
 *  - Company background, culture, tech stack
 *  - Real interview process (from Glassdoor data + AI inference)
 *  - Technical topics prioritised by likelihood
 *  - Day-by-day study plan based on days until interview
 *  - Curated links: blogs, LeetCode patterns, system design resources
 *  - Sends full guide to Telegram/WhatsApp
 *  - Saves as markdown in prep/ folder
 *
 * Usage:
 *   node services/interview-prep.mjs <company> <role> [jd-file] [days-until-interview]
 *   node services/interview-prep.mjs Razorpay "GenAI Engineer" jds/razorpay.txt 3
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { createLogger } from './lib/logger.mjs';
import { generateInterviewPrep } from './lib/azure-openai.mjs';
import { sendAll } from './notifier.mjs';

const log = createLogger('interview-prep');
const ROOT = resolve(process.cwd());

function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

// Company knowledge base — curated resources per well-known company
const COMPANY_RESOURCES = {
  razorpay: {
    glassdoor: 'https://www.glassdoor.com/Interview/Razorpay-Interview-Questions-E1640853.htm',
    techBlog: 'https://engineering.razorpay.com/',
    leetcodeFilter: 'https://leetcode.com/company/razorpay/',
    interviewProcess: '3–4 rounds: 1 online assessment (DSA, 60 min), 1–2 technical (DSA + system design), 1 hiring manager',
    topTopics: ['Arrays & Strings', 'Dynamic Programming', 'System Design (payments, idempotency)', 'LangChain/RAG', 'PostgreSQL/Redis'],
  },
  google: {
    glassdoor: 'https://www.glassdoor.com/Interview/Google-Software-Engineer-Interview-Questions-EI_IE9079.0,6_KO7,24.htm',
    techBlog: 'https://google.github.io/eng-practices/',
    leetcodeFilter: 'https://leetcode.com/company/google/',
    interviewProcess: '5–6 rounds: coding (4), system design (1), behavioral (googleyness)',
    topTopics: ['Trees & Graphs', 'DP', 'System Design at scale', 'BFS/DFS', 'Distributed systems'],
  },
  microsoft: {
    glassdoor: 'https://www.glassdoor.com/Interview/Microsoft-Software-Engineer-Interview-Questions-EI_IE1651.0,9_KO10,27.htm',
    techBlog: 'https://devblogs.microsoft.com/',
    leetcodeFilter: 'https://leetcode.com/company/microsoft/',
    interviewProcess: '4–5 rounds: coding (3), design (1), behavioral (1)',
    topTopics: ['Arrays', 'Trees', 'System Design', 'OOD', 'Behavioral (STAR)'],
  },
  flipkart: {
    glassdoor: 'https://www.glassdoor.com/Interview/Flipkart-Software-Development-Engineer-Interview-Questions-EI_IE717122.0,8_KO9,38.htm',
    techBlog: 'https://tech.flipkart.com/',
    leetcodeFilter: 'https://leetcode.com/company/flipkart/',
    interviewProcess: '4 rounds: 1 online (DSA), 2 technical (DSA + SD), 1 HR',
    topTopics: ['DP', 'Graph algorithms', 'System Design (e-commerce)', 'Low Level Design'],
  },
  swiggy: {
    glassdoor: 'https://www.glassdoor.com/Interview/Swiggy-Software-Engineer-Interview-Questions-EI_IE1095461.0,6_KO7,24.htm',
    techBlog: 'https://bytes.swiggy.com/',
    leetcodeFilter: 'https://leetcode.com/company/swiggy/',
    interviewProcess: '3–4 rounds: online DSA, technical (DSA + SD), system design, HR',
    topTopics: ['Graphs', 'DP', 'System Design (logistics)', 'Microservices'],
  },
  zomato: {
    glassdoor: 'https://www.glassdoor.com/Interview/Zomato-Software-Engineer-Interview-Questions-EI_IE722162.0,6_KO7,24.htm',
    techBlog: 'https://hyperedge.zomato.com/',
    leetcodeFilter: 'https://leetcode.com/company/zomato/',
    interviewProcess: '3 rounds: online DSA, technical, hiring manager',
    topTopics: ['Graph problems', 'DP', 'System Design', 'API design'],
  },
  zepto: {
    glassdoor: 'https://www.glassdoor.com/Interview/Zepto-Interview-Questions-E7597036.htm',
    techBlog: 'https://engineering.zepto.co.in/',
    leetcodeFilter: 'https://leetcode.com/company/zepto/',
    interviewProcess: '3 rounds: DSA, system design + LLD, cultural fit',
    topTopics: ['Graphs', 'DP', 'System Design (quick commerce)', 'LLD'],
  },
  meesho: {
    glassdoor: 'https://www.glassdoor.com/Interview/Meesho-Software-Engineer-Interview-Questions-EI_IE2158283.0,6_KO7,24.htm',
    techBlog: 'https://engineering.meesho.com/',
    leetcodeFilter: 'https://leetcode.com/company/meesho/',
    interviewProcess: '4 rounds: online assessment, 2 technical, 1 HR',
    topTopics: ['DP', 'Trees', 'System Design', 'LLD patterns'],
  },
  exotel: {
    glassdoor: 'https://www.glassdoor.com/Interview/Exotel-Interview-Questions-E656428.htm',
    techBlog: 'https://exotel.com/blog/',
    leetcodeFilter: 'https://leetcode.com/problemset/',
    interviewProcess: '3 rounds: technical screening, coding + design, HR',
    topTopics: ['WebSockets/VoIP', 'System Design (telephony)', 'Python/Node.js', 'DSA basics'],
  },
  atlassian: {
    glassdoor: 'https://www.glassdoor.com/Interview/Atlassian-Software-Engineer-Interview-Questions-EI_IE115699.0,9_KO10,27.htm',
    techBlog: 'https://blog.developer.atlassian.com/',
    leetcodeFilter: 'https://leetcode.com/company/atlassian/',
    interviewProcess: '4 rounds: values interview, coding × 2, system design',
    topTopics: ['Arrays/Strings', 'System Design', 'Values (TEAM principles)', 'OOD'],
  },
};

function getCompanyResources(company) {
  const key = company.toLowerCase().replace(/[^a-z]/g, '');
  for (const [k, v] of Object.entries(COMPANY_RESOURCES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

// Universal resource links
const UNIVERSAL_LINKS = {
  systemDesign: [
    'https://github.com/donnemartin/system-design-primer',
    'https://github.com/karanpratapsingh/system-design',
    'https://bytebytego.com/',
  ],
  dsa: [
    'https://neetcode.io/roadmap',
    'https://leetcode.com/study-plan/leetcode-75/',
    'https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2/',
  ],
  behavioral: [
    'https://www.techinterviewhandbook.org/behavioral-interview/',
    'https://www.levels.fyi/',
  ],
  genai: [
    'https://github.com/microsoft/generative-ai-for-beginners',
    'https://learnprompting.org/',
    'https://www.deeplearning.ai/short-courses/',
    'https://python.langchain.com/docs/get_started/introduction',
    'https://docs.llamaindex.ai/en/stable/',
  ],
};

function buildDayPlan(daysLeft, topTopics) {
  if (daysLeft <= 0) return '⚡ *Interview is today!* Focus only on fundamentals + behavioral.';
  const plan = [`📅 *${daysLeft}-Day Study Plan*\n`];

  if (daysLeft === 1) {
    plan.push('**Day 1 (today):**');
    plan.push(`• Morning: ${topTopics[0] || 'Review core DSA'}`);
    plan.push(`• Afternoon: ${topTopics[1] || 'System design brush-up'}`);
    plan.push('• Evening: Behavioral stories (STAR format), mock questions');
    plan.push('• Night: Sleep early. No cramming.');
  } else if (daysLeft <= 3) {
    for (let d = 1; d <= Math.min(daysLeft, 3); d++) {
      const topic = topTopics[d - 1] || 'Review & practice';
      plan.push(`**Day ${d}:** ${topic} — solve 3–5 LeetCode problems on this topic`);
    }
    plan.push(`**Final day:** Mock interview + behavioral prep`);
  } else {
    plan.push(`**Days 1–${Math.floor(daysLeft * 0.5)}:** DSA — ${topTopics.slice(0, 3).join(', ')}`);
    plan.push(`**Days ${Math.floor(daysLeft * 0.5) + 1}–${Math.floor(daysLeft * 0.8)}:** System Design + LLD`);
    plan.push(`**Days ${Math.floor(daysLeft * 0.8) + 1}–${daysLeft - 1}:** Company-specific practice + past questions`);
    plan.push(`**Final day:** Mock interview + behavioral + light review`);
  }
  return plan.join('\n');
}

async function generatePrep(company, role, jdText, daysLeft) {
  log.info('Generating interview prep', { company, role, daysLeft });
  const timer = log.time('prep-generation');

  const cvText = existsSync(join(ROOT, 'cv.md'))
    ? readFileSync(join(ROOT, 'cv.md'), 'utf-8')
    : '';

  const resources = getCompanyResources(company);

  // Try to load pre-scraped company research
  let researchData = null;
  const researchPath = join(ROOT, 'data', 'company-research', `${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`);
  if (existsSync(researchPath)) {
    try {
      researchData = JSON.parse(readFileSync(researchPath, 'utf-8'));
      log.info('Loaded company research', { company });
    } catch { /* ignore */ }
  }

  // Build Glassdoor context
  let glassdoorContext;
  if (researchData) {
    glassdoorContext = `Company research:\nOverview: ${researchData.overview || ''}\nInterview process: ${researchData.interviewProcess || ''}\nCommon questions: ${(researchData.commonQuestions || []).join('; ')}\nTips: ${(researchData.tipsFromCandidates || []).join('; ')}\nKey topics: ${(researchData.keyTopics || []).join(', ')}`;
  } else if (resources) {
    glassdoorContext = `Interview process at ${company}: ${resources.interviewProcess}\nTop topics reported: ${resources.topTopics.join(', ')}`;
  } else {
    glassdoorContext = `Research ${company}'s interview process on Glassdoor. Focus on technical rounds typical for ${role} roles.`;
  }

  // AI-generated deep prep
  const aiPrep = await generateInterviewPrep(company, role, jdText || `Role: ${role} at ${company}`, cvText, glassdoorContext);
  timer.done('AI prep generated');

  const topTopics = resources?.topTopics || ['DSA', 'System Design', 'Behavioral'];
  const dayPlan   = buildDayPlan(daysLeft, topTopics);

  // Build full markdown guide
  const date = new Date().toISOString().split('T')[0];
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const guide = `# Interview Prep: ${role} @ ${company}
*Generated ${date} | ${daysLeft > 0 ? `${daysLeft} day(s) until interview` : 'Interview today!'}*

---

${aiPrep}

---

## Quick Reference Links

### Company-Specific
${resources ? [
  `- [Glassdoor Interview Questions](${resources.glassdoor})`,
  `- [Engineering Blog](${resources.techBlog})`,
  `- [LeetCode Company Filter](${resources.leetcodeFilter})`,
].join('\n') : `- [Glassdoor ${company} Interviews](https://www.glassdoor.com/Interview/${company}-Interview-Questions.htm)`}

### DSA Practice
${UNIVERSAL_LINKS.dsa.map(l => `- ${l}`).join('\n')}

### System Design
${UNIVERSAL_LINKS.systemDesign.map(l => `- ${l}`).join('\n')}

### GenAI / LLM (relevant for your profile)
${UNIVERSAL_LINKS.genai.map(l => `- ${l}`).join('\n')}

### Behavioral
${UNIVERSAL_LINKS.behavioral.map(l => `- ${l}`).join('\n')}

---

${dayPlan}

---

*Generated by HireForge · Powered by Azure OpenAI o4-mini*
`;

  // Save to file
  const prepDir = join(ROOT, 'prep');
  if (!existsSync(prepDir)) mkdirSync(prepDir, { recursive: true });
  const fname = join(prepDir, `${slug}-${date}.md`);
  writeFileSync(fname, guide);
  log.info('Prep guide saved', { file: fname });

  return { guide, fname };
}

async function main() {
  const company  = process.argv[2];
  const role     = process.argv[3];
  const jdArg    = process.argv[4];
  const daysLeft = parseInt(process.argv[5] || '3', 10);

  if (!company || !role) {
    console.log('Usage: node services/interview-prep.mjs <company> <role> [jd-file] [days-until-interview]');
    console.log('Example: node services/interview-prep.mjs Razorpay "GenAI Engineer" jds/razorpay.txt 3');
    process.exit(1);
  }

  let jdText = '';
  if (jdArg && existsSync(jdArg)) {
    jdText = readFileSync(jdArg, 'utf-8');
    log.info('JD loaded', { file: jdArg, chars: jdText.length });
  }

  const { guide, fname } = await generatePrep(company, role, jdText, daysLeft);

  // Send to Telegram (chunked) and WhatsApp (summary)
  const telegramMsg = [
    `🎯 *Interview Prep Ready: ${role} @ ${company}*`,
    `${daysLeft > 0 ? `⏳ ${daysLeft} day(s) until interview` : '⚡ Interview is today!'}`,
    `📄 Full guide saved: ${fname.replace(ROOT + '/', '')}`,
    `\n` + guide.slice(0, 3500),
  ].join('\n');

  await sendAll(telegramMsg);

  log.info('Done! Open the prep guide:', { file: fname.replace(ROOT + '/', '') });
}

main().catch(e => { log.error('Fatal', { err: e.message }); process.exit(1); });
