/**
 * Warm /images/* and /media/* via GET (Workers Caching + Cache-Control).
 *
 * Sources (first match wins):
 *   --from-disk              every file under public/images + public/media
 *   --list=path/to/urls.txt  one https URL per line
 *   else                     image:loc entries from the live Astro sitemap
 *
 * Usage:
 *   node scripts/warm-images.mjs
 *   node scripts/warm-images.mjs --limit=100 --delay=2000
 *   node scripts/warm-images.mjs --list=scripts/data/warm-images.txt
 *   node scripts/warm-images.mjs --from-disk --delay=1000
 */
import fs from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = String(args.origin || 'https://panoramicireland.com').replace(/\/$/, '');
const SITEMAP = String(args.sitemap || `${ORIGIN}/sitemap-index.xml`);
const DELAY_MS = Math.max(0, Number(args.delay || 2000));
const LIMIT = args.limit != null ? Number(args.limit) : Infinity;
const CONCURRENCY = Math.max(1, Number(args.concurrency || 1));
const LIST = args.list ? String(args.list) : null;
const FROM_DISK = Boolean(args['from-disk']);

const DISK_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.bmp',
  '.tif',
  '.tiff',
  '.mp4',
  '.webm',
  '.pdf',
]);
/** Retries for blips (fetch failed / 502–504 / 429). Does not apply to 403/404. */
const RETRIES = Math.max(0, Number(args.retries ?? 3));
const RETRY_MS = Math.max(200, Number(args['retry-ms'] || 2500));
/**
 * Stop the whole run only on auth walls that mean the warmer itself is blocked.
 * Per-URL 403s (e.g. one bad media path) must not abort the other ~800 URLs —
 * they count as soft fails instead.
 */
const STOP_STATUSES = new Set([401]);

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

function walkPublicMedia(dir, urlPrefix, out) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkPublicMedia(full, `${urlPrefix}/${ent.name}`, out);
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!DISK_EXTS.has(ext)) continue;
    out.push(`${ORIGIN}${urlPrefix}/${ent.name}`.replace(/\\/g, '/'));
  }
}

/** All media URLs from the checked-out public/ tree (post-purge full warm). */
function loadUrlsFromDisk() {
  const out = [];
  walkPublicMedia(path.join(ROOT, 'public', 'images'), '/images', out);
  walkPublicMedia(path.join(ROOT, 'public', 'media'), '/media', out);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

async function loadUrls() {
  if (FROM_DISK) return loadUrlsFromDisk();
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

/** CF-Ray `abc123-LHR` → `LHR` (Cloudflare colo / PoP). */
function coloFromCfRay(header) {
  const raw = String(header || '').trim();
  if (!raw) return null;
  const dash = raw.lastIndexOf('-');
  if (dash < 0 || dash === raw.length - 1) return null;
  const colo = raw.slice(dash + 1).toUpperCase();
  return /^[A-Z0-9]{2,4}$/.test(colo) ? colo : null;
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
    // fetch() resolves on headers — client TTFB (includes runner→CF path).
    const ttfbMs = Date.now() - started;
    const buf = await res.arrayBuffer();
    const type = res.headers.get('content-type') || '';
    // Workers Cache ([cache] + Cache-Control) surfaces as cf-cache-status.
    const cache = cacheLabel(res.headers.get('cf-cache-status'));
    const age = res.headers.get('age');
    const colo = coloFromCfRay(res.headers.get('cf-ray'));
    const workerMs = res.headers.get('x-worker-response-ms');
    const bunnyMs = res.headers.get('x-bunny-fetch-ms');
    return {
      url,
      ok: res.ok && /^image\//i.test(type),
      status: res.status,
      type,
      cache,
      colo,
      age: age != null && age !== '' ? age : null,
      bytes: buf.byteLength,
      ttfbMs,
      ms: Date.now() - started,
      workerMs: workerMs != null && workerMs !== '' ? workerMs : null,
      bunnyMs: bunnyMs != null && bunnyMs !== '' ? bunnyMs : null,
    };
  } catch (err) {
    return {
      url,
      ok: false,
      status: 0,
      type: '',
      cache: 'NONE',
      colo: null,
      age: null,
      bytes: 0,
      ttfbMs: Date.now() - started,
      ms: Date.now() - started,
      workerMs: null,
      bunnyMs: null,
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

function formatLine(i, count, r) {
  const n = `[${i + 1}/${count}]`;
  const kb = `${Math.round((r.bytes || 0) / 1024)}KB`;
  const age = r.age != null ? ` age=${r.age}s` : '';
  const retry = r.retries ? ` retry=${r.retries}` : '';
  const colo = r.colo ? ` ${r.colo}` : '';
  const path = (() => {
    try {
      return new URL(r.url).pathname;
    } catch {
      return r.url;
    }
  })();
  if (r.status === 404 || r.status === 410) {
    return `${n} SKIP ${String(r.cache).padEnd(12)}${colo} ${r.status} ${path}`;
  }
  if (!r.ok) {
    return `${n} FAIL ${String(r.cache).padEnd(12)}${colo} ${r.status} ${r.type || ''} ${r.error || ''}${retry} ${path}`;
  }
  const ttfb =
    r.ttfbMs != null ? ` ttfb=${String(r.ttfbMs).padStart(4)}ms` : '';
  const totalMs = ` total=${String(r.ms).padStart(4)}ms`;
  // On CF HIT these Worker/Bunny values are historical (from first cache fill).
  const worker =
    r.workerMs != null ? ` worker=${r.workerMs}ms` : '';
  const bunny = r.bunnyMs != null ? ` bunny=${r.bunnyMs}ms` : '';
  // Leading token is HIT/MISS/… — MISS is success for a warmer (fills the edge).
  return `${n} ${String(r.cache).padEnd(12)}${colo} ${r.status} ${kb.padStart(6)}${ttfb}${totalMs}${worker}${bunny}${age}${retry} ${path}`;
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

const rawUrls = await loadUrls();
let urls = FROM_DISK
  ? [...new Set(rawUrls)]
  : [...new Set(rawUrls.filter(isMediaUrl))];
if (Number.isFinite(LIMIT)) urls = urls.slice(0, LIMIT);

const source = FROM_DISK ? 'public/images+media' : LIST ? `--list=${LIST}` : 'sitemap image:loc';
console.log(
  `Warming ${urls.length} image(s) on ${ORIGIN} from ${source} (concurrency ${CONCURRENCY}, delay ${DELAY_MS}ms)`
);
if (urls.length === 0) {
  console.error('No image URLs found.');
  process.exit(1);
}

let blocked = false;
let reportedColo = false;
const results = await mapPool(urls, CONCURRENCY, async (url, i) => {
  if (blocked) {
    return {
      url,
      ok: false,
      status: 0,
      type: '',
      cache: 'NONE',
      colo: null,
      age: null,
      bytes: 0,
      ms: 0,
      skipped: true,
    };
  }
  const r = await warmOne(url);
  if (!reportedColo && r.colo) {
    console.log(`CF colo: ${r.colo}`);
    reportedColo = true;
  }
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
const colos = [...new Set(results.map((r) => r.colo).filter(Boolean))];
console.log(
  `\nDone. ok=${ok} fail=${fail} skip=${skip} HIT=${hit} MISS=${miss} (MISS is fine — filled cache) no-cf-header=${none}${blocked ? ' (stopped early: hard block)' : ''}`
);
console.log(`CF colo(s): ${colos.length ? colos.join(', ') : 'unknown'}`);
// Fail the job only on hard block, or if more than a few soft failures remain after retries.
if (blocked || fail > 5) process.exitCode = 1;
