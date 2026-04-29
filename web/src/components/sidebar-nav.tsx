"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Home,
  Kanban,
  List,
  BarChart3,
  GraduationCap,
  Settings,
  Briefcase,
  Activity,
  Menu,
  X,
  FileText,
  Mail,
  ScrollText,
  BookOpen,
  LinkIcon,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/applications", label: "Applications", icon: List },
  { href: "/resume-builder", label: "Resume Builder", icon: FileText },
  { href: "/cover-letter", label: "Cover Letter", icon: ScrollText },
  { href: "/interviews", label: "Interview Prep", icon: GraduationCap },
  { href: "/cold-emails", label: "Cold Emails", icon: Mail },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/blog", label: "Blog", icon: BookOpen },
  { href: "/resources", label: "Resources", icon: LinkIcon },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();
  const [apiHealthy, setApiHealthy] = useState(false);
  const [pipelineCount, setPipelineCount] = useState(0);
  const [totalApps, setTotalApps] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [profileName, setProfileName] = useState("Loading...");
  const [profileSubtitle, setProfileSubtitle] = useState("");
  const [profileTags, setProfileTags] = useState("");

  useEffect(() => {
    const checkHealth = () => {
      apiFetch("/api/health")
        .then((r) => r.json())
        .then(() => setApiHealthy(true))
        .catch(() => setApiHealthy(false));

      apiFetch("/api/applications")
        .then((r) => r.json())
        .then((data) => {
          setPipelineCount(data.pipeline?.pending ?? 0);
          setTotalApps(data.apps?.length ?? 0);
        })
        .catch(() => {});
    };
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    apiFetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfileName(data.candidate?.name || "User");
        const edu = data.education?.institution?.split(",")[0] || "";
        setProfileSubtitle(edu);
        const roles = (data.targetRoles || []).slice(0, 3).join(" · ");
        setProfileTags(roles);
      })
      .catch(() => {
        setProfileName("User");
      });
  }, []);

  const closeMobile = () => setMobileOpen(false);

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-blue-500" />
          <span className="text-sm font-semibold tracking-tight gradient-text">HireForge</span>
        </div>
        <button
          className="md:hidden p-1 text-muted-foreground"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMobile}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-blue-500/10 text-blue-500 font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.href === "/pipeline" && pipelineCount > 0 && (
                <span className="ml-auto rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400 tabular-nums">
                  {pipelineCount}
                </span>
              )}
              {item.href === "/applications" && totalApps > 0 && (
                <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                  {totalApps}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-4 left-0 right-0 space-y-3 px-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
          <Activity className={cn("h-3 w-3", apiHealthy ? "text-green-400" : "text-red-400")} />
          <span className="text-[10px] text-muted-foreground">
            API {apiHealthy ? "Connected" : "Offline"}
          </span>
          {apiHealthy && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="rounded-md border border-border bg-secondary/50 p-3 flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground/80 truncate">{profileName}</p>
            {profileSubtitle && <p className="text-[10px] text-muted-foreground/60 truncate">{profileSubtitle}</p>}
            {profileTags && <p className="text-[10px] text-muted-foreground/40 mt-0.5 truncate">{profileTags}</p>}
          </div>
          {hydrated && (
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
              title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            >
              {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-50 rounded-md border border-border bg-[#0f0f0f] p-2 md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-56 border-r border-border bg-[#0f0f0f] transition-transform duration-200 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
