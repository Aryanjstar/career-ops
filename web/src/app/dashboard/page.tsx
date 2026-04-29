"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase, Target, Trophy, TrendingUp, Clock,
  Filter, ExternalLink, ChevronDown
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Stats {
  total: number; applied: number; interviews: number; offers: number;
  rejected: number; evaluated: number; avgScore: string;
  byStatus: Record<string, number>;
}
interface Application {
  id: number; date: string; company: string; role: string;
  score: string; status: string; notes: string; pdf?: string; report?: string;
}

const statusColors: Record<string, string> = {
  Evaluated: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  Applied: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  Responded: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  Interview: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  Offer: "bg-green-500/10 text-green-500 border-green-500/20",
  Rejected: "bg-red-500/10 text-red-500 border-red-500/20",
  Discarded: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  SKIP: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const ROLE_FILTERS = [
  { label: "All", value: "all" },
  { label: "AI/ML", value: "ai" },
  { label: "Frontend", value: "frontend" },
  { label: "Backend", value: "backend" },
  { label: "Full Stack", value: "fullstack" },
  { label: "DevOps/SRE", value: "devops" },
  { label: "Data Science", value: "data" },
  { label: "Fintech", value: "fintech" },
];

function classifyRole(role: string): string[] {
  const r = role.toLowerCase();
  const tags: string[] = [];
  if (/\b(ai|ml|machine learning|llm|genai|nlp|deep learning|computer vision)\b/.test(r)) tags.push("ai");
  if (/\b(frontend|react|vue|angular|ui)\b/.test(r)) tags.push("frontend");
  if (/\b(backend|server|api|node|python|java|go)\b/.test(r)) tags.push("backend");
  if (/\b(full.?stack|fullstack)\b/.test(r)) tags.push("fullstack");
  if (/\b(devops|sre|infrastructure|platform|cloud|reliability)\b/.test(r)) tags.push("devops");
  if (/\b(data.?scien|data.?engineer|data.?analyst|analytics)\b/.test(r)) tags.push("data");
  if (/\b(fintech|payment|finance|trading|risk)\b/.test(r)) tags.push("fintech");
  if (tags.length === 0) tags.push("other");
  return tags;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchData = () => {
    apiFetch("/api/applications")
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats);
        setApps(data.apps || []);
        setLoading(false);
        setLastUpdated(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }));
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredApps = useMemo(() => {
    return apps.filter(app => {
      if (statusFilter !== "all" && app.status !== statusFilter) return false;
      if (roleFilter !== "all") {
        const tags = classifyRole(app.role);
        if (!tags.includes(roleFilter)) return false;
      }
      return true;
    });
  }, [apps, roleFilter, statusFilter]);

  const appliedCount = apps.filter(a => a.status === "Applied").length;
  const evaluatedCount = apps.filter(a => a.status === "Evaluated").length;
  const activeCount = apps.filter(a => !["SKIP", "Rejected", "Discarded"].includes(a.status)).length;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const kpis = [
    { label: "Total Scanned", value: stats?.total || 0, icon: Briefcase, color: "text-blue-500" },
    { label: "Applied", value: appliedCount, icon: Target, color: "text-green-500" },
    { label: "Pending Review", value: evaluatedCount, icon: Clock, color: "text-yellow-500" },
    { label: "Active Pipeline", value: activeCount, icon: TrendingUp, color: "text-cyan-500" },
    { label: "Interviews", value: stats?.interviews || 0, icon: Trophy, color: "text-purple-500" },
    { label: "Avg Score", value: stats?.avgScore || "0.0", icon: TrendingUp, color: "text-orange-500" },
  ];

  const recentApps = [...filteredApps]
    .sort((a, b) => {
      const scoreA = parseFloat(a.score) || 0;
      const scoreB = parseFloat(b.score) || 0;
      return scoreB - scoreA;
    });

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Automated Job Search Pipeline</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground/60">
              Updated {lastUpdated}
            </span>
          )}
          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20 animate-pulse">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
            Pipeline Active
          </Badge>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
          >
            <Card className="border-border/50 bg-card/80 hover:shadow-md hover:shadow-indigo-500/5 transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">{kpi.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Filter className="h-4 w-4" />
          <span>Filters</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
        </button>

        {showFilters && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Role Type</p>
              <div className="flex flex-wrap gap-2">
                {ROLE_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setRoleFilter(f.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      roleFilter === f.value
                        ? "bg-blue-500 text-white"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</p>
              <div className="flex flex-wrap gap-2">
                {["all", "Evaluated", "Applied", "Interview", "Offer", "SKIP"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? "bg-blue-500 text-white"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {s === "all" ? "All" : s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Status Distribution */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.byStatus && Object.keys(stats.byStatus).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(stats.byStatus)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => (
                  <div key={status} className="flex items-center gap-3">
                    <Badge variant="outline" className={`min-w-[80px] justify-center ${statusColors[status] || ""}`}>
                      {status}
                    </Badge>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-secondary">
                        <div
                          className="h-2 rounded-full bg-blue-500 transition-all"
                          style={{ width: `${Math.max(2, (count / (stats?.total || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold tabular-nums w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for first scan cycle...</p>
            )}
          </CardContent>
        </Card>

        {/* Applications Table */}
        <Card className="border-border bg-card lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Applications ({filteredApps.length})
              </CardTitle>
              {roleFilter !== "all" && (
                <Badge variant="outline" className="text-xs">
                  {ROLE_FILTERS.find(f => f.value === roleFilter)?.label}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {recentApps.length > 0 ? (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {recentApps.map((app) => {
                  const url = app.notes?.match(/https?:\/\/\S+/)?.[0];
                  const score = parseFloat(app.score) || 0;
                  return (
                    <div
                      key={`${app.id}-${app.company}-${app.role}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2.5 hover:bg-secondary/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">{app.company}</p>
                          {url && (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground mt-0.5">{app.role}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{app.date}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className={`text-xs font-bold tabular-nums ${
                          score >= 4 ? "text-green-400" : score >= 3 ? "text-yellow-400" : "text-gray-500"
                        }`}>
                          {app.score}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${statusColors[app.status] || ""}`}>
                          {app.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground py-8 text-center">
                <p className="text-base font-medium">Pipeline is running</p>
                <p className="text-xs opacity-60">Scanning 95+ companies every 6 hours for fresher AI/SDE roles.</p>
                <p className="text-xs opacity-60">You{"'"}ll see results here once the first scrape cycle completes.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
