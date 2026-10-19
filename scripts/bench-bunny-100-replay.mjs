/**
 * Two-pass bench of the 100 keys from .cache/bunny-bench-100.json.
 * Pass A: unique query (CF MISS). Pass B: exact same URLs (CF may HIT; Bunny should be warm).
 * Records CF-Cache-Status, x-bunny-cache, x-bunny-fetch-ms.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prev = JSON.parse(
  fs.readFileSync(path.join(root, '.cache', 'bunny-bench-100.json'), 'utf8')
);
const keys = prev.rows.map((r) => r.key);
const nonce = `replay-${Date.now()}`;
const urls = keys.map(
  (key, i) =>
    `https://panoramicireland.com/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?r100=${nonce}-${i + 1}`
);

function curlGet(url) {
  return new Promise((resolve, reject) => {
    const hdrFile = path.join(root, '.cache', `_hdr-${process.pid}.txt`);
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
      if (code !== 0) {
        return reject(new Error(err || `curl exit ${code}`));
      }
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
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const pct = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  return {
    n: a.length,
    min: a[0],
    med: pct(0.5),
    p95: pct(0.95),
    max: a[a.length - 1],
  };
}

function countBy(rows, field) {
  const o = {};
  for (const r of rows) {
    const k = r[field] || '?';
    o[k] = (o[k] || 0) + 1;
  }
  return o;
}

async function runPass(label, urlList) {
  console.log(`\n=== ${label} (${urlList.length} URLs) ===`);
  const rows = [];
  for (let i = 0; i < urlList.length; i++) {
    const url = urlList[i];
    try {
      const t = await curlGet(url);
      rows.push({ url, key: keys[i], ...t });
    } catch (e) {
      rows.push({
        url,
        key: keys[i],
        http: 0,
        ttfb: null,
        err: e.message,
        cf: 'ERR',
        bunnyCache: 'ERR',
        bunnyMs: '?',
      });
    }
    if ((i + 1) % 10 === 0) console.log(`${i + 1}/${urlList.length}`);
  }
  const ok = rows.filter((r) => r.http === 200 && r.ttfb != null);
  const ttfb = stats(ok.map((r) => r.ttfb));
  const bunnyMs = stats(
    ok.map((r) => Number(r.bunnyMs)).filter((n) => Number.isFinite(n))
  );
  console.log('ok', ok.length, '/', urlList.length);
  console.log('CF-Cache', JSON.stringify(countBy(ok, 'cf')));
  console.log('x-bunny-cache', JSON.stringify(countBy(ok, 'bunnyCache')));
  console.log('backend', JSON.stringify(countBy(ok, 'backend')));
  if (ttfb) {
    console.log(
      `TTFB   med ${ttfb.med.toFixed(3)}s  p95 ${ttfb.p95.toFixed(3)}s  min ${ttfb.min.toFixed(3)} max ${ttfb.max.toFixed(3)}`
    );
  }
  if (bunnyMs) {
    console.log(
      `Bunny fetch-ms  med ${bunnyMs.med}  p95 ${bunnyMs.p95}  min ${bunnyMs.min} max ${bunnyMs.max}`
    );
  }
  const slow = [...ok].sort((a, b) => b.ttfb - a.ttfb).slice(0, 8);
  console.log('slowest TTFB:');
  for (const r of slow) {
    console.log(
      `  ${r.ttfb.toFixed(3)}s bunny=${r.bunnyMs}ms ${r.bunnyCache} cf=${r.cf} ${path.basename(r.key)}`
    );
  }
  return { label, rows, ttfb, bunnyMs, cf: countBy(ok, 'cf'), bunnyCache: countBy(ok, 'bunnyCache') };
}

const passA = await runPass('PASS A — first hit (unique query)', urls);
const passB = await runPass('PASS B — same URLs / same query (CF HIT expected)', urls);

// New query → CF MISS again, but Bunny edge should still be warm (origin path unchanged).
const nonceC = `replayC-${Date.now()}`;
const urlsC = keys.map(
  (key, i) =>
    `https://panoramicireland.com/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?r100=${nonceC}-${i + 1}`
);
const passC = await runPass(
  'PASS C — new query, same keys (CF MISS, Bunny warm?)',
  urlsC
);

function cmp(label, a, b) {
  if (!a?.ttfb || !b?.ttfb) return;
  console.log(
    `${label} TTFB med ${a.ttfb.med.toFixed(3)}s → ${b.ttfb.med.toFixed(3)}s | p95 ${a.ttfb.p95.toFixed(3)}s → ${b.ttfb.p95.toFixed(3)}s`
  );
  if (a.bunnyMs && b.bunnyMs) {
    console.log(
      `${label} Bunny ms med ${a.bunnyMs.med} → ${b.bunnyMs.med} | p95 ${a.bunnyMs.p95} → ${b.bunnyMs.p95}`
    );
  }
}

console.log('\n=== Compare ===');
cmp('A→B (same URL)', passA, passB);
cmp('A→C (Bunny warm, CF miss)', passA, passC);
console.log('Bunny cache A', passA.bunnyCache, '| B', passB.bunnyCache, '| C', passC.bunnyCache);
console.log('CF cache A', passA.cf, '| B', passB.cf, '| C', passC.cf);
console.log(
  'Note: Pass B CF HIT reuses cached headers (x-bunny-* from first fill). Pass C is the Bunny-warm check.'
);

fs.writeFileSync(
  path.join(root, '.cache', 'bunny-bench-100-replay.json'),
  JSON.stringify(
    { at: new Date().toISOString(), nonce, nonceC, passA, passB, passC },
    null,
    2
  )
);
console.log('\nWrote .cache/bunny-bench-100-replay.json');
