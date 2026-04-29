"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Mail, Send, CheckCircle, XCircle, Copy } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface ColdEmail {
  id: number;
  company: string;
  contactName: string;
  contactTitle: string;
  email: string;
  subject: string;
  body: string;
  status: "draft" | "sent" | "replied" | "skipped";
  date: string;
  heading?: string;
}

export default function ColdEmailsPage() {
  const [emails, setEmails] = useState<ColdEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = () => {
      apiFetch("/api/cold-emails")
        .then((r) => r.json())
        .then((data) => {
          setEmails(data.emails || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = async (email: ColdEmail) => {
    const text = `To: ${email.email}\nSubject: ${email.subject}\n\n${email.body}\n\n---\nPortfolio: https://aryanjaiswal.in | GitHub: https://github.com/aryanjstar | LinkedIn: https://linkedin.com/in/aryanjstar`;
    await navigator.clipboard.writeText(text);
    setCopiedId(email.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const updateStatus = async (id: number, status: ColdEmail["status"]) => {
    const email = emails.find((e) => e.id === id);
    if (email?.heading) {
      apiFetch("/api/cold-emails/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heading: email.heading, newStatus: status.charAt(0).toUpperCase() + status.slice(1) }),
      }).catch(() => {});
    }
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status } : e)),
    );
  };

  const drafts = emails.filter((e) => e.status === "draft");
  const sent = emails.filter((e) => e.status === "sent");
  const replied = emails.filter((e) => e.status === "replied");

  const statusColor = (status: ColdEmail["status"]) => {
    switch (status) {
      case "draft":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "sent":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "replied":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "skipped":
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
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
      >
        <h1 className="text-2xl font-semibold tracking-tight">Cold Emails</h1>
        <p className="text-sm text-muted-foreground">
          Auto-drafted outreach emails for hiring managers and founders
        </p>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Drafted</p>
            <p className="text-2xl font-semibold tabular-nums">{emails.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending Review</p>
            <p className="text-2xl font-semibold tabular-nums text-yellow-400">
              {drafts.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sent</p>
            <p className="text-2xl font-semibold tabular-nums text-blue-400">
              {sent.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Replied</p>
            <p className="text-2xl font-semibold tabular-nums text-green-400">
              {replied.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {emails.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Mail className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-sm text-muted-foreground">
              No cold emails drafted yet
            </p>
            <p className="text-xs text-muted-foreground/60 text-center max-w-sm">
              The system generates personalized outreach emails during each
              pipeline run. Check back after the next scrape cycle.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {emails.map((email) => (
            <Card key={email.id} className="border-border bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{email.company}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {email.contactName} — {email.contactTitle}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {email.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={statusColor(email.status)}>
                      {email.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {email.date}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border bg-secondary/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Subject: {email.subject}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{email.body}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(email)}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "text-xs border-border",
                    )}
                  >
                    {copiedId === email.id ? (
                      <>
                        <CheckCircle className="mr-1 h-3 w-3 text-green-400" />{" "}
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 h-3 w-3" /> Copy email
                      </>
                    )}
                  </button>
                  {email.status === "draft" && (
                    <>
                      <button
                        type="button"
                        onClick={() => updateStatus(email.id, "sent")}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "text-xs border-border",
                        )}
                      >
                        <Send className="mr-1 h-3 w-3" /> Mark sent
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStatus(email.id, "skipped")}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "text-xs border-border text-muted-foreground",
                        )}
                      >
                        <XCircle className="mr-1 h-3 w-3" /> Skip
                      </button>
                    </>
                  )}
                  {email.status === "sent" && (
                    <button
                      type="button"
                      onClick={() => updateStatus(email.id, "replied")}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "text-xs border-border",
                      )}
                    >
                      <CheckCircle className="mr-1 h-3 w-3" /> Got reply
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            How cold emails work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            1. <strong className="text-foreground">Discovery</strong> — The
            scraper finds companies with open roles matching your profile.
          </p>
          <p>
            2. <strong className="text-foreground">Research</strong> — Contact
            info for hiring managers, founders, and HR is scraped from the web.
          </p>
          <p>
            3. <strong className="text-foreground">Drafting</strong> — AI
            generates personalized 4-sentence emails (50-125 words) using your
            profile data.
          </p>
          <p>
            4. <strong className="text-foreground">Review</strong> — You review
            drafts here, copy them, and send manually via your email client.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
