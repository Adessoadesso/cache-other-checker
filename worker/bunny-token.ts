/**
 * BunnyCDN Advanced Token Authentication (HMAC-SHA256).
 * Matches BunnyWay/BunnyCDN.TokenAuthentication nodejs/token.js
 */

function base64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Bunny Advanced token auth signs the *decoded* path (e.g. `/dir/duke st.jpg`),
 * while the request URL still uses percent-encoding (`duke%20st.jpg`).
 */
function signaturePathFromUrl(parsed: URL): string {
  try {
    return decodeURIComponent(parsed.pathname);
  } catch {
    return parsed.pathname;
  }
}

/** Sign a CDN file URL for Advanced token auth. */
export async function signBunnyUrl(
  url: string,
  securityKey: string,
  expirationSeconds = 3600
): Promise<string> {
  const parsed = new URL(url);
  const expires = String(Math.floor(Date.now() / 1000) + expirationSeconds);
  const signaturePath = signaturePathFromUrl(parsed);
  const signingData = ''; // no extra query params in signature

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(securityKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  // Payload order: path + expires + (empty IP) + signingData
  const payload = new Uint8Array([
    ...enc.encode(signaturePath),
    ...enc.encode(expires),
    ...enc.encode(signingData),
  ]);
  const digest = await crypto.subtle.sign('HMAC', key, payload);
  const token = `HS256-${base64Url(digest)}`;
  return `${parsed.origin}${parsed.pathname}?token=${token}&expires=${expires}`;
}
