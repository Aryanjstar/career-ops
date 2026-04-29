"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase, Target, FileText, Mail, GraduationCap,
  Activity, ArrowRight, Zap, RefreshCw, Bot,
  CheckCircle2, Clock, Send, Search, ScrollText,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface SystemStatus {
  status: string;
  autoApply: boolean;
  lastScrape: string | null;
  lastLog: string | null;
}

interface Stats {
  total: number;
  applied: number;
  interviews: number;
  evaluated: number;
}

import type { Variants } from "framer-motion";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function HomePage() {
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [coldEmailCount, setColdEmailCount] = useState(0);
  const [interviewCount, setInterviewCount] = useState(0);
  const [userName, setUserName] = useState("you");

  useEffect(() => {
    apiFetch("/api/status").then(r => r.json()).then(setSysStatus).catch(() => {});
    apiFetch("/api/applications").then(r => r.json()).then(d => setStats(d.stats)).catch(() => {});
    apiFetch("/api/cold-emails").then(r => r.json()).then(d => setColdEmailCount(d.emails?.length || 0)).catch(() => {});
    apiFetch("/api/interviews").then(r => r.json()).then(d => setInterviewCount(d.interviews?.length || 0)).catch(() => {});
    apiFetch("/api/profile").then(r => r.json()).then(d => setUserName(d.candidate?.name || "you")).catch(() => {});
  }, []);

  const isRunning = sysStatus?.status === "running";
  const autoApplyOn = sysStatus?.autoApply;
  const lastScrape = sysStatus?.lastScrape
    ? new Date(sysStatus.lastScrape).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "Not yet";

  const modules = [
    { title: "Job Scanner", desc: "Scrapes 95+ companies every 6h via Greenhouse, Lever, Ashby APIs.", icon: Search, color: "text-blue-500", bg: "bg-blue-500/10", stat: `${stats?.total || 0} jobs`, href: "/pipeline" },
    { title: "Auto Apply", desc: "AI evaluates, tailors resume, applies via Playwright. Fully headless.", icon: Bot, color: "text-emerald-500", bg: "bg-emerald-500/10", stat: `${stats?.applied || 0} applied`, href: "/applications" },
    { title: "Resume Builder", desc: "Paste any JD — get an ATS-optimized LaTeX resume as PDF.", icon: FileText, color: "text-orange-500", bg: "bg-orange-500/10", stat: "On demand", href: "/resume-builder" },
    { title: "Cover Letter", desc: "AI researches the company, crafts 7 tailored paragraphs.", icon: ScrollText, color: "text-violet-500", bg: "bg-violet-500/10", stat: "On demand", href: "/cover-letter" },
    { title: "Cold Emails", desc: "Finds HR/founders, generates personalized outreach drafts.", icon: Mail, color: "text-pink-500", bg: "bg-pink-500/10", stat: `${coldEmailCount} drafts`, href: "/cold-emails" },
    { title: "Interview Prep", desc: "Tracks rounds, scrapes Glassdoor/Reddit, generates roadmaps.", icon: GraduationCap, color: "text-purple-500", bg: "bg-purple-500/10", stat: `${interviewCount} active`, href: "/interviews" },
    { title: "Dashboard", desc: "Real-time view of all scanned jobs, scores, and statuses.", icon: Target, color: "text-cyan-500", bg: "bg-cyan-500/10", stat: `${stats?.evaluated || 0} evaluated`, href: "/dashboard" },
  ];

  const pipeline = [
    { step: 1, label: "Scan", desc: "APIs + web search", icon: Search, color: "from-blue-500 to-blue-600" },
    { step: 2, label: "Evaluate", desc: "AI scores 0–5", icon: Zap, color: "from-amber-500 to-amber-600" },
    { step: 3, label: "Tailor", desc: "LaTeX + keywords", icon: FileText, color: "from-orange-500 to-orange-600" },
    { step: 4, label: "Apply", desc: "Playwright forms", icon: Send, color: "from-emerald-500 to-emerald-600" },
    { step: 5, label: "Notify", desc: "Telegram + Docs", icon: CheckCircle2, color: "from-purple-500 to-purple-600" },
    { step: 6, label: "Track", desc: "Interviews + prep", icon: GraduationCap, color: "from-cyan-500 to-cyan-600" },
  ];

  return (
    <div className="space-y-10 max-w-5xl mx-auto pb-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <div className="absolute -top-4 -left-4 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/5" />
        <div className="absolute top-8 right-8 h-24 w-24 rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/5" />
        <div className="relative space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
              <Briefcase className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="gradient-text">HireForge</span>
              </h1>
              <p className="text-xs text-muted-foreground">AI-Powered Job Search Automation</p>
            </div>
          </div>
          <p className="text-base text-muted-foreground max-w-2xl leading-relaxed">
            Fully automated pipeline for <span className="text-foreground font-medium">{userName}</span>.
            Scans companies, tailors resumes, generates cover letters, auto-applies, and sends you
            everything you need on Telegram.
          </p>
        </div>
      </motion.div>

      {/* System Status */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
      >
        <Card className="border-border/50 bg-card/80 glass glow">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className={`h-4 w-4 ${isRunning ? "text-green-400" : "text-red-400"}`} />
                <span className="text-sm font-medium">
                  System {isRunning ? "Running" : "Offline"}
                </span>
                {isRunning && <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />}
              </div>
              <Badge variant="outline" className={autoApplyOn
                ? "bg-green-500/10 text-green-500 border-green-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
              }>
                Auto-Apply: {autoApplyOn ? "ON" : "OFF"}
              </Badge>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3" />
                <span>Every 6h</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Last scan: {lastScrape}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* How It Works - Pipeline */}
      <div className="space-y-4">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-lg font-semibold"
        >
          How It Works
        </motion.h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {pipeline.map((p, i) => (
            <motion.div
              key={p.step}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={scaleIn}
              className="group relative flex flex-col items-center rounded-xl border border-border/50 bg-card/80 p-4 text-center transition-all hover:shadow-md hover:shadow-indigo-500/5 hover:border-indigo-500/30"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${p.color} text-white text-sm font-bold mb-3 shadow-sm`}>
                {p.step}
              </div>
              <p.icon className="h-4 w-4 text-muted-foreground mb-1.5" />
              <p className="text-xs font-semibold">{p.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {[
            { label: "Jobs Found", value: stats.total, color: "text-blue-500" },
            { label: "Applied", value: stats.applied, color: "text-emerald-500" },
            { label: "Evaluated", value: stats.evaluated, color: "text-amber-500" },
            { label: "Interviews", value: stats.interviews, color: "text-purple-500" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
            >
              <Card className="border-border/50 bg-card/80 text-center">
                <CardContent className="p-4">
                  <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{s.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Modules Grid */}
      <div className="space-y-4">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-lg font-semibold"
        >
          Modules
        </motion.h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m, i) => (
            <motion.div
              key={m.title}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
            >
              <Link href={m.href}>
                <Card className="group border-border/50 bg-card/80 hover:bg-card hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 cursor-pointer h-full hover:border-indigo-500/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${m.bg} transition-transform group-hover:scale-110 duration-300`}>
                        <m.icon className={`h-5 w-5 ${m.color}`} />
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                    <CardTitle className="text-sm font-semibold mt-3">{m.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
                    <Badge variant="outline" className="mt-3 text-[10px]">{m.stat}</Badge>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65 }}
          className="text-lg font-semibold"
        >
          Quick Actions
        </motion.h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/resume-builder", icon: FileText, color: "text-orange-500", bg: "bg-orange-500/10", label: "Tailor Resume", sub: "Paste JD, get PDF" },
            { href: "/cover-letter", icon: ScrollText, color: "text-violet-500", bg: "bg-violet-500/10", label: "Cover Letter", sub: "AI-researched letter" },
            { href: "/cold-emails", icon: Mail, color: "text-pink-500", bg: "bg-pink-500/10", label: "Cold Emails", sub: "Review outreach" },
            { href: "/dashboard", icon: Target, color: "text-cyan-500", bg: "bg-cyan-500/10", label: "Dashboard", sub: "All applications" },
          ].map((a, i) => (
            <motion.div
              key={a.href}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={scaleIn}
            >
              <Link href={a.href}>
                <div className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card/80 p-4 hover:bg-card hover:shadow-md hover:shadow-indigo-500/5 transition-all duration-300 cursor-pointer hover:border-indigo-500/30">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${a.bg} transition-transform group-hover:scale-110 duration-300`}>
                    <a.icon className={`h-5 w-5 ${a.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="text-[10px] text-muted-foreground">{a.sub}</p>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="rounded-xl border border-border/50 bg-card/50 p-5 text-xs text-muted-foreground space-y-1.5"
      >
        <p><span className="font-medium text-foreground/80">Stack:</span> Node.js + Azure Container Apps + Azure OpenAI + Playwright + Tectonic LaTeX + Next.js</p>
        <p><span className="font-medium text-foreground/80">Pipeline:</span> Runs every 6h autonomously. 95+ companies via Greenhouse, Lever, Ashby APIs.</p>
        <p><span className="font-medium text-foreground/80">Notifications:</span> Telegram job packets with tailored resume + cover letter PDFs for manual applications.</p>
      </motion.div>
    </div>
  );
}
