import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

// In dev: process.cwd() = HireForge/web → go up one level
// In Azure SWA standalone: process.cwd() = .next/standalone/web → go up to HireForge root
// Fallback: try multiple candidate paths
function findCareerOpsRoot(): string {
  const candidates = [
    resolve(process.cwd(), '..'),                          // web/ → HireForge/
    resolve(process.cwd(), '../..'),                       // standalone/web/ → HireForge/
    resolve(process.cwd(), '../../..'),                    // .next/standalone/web/
    process.cwd(),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'data')) || existsSync(join(c, 'batch'))) return c;
  }
  return candidates[0];
}

const ROOT = findCareerOpsRoot();

export interface Application {
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

export type Status = 'Evaluated' | 'Applied' | 'Responded' | 'Interview' | 'Offer' | 'Rejected' | 'Discarded' | 'SKIP';

export function parseTracker(): Application[] {
  const trackerPath = join(ROOT, 'data', 'applications.md');
  if (!existsSync(trackerPath)) return [];

  const content = readFileSync(trackerPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.startsWith('|'));

  if (lines.length < 3) return [];

  const dataLines = lines.slice(2);
  const apps: Application[] = [];

  for (const line of dataLines) {
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 9) continue;

    apps.push({
      id: parseInt(cols[0], 10) || 0,
      date: cols[1],
      company: cols[2],
      role: cols[3],
      score: cols[4],
      status: cols[5],
      pdf: cols[6],
      report: cols[7],
      notes: cols[8],
    });
  }

  return apps;
}

export function parsePendingAdditions(): Application[] {
  const additionsDir = join(ROOT, 'batch', 'tracker-additions');
  if (!existsSync(additionsDir)) return [];

  const files = readdirSync(additionsDir).filter(f => f.endsWith('.tsv'));
  const apps: Application[] = [];

  for (const file of files) {
    const content = readFileSync(join(additionsDir, file), 'utf-8').trim();
    if (!content) continue;

    for (const line of content.split('\n')) {
      const cols = line.split('\t');
      if (cols.length < 9) continue;

      apps.push({
        id: parseInt(cols[0], 10) || 0,
        date: cols[1],
        company: cols[2],
        role: cols[3],
        status: cols[4],
        score: cols[5],
        pdf: cols[6],
        report: cols[7],
        notes: cols[8],
      });
    }
  }

  return apps;
}

function mergeLatestApps(allApps: Application[]): Application[] {
  const map = new Map<string, Application>();
  for (const app of allApps) {
    const key = `${app.company}|||${app.role}`;
    const prev = map.get(key);
    if (!prev || (app.id || 0) > (prev.id || 0)) map.set(key, app);
  }
  return [...map.values()].sort((a, b) => (b.id || 0) - (a.id || 0));
}

export function getAllApplications(): Application[] {
  const tracked = parseTracker();
  const pending = parsePendingAdditions();
  return mergeLatestApps([...tracked, ...pending]);
}

export function getReport(reportPath: string): string {
  const match = reportPath.match(/\(([^)]+)\)/);
  if (!match) return '';
  const filePath = join(ROOT, match[1]);
  if (!existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf-8');
}

function parseScoreCell(score: string): number {
  const m = String(score).match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : NaN;
}

export function parseScanHistory(limit = 50) {
  const path = join(ROOT, 'data', 'scan-history.tsv');
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').trim().split('\n');
  if (lines.length < 2) return [];
  const rows: { url: string; first_seen: string; source: string; title: string; company: string; status: string }[] = [];
  for (let i = lines.length - 1; i >= 1 && rows.length < limit; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 6) continue;
    rows.push({
      url: cols[0] || '',
      first_seen: cols[1] || '',
      source: cols[2] || '',
      title: cols[3] || '',
      company: cols[4] || '',
      status: cols[5] || '',
    });
  }
  return rows;
}

export function readPipelineSnippet(maxChars = 8000) {
  const path = join(ROOT, 'data', 'pipeline.md');
  if (!existsSync(path)) return '';
  const content = readFileSync(path, 'utf-8');
  return content.length > maxChars ? `${content.slice(0, maxChars)}\n\n…` : content;
}

export function getPipelinePendingCount() {
  const path = join(ROOT, 'data', 'pipeline.md');
  if (!existsSync(path)) return 0;
  const content = readFileSync(path, 'utf-8');
  return (content.match(/- \[ \]/g) || []).length;
}

export function getStats(apps: Application[]) {
  const total = apps.length;
  const byStatus: Record<string, number> = {};
  let totalScore = 0;
  let scoredCount = 0;

  for (const app of apps) {
    byStatus[app.status] = (byStatus[app.status] || 0) + 1;
    const numScore = parseScoreCell(app.score);
    if (!isNaN(numScore)) {
      totalScore += numScore;
      scoredCount++;
    }
  }

  return {
    total,
    byStatus,
    avgScore: scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : '0.0',
    applied: byStatus['Applied'] || 0,
    interviews: byStatus['Interview'] || 0,
    offers: byStatus['Offer'] || 0,
    rejected: byStatus['Rejected'] || 0,
    evaluated: byStatus['Evaluated'] || 0,
  };
}
