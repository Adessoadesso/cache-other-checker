/**
 * Verify every local media path with special characters works via signed Bunny CDN.
 * Exit 1 if any fail.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signBunnyUrl } from './lib/bunny-token.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.htaccess', '.DS_Store', 'Thumbs.db']);

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

function walk(d, base, out) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const full = path.join(d, e.name);
    const key = `${base}/${e.name}`.replace(/\\/g, '/');
    if (e.isDirectory()) walk(full, key, out);
    else if (e.isFile()) out.push({ key, size: fs.statSync(full).size, file: full });
  }
}

function isSpecial(key) {
  return /[^a-zA-Z0-9._\-/]/.test(key);
}

loadDotEnv();
const origin = process.env.BUNNY_CDN_ORIGIN?.replace(/\/$/, '');
const tokenKey = process.env.BUNNY_TOKEN_AUTH_KEY?.trim();
if (!origin || !tokenKey) {
  console.error('Need BUNNY_CDN_ORIGIN and BUNNY_TOKEN_AUTH_KEY in .env');
  process.exit(1);
}

const files = [];
walk(path.join(root, 'public', 'images'), 'images', files);
walk(path.join(root, 'public', 'media'), 'media', files);
const special = files.filter((f) => isSpecial(f.key));
console.log(`Auditing ${special.length} special-character paths…`);

const fails = [];
let ok = 0;
const concurrency = 12;
let i = 0;

async function worker() {
  while (i < special.length) {
    const idx = i++;
    const f = special[idx];
    const base = `${origin}/${f.key.split('/').map(encodeURIComponent).join('/')}`;
    const signed = signBunnyUrl(base, tokenKey, 3600);
    try {
      const res = await fetch(signed, { method: 'HEAD', cache: 'no-store' });
      const cl = res.headers.get('content-length');
      if (!res.ok) {
        fails.push({ key: f.key, status: res.status, reason: 'http' });
      } else if (cl != null && Number(cl) !== f.size) {
        fails.push({
          key: f.key,
          status: res.status,
          reason: 'size',
          local: f.size,
          remote: Number(cl),
        });
      } else {
        ok++;
      }
    } catch (e) {
      fails.push({ key: f.key, reason: 'error', error: e.message });
    }
    if ((idx + 1) % 25 === 0 || idx + 1 === special.length) {
      console.log(`${idx + 1}/${special.length} checked, ${ok} ok, ${fails.length} fail`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
const report = { at: new Date().toISOString(), total: special.length, ok, fails };
fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
fs.writeFileSync(
  path.join(root, '.cache', 'special-media-audit.json'),
  JSON.stringify(report, null, 2)
);
console.log(`Done: ${ok}/${special.length} ok, ${fails.length} fail`);
if (fails.length) {
  for (const f of fails.slice(0, 30)) console.error(JSON.stringify(f));
  process.exitCode = 1;
}
