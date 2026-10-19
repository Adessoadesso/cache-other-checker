/**
 * Sync public/images + public/media (+ root brand icons) → Bunny Storage.
 * Keys match site paths: images/..., media/..., favicon.ico, …
 *
 * Requires .env (or env):
 *   BUNNY_STORAGE_ZONE=panoramicireland-images-media
 *   BUNNY_STORAGE_PASSWORD=<Storage AccessKey>
 *   BUNNY_STORAGE_HOST=storage.bunnycdn.com   (optional; Frankfurt Edge default)
 *   BUNNY_CDN_ORIGIN=https://panoramic-visuals.b-cdn.net  (optional; post-upload GET verify)
 *
 *   node scripts/sync-media-to-bunny.mjs
 *   node scripts/sync-media-to-bunny.mjs --dry-run
 *   node scripts/sync-media-to-bunny.mjs --prefix=images/blogWM/2026/October-2026
 *   node scripts/sync-media-to-bunny.mjs --concurrency=8 --no-verify
 *   node scripts/sync-media-to-bunny.mjs --from-audit   # re-upload missing from last audit
 *
 * After upload (unless --no-audit): runs audit-bunny-media.mjs — exit 1 if any missing.
 * No remote deletes. Failed keys → .cache/bunny-media-sync-failed.json
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const STATE_PATH = path.join(root, '.cache', 'bunny-media-sync-state.json');
const FAILED_PATH = path.join(root, '.cache', 'bunny-media-sync-failed.json');

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

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

const AUDIT_PATH = path.join(root, '.cache', 'bunny-media-audit.json');

function parseArgs(argv) {
  const args = {
    dryRun: false,
    concurrency: 6,
    prefix: '',
    resume: true,
    verify: false,
    audit: true,
    fromAudit: false,
  };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-resume') args.resume = false;
    else if (a === '--verify') args.verify = true;
    else if (a === '--no-verify') args.verify = false;
    else if (a === '--no-audit') args.audit = false;
    else if (a === '--from-audit') args.fromAudit = true;
    else if (a.startsWith('--concurrency=')) args.concurrency = Math.max(1, Number(a.slice(14)) || 6);
    else if (a.startsWith('--prefix=')) args.prefix = a.slice(9).replace(/^\/+/, '');
  }
  return args;
}

function loadAuditMissing() {
  try {
    const r = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
    const keys = new Set([
      ...(r.missing || []),
      ...((r.sizeMismatches || []).map((m) => m.key)),
      ...((r.errors || []).map((e) => e.key)),
    ]);
    return keys;
  } catch {
    console.error(`No audit report at ${AUDIT_PATH} — run npm run audit:media:bunny first.`);
    process.exit(1);
  }
}

function runAudit(prefix) {
  return new Promise((resolve, reject) => {
    const args = [path.join(root, 'scripts', 'audit-bunny-media.mjs')];
    if (prefix) args.push(`--prefix=${prefix}`);
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`audit exited ${code}`));
    });
  });
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
      out.push({ file: full, key, size: st.size, mtimeMs: st.mtimeMs });
    }
  }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { uploaded: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state), 'utf8');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function putWithRetries(url, password, body, contentType, checksum, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          AccessKey: password,
          'Content-Type': contentType,
          Checksum: checksum,
        },
        body,
      });
      if (res.status === 201 || res.status === 200) return;
      const text = await res.text().catch(() => '');
      lastErr = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      if (res.status === 429 || res.status >= 500) {
        await sleep(400 * 2 ** i);
        continue;
      }
      throw lastErr;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(400 * 2 ** i);
      else throw lastErr;
    }
  }
  throw lastErr;
}

async function verifyCdn(cdnOrigin, key, size) {
  const url = `${cdnOrigin.replace(/\/$/, '')}/${key}`;
  const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  if (!res.ok) throw new Error(`CDN verify ${res.status} ${url}`);
  const cl = res.headers.get('content-length');
  if (cl && Number(cl) !== size) {
    throw new Error(`CDN size mismatch ${cl} != ${size} for ${key}`);
  }
}

async function main() {
  loadDotEnv();
  const zone = process.env.BUNNY_STORAGE_ZONE?.trim();
  const password = process.env.BUNNY_STORAGE_PASSWORD?.trim();
  const host = (process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com').trim();
  const cdnOrigin = process.env.BUNNY_CDN_ORIGIN?.trim();

  if (!zone || !password) {
    console.error('Missing BUNNY_STORAGE_ZONE or BUNNY_STORAGE_PASSWORD (set in .env).');
    process.exit(1);
  }

  const opts = parseArgs(process.argv.slice(2));
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
    const st = fs.statSync(file);
    files.push({ file, key: name, size: st.size, mtimeMs: st.mtimeMs });
  }
  files.sort((a, b) => a.key.localeCompare(b.key));

  let list = files;
  if (opts.prefix) list = list.filter((f) => f.key.startsWith(opts.prefix));

  const state = opts.resume ? loadState() : { uploaded: {} };
  let todo;
  if (opts.fromAudit) {
    const need = loadAuditMissing();
    todo = list.filter((f) => need.has(f.key));
    for (const f of todo) delete state.uploaded[f.key];
    console.log(`--from-audit: ${need.size} keys in audit gaps; ${todo.length} match local list`);
  } else {
    todo = list.filter((f) => {
      const prev = state.uploaded[f.key];
      return !prev || prev.size !== f.size || prev.mtimeMs !== f.mtimeMs;
    });
  }

  const bytes = todo.reduce((s, f) => s + f.size, 0);
  console.log(
    `Bunny ${zone} @ ${host}: ${list.length} local matching` +
      (opts.prefix ? ` prefix=${opts.prefix}` : '') +
      `; ${todo.length} to upload (${(bytes / 1e6).toFixed(1)} MB); concurrency=${opts.concurrency}`,
  );

  if (opts.dryRun) {
    console.log('dry-run sample keys:');
    for (const f of todo.slice(0, 15)) console.log(`  ${f.key}`);
    if (todo.length > 15) console.log(`  … +${todo.length - 15} more`);
    return;
  }

  let done = 0;
  let failed = 0;
  const failures = [];
  const t0 = Date.now();
  let i = 0;

  async function worker() {
    while (i < todo.length) {
      const idx = i++;
      const f = todo[idx];
      const ext = path.extname(f.file).toLowerCase();
      const ct = MIME[ext] || 'application/octet-stream';
      const url = `https://${host}/${zone}/${f.key.split('/').map(encodeURIComponent).join('/')}`;
      try {
        const body = fs.readFileSync(f.file);
        const checksum = createHash('sha256').update(body).digest('hex').toUpperCase();
        await putWithRetries(url, password, body, ct, checksum);
        if (opts.verify && cdnOrigin) {
          await sleep(150);
          try {
            await verifyCdn(cdnOrigin, f.key, f.size);
          } catch (ve) {
            console.warn(`VERIFY soft-fail ${f.key}: ${ve.message}`);
          }
        }
        state.uploaded[f.key] = { size: f.size, mtimeMs: f.mtimeMs };
        done++;
        if (done % 25 === 0 || done === todo.length) {
          saveState(state);
          const elapsed = (Date.now() - t0) / 1000;
          const rate = done / Math.max(elapsed, 1);
          const eta = ((todo.length - done) / Math.max(rate, 0.01) / 60).toFixed(1);
          console.log(
            `${done}/${todo.length} ok, ${failed} fail, ${rate.toFixed(1)}/s, ETA ~${eta} min — ${f.key}`,
          );
        }
      } catch (e) {
        failed++;
        const msg = e.message?.slice(0, 200) || String(e);
        failures.push({ key: f.key, error: msg });
        console.error(`FAIL ${f.key}: ${msg}`);
      }
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency }, () => worker()));
  saveState(state);
  fs.mkdirSync(path.dirname(FAILED_PATH), { recursive: true });
  fs.writeFileSync(FAILED_PATH, JSON.stringify({ at: new Date().toISOString(), failures }, null, 2));
  console.log(
    `Finished: ${done} uploaded, ${failed} failed, ${list.length - todo.length} skipped (unchanged).`,
  );
  if (failed) {
    console.error(`Failed report: ${FAILED_PATH}`);
    process.exitCode = 1;
  }

  if (opts.audit && !opts.dryRun && cdnOrigin) {
    console.log('Running CDN audit (Content-Length check for every local key)…');
    // Brief pause so edge can see the last PUTs
    await sleep(2000);
    try {
      await runAudit(opts.prefix);
    } catch (e) {
      console.error(e.message);
      console.error('Fix gaps with: npm run sync:media:bunny -- --from-audit');
      process.exitCode = 1;
    }
  } else if (opts.audit && !cdnOrigin) {
    console.warn('Skip audit: BUNNY_CDN_ORIGIN not set');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
