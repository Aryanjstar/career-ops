"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ArrowUpDown, ExternalLink } from "lucide-react";
import { apiFetch, parseScore, extractUrlFromNotes } from "@/lib/api";

interface Application {
  id: number;
  date: string;
  company: string;
  role: string;
  score: string;
  status: string;
  pdf: string;
  report: string;
  notes: string;
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

type SortKey = "date" | "score" | "company" | "status";

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    const fetchData = () => {
      apiFetch("/api/applications")
        .then((r) => r.json())
        .then((data) => {
          setApps(data.apps || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = apps
    .filter((app) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        app.company.toLowerCase().includes(q) ||
        app.role.toLowerCase().includes(q) ||
        app.notes.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" || app.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "date":
          return dir * a.date.localeCompare(b.date);
        case "score":
          return dir * (parseScore(a.score) - parseScore(b.score));
        case "company":
          return dir * a.company.localeCompare(b.company);
        case "status":
          return dir * a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

  const statuses = ["all", ...new Set(apps.map((a) => a.status))];

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
      >
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          All your tracked applications
        </p>
      </motion.div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search company, role, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <div className="flex gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                statusFilter === s
                  ? "bg-blue-500/10 text-blue-500 font-medium"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-12">#</TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("date")}
                    className="flex items-center gap-1"
                  >
                    Date <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("company")}
                    className="flex items-center gap-1"
                  >
                    Company <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>Role</TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("score")}
                    className="flex items-center gap-1"
                  >
                    Score <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("status")}
                    className="flex items-center gap-1"
                  >
                    Status <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>JD / Report</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {apps.length === 0
                      ? "No applications yet. Start by evaluating a job description."
                      : "No results match your search."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((app) => (
                  <TableRow
                    key={`${app.company}-${app.role}`}
                    className="border-border"
                  >
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {app.id}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {app.date}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {app.company}
                    </TableCell>
                    <TableCell className="text-sm">{app.role}</TableCell>
                    <TableCell>
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          parseScore(app.score) >= 4.0
                            ? "text-green-500"
                            : parseScore(app.score) >= 3.0
                              ? "text-yellow-500"
                              : "text-muted-foreground"
                        }`}
                      >
                        {app.score}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${statusColors[app.status] || ""}`}
                      >
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {extractUrlFromNotes(app.notes) ? (
                        <a
                          href={extractUrlFromNotes(app.notes)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                        >
                          Open posting <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : app.report ? (
                        <span className="text-muted-foreground truncate max-w-[120px] inline-block align-top">
                          {app.report}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {app.notes}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
