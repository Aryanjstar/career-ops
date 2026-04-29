"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch, extractUrlFromNotes } from "@/lib/api";
import { ExternalLink, Radar } from "lucide-react";

interface Application {
  id: number;
  date: string;
  company: string;
  role: string;
  score: string;
  status: string;
  notes: string;
}

interface ScanRow {
  url: string;
  first_seen: string;
  source: string;
  title: string;
  company: string;
  status: string;
}

const columns = [
  { key: "Evaluated", label: "Evaluated", color: "border-yellow-500" },
  { key: "Applied", label: "Applied", color: "border-blue-500" },
  { key: "SKIP", label: "Low fit / Skip", color: "border-zinc-500" },
  { key: "Responded", label: "Responded", color: "border-cyan-500" },
  { key: "Interview", label: "Interview", color: "border-purple-500" },
  { key: "Offer", label: "Offer", color: "border-green-500" },
  { key: "Rejected", label: "Rejected", color: "border-red-500" },
];

function ScoreDot({ score }: { score: string }) {
  const num = parseFloat(score);
  const color =
    num >= 4.5
      ? "bg-green-500"
      : num >= 4.0
        ? "bg-blue-500"
        : num >= 3.5
          ? "bg-yellow-500"
          : "bg-red-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

export default function PipelinePage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [scanHistory, setScanHistory] = useState<ScanRow[]>([]);
  const [pipelinePending, setPipelinePending] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      apiFetch("/api/applications")
        .then((r) => r.json())
        .then((data) => {
          setApps(data.apps || []);
          setScanHistory(data.scanHistory || []);
          setPipelinePending(data.pipeline?.pending ?? 0);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const grouped: Record<string, Application[]> = {};
  for (const col of columns) grouped[col.key] = [];
  for (const app of apps) {
    if (grouped[app.status]) {
      grouped[app.status].push(app);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Kanban by status — same data as the dashboard API
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-blue-500/30 text-blue-400">
          Batch queue: {pipelinePending} pending
        </Badge>
      </motion.div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.key} className="w-72 flex-shrink-0">
            <Card className={`border-t-2 ${col.color} border-border bg-card`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {col.label}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {grouped[col.key]?.length || 0}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-2">
                <ScrollArea className="h-[calc(100vh-240px)]">
                  <div className="space-y-2 p-1">
                    {(grouped[col.key] || []).length === 0 ? (
                      <p className="py-8 text-center text-xs text-muted-foreground">
                        No items
                      </p>
                    ) : (
                      (grouped[col.key] || []).map((app) => (
                        <div
                          key={`${app.company}-${app.role}`}
                          className="rounded-lg border border-border bg-secondary/30 p-3 transition-colors hover:bg-secondary/50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-tight">
                              {app.company}
                            </p>
                            <div className="flex items-center gap-1">
                              <ScoreDot score={app.score} />
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {app.score}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {app.role}
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-1">
                            <span className="text-[10px] text-muted-foreground/60">
                              {app.date}
                            </span>
                            {extractUrlFromNotes(app.notes) && (
                              <a
                                href={extractUrlFromNotes(app.notes)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5"
                              >
                                JD <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {scanHistory.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Radar className="h-4 w-4 text-cyan-500" />
              Recent scan discoveries
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Latest roles seen by the mega-scraper (deduplicated list refreshes each run)
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px]">
              <div className="space-y-2 pr-3">
                {scanHistory.map((row, i) => (
                  <div
                    key={`${row.url}-${i}`}
                    className="flex flex-col gap-1 rounded-md border border-border bg-secondary/20 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{row.company}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{row.title}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {row.source}
                      </Badge>
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
