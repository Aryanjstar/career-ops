"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GraduationCap,
  Clock,
  BookOpen,
  ExternalLink,
  Sparkles,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Target,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { apiFetch, parseScore, extractUrlFromNotes } from "@/lib/api";

interface Application {
  id: number;
  date: string;
  company: string;
  role: string;
  score: string;
  status: string;
  notes: string;
  report?: string;
}

interface InterviewRound {
  number: number;
  type: string;
  date: string | null;
  status: string;
  notes: string;
  prepDone: boolean;
}

interface Interview {
  id: string;
  company: string;
  role: string;
  url: string;
  score: string;
  status: string;
  startDate: string;
  rounds: InterviewRound[];
  nextRound: number;
  result: string | null;
}

export default function InterviewsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [generatingPrep, setGeneratingPrep] = useState<string | null>(null);
  const [prepContent, setPrepContent] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [appsRes, intRes] = await Promise.all([
          apiFetch("/api/applications").then((r) => r.json()),
          apiFetch("/api/interviews").then((r) => r.json()).catch(() => ({ interviews: [] })),
        ]);
        setApps(appsRes.apps || []);
        setInterviews(intRes.interviews || []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const activeInterviews = interviews.filter((i) => i.status === "active");
  const completedInterviews = interviews.filter((i) => i.status === "completed");

  const appInterviews = apps.filter(
    (a) => a.status === "Interview" || a.status === "Responded"
  );
  const upcoming = apps.filter((a) => a.status === "Applied");

  const prepTargets = useMemo(() => {
    return apps
      .filter((a) => a.status === "Evaluated" && parseScore(a.score) >= 3.0)
      .sort((a, b) => parseScore(b.score) - parseScore(a.score))
      .slice(0, 12);
  }, [apps]);

  const getDaysLeft = (dateStr: string | null) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    return diff >= 0 ? diff : null;
  };

  const roundStatusColor = (status: string) => {
    switch (status) {
      case "passed": return "bg-green-500/10 text-green-400 border-green-500/20";
      case "failed": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "scheduled": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default: return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch("/api/interviews/sync", { method: "POST" });
      const data = await res.json();
      if (data.success && data.data) {
        setInterviews(data.data.interviews || []);
      }
    } catch { /* ignore */ }
    finally { setSyncing(false); }
  };

  const handleGeneratePrep = async (company: string, role: string) => {
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    setGeneratingPrep(slug);
    try {
      await apiFetch("/api/prep/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role, days: 7 }),
      });
      const prepRes = await apiFetch(`/api/prep/${slug}`);
      const prepData = await prepRes.json();
      if (prepData.content) {
        setPrepContent(prev => ({ ...prev, [slug]: prepData.content }));
      }
    } catch { /* ignore */ }
    finally { setGeneratingPrep(null); }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Interview Prep & Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Track interview rounds, prep roadmaps, and company research
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "text-xs border-border"
          )}
        >
          {syncing ? (
            <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Syncing...</>
          ) : (
            <><RefreshCw className="mr-1 h-3 w-3" /> Sync from Tracker</>
          )}
        </button>
      </motion.div>

      {activeInterviews.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Target className="h-5 w-5 text-purple-500" />
            Active Interviews — Round Tracking
          </h2>
          <div className="space-y-3">
            {activeInterviews.map((interview) => {
              const expanded = expandedId === interview.id;
              return (
                <Card key={interview.id} className="border-border bg-card border-l-2 border-l-purple-500">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <button
                        type="button"
                        className="flex items-start gap-2 text-left"
                        onClick={() => setExpandedId(expanded ? null : interview.id)}
                      >
                        {expanded ? <ChevronUp className="h-4 w-4 mt-1" /> : <ChevronDown className="h-4 w-4 mt-1" />}
                        <div>
                          <CardTitle className="text-base">{interview.company}</CardTitle>
                          <p className="text-sm text-muted-foreground">{interview.role}</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20">
                          Round {interview.nextRound}/{interview.rounds.length}
                        </Badge>
                        <span className="text-xs tabular-nums text-muted-foreground">{interview.score}</span>
                      </div>
                    </div>
                  </CardHeader>
                  {expanded && (
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        {interview.rounds.map((round) => {
                          const daysLeft = getDaysLeft(round.date);
                          return (
                            <div key={round.number} className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 p-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-xs font-medium">
                                {round.number}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{round.type}</p>
                                {round.date && (
                                  <p className="text-xs text-muted-foreground">
                                    {round.date}
                                    {daysLeft !== null && (
                                      <span className="ml-2 text-blue-400">
                                        ({daysLeft === 0 ? "Today" : `${daysLeft}d left`})
                                      </span>
                                    )}
                                  </p>
                                )}
                                {round.notes && <p className="text-xs text-muted-foreground/60 mt-0.5">{round.notes}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                {round.prepDone && <CheckCircle className="h-4 w-4 text-green-400" />}
                                <Badge className={roundStatusColor(round.status)}>{round.status}</Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {interview.url && (
                          <a href={interview.url} target="_blank" rel="noopener noreferrer"
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs border-border")}>
                            <ExternalLink className="mr-1 h-3 w-3" /> Job posting
                          </a>
                        )}
                        <a href={`https://www.google.com/search?q=${encodeURIComponent(interview.company + " " + interview.role + " interview experience")}`}
                          target="_blank" rel="noopener noreferrer"
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs border-border")}>
                          <BookOpen className="mr-1 h-3 w-3" /> Interview reviews
                        </a>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {completedInterviews.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium flex items-center gap-2">
            {completedInterviews.some((i) => i.result === "passed") ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-zinc-500" />
            )}
            Completed Interviews
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {completedInterviews.map((interview) => (
              <Card key={interview.id} className={cn("border-border bg-card border-l-2",
                interview.result === "passed" ? "border-l-green-500" : "border-l-zinc-500")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium">{interview.company}</p>
                      <p className="text-xs text-muted-foreground">{interview.role}</p>
                    </div>
                    <Badge className={interview.result === "passed"
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}>
                      {interview.result}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {interview.rounds.length} round(s) completed
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {prepTargets.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            High-fit roles — prep focus
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Evaluated listings with score of 3.0 or higher. Use the posting link and tailor your talking points to the JD.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {prepTargets.map((app) => {
              const url = extractUrlFromNotes(app.notes);
              return (
                <Card key={`prep-${app.id}-${app.company}`} className="border-border bg-card border-l-2 border-l-amber-500/80">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{app.company}</CardTitle>
                        <p className="text-sm text-muted-foreground line-clamp-2">{app.role}</p>
                      </div>
                      <Badge className="shrink-0 bg-amber-500/10 text-amber-400 border-amber-500/20 tabular-nums">{app.score}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs border-border")}>
                        <ExternalLink className="mr-1 h-3 w-3" /> Job posting
                      </a>
                    )}
                    <a href={`https://www.google.com/search?q=${encodeURIComponent(app.company + " " + app.role + " interview experience")}`}
                      target="_blank" rel="noopener noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs border-border")}>
                      <BookOpen className="mr-1 h-3 w-3" /> Find interview reviews
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const slug = app.company.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                        if (prepContent[slug]) return;
                        handleGeneratePrep(app.company, app.role);
                      }}
                      disabled={generatingPrep === app.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs border-border")}
                    >
                      {generatingPrep === app.company.toLowerCase().replace(/[^a-z0-9]+/g, "-") ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Generating...</>
                      ) : prepContent[app.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")] ? (
                        <><CheckCircle className="mr-1 h-3 w-3" /> Prep Ready</>
                      ) : (
                        <><Sparkles className="mr-1 h-3 w-3" /> Generate Prep</>
                      )}
                    </button>
                  </CardContent>
                  {prepContent[app.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")] && (
                    <CardContent className="pt-0">
                      <div className="rounded-md border border-border bg-secondary/20 p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {prepContent[app.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")]?.slice(0, 2000)}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            Applied — awaiting response
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((app) => (
              <Card key={`${app.company}-${app.role}`} className="border-border bg-card">
                <CardContent className="p-4">
                  <p className="text-sm font-medium">{app.company}</p>
                  <p className="text-xs text-muted-foreground">{app.role}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{app.date}</span>
                    <span className="text-xs tabular-nums">{app.score}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeInterviews.length === 0 && appInterviews.length === 0 && upcoming.length === 0 && prepTargets.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <GraduationCap className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-sm text-muted-foreground">No pipeline data yet</p>
            <p className="text-xs text-muted-foreground/60 text-center max-w-sm">
              After the next scrape cycle, evaluated roles and interview tracking will appear here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
