"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  Code,
  Server,
  Brain,
  Cpu,
  Sparkles,
  Building2,
  FileText,
  GraduationCap,
} from "lucide-react";

const categories = [
  { id: "all", label: "All", count: 0 },
  { id: "dsa", label: "DSA Practice", count: 0 },
  { id: "system-design", label: "System Design", count: 0 },
  { id: "behavioral", label: "Behavioral", count: 0 },
  { id: "ai-ml", label: "AI/ML", count: 0 },
  { id: "genai", label: "GenAI/LLM", count: 0 },
  { id: "company-prep", label: "Company Prep", count: 0 },
  { id: "resume", label: "Resume/CV", count: 0 },
  { id: "general", label: "General", count: 0 },
];

const resources = [
  {
    title: "LeetCode",
    url: "https://leetcode.com",
    description: "The standard for coding interview prep. 2500+ problems with company tags and difficulty levels.",
    category: "dsa",
    icon: Code,
    color: "text-yellow-500",
  },
  {
    title: "NeetCode 150",
    url: "https://neetcode.io/practice",
    description: "Curated 150 problems covering all major patterns. Better than grinding 1000 random problems.",
    category: "dsa",
    icon: Code,
    color: "text-yellow-500",
  },
  {
    title: "Codeforces",
    url: "https://codeforces.com",
    description: "Competitive programming contests. Great for building speed and problem-solving instincts.",
    category: "dsa",
    icon: Code,
    color: "text-yellow-500",
  },
  {
    title: "GeeksforGeeks",
    url: "https://www.geeksforgeeks.org",
    description: "Comprehensive DSA articles, company-wise questions, and interview experiences.",
    category: "dsa",
    icon: Code,
    color: "text-yellow-500",
  },
  {
    title: "ByteByteGo (Alex Xu)",
    url: "https://bytebytego.com",
    description: "Visual system design guides. The System Design Interview book is the gold standard.",
    category: "system-design",
    icon: Server,
    color: "text-blue-500",
  },
  {
    title: "System Design Primer",
    url: "https://github.com/donnemartin/system-design-primer",
    description: "Free GitHub repo with comprehensive system design topics, diagrams, and solutions.",
    category: "system-design",
    icon: Server,
    color: "text-blue-500",
  },
  {
    title: "Designing Data-Intensive Applications",
    url: "https://dataintensive.net",
    description: "Martin Kleppmann's book. Deep understanding of databases, distributed systems, and data pipelines.",
    category: "system-design",
    icon: Server,
    color: "text-blue-500",
  },
  {
    title: "High Scalability",
    url: "http://highscalability.com",
    description: "Real-world architecture case studies from companies like Netflix, Uber, and Instagram.",
    category: "system-design",
    icon: Server,
    color: "text-blue-500",
  },
  {
    title: "Grokking the System Design Interview",
    url: "https://www.designgurus.io/course/grokking-the-system-design-interview",
    description: "Step-by-step walkthroughs of 25+ system design problems. Great for structured learning.",
    category: "system-design",
    icon: Server,
    color: "text-blue-500",
  },
  {
    title: "STAR Method Guide",
    url: "https://www.themuse.com/advice/star-interview-method",
    description: "The definitive guide to structuring behavioral interview answers with the STAR framework.",
    category: "behavioral",
    icon: Brain,
    color: "text-purple-500",
  },
  {
    title: "Amazon Leadership Principles",
    url: "https://www.amazon.jobs/content/en/our-workplace/leadership-principles",
    description: "Even for non-Amazon interviews, these 16 principles map to universal behavioral themes.",
    category: "behavioral",
    icon: Brain,
    color: "text-purple-500",
  },
  {
    title: "Hugging Face",
    url: "https://huggingface.co",
    description: "The GitHub of ML. Models, datasets, spaces, and the transformers library.",
    category: "ai-ml",
    icon: Cpu,
    color: "text-green-500",
  },
  {
    title: "Papers with Code",
    url: "https://paperswithcode.com",
    description: "Latest ML research papers with open-source implementations and benchmarks.",
    category: "ai-ml",
    icon: Cpu,
    color: "text-green-500",
  },
  {
    title: "Fast.ai",
    url: "https://www.fast.ai",
    description: "Practical deep learning courses. Top-down approach: build things first, theory later.",
    category: "ai-ml",
    icon: Cpu,
    color: "text-green-500",
  },
  {
    title: "LangChain Documentation",
    url: "https://python.langchain.com",
    description: "Building LLM applications: chains, agents, RAG, tool-calling, memory, and more.",
    category: "genai",
    icon: Sparkles,
    color: "text-violet-500",
  },
  {
    title: "OpenAI Cookbook",
    url: "https://cookbook.openai.com",
    description: "Practical examples and best practices for building with GPT, embeddings, and function calling.",
    category: "genai",
    icon: Sparkles,
    color: "text-violet-500",
  },
  {
    title: "Prompt Engineering Guide",
    url: "https://www.promptingguide.ai",
    description: "Comprehensive guide to prompt engineering techniques: few-shot, chain-of-thought, ReAct, and more.",
    category: "genai",
    icon: Sparkles,
    color: "text-violet-500",
  },
  {
    title: "Anthropic Research",
    url: "https://www.anthropic.com/research",
    description: "Constitutional AI, RLHF, interpretability research. Essential for AI safety interviews.",
    category: "genai",
    icon: Sparkles,
    color: "text-violet-500",
  },
  {
    title: "Glassdoor",
    url: "https://www.glassdoor.com",
    description: "Interview experiences, salary data, and company reviews from real employees.",
    category: "company-prep",
    icon: Building2,
    color: "text-cyan-500",
  },
  {
    title: "Levels.fyi",
    url: "https://www.levels.fyi",
    description: "The most accurate tech compensation data. Compare offers across companies and levels.",
    category: "company-prep",
    icon: Building2,
    color: "text-cyan-500",
  },
  {
    title: "Blind",
    url: "https://www.teamblind.com",
    description: "Anonymous professional network. Insider info on interviews, compensation, and company culture.",
    category: "company-prep",
    icon: Building2,
    color: "text-cyan-500",
  },
  {
    title: "Jake's Resume Template",
    url: "https://www.overleaf.com/latex/templates/jakes-resume-anonymous/cstpnrbkhndn",
    description: "Clean, ATS-friendly single-column LaTeX resume template. The standard for tech resumes.",
    category: "resume",
    icon: FileText,
    color: "text-orange-500",
  },
  {
    title: "FlowCV",
    url: "https://flowcv.io",
    description: "Free online resume builder with ATS-tested templates. Good for non-LaTeX users.",
    category: "resume",
    icon: FileText,
    color: "text-orange-500",
  },
  {
    title: "Roadmap.sh",
    url: "https://roadmap.sh",
    description: "Visual learning roadmaps for backend, frontend, DevOps, AI, and more. Great for planning study.",
    category: "general",
    icon: GraduationCap,
    color: "text-emerald-500",
  },
  {
    title: "Tech Interview Handbook",
    url: "https://www.techinterviewhandbook.org",
    description: "Free comprehensive guide covering resume, coding, system design, and behavioral interviews.",
    category: "general",
    icon: GraduationCap,
    color: "text-emerald-500",
  },
];

categories.forEach((cat) => {
  cat.count =
    cat.id === "all"
      ? resources.length
      : resources.filter((r) => r.category === cat.id).length;
});

export default function ResourcesPage() {
  const [activeCategory, setActiveCategory] = useState("all");

  const filtered =
    activeCategory === "all"
      ? resources
      : resources.filter((r) => r.category === activeCategory);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
        <p className="text-sm text-muted-foreground">
          Curated learning resources for technical interviews, system design,
          and career growth
        </p>
      </motion.div>

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
              activeCategory === cat.id
                ? "border-blue-500 bg-blue-500/10 text-blue-500"
                : "border-border bg-card text-muted-foreground hover:bg-secondary"
            }`}
          >
            {cat.label}
            <span className="text-[10px] tabular-nums">({cat.count})</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((resource) => (
          <a
            key={resource.url}
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Card className="border-border bg-card hover:bg-secondary/30 transition-colors h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <resource.icon
                      className={`h-4 w-4 ${resource.color}`}
                    />
                    <CardTitle className="text-sm">{resource.title}</CardTitle>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {resource.description}
                </p>
                <Badge
                  variant="outline"
                  className="mt-3 text-[10px]"
                >
                  {
                    categories.find((c) => c.id === resource.category)
                      ?.label
                  }
                </Badge>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-4 text-xs text-muted-foreground">
          <p>
            These resources are curated based on what actually helps in tech
            interviews. Missing something?{" "}
            <span className="text-foreground">
              Edit the resources list in the source code to add your own.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
