"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronUp,
  Brain,
  Target,
  FileText,
  Mail,
  DollarSign,
  Zap,
} from "lucide-react";

const articles = [
  {
    id: "behavioral-prep",
    title: "Behavioral Interviews: The STAR+R Framework",
    category: "Interview Prep",
    icon: Brain,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    summary:
      "Most candidates lose behavioral rounds not because they lack experience, but because they lack structure. STAR+R fixes that.",
    content: `**Situation → Task → Action → Result → Reflection**

The extra R (Reflection) is what separates good from great answers. After every story, add what you learned and how it changed your approach.

**Building Your Story Bank:**
- Map 8-10 career stories that cover: leadership, conflict, failure, ambiguity, tight deadlines, cross-team collaboration
- Each story should have concrete metrics (reduced X by 40%, served 150K users, cut deploy time from hours to minutes)
- Practice the 2-minute version and the 30-second version of each

**Common Behavioral Questions Pattern:**
- "Tell me about a time when..." → use STAR+R
- "How would you handle..." → use a real example first, then add how you'd adapt
- "What's your biggest weakness?" → pick something real you've actively improved

**The Amazon Leadership Principles hack:** Even if you're not interviewing at Amazon, their 16 LPs map to universal interview themes. Prepare one story for each LP and you'll cover 90% of behavioral questions at any company.

**Pro tip:** Record yourself answering 3 questions. You'll immediately spot filler words, rambling, and missing metrics. Fix those and you're ahead of 80% of candidates.`,
  },
  {
    id: "ats-resume",
    title: "ATS-Optimized Resumes: What Actually Works",
    category: "Resume",
    icon: FileText,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    summary:
      "Your resume gets 6 seconds of human attention — but first it has to pass the machine. Here's what the ATS actually checks.",
    content: `**What ATS Systems Actually Do:**
- Parse your resume into structured data (name, experience, skills, education)
- Match keywords from the JD against your resume
- Score the match and rank candidates

**Rules That Matter:**
1. **Single column layout** — multi-column breaks most parsers
2. **Standard section headings** — "Experience", "Education", "Skills", not creative alternatives
3. **No graphics, tables, or text boxes** — invisible to ATS
4. **PDF format** — Word docs can lose formatting, images get stripped
5. **Keywords from the JD** — if they say "React" and you write "ReactJS", that might not match

**What Doesn't Matter:**
- Fancy fonts (ATS ignores them)
- Color (ATS ignores it, humans appreciate subtle use)
- Length debates (1 page for < 5 years, 2 pages for senior roles)

**The Real Strategy:**
Tailor every resume. Not manually — use automation. Extract the top 15 keywords from each JD, reframe your bullets to include them naturally, and reorder your skills section to lead with what the JD emphasizes.

**Metrics win interviews.** "Built a monitoring system" vs "Built Prometheus/Grafana monitoring with 30s real-time alerts, reducing incident response from hours to minutes" — the second gets callbacks.`,
  },
  {
    id: "system-design",
    title: "System Design Interviews: A Practical Framework",
    category: "Technical",
    icon: Zap,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    summary:
      "System design interviews test your ability to think at scale. Here's a repeatable framework that works for any problem.",
    content: `**The 4-Step Framework (45 min):**

**1. Clarify Requirements (5 min)**
- Functional: what does the system do?
- Non-functional: scale, latency, availability, consistency
- Ask about DAU, read/write ratio, data size
- Get concrete numbers: "10M DAU, 100:1 read/write, 99.9% availability"

**2. High-Level Design (10 min)**
- Draw the main components: clients, load balancer, API servers, database, cache, message queue
- Define API contracts (REST endpoints with request/response)
- Choose database type with reasoning (SQL vs NoSQL vs both)

**3. Deep Dive (20 min)**
- Pick the most complex component and design it in detail
- Data model with specific schema
- Scaling strategy: horizontal scaling, sharding, replication
- Caching strategy: what to cache, TTL, invalidation
- Handle edge cases: race conditions, failures, hot keys

**4. Wrap Up (10 min)**
- Discuss trade-offs you made
- Mention what you'd add with more time (monitoring, rate limiting, analytics)
- Address bottlenecks and how you'd handle 10x growth

**Top Resources:**
- "Designing Data-Intensive Applications" by Martin Kleppmann
- ByteByteGo (Alex Xu) YouTube + newsletter
- System Design Primer on GitHub (donnemartin)`,
  },
  {
    id: "cold-outreach",
    title: "Cold Outreach That Gets Responses",
    category: "Job Search",
    icon: Mail,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    summary:
      "The average cold email response rate is 1-5%. Here's how to get to 20%+ with research-driven personalization.",
    content: `**The 4-Sentence Email:**
1. **Hook**: Show you know them/their company (not generic flattery)
2. **Relevance**: One line connecting your experience to their needs
3. **Proof**: One concrete metric or achievement
4. **Ask**: Specific, low-commitment CTA

**What Works:**
- Subject line: "{Company} + {your skill}" or "Quick question about {team}"
- Mention a specific product, blog post, or recent news
- Keep it under 125 words
- Include your portfolio/GitHub link
- Send Tuesday-Thursday, 9-11 AM their timezone

**What Doesn't:**
- "I'm passionate about..." (everyone says this)
- Attachments in first email (looks spammy)
- Long paragraphs about your background
- Generic templates sent to 100 people

**The Follow-Up Cadence:**
- Day 0: Initial email
- Day 3: Bump ("Just wanted to make sure this didn't get buried")
- Day 7: New angle (share a relevant article or project)
- Day 14: Final ("I'll stop reaching out, but if timing changes...")

**Finding the Right Person:**
- Hiring manager > recruiter > HR for initial outreach
- LinkedIn Sales Navigator free trial for email finding
- Check company engineering blog for team member names`,
  },
  {
    id: "salary-negotiation",
    title: "Salary Negotiation: Data-Driven Approach",
    category: "Negotiation",
    icon: DollarSign,
    color: "text-green-500",
    bg: "bg-green-500/10",
    summary:
      "You leave 10-20% on the table by not negotiating. Here's how to negotiate with data, not emotion.",
    content: `**Before the Negotiation:**
1. Research market rates: Levels.fyi, Glassdoor, Blind, Payscale
2. Know your BATNA (Best Alternative to Negotiated Agreement)
3. Have a specific number, not a range — ranges anchor to the low end
4. Calculate total comp, not just base (RSUs, bonus, benefits, WFH stipend)

**The Negotiation Script:**
- "Thank you for the offer. I'm excited about the role and {specific thing you like}."
- "Based on my research and the market rate for this role, I was expecting something closer to {number}."
- "I'd like to understand if there's flexibility on {specific component}."
- Never say: "I need X because of my expenses" — negotiate on market value, not personal needs

**What's Negotiable:**
- Base salary (most obvious)
- Signing bonus (often easier to get than base increase)
- RSU/equity grants
- Annual bonus target
- Start date
- Remote/hybrid flexibility
- Professional development budget
- Title (can affect future earnings)

**Timing:**
- Negotiate AFTER the offer, not during interviews
- Take 2-3 days to respond ("I'd like to review this carefully")
- Never accept on the spot, even if it's great

**If They Say "This is Final":**
- "I understand. Could we revisit compensation at the 6-month review?"
- "Would a signing bonus be possible to bridge the gap?"
- "Could we adjust the equity component instead?"`,
  },
  {
    id: "job-search-automation",
    title: "Automating Your Job Search Pipeline",
    category: "Strategy",
    icon: Target,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    summary:
      "Quality over quantity: how to apply to fewer jobs and get more offers by building a systematic pipeline.",
    content: `**The Pipeline Mindset:**
Instead of "apply to everything and pray," build a systematic funnel:

1. **Scan** (automated): Monitor 50-100 company career pages daily
2. **Filter** (automated): Score each JD against your profile (skills match, culture fit, comp range)
3. **Evaluate** (semi-auto): Deep-dive the top 20% — company research, team analysis, growth trajectory
4. **Tailor** (automated): Generate company-specific resume + cover letter with JD keywords
5. **Apply** (human review): You review everything before submitting
6. **Track** (automated): Log every application, follow up on schedule

**Why This Works:**
- 5 tailored applications > 50 generic ones
- You focus energy on high-fit roles
- Automated tracking prevents dropped balls
- Data helps you learn what works (which roles respond, which keywords matter)

**Tools of the Trade:**
- Job scanning: Greenhouse/Lever/Ashby APIs (most companies use one of these)
- Resume tailoring: LaTeX templates + AI keyword matching
- Application tracking: Simple markdown table or spreadsheet
- Follow-up cadence: Calendar reminders at Day 3, 7, 14

**The 80/20 of Job Search:**
- 80% of offers come from 20% of your applications (the tailored ones)
- 80% of your time should be on research and preparation, not mass applying
- The best opportunities often come from 2nd-degree connections, not job boards`,
  },
];

export default function BlogPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">Blog</h1>
        <p className="text-sm text-muted-foreground">
          Career insights, interview strategies, and job search best practices
        </p>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Articles</p>
            <p className="text-2xl font-semibold tabular-nums">
              {articles.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Categories</p>
            <p className="text-2xl font-semibold tabular-nums">
              {new Set(articles.map((a) => a.category)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {articles.map((article) => {
          const expanded = expandedId === article.id;
          return (
            <Card key={article.id} className="border-border bg-card">
              <CardHeader className="pb-3">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    setExpandedId(expanded ? null : article.id)
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${article.bg} shrink-0`}
                      >
                        <article.icon
                          className={`h-5 w-5 ${article.color}`}
                        />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {article.title}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {article.summary}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className="text-[10px] hidden sm:inline-flex"
                      >
                        {article.category}
                      </Badge>
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>
              </CardHeader>
              {expanded && (
                <CardContent>
                  <div className="rounded-md border border-border bg-secondary/20 p-4">
                    <div className="prose prose-sm prose-invert max-w-none">
                      {article.content.split("\n\n").map((block, i) => {
                        if (block.startsWith("**") && block.endsWith("**")) {
                          return (
                            <h3
                              key={i}
                              className="text-sm font-semibold text-foreground mt-4 mb-2 first:mt-0"
                            >
                              {block.replace(/\*\*/g, "")}
                            </h3>
                          );
                        }
                        if (block.startsWith("**")) {
                          const [title, ...rest] = block.split("\n");
                          return (
                            <div key={i} className="mb-3">
                              <p className="text-sm font-medium text-foreground mb-1">
                                {title.replace(/\*\*/g, "")}
                              </p>
                              {rest.map((line, j) => (
                                <p
                                  key={j}
                                  className="text-sm text-muted-foreground leading-relaxed"
                                >
                                  {line.replace(/\*\*/g, "")}
                                </p>
                              ))}
                            </div>
                          );
                        }
                        return (
                          <p
                            key={i}
                            className="text-sm text-muted-foreground leading-relaxed mb-2"
                          >
                            {block.replace(/\*\*/g, "")}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
