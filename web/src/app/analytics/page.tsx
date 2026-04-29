"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, PieChart } from "lucide-react";
import { apiFetch, parseScore } from "@/lib/api";

interface Application {
  id: number;
  date: string;
  company: string;
  role: string;
  score: string;
  status: string;
  notes: string;
}

interface Stats {
  total: number;
  applied: number;
  interviews: number;
  offers: number;
  rejected: number;
  evaluated: number;
  avgScore: string;
  byStatus: Record<string, number>;
}

const statusBarColors: Record<string, string> = {
  Evaluated: "bg-yellow-500",
  Applied: "bg-blue-500",
  Responded: "bg-cyan-500",
  Interview: "bg-purple-500",
  Offer: "bg-green-500",
  Rejected: "bg-red-500",
  Discarded: "bg-gray-500",
  SKIP: "bg-gray-400",
};

export default function AnalyticsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/applications")
      .then((r) => r.json())
      .then((data) => {
        setApps(data.apps || []);
        setStats(data.stats);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const scoreDistribution = [
    { range: "4.5+", count: apps.filter((a) => parseScore(a.score) >= 4.5).length, color: "bg-green-500" },
    { range: "4.0–4.4", count: apps.filter((a) => { const s = parseScore(a.score); return s >= 4.0 && s < 4.5; }).length, color: "bg-emerald-500" },
    { range: "3.5–3.9", count: apps.filter((a) => { const s = parseScore(a.score); return s >= 3.5 && s < 4.0; }).length, color: "bg-yellow-500" },
    { range: "3.0–3.4", count: apps.filter((a) => { const s = parseScore(a.score); return s >= 3.0 && s < 3.5; }).length, color: "bg-orange-500" },
    { range: "<3.0", count: apps.filter((a) => { const s = parseScore(a.score); return s > 0 && s < 3.0; }).length, color: "bg-zinc-500" },
  ];

  const topCompanies = Object.entries(
    apps.reduce<Record<string, number>>((acc, app) => {
      acc[app.company] = (acc[app.company] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const responseRate =
    stats && stats.total > 0
      ? (
          ((stats.interviews + stats.offers + (stats.byStatus["Responded"] || 0)) /
            stats.total) *
          100
        ).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Insights into your job search performance
        </p>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">
                Response Rate
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold">{responseRate}%</p>
            <p className="text-xs text-muted-foreground">
              of applications got a response
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Avg Score</span>
            </div>
            <p className="mt-2 text-3xl font-bold">
              {stats?.avgScore || "0.0"}/5
            </p>
            <p className="text-xs text-muted-foreground">
              across all evaluations
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">
                Interview Rate
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold">
              {stats && stats.total > 0
                ? ((stats.interviews / stats.total) * 100).toFixed(1)
                : "0.0"}
              %
            </p>
            <p className="text-xs text-muted-foreground">
              of applications reached interview
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Score Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scoreDistribution.map((bucket) => (
                <div key={bucket.range} className="flex items-center gap-3">
                  <span className="w-16 text-xs text-muted-foreground">
                    {bucket.range}
                  </span>
                  <div className="flex-1">
                    <div className="h-6 rounded bg-secondary">
                      <div
                        className={`h-6 rounded ${bucket.color} transition-all flex items-center justify-end pr-2`}
                        style={{
                          width: `${apps.length > 0 ? (bucket.count / apps.length) * 100 : 0}%`,
                          minWidth: bucket.count > 0 ? "24px" : "0",
                        }}
                      >
                        {bucket.count > 0 && (
                          <span className="text-[10px] font-medium text-white">
                            {bucket.count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.byStatus && Object.keys(stats.byStatus).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(stats.byStatus)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <div key={status} className="flex items-center gap-3">
                      <span className="w-20 text-xs text-muted-foreground">
                        {status}
                      </span>
                      <div className="flex-1">
                        <div className="h-5 rounded bg-secondary">
                          <div
                            className={`h-5 rounded ${statusBarColors[status] || "bg-gray-500"} transition-all`}
                            style={{
                              width: `${(count / stats.total) * 100}%`,
                              minWidth: "4px",
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-medium tabular-nums w-8 text-right">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet</p>
            )}
          </CardContent>
        </Card>

        {topCompanies.length > 0 && (
          <Card className="border-border bg-card lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Top Companies Applied
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2">
                {topCompanies.map(([company, count], i) => (
                  <div
                    key={company}
                    className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums w-4">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm">{company}</span>
                    <span className="text-xs font-medium tabular-nums">
                      {count} app{count > 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
