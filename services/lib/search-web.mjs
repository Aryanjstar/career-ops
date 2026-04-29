/**
 * Web job discovery — multiple backends so LinkedIn/Naukri/Indeed queries
 * still return URLs when one HTML layout changes.
 */

import { createLogger } from './logger.mjs';

const log = createLogger('search-web');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function expandDdgRedirect(u) {
  try {
    const parsed = new URL(u);
    if (!parsed.hostname.includes('duckduckgo.com')) return u;
    const inner = parsed.searchParams.get('uddg');
    if (inner) return decodeURIComponent(inner);
  } catch { /* keep original */ }
  return u;
}

const SEARCH_ENGINE_PATTERN = /^https?:\/\/(www\.)?(google\.com|bing\.com|duckduckgo\.com|search\.yahoo\.com)\/(search|images|aclick)/i;

function extractUrlsFromText(text, max = 20) {
  const out = [];
  const seen = new Set();
  const re = /\b(https?:\/\/[^\s\])'"<>]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null && out.length < max * 2) {
    let u = m[1].replace(/[),.]+$/, '');
    u = expandDdgRedirect(u);
    if (seen.has(u)) continue;
    if (u.includes('duckduckgo.com')) continue;
    if (u.includes('bing.com/aclick')) continue;
    if (u.includes('microsoft.com/tracking')) continue;
    if (u.includes('google.com/url')) {
      try {
        const gu = new URL(u);
        const real = gu.searchParams.get('url') || gu.searchParams.get('q');
        if (real) { u = real; }
        else continue;
      } catch {}
    }
    if (SEARCH_ENGINE_PATTERN.test(u)) continue;
    if (u.includes('jina.ai')) continue;
    if (u.includes('r.jina.ai')) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

const JOB_URL_PATTERN = /linkedin\.com\/jobs|linkedin\.com\/job|indeed\.|naukri\.|internshala\.|glassdoor\.|wellfound\.|greenhouse\.|lever\.|ashbyhq\.|myworkdayjobs\.|job-boards\.|boards\.greenhouse|stripe\.com\/jobs|careers\.|\/jobs?\/|\/job\/|cutshort\.io|foundit\.in|instahyre\.com|angel\.co|workatastartup/i;

function timeoutSignal(ms) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** Classic DDG HTML results via Jina (works when direct HTML scrape is blocked) */
async function searchViaJinaDdgHtml(query, maxResults) {
  const target = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const r = await fetch(`https://r.jina.ai/${target}`, {
      headers: { Accept: 'text/plain' },
      signal: timeoutSignal(15000),
    });
    if (!r.ok) return [];
    const text = await r.text();
    const urls = extractUrlsFromText(text, maxResults + 12);
    return urls.filter(u => JOB_URL_PATTERN.test(u)).slice(0, maxResults).map((url) => ({ url, title: '' }));
  } catch (e) {
    log.warn('Jina DDG search failed', { err: e.message });
    return [];
  }
}

/** Direct DuckDuckGo Lite (legacy) */
async function searchDdgLite(query, maxResults) {
  try {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=in-en`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: timeoutSignal(12000),
    });
    if (!r.ok) return [];
    const html = await r.text();
    const results = [];
    const linkRegex = /href="(https?:\/\/[^"]+)"/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
      const u = match[1];
      if (!u.includes('duckduckgo.com') && !u.includes('duck.co')) {
        results.push({ url: u, title: '' });
      }
    }
    return results;
  } catch (e) {
    log.warn('DDG lite failed', { err: e.message });
    return [];
  }
}

/** Google search via Jina for broader coverage */
async function searchViaJinaGoogle(query, maxResults) {
  const target = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${maxResults + 5}`;
  try {
    const r = await fetch(`https://r.jina.ai/${target}`, {
      headers: { Accept: 'text/plain' },
      signal: timeoutSignal(15000),
    });
    if (!r.ok) return [];
    const text = await r.text();
    const urls = extractUrlsFromText(text, maxResults + 15);
    return urls.filter(u => JOB_URL_PATTERN.test(u)).slice(0, maxResults).map((url) => ({ url, title: '' }));
  } catch (e) {
    log.warn('Jina Google search failed', { err: e.message });
    return [];
  }
}

/** Bing search via Jina as another fallback */
async function searchViaBing(query, maxResults) {
  const target = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults + 5}`;
  try {
    const r = await fetch(`https://r.jina.ai/${target}`, {
      headers: { Accept: 'text/plain' },
      signal: timeoutSignal(15000),
    });
    if (!r.ok) return [];
    const text = await r.text();
    const urls = extractUrlsFromText(text, maxResults + 10);
    return urls.filter(u => JOB_URL_PATTERN.test(u)).slice(0, maxResults).map((url) => ({ url, title: '' }));
  } catch (e) {
    log.warn('Bing search failed', { err: e.message });
    return [];
  }
}

/**
 * @returns {Promise<{ url: string, title: string }[]>}
 */
export async function searchWeb(query, maxResults = 8) {
  // Try multiple search backends in order of reliability
  const primary = await searchViaJinaDdgHtml(query, maxResults);
  if (primary.length > 0) return primary;

  const google = await searchViaJinaGoogle(query, maxResults);
  if (google.length > 0) return google;

  const secondary = await searchDdgLite(query, maxResults);
  if (secondary.length > 0) return secondary;

  const bing = await searchViaBing(query, maxResults);
  if (bing.length > 0) return bing;

  const lastChance = await searchViaJinaDdgHtml(`${query} jobs hiring apply`, maxResults);
  return lastChance;
}
