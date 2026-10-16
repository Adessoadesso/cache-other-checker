/**
 * Warm /images/* and /media/* via GET (Worker Cache API).
 *
 * Sources (first that works):
 *   --list=path/to/urls.txt   one https URL per line
 *   else: image:loc entries from the live Astro sitemap
 *
 * Usage:
 *   node scripts/warm-images.mjs
 *   node scripts/warm-images.mjs --limit=100 --delay=2000
 *   node scripts/warm-images.mjs --list=scripts/data/warm-images.txt
 */
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const ORIGIN = String(args.origin || 'https://panoramicireland.com').replace(/\/$/, '');
const SITEMAP = String(args.sitemap || `${ORIGIN}/sitemap-index.xml`);
const DELAY_MS = Math.max(0, Number(args.delay || 2000));
const LIMIT = args.limit != null ? Number(args.limit) : Infinity;
const CONCURRENCY = Math.max(1, Number(args.concurrency || 1));
const LIST = args.list ? String(args.list) : null;
/** Retries for blips (fetch failed / 502–504 / 429). Does not apply to 403/404. */
const RETRIES = Math.max(0, Number(args.retries ?? 3));
const RETRY_MS = Math.max(200, Number(args['retry-ms'] || 2500));
/** Stop the whole run only on hard blocks (WAF/auth), not one network blip. */
const STOP_STATUSES = new Set([401, 403]);

function extractLocs(xml) {
  const locs = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    locs.push(m[1].trim());
  }
  return locs;
}

function extractImageLocs(xml) {
  const locs = [];
  // Google image sitemap: <image:loc>...</image:loc>
  for (const m of xml.matchAll(/<image:loc>\s*([^<\s]+)\s*<\/image:loc>/gi)) {
    locs.push(m[1].trim());
  }
  return locs;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'panoramicireland-image-warmer/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function loadSitemapXml(sitemapUrl) {
  const xml = await fetchText(sitemapUrl);
  const locs = extractLocs(xml);
  const isIndex =
    /<sitemapindex[\s>]/i.test(xml) || locs.some((u) => /sitemap.*\.xml/i.test(u));
  if (!isIndex) return xml;
  const parts = [];
  for (const child of locs) {
    parts.push(await fetchText(child));
  }
  return parts.join('\n');
}

async function loadUrls() {
  if (LIST) {
    const text = await readFile(LIST, 'utf8');
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^https:\/\//i.test(l));
  }
  const xml = await loadSitemapXml(SITEMAP);
  return extractImageLocs(xml);
}

function isMediaUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.origin === new URL(ORIGIN).origin &&
      (u.pathname.startsWith('/images/') || u.pathname.startsWith('/media/'))
    );
  } catch {
    return false;
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
  if (r.status === 0) return true; // fetch failed / DNS / reset
  if (r.status === 429 || r.status === 502 || r.status === 503 || r.status === 504) return true;
  return false;
}

async function warmOnce(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'user-agent': 'panoramicireland-image-warmer/1.0' },
      redirect: 'follow',
    });
    const buf = await res.arrayBuffer();
    const type = res.headers.get('content-type') || '';
    // Workers Cache ([cache] + Cache-Control) surfaces as cf-cache-status.
    const cache = cacheLabel(res.headers.get('cf-cache-status'));
    const age = res.headers.get('age');
    return {
      url,
      ok: res.ok && /^image\//i.test(type),
      status: res.status,
      type,
      cache,
      age: age != null && age !== '' ? age : null,
      bytes: buf.byteLength,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      url,
      ok: false,
      status: 0,
      type: '',
      cache: 'NONE',
      age: null,
      bytes: 0,
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

function formatLine(i, total, r) {
  const n = `[${i + 1}/${total}]`;
  const kb = `${Math.round((r.bytes || 0) / 1024)}KB`;
  const age = r.age != null ? ` age=${r.age}s` : '';
  const retry = r.retries ? ` retry=${r.retries}` : '';
  const path = (() => {
    try {
      return new URL(r.url).pathname;
    } catch {
      return r.url;
    }
  })();
  if (r.status === 404 || r.status === 410) {
    return `${n} SKIP ${String(r.cache).padEnd(12)} ${r.status} ${path}`;
  }
  if (!r.ok) {
    return `${n} FAIL ${String(r.cache).padEnd(12)} ${r.status} ${r.type || ''} ${r.error || ''}${retry} ${path}`;
  }
  // Leading token is HIT/MISS/… — MISS is success for a warmer (fills the edge).
  return `${n} ${String(r.cache).padEnd(12)} ${r.status} ${kb.padStart(6)} ${String(r.ms).padStart(5)}ms${age}${retry} ${path}`;
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
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return out;
}

let urls = [...new Set((await loadUrls()).filter(isMediaUrl))];
if (Number.isFinite(LIMIT)) urls = urls.slice(0, LIMIT);

console.log(
  `Warming ${urls.length} image(s) on ${ORIGIN} (concurrency ${CONCURRENCY}, delay ${DELAY_MS}ms)`
);
if (urls.length === 0) {
  console.error('No image URLs found.');
  process.exit(1);
}

let blocked = false;
const results = await mapPool(urls, CONCURRENCY, async (url, i) => {
  if (blocked) {
    return {
      url,
      ok: false,
      status: 0,
      type: '',
      cache: 'NONE',
      age: null,
      bytes: 0,
      ms: 0,
      skipped: true,
    };
  }
  const r = await warmOne(url);
  console.log(formatLine(i, urls.length, r));
  // Only abort the run on hard blocks (Imunify/WAF). Transient fetch failures continue.
  if (STOP_STATUSES.has(r.status)) {
    blocked = true;
  }
  if (DELAY_MS) await delay(DELAY_MS);
  return r;
});

const ok = results.filter((r) => r.ok).length;
const skip = results.filter((r) => r.status === 404 || r.status === 410).length;
const fail = results.filter(
  (r) => !r.ok && !r.skipped && r.status !== 404 && r.status !== 410
).length;
const hit = results.filter((r) => r.ok && /^(HIT|STALE|REVALIDATED)$/i.test(r.cache || '')).length;
const miss = results.filter((r) => r.ok && /^(MISS|EXPIRED)$/i.test(r.cache || '')).length;
const none = results.filter((r) => r.ok && r.cache === 'NONE').length;
console.log(
  `\nDone. ok=${ok} fail=${fail} skip=${skip} HIT=${hit} MISS=${miss} (MISS is fine — filled cache) no-cf-header=${none}${blocked ? ' (stopped early: hard block)' : ''}`
);
// Fail the job only on hard block, or if more than a few soft failures remain after retries.
if (blocked || fail > 5) process.exitCode = 1;
