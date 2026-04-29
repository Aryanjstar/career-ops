"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  User,
  Bell,
  Key,
  MapPin,
  Target,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface ProfileData {
  candidate?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    portfolio?: string;
    linkedin?: string;
    github?: string;
  };
  education?: {
    institution?: string;
    degree?: string;
    period?: string;
  };
  targetRoles?: string[];
  integrations?: {
    azureOpenAI?: boolean;
    telegram?: boolean;
    calendar?: boolean;
  };
}

export default function SettingsPage() {
  const [apiStatus, setApiStatus] = useState<string>("checking...");
  const [totalApps, setTotalApps] = useState<number>(0);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    apiFetch("/api/health")
      .then((r) => r.json())
      .then(() => setApiStatus("connected"))
      .catch(() => setApiStatus("offline"));

    apiFetch("/api/applications")
      .then((r) => r.json())
      .then((d) => setTotalApps(d.apps?.length ?? 0))
      .catch(() => {});

    apiFetch("/api/profile")
      .then((r) => r.json())
      .then(setProfile)
      .catch(() => {});
  }, []);

  const c = profile?.candidate;
  const integrations = profile?.integrations;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          System configuration and integrations
        </p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4 text-blue-500" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span>{c?.name || "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{c?.email || "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{c?.phone || <span className="text-muted-foreground/60">Not set</span>}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Location</span>
              <span className="text-right">{c?.location || "Not set"}</span>
            </div>
            {c?.portfolio && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Portfolio</span>
                <a href={c.portfolio} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-right break-all">
                  {c.portfolio.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
            <p className="text-xs text-muted-foreground/60 pt-2">
              Source of truth: <code className="bg-secondary px-1 rounded">config/profile.yml</code> + <code className="bg-secondary px-1 rounded">data/profile-data.json</code>
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              Target Roles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile?.targetRoles && profile.targetRoles.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Active targets</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.targetRoles.map((r) => (
                    <Badge key={r} variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                      {r}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No target roles configured yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Key className="h-4 w-4 text-yellow-500" />
              API Integrations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Azure OpenAI</span>
              <Badge className={`text-[10px] ${integrations?.azureOpenAI ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"}`}>
                {integrations?.azureOpenAI ? "Configured" : "Not configured"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">API Server</span>
              <Badge className={`text-[10px] ${apiStatus === "connected" ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"}`}>
                {apiStatus === "connected" ? `Online (${totalApps} apps)` : apiStatus}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Telegram</span>
              <Badge className={`text-[10px] ${integrations?.telegram ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}`}>
                {integrations?.telegram ? "Configured" : "Not configured"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Google Calendar</span>
              <Badge className={`text-[10px] ${integrations?.calendar ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}`}>
                {integrations?.calendar ? "Configured" : "Not configured"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4 text-cyan-500" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Telegram alerts</span>
              <span className="text-xs text-muted-foreground">{integrations?.telegram ? "Active" : "Inactive"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Calendar Events</span>
              <span className="text-xs text-muted-foreground">{integrations?.calendar ? "Active" : "Inactive"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4 text-green-500" />
              Location Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Work Mode</span>
              <span>Remote-first</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Open to Relocation</span>
              <span>Yes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Notice Period</span>
              <span>Immediate</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              System
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Run <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">npm run doctor</code> to check system health
            </p>
            <p>
              Run <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">npm run verify</code> to validate pipeline integrity
            </p>
            <p>
              Run <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">npm run scan</code> to scan portals for new jobs
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
