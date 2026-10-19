/**
 * Audit: every local public/images + public/media (+ root icons) key must
 * exist on Bunny CDN with matching Content-Length.
 *
 *   node scripts/audit-bunny-media.mjs
 *   node scripts/audit-bunny-media.mjs --prefix=images/blogWM/2026/October-2026
 *   node scripts/audit-bunny-media.mjs --concurrency=20
 *
 * Exit 1 if any missing / size mismatch. Report → .cache/bunny-media-audit.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signBunnyUrl } from './lib/bunny-token.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(root, '.cache', 'bunny-media-audit.json');
const SKIP_NAMES = new Set(['.htaccess', '.DS_Store', 'Thumbs.db']);

function loadDotEnv() {
  const p = path.join(root, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function parseArgs(argv) {
  const args = { concurrency: 20, prefix: '' };
  for (const a of argv) {
    if (a.startsWith('--concurrency=')) args.concurrency = Math.max(1, Number(a.slice(14)) || 20);
    else if (a.startsWith('--prefix=')) args.prefix = a.slice(9).replace(/^\/+/, '');
  }
  return args;
}

function walk(dir, baseKey, out) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_NAMES.has(ent.name) || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    const key = `${baseKey}/${ent.name}`.replace(/\\/g, '/');
    if (ent.isDirectory()) walk(full, key, out);
    else if (ent.isFile()) {
      const st = fs.statSync(full);
      out.push({ key, size: st.size });
    }
  }
}

function collectFiles(prefix) {
  const files = [];
  walk(path.join(root, 'public', 'images'), 'images', files);
  walk(path.join(root, 'public', 'media'), 'media', files);
  for (const name of [
    'favicon.ico',
    'favicon.png',
    'favicon.svg',
    'apple-touch-icon.png',
  ]) {
    const file = path.join(root, 'public', name);
    if (!fs.existsSync(file)) continue;
    files.push({ key: name, size: fs.statSync(file).size });
  }
  files.sort((a, b) => a.key.localeCompare(b.key));
  if (prefix) return files.filter((f) => f.key.startsWith(prefix));
  return files;
}

async function checkOne(cdnOrigin, f, tokenKey) {
  let url = `${cdnOrigin.replace(/\/$/, '')}/${f.key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  if (tokenKey) url = signBunnyUrl(url, tokenKey, 3600);
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (res.status === 404) return { key: f.key, ok: false, reason: 'missing', status: 404 };
    if (!res.ok) return { key: f.key, ok: false, reason: `http_${res.status}`, status: res.status };
    const cl = res.headers.get('content-length');
    if (cl != null && Number(cl) !== f.size) {
      return {
        key: f.key,
        ok: false,
        reason: 'size_mismatch',
        local: f.size,
        remote: Number(cl),
      };
    }
    return { key: f.key, ok: true };
  } catch (e) {
    return { key: f.key, ok: false, reason: 'error', error: e.message?.slice(0, 200) };
  }
}

async function main() {
  loadDotEnv();
  const cdnOrigin = process.env.BUNNY_CDN_ORIGIN?.trim();
  const tokenKey = process.env.BUNNY_TOKEN_AUTH_KEY?.trim() || '';
  if (!cdnOrigin) {
    console.error('Missing BUNNY_CDN_ORIGIN in .env');
    process.exit(1);
  }
  const opts = parseArgs(process.argv.slice(2));
  const files = collectFiles(opts.prefix);
  console.log(
    `Audit Bunny CDN ${cdnOrigin}: ${files.length} local keys` +
      (opts.prefix ? ` prefix=${opts.prefix}` : '') +
      `; concurrency=${opts.concurrency}` +
      (tokenKey ? '; signed tokens ON' : '; signed tokens OFF'),
  );

  const missing = [];
  const mismatches = [];
  const errors = [];
  let ok = 0;
  let i = 0;
  const t0 = Date.now();

  async function worker() {
    while (i < files.length) {
      const idx = i++;
      const f = files[idx];
      const r = await checkOne(cdnOrigin, f, tokenKey);
      if (r.ok) ok++;
      else if (r.reason === 'missing') missing.push(r);
      else if (r.reason === 'size_mismatch') mismatches.push(r);
      else errors.push(r);

      const done = ok + missing.length + mismatches.length + errors.length;
      if (done % 200 === 0 || done === files.length) {
        const elapsed = (Date.now() - t0) / 1000;
        console.log(
          `${done}/${files.length} checked, ${ok} ok, ${missing.length} missing, ${mismatches.length} size, ${errors.length} err (${(done / Math.max(elapsed, 1)).toFixed(1)}/s)`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency }, () => worker()));

  const report = {
    at: new Date().toISOString(),
    cdnOrigin,
    prefix: opts.prefix || null,
    total: files.length,
    ok,
    missing: missing.map((m) => m.key),
    sizeMismatches: mismatches,
    errors,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(
    `Done: ${ok}/${files.length} ok, ${missing.length} missing, ${mismatches.length} size mismatch, ${errors.length} errors.`,
  );
  console.log(`Report: ${REPORT_PATH}`);

  if (missing.length || mismatches.length || errors.length) {
    if (missing.length) {
      console.error('Missing sample:');
      for (const k of missing.slice(0, 15).map((m) => m.key)) console.error(`  ${k}`);
      if (missing.length > 15) console.error(`  … +${missing.length - 15} more`);
    }
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
