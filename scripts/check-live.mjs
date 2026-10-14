/**
 * Live smoke checks: HTML status, redirect loops, CF cache headers, sample media.
 *
 * Usage:
 *   npm run check:live
 *   node scripts/check-live.mjs --origin=https://panoramicireland.com
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const ORIGIN = String(args.origin || 'https://panoramicireland.com').replace(/\/$/, '');
const MAX_REDIRS = Math.max(1, Number(args['max-redirs'] || 3));
const UA = 'panoramicireland-check-live/1.0';

const HTML_SMOKE = [
  '/',
  '/dublin',
  '/about',
  '/contact',
  '/photography-workshops-ireland/book-a-photo-tour-in-dublin',
  '/photo-tours-blog',
  '/blog-ireland-guide',
  '/blog-ireland-guide/tag/green-road',
  '/blog-ireland-guide/tag/irish-festivals',
];

const SYNONYM_HOPS = [
  {
    from: '/photo-tours-blog/tag/green-road',
    to: '/blog-ireland-guide/tag/green-road',
  },
  {
    from: '/photo-tours-blog/tag/irish-festivals',
    to: '/blog-ireland-guide/tag/irish-festivals',
  },
];

const SAMPLE_MEDIA = [
  '/images/2016/03/15/panoramic-ireland-dublin-3513.jpg',
  '/images/2016/03/15/panoramic-ireland-connemara-7585-3.jpg',
  '/media/k2/items/cache/d521b3285331148964fc0a459a826ae3_XL.jpg',
];

const CF_OK = /^(HIT|STALE|REVALIDATED|DYNAMIC|MISS|EXPIRED|UPDATING)$/i;

function abs(pathname) {
  if (pathname.startsWith('http')) return pathname;
  return `${ORIGIN}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function normPath(urlOrPath) {
  try {
    const u = new URL(urlOrPath, ORIGIN);
    let p = u.pathname;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  } catch {
    return urlOrPath;
  }
}

function sameUrl(a, b) {
  return normPath(a) === normPath(b);
}

async function fetchManual(url, { method = 'GET' } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'user-agent': UA },
    redirect: 'manual',
  });
  // Drain body on GET so connections stay healthy.
  if (method === 'GET' && res.status < 300) {
    await res.arrayBuffer().catch(() => {});
  } else if (method === 'GET' && res.body) {
    await res.arrayBuffer().catch(() => {});
  }
  return res;
}

/**
 * Follow redirects manually; fail on self-redirect or too many hops.
 * @returns {{ ok: boolean, status: number, finalUrl: string, hops: object[], cf: string|null, error?: string }}
 */
async function resolveUrl(startUrl, { expectFinal = 200 } = {}) {
  const hops = [];
  let url = startUrl;
  for (let i = 0; i <= MAX_REDIRS; i++) {
    let res;
    try {
      res = await fetchManual(url);
    } catch (err) {
      return {
        ok: false,
        status: 0,
        finalUrl: url,
        hops,
        cf: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const loc = res.headers.get('location');
    const cf = res.headers.get('cf-cache-status');
    hops.push({
      url,
      status: res.status,
      location: loc,
      cf,
    });

    if (res.status >= 300 && res.status < 400) {
      if (!loc) {
        return {
          ok: false,
          status: res.status,
          finalUrl: url,
          hops,
          cf,
          error: `redirect ${res.status} without Location`,
        };
      }
      const next = new URL(loc, url).href;
      if (sameUrl(url, next)) {
        return {
          ok: false,
          status: res.status,
          finalUrl: url,
          hops,
          cf,
          error: `self-redirect ${res.status} → ${next}`,
        };
      }
      if (i === MAX_REDIRS) {
        return {
          ok: false,
          status: res.status,
          finalUrl: url,
          hops,
          cf,
          error: `exceeded ${MAX_REDIRS} redirects`,
        };
      }
      url = next;
      continue;
    }

    return {
      ok: res.status === expectFinal,
      status: res.status,
      finalUrl: url,
      hops,
      cf,
      error:
        res.status === expectFinal
          ? undefined
          : `expected ${expectFinal}, got ${res.status}`,
    };
  }

  return {
    ok: false,
    status: 0,
    finalUrl: url,
    hops,
    cf: null,
    error: `exceeded ${MAX_REDIRS} redirects`,
  };
}

function pass(name, detail) {
  return { name, ok: true, detail };
}

function fail(name, detail) {
  return { name, ok: false, detail };
}

async function checkHtmlSmoke() {
  const results = [];
  for (const p of HTML_SMOKE) {
    const url = abs(p);
    // First request (may MISS)
    const first = await resolveUrl(url);
    if (!first.ok) {
      results.push(fail(`html ${p}`, first.error || `status ${first.status}`));
      continue;
    }
    // Second request — require CF-Cache-Status header present
    const second = await resolveUrl(url);
    if (!second.ok) {
      results.push(fail(`html ${p} (2nd)`, second.error || `status ${second.status}`));
      continue;
    }
    const cf = second.cf || first.cf;
    if (!cf || !CF_OK.test(cf)) {
      results.push(
        fail(
          `html ${p} cf-cache`,
          cf ? `unexpected CF-Cache-Status=${cf}` : 'missing CF-Cache-Status'
        )
      );
      continue;
    }
    const note =
      /MISS|EXPIRED/i.test(first.cf || '') && /MISS|EXPIRED/i.test(second.cf || '')
        ? ` (still MISS after 2nd — warn only)`
        : '';
    results.push(pass(`html ${p}`, `200 cf=${cf}${note}`));
  }
  return results;
}

async function checkSynonymHops() {
  const results = [];
  for (const { from, to } of SYNONYM_HOPS) {
    const url = abs(from);
    let res;
    try {
      res = await fetchManual(url);
    } catch (err) {
      results.push(
        fail(`synonym ${from}`, err instanceof Error ? err.message : String(err))
      );
      continue;
    }
    if (res.status < 300 || res.status >= 400) {
      results.push(fail(`synonym ${from}`, `expected 3xx, got ${res.status}`));
      continue;
    }
    const loc = res.headers.get('location');
    if (!loc) {
      results.push(fail(`synonym ${from}`, `redirect ${res.status} without Location`));
      continue;
    }
    const next = new URL(loc, url).href;
    if (sameUrl(url, next)) {
      results.push(fail(`synonym ${from}`, `self-redirect → ${next}`));
      continue;
    }
    if (normPath(next) !== normPath(to)) {
      results.push(
        fail(`synonym ${from}`, `expected → ${to}, got → ${normPath(next)}`)
      );
      continue;
    }
    const hub = await resolveUrl(abs(to));
    if (!hub.ok) {
      results.push(
        fail(`synonym ${from} → hub`, hub.error || `hub status ${hub.status}`)
      );
      continue;
    }
    results.push(pass(`synonym ${from}`, `${res.status} → ${to} → 200`));
  }
  return results;
}

async function checkSampleMedia() {
  const results = [];
  for (const p of SAMPLE_MEDIA) {
    const url = abs(p);
    let res;
    try {
      res = await fetchManual(url);
    } catch (err) {
      results.push(
        fail(`media ${p}`, err instanceof Error ? err.message : String(err))
      );
      continue;
    }
    if (res.status >= 300 && res.status < 400) {
      results.push(
        fail(
          `media ${p}`,
          `unexpected redirect ${res.status} → ${res.headers.get('location')}`
        )
      );
      continue;
    }
    if (res.status !== 200) {
      results.push(fail(`media ${p}`, `status ${res.status}`));
      continue;
    }
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!ct.startsWith('image/')) {
      results.push(fail(`media ${p}`, `Content-Type=${ct || '(missing)'} (want image/*)`));
      continue;
    }
    const cf = res.headers.get('cf-cache-status');
    if (!cf || !CF_OK.test(cf)) {
      results.push(
        fail(
          `media ${p} cf-cache`,
          cf ? `unexpected CF-Cache-Status=${cf}` : 'missing CF-Cache-Status'
        )
      );
      continue;
    }
    results.push(pass(`media ${p}`, `200 ${ct} cf=${cf}`));
  }
  return results;
}

const started = Date.now();
console.log(`check:live → ${ORIGIN}\n`);

const checks = [
  ...(await checkHtmlSmoke()),
  ...(await checkSynonymHops()),
  ...(await checkSampleMedia()),
];

let failed = 0;
for (const c of checks) {
  const label = c.ok ? 'ok  ' : 'FAIL';
  if (!c.ok) failed++;
  console.log(`[${label}] ${c.name}: ${c.detail}`);
  if (!c.ok && process.env.GITHUB_ACTIONS) {
    const msg = `${c.name}: ${c.detail}`.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error::${msg}`);
  }
}

const report = {
  origin: ORIGIN,
  checkedAt: new Date().toISOString(),
  ms: Date.now() - started,
  ok: failed === 0,
  failed,
  total: checks.length,
  checks,
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'reports');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, 'live-check.json');
await writeFile(outFile, JSON.stringify(report, null, 2), 'utf8');

console.log(`\nDone. ok=${checks.length - failed} fail=${failed} → ${outFile}`);
if (failed) process.exitCode = 1;
