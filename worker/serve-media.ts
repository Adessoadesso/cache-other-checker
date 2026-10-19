/**
 * Serve /images/* and /media/* (and root brand icons).
 *
 * Backend via MEDIA_BACKEND:
 *   - r2 (default): MEDIA_R2 binding
 *   - bunny: fetch BUNNY_CDN_ORIGIN/{key} (streamed; subrequest cache: no-store)
 *     If BUNNY_TOKEN_AUTH_KEY is set, Advanced HMAC tokens are added so the
 *     Pull Zone can reject anonymous Google/hotlink hits on b-cdn.net.
 *
 * Edge caching uses Workers Cache ([cache] enabled in wrangler.toml) via
 * Cache-Control — not the Cache API (caches.default).
 */

import { signBunnyUrl } from './bunny-token';

const MEDIA_PREFIXES = ['/images/', '/media/'] as const;

/** Root brand icons — kept out of Astro/HTML-worker asset drift. */
const ROOT_ICON_PATHS = new Set([
  '/favicon.ico',
  '/favicon.png',
  '/favicon.svg',
  '/apple-touch-icon.png',
]);

const EXT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
};

/** Long TTL — Workers Cache honors these (tiered across colos). */
const CACHE_CONTROL = 'public, max-age=2592000, s-maxage=31536000';
const ICON_CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800';
const ERROR_CACHE_CONTROL = 'public, max-age=60';

const FORWARD_REQUEST_HEADERS = [
  'range',
  'if-range',
  'if-none-match',
  'if-modified-since',
] as const;

const PRESERVE_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
] as const;

export function isMediaPath(pathname: string): boolean {
  return MEDIA_PREFIXES.some((p) => pathname.startsWith(p));
}

export function isSiteIconPath(pathname: string): boolean {
  return ROOT_ICON_PATHS.has(pathname);
}

function mediaKey(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (ROOT_ICON_PATHS.has(decoded)) {
    return decoded.slice(1);
  }
  if (!isMediaPath(decoded)) return null;
  if (decoded.includes('\0') || decoded.split('/').includes('..')) return null;
  return decoded.slice(1);
}

function guessContentType(key: string): string {
  const lower = key.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return EXT_TYPES[lower.slice(dot)] ?? 'application/octet-stream';
}

type MediaEnv = {
  MEDIA_R2: R2Bucket;
  MEDIA_BACKEND?: string;
  BUNNY_CDN_ORIGIN?: string;
  /** Pull Zone URL Token Authentication Key (Advanced HMAC). Wrangler secret. */
  BUNNY_TOKEN_AUTH_KEY?: string;
};

function mediaBackend(env: MediaEnv): 'r2' | 'bunny' {
  return String(env.MEDIA_BACKEND ?? 'r2').toLowerCase() === 'bunny' ? 'bunny' : 'r2';
}

function successCacheControl(key: string): string {
  return isSiteIconPath(`/${key}`) ? ICON_CACHE_CONTROL : CACHE_CONTROL;
}

async function serveFromR2(
  request: Request,
  env: MediaEnv,
  key: string,
  method: string
): Promise<Response> {
  const hasRange = request.headers.has('range');
  const getOpts: R2GetOptions = { onlyIf: request.headers };
  if (hasRange) getOpts.range = request.headers;

  const object = await env.MEDIA_R2.get(key, getOpts);

  if (object === null) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'cache-control': ERROR_CACHE_CONTROL },
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', successCacheControl(key));
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-media-backend', 'r2');
  if (!headers.has('content-type')) {
    headers.set('content-type', guessContentType(key));
  }
  if (key.endsWith('.ico')) {
    headers.set('content-type', 'image/vnd.microsoft.icon');
  }

  const isPartial = Boolean(hasRange && object.range);
  if (isPartial && object.range) {
    const end = object.range.end ?? object.size - 1;
    headers.set(
      'content-range',
      `bytes ${object.range.offset}-${end}/${object.size}`
    );
  } else if (object.size > 0) {
    headers.set('content-length', String(object.size));
  }

  const hasBody = 'body' in object && object.body != null;
  let status = 200;
  if (!hasBody) {
    status = 304;
  } else if (isPartial) {
    status = 206;
  }

  const body = method === 'HEAD' || !hasBody ? null : object.body;
  return new Response(body, { status, headers });
}

function bunnyOriginUrl(env: MediaEnv, key: string): string | null {
  const origin = env.BUNNY_CDN_ORIGIN?.trim().replace(/\/$/, '');
  if (!origin) return null;
  const path = key
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `${origin}/${path}`;
}

async function bunnyFetchUrl(env: MediaEnv, key: string): Promise<string | null> {
  const base = bunnyOriginUrl(env, key);
  if (!base) return null;
  const tokenKey = env.BUNNY_TOKEN_AUTH_KEY?.trim();
  if (!tokenKey) return base;
  // Fresh short-lived token per Worker origin fetch (never sent to browsers).
  return signBunnyUrl(base, tokenKey, 3600);
}

/**
 * Header-time diagnostics (not body download).
 * On CF HIT these values are from when the object was first cached — ignore for diagnosis.
 */
function attachTimingHeaders(
  headers: Headers,
  workerStarted: number,
  bunnyMs?: number
): void {
  const workerMs = performance.now() - workerStarted;
  headers.set('x-worker-response-ms', workerMs.toFixed(1));
  const parts = [`worker;dur=${workerMs.toFixed(1)}`];
  if (bunnyMs != null && Number.isFinite(bunnyMs)) {
    headers.set('x-bunny-fetch-ms', bunnyMs.toFixed(1));
    parts.push(`bunny;dur=${bunnyMs.toFixed(1)}`);
  }
  const existing = headers.get('server-timing');
  headers.set(
    'server-timing',
    existing ? `${existing}, ${parts.join(', ')}` : parts.join(', ')
  );
}

async function serveFromBunny(
  request: Request,
  env: MediaEnv,
  key: string,
  method: string,
  workerStarted: number
): Promise<Response> {
  const bunnyUrl = await bunnyFetchUrl(env, key);
  if (!bunnyUrl) {
    const headers = new Headers({ 'cache-control': 'private, no-store' });
    attachTimingHeaders(headers, workerStarted);
    return new Response('Bunny origin not configured', { status: 500, headers });
  }

  const fwd = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = request.headers.get(h);
    if (v) fwd.set(h, v);
  }

  // Do not create a second Cloudflare fetch-cache of Bunny origin responses.
  // await fetch resolves on headers — bunnyMs is TTFB to Bunny, not full body.
  const bunnyStarted = performance.now();
  const upstream = await fetch(bunnyUrl, {
    method,
    headers: fwd,
    cache: 'no-store',
  });
  const bunnyMs = performance.now() - bunnyStarted;
  const bunnyCache =
    upstream.headers.get('CDN-Cache') ||
    upstream.headers.get('cdn-cache') ||
    '?';

  const status = upstream.status;

  // Missing / token edge-cases on Bunny → R2 (same public URL; never 403 HTML to browsers).
  if (status === 404 || status === 403) {
    upstream.body?.cancel();
    const r2 = await serveFromR2(request, env, key, method);
    const headers = new Headers(r2.headers);
    headers.set(
      'x-media-backend',
      status === 403 ? 'bunny-403-r2' : 'bunny-miss-r2'
    );
    headers.set('x-bunny-cache', bunnyCache);
    headers.set('x-bunny-upstream-status', String(status));
    attachTimingHeaders(headers, workerStarted, bunnyMs);
    return new Response(r2.body, { status: r2.status, headers });
  }

  const okCacheable =
    status === 200 || status === 206 || status === 304;

  const headers = new Headers();
  for (const h of PRESERVE_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', guessContentType(key));
  }
  if (key.endsWith('.ico')) {
    headers.set('content-type', 'image/vnd.microsoft.icon');
  }
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-media-backend', 'bunny');
  headers.set('x-bunny-cache', bunnyCache);
  headers.set(
    'cache-control',
    okCacheable ? successCacheControl(key) : ERROR_CACHE_CONTROL
  );
  attachTimingHeaders(headers, workerStarted, bunnyMs);

  // Stream body; HEAD / 304 have no body.
  const body =
    method === 'HEAD' || status === 304 || status === 204
      ? null
      : upstream.body;

  return new Response(body, { status, headers });
}

export async function serveMedia(
  request: Request,
  env: MediaEnv,
  _ctx: ExecutionContext,
  workerStarted = performance.now()
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const url = new URL(request.url);
  const key = mediaKey(url.pathname);
  if (!key) {
    return new Response('Bad Request', { status: 400 });
  }

  if (mediaBackend(env) === 'bunny') {
    return serveFromBunny(request, env, key, method, workerStarted);
  }
  const r2 = await serveFromR2(request, env, key, method);
  const headers = new Headers(r2.headers);
  attachTimingHeaders(headers, workerStarted);
  return new Response(r2.body, { status: r2.status, headers });
}
