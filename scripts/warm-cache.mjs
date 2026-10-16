/**
 * Warm Cloudflare edge cache by requesting live URLs from the sitemap.
 *
 * Uses plain fetch only (no headless browser). Astro publishes
 * /sitemap-index.xml → /sitemap-0.xml; do not point this at the old
 * Joomla /sitemap.xml URL.
 *
 * Usage (after Purge Everything in the Cloudflare dashboard):
 *   npm run warm:cache
 *   npm run warm:cache -- --limit=100
 *   npm run warm:cache -- --concurrency=2
 *   npm run warm:cache -- --priority-only
 */
import { setTimeout as delay } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const ORIGIN = String(args.origin || 'https://panoramicireland.com').replace(/\/$/, '');
/** Prefer the Astro index; fall back to sitemap-0.xml only if the index is empty. */
const SITEMAP = String(args.sitemap || `${ORIGIN}/sitemap-index.xml`);
/** Keep low — ~1–2 requests/sec with delay below; high concurrency trips host rules. */
const CONCURRENCY = Math.max(1, Number(args.concurrency || 2));
const DELAY_MS = Math.max(0, Number(args.delay || 500));
const LIMIT = args.limit != null ? Number(args.limit) : Infinity;
const PRIORITY_ONLY = Boolean(args['priority-only']);
const METHOD = String(args.method || 'GET').toUpperCase() === 'HEAD' ? 'HEAD' : 'GET';
/** Retries for blips (fetch failed / 502–504 / 429). */
const RETRIES = Math.max(0, Number(args.retries ?? 3));
const RETRY_MS = Math.max(200, Number(args['retry-ms'] || 2500));
/** Exit non-zero only if soft fails exceed this after retries. */
const FAIL_EXIT_THRESHOLD = Math.max(0, Number(args['fail-threshold'] ?? 5));

const PRIORITY_PATHS = [
  '/',
  '/dublin',
  '/about',
  '/contact',
  '/photography-workshops-ireland/book-a-photo-tour-in-dublin',
  '/photo-tours-blog',
  '/blog-ireland-guide',
];

function extractLocs(xml) {
  const locs = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    locs.push(m[1].trim());
  }
  return locs;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'panoramicireland-cache-warmer/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function loadSitemapUrls(sitemapUrl) {
  const xml = await fetchText(sitemapUrl);
  const locs = extractLocs(xml);
  const isIndex = /<sitemapindex[\s>]/i.test(xml) || locs.some((u) => /sitemap.*\.xml/i.test(u));
  if (!isIndex) {
    console.log(`Sitemap entries: 0 (leaf sitemap)`);
    console.log(`URL entries: ${locs.length}`);
    return locs;
  }

  console.log(`Sitemap entries: ${locs.length}`);
  if (locs.length === 0) {
    const leaf = `${ORIGIN}/sitemap-0.xml`;
    console.log(`Index empty — falling back to ${leaf}`);
    const childXml = await fetchText(leaf);
    const nested = extractLocs(childXml);
    console.log(`URL entries: ${nested.length}`);
    return nested;
  }

  const nested = [];
  for (const child of locs) {
    const childXml = await fetchText(child);
    nested.push(...extractLocs(childXml));
  }
  console.log(`URL entries: ${nested.length}`);
  return nested;
}

function normalizeUrl(loc) {
  try {
    const u = new URL(loc, ORIGIN);
    if (u.origin !== new URL(ORIGIN).origin) return null;
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `${ORIGIN}${path || '/'}${u.search}`;
  } catch {
    return null;
  }
}

function priorityScore(url) {
  try {
    let path = new URL(url).pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    path = path || '/';
    const idx = PRIORITY_PATHS.indexOf(path);
    return idx === -1 ? 1000 : idx;
  } catch {
    return 1000;
  }
}

/** CF-Cache-Status → short token for logs (HIT / MISS / …). */
function cacheLabel(header) {
  const raw = String(header || '').trim().toUpperCase();
  if (!raw) return 'NONE';
  if (/^(HIT|STALE|REVALIDATED|MISS|EXPIRED|UPDATING|BYPASS|DYNAMIC|IGNORE)$/.test(raw)) {
    return raw;
  }
  return raw.slice(0, 12);
}

function isRetryable(r) {
  if (r.ok) return false;
  if (r.status === 0) return true;
  if (r.status === 429 || r.status === 502 || r.status === 503 || r.status === 504) return true;
  return false;
}

async function warmOnce(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: METHOD,
      headers: { 'user-agent': 'panoramicireland-cache-warmer/1.0' },
      redirect: 'follow',
    });
    // Drain body so keep-alive connections stay healthy on GET.
    if (METHOD === 'GET') await res.arrayBuffer();
    const cache = cacheLabel(res.headers.get('cf-cache-status'));
    const age = res.headers.get('age');
    return {
      url,
      ok: res.ok,
      status: res.status,
      cache,
      age: age != null && age !== '' ? age : null,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      url,
      ok: false,
      status: 0,
      cache: 'NONE',
      age: null,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function warmOne(url) {
  let last = await warmOnce(url);
  for (let attempt = 1; attempt <= RETRIES && isRetryable(last); attempt++) {
    await delay(RETRY_MS * attempt);
    last = await warmOnce(url);
    last.retries = attempt;
  }
  return last;
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

const raw = PRIORITY_ONLY
  ? PRIORITY_PATHS.map((p) => `${ORIGIN}${p === '/' ? '/' : p}`)
  : await loadSitemapUrls(SITEMAP);
let urls = [...new Set(raw.map(normalizeUrl).filter(Boolean))];
urls.sort((a, b) => priorityScore(a) - priorityScore(b) || a.localeCompare(b));

if (!PRIORITY_ONLY && Number.isFinite(LIMIT)) {
  // Keep priority URLs first, then fill up to limit from the rest.
  const priority = urls.filter((u) => priorityScore(u) < 1000);
  const rest = urls.filter((u) => priorityScore(u) >= 1000);
  urls = [...priority, ...rest].slice(0, LIMIT);
}

console.log(
  `Warming ${urls.length} URL(s) on ${ORIGIN} (${METHOD}, concurrency ${CONCURRENCY}, delay ${DELAY_MS}ms)`
);
const results = await mapPool(urls, CONCURRENCY, async (url, i) => {
  const r = await warmOne(url);
  const n = `[${i + 1}/${urls.length}]`;
  const age = r.age != null ? ` age=${r.age}s` : '';
  const retry = r.retries ? ` retry=${r.retries}` : '';
  const path = new URL(url).pathname;
  if (!r.ok) {
    console.log(
      `${n} FAIL ${String(r.cache).padEnd(12)} ${r.status} ${r.ms}ms ${r.error || ''}${retry} ${path}`
    );
  } else {
    // Leading token is HIT/MISS/… — MISS is success for a warmer (fills the edge).
    console.log(
      `${n} ${String(r.cache).padEnd(12)} ${r.status} ${String(r.ms).padStart(5)}ms${age}${retry} ${path}`
    );
  }
  // Gentle pacing so shared origin is not hammered on MISS (~1–2 req/s default).
  if (DELAY_MS) await delay(DELAY_MS);
  return r;
});

const ok = results.filter((r) => r.ok).length;
const hit = results.filter((r) => r.ok && /^(HIT|STALE|REVALIDATED)$/i.test(r.cache)).length;
const miss = results.filter((r) => r.ok && /^(MISS|EXPIRED)$/i.test(r.cache)).length;
const none = results.filter((r) => r.ok && r.cache === 'NONE').length;
const fail = results.length - ok;
const hard = results.filter((r) => r.status === 401 || r.status === 403).length;

console.log('\nDone.');
console.log(
  `  ok=${ok} fail=${fail} HIT=${hit} MISS=${miss} (MISS is fine — filled cache) no-cf-header=${none}`
);
// One blip shouldn't red the Actions run; hard blocks or many soft fails still do.
if (hard > 0 || fail > FAIL_EXIT_THRESHOLD) process.exitCode = 1;
