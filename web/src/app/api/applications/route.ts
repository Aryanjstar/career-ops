import { NextResponse } from 'next/server';

// This API route works in local dev mode only.
// In static export (Azure SWA), it's excluded — dashboard fetches data client-side.
export const dynamic = 'force-static';

export async function GET() {
  try {
    const {
      getAllApplications,
      getStats,
      parseScanHistory,
      readPipelineSnippet,
      getPipelinePendingCount,
    } = await import('@/lib/tracker');
    const apps = getAllApplications();
    const stats = getStats(apps);
    const scanHistory = parseScanHistory(50);
    const pipeline = {
      pending: getPipelinePendingCount(),
      markdown: readPipelineSnippet(8000),
    };
    return NextResponse.json({ apps, stats, scanHistory, pipeline });
  } catch {
    return NextResponse.json({
      apps: [],
      scanHistory: [],
      pipeline: { pending: 0, markdown: '' },
      stats: { total: 0, applied: 0, interviews: 0, offers: 0, rejected: 0, evaluated: 0, avgScore: '0.0', byStatus: {} },
    });
  }
}
