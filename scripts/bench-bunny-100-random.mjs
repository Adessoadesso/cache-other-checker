/**
 * 100 random apex image URLs (unique query → CF MISS preferred).
 * Records CF-Cache-Status, x-bunny-cache, x-bunny-fetch-ms.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.htaccess', '.DS_Store', 'Thumbs.db']);

function walk(d, base, out) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const full = path.join(d, e.name);
    const key = `${base}/${e.name}`.replace(/\\/g, '/');
    if (e.isDirectory()) walk(full, key, out);
    else if (e.isFile() && /\.(jpe?g|png|webp|gif|avif)$/i.test(e.name)) {
      out.push({ key, size: fs.statSync(full).size });
    }
  }
}

function curl(url) {
  return new Promise((resolve, reject) => {
    const hdrFile = path.join(
      root,
      '.cache',
      `_h-${process.pid}-${Math.random().toString(36).slice(2)}.txt`
    );
    fs.mkdirSync(path.dirname(hdrFile), { recursive: true });
    const child = spawn(
      'curl.exe',
      [
        '-s',
        '-o',
        'NUL',
        '-D',
        hdrFile,
        '-w',
        '%{http_code}|%{time_starttransfer}|%{time_total}|%{size_download}',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      let headers = '';
      try {
        headers = fs.readFileSync(hdrFile, 'utf8');
        fs.unlinkSync(hdrFile);
      } catch {
        /* ignore */
      }
      if (code !== 0) return reject(new Error(err || `curl ${code}`));
      const [http, ttfb, total, size] = out.trim().split('|').map(Number);
      const pick = (re) => (headers.match(re) || [])[1] || '?';
      resolve({
        http,
        ttfb,
        total,
        size,
        cf: pick(/CF-Cache-Status:\s*(\S+)/i),
        backend: pick(/x-media-backend:\s*(\S+)/i),
        bunnyCache: pick(/x-bunny-cache:\s*(\S+)/i),
        bunnyMs: pick(/x-bunny-fetch-ms:\s*(\S+)/i),
      });
    });
  });
}

function stats(nums) {
  const a = nums.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const pct = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  return { n: a.length, min: a[0], med: pct(0.5), p95: pct(0.95), max: a[a.length - 1] };
}

function countBy(rows, field) {
  const o = {};
  for (const r of rows) {
    const k = r[field] || '?';
    o[k] = (o[k] || 0) + 1;
  }
  return o;
}

const all = [];
walk(path.join(root, 'public', 'images'), 'images', all);
walk(path.join(root, 'public', 'media'), 'media', all);
for (let i = all.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [all[i], all[j]] = [all[j], all[i]];
}
const picks = all.slice(0, 100);
const nonce = Date.now();
console.log(`Picked ${picks.length} of ${all.length} images; nonce=${nonce}`);

const rows = [];
for (let i = 0; i < picks.length; i++) {
  const p = picks[i];
  const url = `https://panoramicireland.com/${p.key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}?r100c=${nonce}-${i + 1}`;
  try {
    rows.push({ key: p.key, size: p.size, url, ...(await curl(url)) });
  } catch (e) {
    rows.push({
      key: p.key,
      size: p.size,
      url,
      http: 0,
      ttfb: null,
      err: e.message,
      cf: 'ERR',
      bunnyCache: 'ERR',
    });
  }
  if ((i + 1) % 10 === 0) console.log(`${i + 1}/100`);
}

const ok = rows.filter((r) => r.http === 200 && r.ttfb != null);
const ttfb = stats(ok.map((r) => r.ttfb));
const bms = stats(ok.map((r) => Number(r.bunnyMs)).filter(Number.isFinite));

console.log('\n=== 100 random apex (unique query) ===');
console.log('ok', ok.length, '/ 100 | fail', 100 - ok.length);
console.log('CF-Cache', JSON.stringify(countBy(ok, 'cf')));
console.log('x-bunny-cache', JSON.stringify(countBy(ok, 'bunnyCache')));
console.log('backend', JSON.stringify(countBy(ok, 'backend')));
if (ttfb) {
  console.log(
    `TTFB  med ${ttfb.med.toFixed(3)}s  p95 ${ttfb.p95.toFixed(3)}s  min ${ttfb.min.toFixed(3)} max ${ttfb.max.toFixed(3)}`
  );
}
if (bms) {
  console.log(`Bunny ms med ${bms.med}  p95 ${bms.p95}  min ${bms.min} max ${bms.max}`);
}
console.log('ttfb <300ms', `${ok.filter((r) => r.ttfb < 0.3).length}/${ok.length}`);
console.log('ttfb >=750ms', `${ok.filter((r) => r.ttfb >= 0.75).length}/${ok.length}`);
console.log('slowest 8:');
for (const r of [...ok].sort((a, b) => b.ttfb - a.ttfb).slice(0, 8)) {
  console.log(
    `  ${r.ttfb.toFixed(3)}s bunny=${r.bunnyMs}ms ${r.bunnyCache} cf=${r.cf} ${path.basename(r.key).slice(0, 45)}`
  );
}

fs.writeFileSync(
  path.join(root, '.cache', 'bunny-bench-100c.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      nonce,
      summary: {
        ok: ok.length,
        ttfb,
        bms,
        cf: countBy(ok, 'cf'),
        bunnyCache: countBy(ok, 'bunnyCache'),
      },
      rows,
    },
    null,
    2
  )
);
console.log('\nWrote .cache/bunny-bench-100c.json');
