"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FileText,
  Upload,
  Download,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface TailorResult {
  success: boolean;
  pdfUrl?: string;
  keywords?: string[];
  showCGPA?: boolean;
  error?: string;
  buildDir?: string;
}

export default function ResumeBuilderPage() {
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);

  const handleTailor = async () => {
    if (!jd.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await apiFetch("/api/resume/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd: jd.trim(),
          company: company.trim() || "Company",
          role: role.trim() || "Software Engineer",
        }),
      });
      const data = await res.json();
      if (data.success && data.pdfUrl) {
        const base = process.env.NEXT_PUBLIC_API_URL || "";
        data.pdfUrl = base ? `${base}${data.pdfUrl}` : data.pdfUrl;
      }
      setResult(data);
    } catch {
      setResult({ success: false, error: "Failed to connect to API server" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">
          Resume Builder
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste a job description to get an ATS-optimized, JD-tailored resume
        </p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4 text-blue-500" />
                Job Description
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Company
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. Qualcomm"
                    className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Role
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Software Engineer"
                    className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Paste the full JD below
                </label>
                <textarea
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the complete job description here..."
                  rows={16}
                  className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {jd.length > 0
                    ? `${jd.split(/\s+/).filter(Boolean).length} words`
                    : "No JD pasted yet"}
                </p>
                <button
                  onClick={handleTailor}
                  disabled={loading || !jd.trim()}
                  className={cn(
                    buttonVariants({ size: "default" }),
                    "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Tailoring...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Tailor Resume
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {result && (
            <Card
              className={cn(
                "border-border bg-card",
                result.success
                  ? "border-l-2 border-l-green-500"
                  : "border-l-2 border-l-red-500"
              )}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  {result.success ? "Resume Ready" : "Error"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.success ? (
                  <>
                    {result.keywords && result.keywords.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">
                          JD Keywords matched
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {result.keywords.map((kw) => (
                            <Badge
                              key={kw}
                              className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]"
                            >
                              {kw}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        CGPA:{" "}
                        {result.showCGPA ? (
                          <span className="text-green-400">Shown</span>
                        ) : (
                          <span className="text-zinc-400">Hidden</span>
                        )}
                      </span>
                    </div>
                    {result.pdfUrl && (
                      <a
                        href={result.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ size: "sm" }),
                          "w-full bg-green-600 hover:bg-green-700 text-white"
                        )}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </a>
                    )}
                    {result.buildDir && (
                      <p className="text-[10px] text-muted-foreground/60 break-all">
                        LaTeX source: {result.buildDir}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-red-400">{result.error}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                How it works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                1.{" "}
                <strong className="text-foreground">Paste JD</strong> — The
                full job description with requirements and responsibilities.
              </p>
              <p>
                2.{" "}
                <strong className="text-foreground">AI Tailoring</strong> —
                Azure OpenAI rewrites your resume bullets to match JD keywords
                while preserving all metrics and facts.
              </p>
              <p>
                3.{" "}
                <strong className="text-foreground">ATS Optimization</strong>{" "}
                — Single-column layout, standard headings, keyword-rich
                bullets, no graphics.
              </p>
              <p>
                4.{" "}
                <strong className="text-foreground">Download</strong> — Get
                the 1-page PDF compiled from your LaTeX template.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Resume sections tailored
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <p>Professional Summary</p>
              <p>Technical Skills (reordered by JD relevance)</p>
              <p>Work Experience (bullets reframed with JD keywords)</p>
              <p>Projects (bullets reframed with JD keywords)</p>
              <p>CGPA shown/hidden based on JD academic criteria</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
