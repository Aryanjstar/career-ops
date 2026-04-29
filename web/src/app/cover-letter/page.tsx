"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FileText,
  Download,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  Building2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface CoverLetterResult {
  success: boolean;
  pdfUrl?: string;
  paragraphSummary?: string[];
  error?: string;
  buildDir?: string;
}

export default function CoverLetterPage() {
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoverLetterResult | null>(null);

  const handleGenerate = async () => {
    if (!jd.trim() || !company.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await apiFetch("/api/cover-letter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd: jd.trim(),
          company: company.trim(),
          role: role.trim() || "Software Engineer",
          team: team.trim(),
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
          Cover Letter Generator
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste a job description to generate a tailored, single-page cover
          letter PDF
        </p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-500" />
                Job Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Company *
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. Rippling"
                    className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                    className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Team (optional)
                  </label>
                  <input
                    type="text"
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    placeholder="e.g. Financial Integrity"
                    className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                  rows={14}
                  className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-y font-mono"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {jd.length > 0
                    ? `${jd.split(/\s+/).filter(Boolean).length} words`
                    : "No JD pasted yet"}
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={loading || !jd.trim() || !company.trim()}
                  className={cn(
                    buttonVariants({ size: "default" }),
                    "bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Cover Letter
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
                  {result.success ? "Cover Letter Ready" : "Error"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.success ? (
                  <>
                    {result.paragraphSummary &&
                      result.paragraphSummary.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">
                            Paragraph previews
                          </p>
                          <div className="space-y-1">
                            {result.paragraphSummary.map((p, i) => (
                              <p
                                key={i}
                                className="text-[11px] text-muted-foreground/80 border-l-2 border-purple-500/30 pl-2"
                              >
                                {p}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
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
                <strong className="text-foreground">Paste JD + Company</strong>{" "}
                &mdash; The full job description and company name.
              </p>
              <p>
                2.{" "}
                <strong className="text-foreground">Company Research</strong>{" "}
                &mdash; AI researches the company from the web to understand
                their mission, products, and culture.
              </p>
              <p>
                3.{" "}
                <strong className="text-foreground">AI Drafting</strong> &mdash;
                7 purpose-driven paragraphs tailored to the JD with your real
                experience and metrics.
              </p>
              <p>
                4.{" "}
                <strong className="text-foreground">PDF Generation</strong>{" "}
                &mdash; Compiled to a professional single-page LaTeX PDF with
                your branding.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Cover letter structure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <div className="space-y-1.5">
                {[
                  "Why this company (shows research)",
                  "Problem domain interest",
                  "Strongest experience with metrics",
                  "Broader experience showing range",
                  "Technical skills alignment",
                  "What you would focus on if hired",
                  "Leadership + closing",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[9px] shrink-0">
                      {i + 1}
                    </Badge>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
