/**
 * BunnyCDN Advanced Token Authentication (HMAC-SHA256).
 * Same algorithm as worker/bunny-token.ts / Bunny official nodejs signer.
 */
import { createHmac } from 'node:crypto';

/**
 * Bunny Advanced token auth signs the *decoded* path (literal spaces etc.),
 * while the request URL keeps percent-encoding.
 */
function signaturePathFromUrl(parsed) {
  try {
    return decodeURIComponent(parsed.pathname);
  } catch {
    return parsed.pathname;
  }
}

export function signBunnyUrl(url, securityKey, expirationSeconds = 3600) {
  if (!securityKey) throw new Error('securityKey required');
  const parsed = new URL(url);
  const expires = String(Math.floor(Date.now() / 1000) + expirationSeconds);
  const signaturePath = signaturePathFromUrl(parsed);
  const signingData = '';
  const hmac = createHmac('sha256', securityKey);
  hmac.update(signaturePath);
  hmac.update(expires);
  hmac.update(Buffer.alloc(0)); // no IP
  hmac.update(signingData);
  const token =
    'HS256-' +
    hmac
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${parsed.origin}${parsed.pathname}?token=${token}&expires=${expires}`;
}
