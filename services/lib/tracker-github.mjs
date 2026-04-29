/**
 * Optional GitHub persistence for data/applications.md so Azure Container Apps
 * (ephemeral disk) can restore after redeploy. Set:
 *   TRACKER_GITHUB_REPO=owner/repo
 *   TRACKER_GITHUB_PATH=data/applications.md
 *   GITHUB_TOKEN=ghp_... (repo scope)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { createLogger } from './logger.mjs';

const log = createLogger('tracker-github');

const ROOT = resolve(process.cwd());

function b64Encode(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

function b64Decode(b64) {
  return Buffer.from(b64, 'utf-8').toString('utf-8');
}

export async function fetchTrackerFromGitHub() {
  const repo = process.env.TRACKER_GITHUB_REPO || '';
  const path = process.env.TRACKER_GITHUB_PATH || 'data/applications.md';
  const token = process.env.GITHUB_TOKEN || '';
  if (!repo || !token) return false;

  const pathEncoded = path.split('/').map((s) => encodeURIComponent(s)).join('/');
  const url = `https://api.github.com/repos/${repo}/contents/${pathEncoded}`;
  try {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      log.warn('GitHub GET tracker failed', { status: r.status });
      return false;
    }
    const j = await r.json();
    if (!j.content) return false;
    const text = b64Decode(j.content.replace(/\n/g, ''));
    const dest = join(ROOT, 'data', 'applications.md');
    writeFileSync(dest, text);
    log.info('Restored applications.md from GitHub', { lines: text.split('\n').length });
    return true;
  } catch (e) {
    log.error('fetchTrackerFromGitHub', { err: e.message });
    return false;
  }
}

let lastSha = null;

export async function pushTrackerToGitHub() {
  const repo = process.env.TRACKER_GITHUB_REPO || '';
  const path = process.env.TRACKER_GITHUB_PATH || 'data/applications.md';
  const token = process.env.GITHUB_TOKEN || '';
  if (!repo || !token) return false;

  const localPath = join(ROOT, 'data', 'applications.md');
  if (!existsSync(localPath)) return false;
  const content = readFileSync(localPath, 'utf-8');
  const pathEncoded = path.split('/').map((s) => encodeURIComponent(s)).join('/');
  const url = `https://api.github.com/repos/${repo}/contents/${pathEncoded}`;

  try {
    let sha = lastSha;
    if (!sha) {
      const gr = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(20000),
      });
      if (gr.ok) {
        const gj = await gr.json();
        sha = gj.sha;
      }
    }

    const body = {
      message: `chore(tracker): sync applications [HireForge worker]`,
      content: b64Encode(content),
      ...(sha ? { sha } : {}),
    };

    const r = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!r.ok) {
      const errText = await r.text();
      log.warn('GitHub push tracker failed', { status: r.status, err: errText.slice(0, 200) });
      return false;
    }
    const j = await r.json();
    lastSha = j.content?.sha || lastSha;
    log.info('Pushed applications.md to GitHub');
    return true;
  } catch (e) {
    log.error('pushTrackerToGitHub', { err: e.message });
    return false;
  }
}
