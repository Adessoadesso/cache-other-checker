/**
 * Curl N random (or listed) live images and report timing + CF/Bunny headers.
 *
 * Uses real `curl` write-out times (DNS / connect / TTFB / total) so a US
 * GitHub runner measures the path from that runner → Cloudflare colo.
 *
 * Usage:
 *   node scripts/curl-images-timing.mjs
 *   node scripts/curl-images-timing.mjs --count=30
 *   node scripts/curl-images-timing.mjs --count=50 --seed=42
 *   node scripts/curl-images-timing.mjs --list=scripts/data/warm-images.txt
 *   node scripts/curl-images-timing.mjs --pass=2   # second pass (expect more HIT)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = String(args.origin || 'https://panoramicireland.com').replace(/\/$/, '');
const SITEMAP = String(args.sitemap || `${ORIGIN}/sitemap-index.xml`);
const COUNT = Math.max(1, Number(args.count || 30));
const LIST = args.list ? String(args.list) : null;
const PASS = Math.max(1, Number(args.pass || 1));
const SEED = args.seed != null ? Number(args.seed) : Date.now();
const UA = 'panoramicireland-curl-timing/1.0';

function extractLocs(xml) {
  const locs = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    locs.push(m[1].trim());
  }
  return locs;
}

function extractImageLocs(xml) {
  const locs = [];
  for (const m of xml.matchAll(/<image:loc>\s*([^<\s]+)\s*<\/image:loc>/gi)) {
    locs.push(m[1].trim());
  }
  return locs;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function loadSitemapImageUrls() {
  const index = await fetchText(SITEMAP);
  const locs = extractLocs(index);
  const isIndex =
    /<sitemapindex[\s>]/i.test(index) || locs.some((u) => /sitemap.*\.xml/i.test(u));
  let xml = index;
  if (isIndex) {
    const parts = [];
    for (const child of locs) parts.push(await fetchText(child));
    xml = parts.join('\n');
  }
  return [...new Set(extractImageLocs(xml))];
}

function loadListUrls(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  return fs
    .readFileSync(abs, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && /^https?:\/\//i.test(l));
}

/** Mulberry32 — deterministic shuffle when --seed is set. */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, seed) {
  const rand = mulberry32(seed >>> 0);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function headerValue(raw, name) {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im');
  const m = raw.match(re);
  return m ? m[1].trim() : '';
}

function coloFromCfRay(ray) {
  if (!ray) return '';
  const dash = ray.lastIndexOf('-');
  if (dash < 0) return '';
  return ray.slice(dash + 1).toUpperCase();
}

function curlOne(url) {
  const hdrFile = path.join(
    tmpdir(),
    `pi-curl-hdr-${process.pid}-${Math.random().toString(36).slice(2)}.txt`
  );
  const writeOut = [
    'http_code=%{http_code}',
    'size_download=%{size_download}',
    'time_namelookup=%{time_namelookup}',
    'time_connect=%{time_connect}',
    'time_appconnect=%{time_appconnect}',
    'time_starttransfer=%{time_starttransfer}',
    'time_total=%{time_total}',
  ].join(';');

  const r = spawnSync(
    'curl',
    [
      '-sS',
      '-L',
      '--max-time',
      '60',
      '-A',
      UA,
      '-D',
      hdrFile,
      '-o',
      process.platform === 'win32' ? 'NUL' : '/dev/null',
      '-w',
      writeOut,
      url,
    ],
    { encoding: 'utf8' }
  );

  let headers = '';
  try {
    headers = fs.readFileSync(hdrFile, 'utf8');
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(hdrFile);
  } catch {
    /* ignore */
  }

  if (r.error) {
    return {
      ok: false,
      error: r.error.message,
      url,
      status: 0,
      ms: 0,
      ttfbMs: 0,
      bytes: 0,
      cf: 'NONE',
      age: '',
      bunny: '',
      bunnyMs: '',
      backend: '',
      colo: '',
    };
  }

  const out = String(r.stdout || '');
  const pick = (key) => {
    const m = out.match(new RegExp(`${key}=([0-9.]+)`));
    return m ? Number(m[1]) : 0;
  };

  const status = pick('http_code') || 0;
  const bytes = pick('size_download') || 0;
  const total = pick('time_total') || 0;
  const ttfb = pick('time_starttransfer') || 0;
  const cf = headerValue(headers, 'cf-cache-status') || 'NONE';
  const age = headerValue(headers, 'age');
  const bunny = headerValue(headers, 'x-bunny-cache');
  const bunnyMs = headerValue(headers, 'x-bunny-fetch-ms');
  const workerMs = headerValue(headers, 'x-worker-response-ms');
  const backend = headerValue(headers, 'x-media-backend');
  const ray = headerValue(headers, 'cf-ray');
  const type = headerValue(headers, 'content-type');
  const colo = coloFromCfRay(ray);

  return {
    ok: status >= 200 && status < 300 && /^image\//i.test(type),
    error: r.status !== 0 ? String(r.stderr || '').trim() || `curl exit ${r.status}` : '',
    url,
    status,
    ms: Math.round(total * 1000),
    ttfbMs: Math.round(ttfb * 1000),
    dnsMs: Math.round(pick('time_namelookup') * 1000),
    connectMs: Math.round(pick('time_connect') * 1000),
    bytes,
    cf: cf.toUpperCase(),
    age,
    bunny,
    bunnyMs,
    workerMs,
    backend,
    colo,
    type,
  };
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

function summarize(rows, label) {
  const ok = rows.filter((r) => r.ok);
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  const ttfb = ok.map((r) => r.ttfbMs).sort((a, b) => a - b);
  const hit = ok.filter((r) => r.cf === 'HIT').length;
  const miss = ok.filter((r) => r.cf === 'MISS').length;
  const expired = ok.filter((r) => r.cf === 'EXPIRED').length;
  const other = ok.length - hit - miss - expired;
  const colos = [...new Set(ok.map((r) => r.colo).filter(Boolean))];
  const avg = ms.length
    ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)
    : 0;
  const avgTtfb = ttfb.length
    ? Math.round(ttfb.reduce((a, b) => a + b, 0) / ttfb.length)
    : 0;

  console.log(`\n=== ${label} ===`);
  console.log(
    `ok=${ok.length}/${rows.length} fail=${rows.length - ok.length} HIT=${hit} MISS=${miss} EXPIRED=${expired} other=${other}`
  );
  console.log(`CF colo(s): ${colos.length ? colos.join(', ') : 'unknown'}`);
  console.log(
    `total: avg=${avg}ms p50=${pct(ms, 50)}ms p90=${pct(ms, 90)}ms min=${ms[0] ?? 0}ms max=${ms[ms.length - 1] ?? 0}ms`
  );
  console.log(
    `ttfb:  avg=${avgTtfb}ms p50=${pct(ttfb, 50)}ms p90=${pct(ttfb, 90)}ms min=${ttfb[0] ?? 0}ms max=${ttfb[ttfb.length - 1] ?? 0}ms`
  );

  return {
    ok: ok.length,
    fail: rows.length - ok.length,
    hit,
    miss,
    expired,
    other,
    colos,
    totalMs: { avg, p50: pct(ms, 50), p90: pct(ms, 90), min: ms[0] ?? 0, max: ms[ms.length - 1] ?? 0 },
    ttfbMs: {
      avg: avgTtfb,
      p50: pct(ttfb, 50),
      p90: pct(ttfb, 90),
      min: ttfb[0] ?? 0,
      max: ttfb[ttfb.length - 1] ?? 0,
    },
  };
}

function formatLine(i, total, r) {
  const n = `[${i + 1}/${total}]`;
  const kb = `${Math.round((r.bytes || 0) / 1024)}KB`;
  const age = r.age ? ` age=${r.age}s` : '';
  const colo = r.colo ? ` ${r.colo}` : '';
  let pathOnly = r.url;
  try {
    pathOnly = new URL(r.url).pathname;
  } catch {
    /* keep */
  }
  if (pathOnly.length > 72) pathOnly = pathOnly.slice(0, 69) + '...';
  if (!r.ok) {
    return `${n} FAIL${colo} ${r.status} ${r.error || r.type || ''} ${pathOnly}`;
  }
  const worker = r.workerMs ? ` worker=${r.workerMs}ms` : '';
  const bunny = r.bunnyMs ? ` bunny=${r.bunnyMs}ms` : '';
  return `${n} ${String(r.cf).padEnd(8)}${colo} ${r.status} ${kb.padStart(6)} ttfb=${String(r.ttfbMs).padStart(5)}ms total=${String(r.ms).padStart(5)}ms${worker}${bunny}${age} ${pathOnly}`;
}

const curlCheck = spawnSync('curl', ['--version'], { encoding: 'utf8' });
if (curlCheck.error || curlCheck.status !== 0) {
  console.error('curl is required on PATH');
  process.exit(1);
}

let urls;
if (LIST) {
  urls = loadListUrls(LIST);
  console.log(`Loaded ${urls.length} URL(s) from ${LIST}`);
} else {
  urls = await loadSitemapImageUrls();
  console.log(`Loaded ${urls.length} sitemap image:loc URL(s)`);
}

if (!urls.length) {
  console.error('No URLs to test');
  process.exit(1);
}

const sample = shuffle(urls, SEED).slice(0, Math.min(COUNT, urls.length));
console.log(
  `Testing ${sample.length} URL(s) on ${ORIGIN} (seed=${SEED}, passes=${PASS})`
);
console.log('(times are from this machine/runner — includes path to CF colo)\n');

const report = {
  origin: ORIGIN,
  seed: SEED,
  count: sample.length,
  source: LIST || 'sitemap',
  generatedAt: new Date().toISOString(),
  passes: [],
};

for (let p = 1; p <= PASS; p++) {
  const rows = [];
  console.log(`--- pass ${p}/${PASS} ---`);
  for (let i = 0; i < sample.length; i++) {
    const r = curlOne(sample[i]);
    rows.push(r);
    console.log(formatLine(i, sample.length, r));
  }
  const summary = summarize(rows, `pass ${p}`);
  report.passes.push({
    pass: p,
    summary,
    rows: rows.map((r) => ({
      url: r.url,
      ok: r.ok,
      status: r.status,
      cf: r.cf,
      age: r.age || null,
      colo: r.colo || null,
      ms: r.ms,
      ttfbMs: r.ttfbMs,
      bytes: r.bytes,
      bunny: r.bunny || null,
      bunnyMs: r.bunnyMs || null,
      backend: r.backend || null,
    })),
  });
}

const outDir = path.join(ROOT, 'reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'curl-images-timing.json');
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`\nWrote ${outFile}`);

const last = report.passes[report.passes.length - 1];
if (last.summary.fail > Math.max(2, Math.floor(sample.length * 0.1))) {
  process.exitCode = 1;
}
