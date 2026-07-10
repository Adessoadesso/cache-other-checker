import { defineMiddleware } from 'astro:middleware';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from 'cloudflare:workers';

/**
 * Cloudflare Access is the primary gate here — it should be configured in the
 * Cloudflare dashboard to block every request under /admin* before it ever
 * reaches this Worker (see README "Admin panel setup"). This middleware is
 * defense-in-depth: if the Access policy is ever misconfigured or removed,
 * requests still get rejected here because there's no valid Access JWT.
 *
 * Do NOT treat the mere presence of the `Cf-Access-Jwt-Assertion` header as
 * proof of identity — that header is trivially forgeable by anyone who can
 * reach the Worker directly. It has to be cryptographically verified against
 * Cloudflare's public keys for your team domain, which is what this does.
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)
    );
  }
  return jwks;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!pathname.startsWith('/admin')) {
    return next();
  }

  const token = context.request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    return new Response('Not authenticated — this page must be accessed through Cloudflare Access.', {
      status: 401,
    });
  }

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}`,
      audience: env.CF_ACCESS_AUD,
    });
    context.locals.adminEmail = typeof payload.email === 'string' ? payload.email : 'unknown';
  } catch (err) {
    console.error('Access JWT verification failed', err);
    return new Response('Access token invalid or expired — reload to re-authenticate.', { status: 401 });
  }

  return next();
});
