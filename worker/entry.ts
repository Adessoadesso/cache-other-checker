import { handle } from '@astrojs/cloudflare/handler';
import { releaseExpiredHolds } from '../src/lib/release-expired-holds';
import { isMediaPath, isSiteIconPath, serveMedia } from './serve-media';

type WorkerEnv = Cloudflare.Env & {
  MEDIA_R2: R2Bucket;
};

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url);
    if (isMediaPath(pathname) || isSiteIconPath(pathname)) {
      // Timing starts here (before serve-media) so auth/key work is included.
      return serveMedia(request, env, ctx, performance.now());
    }
    const response = await handle(request, env, ctx);
    // Workers Cache ([cache] enabled) uses heuristic TTL when Cache-Control is
    // absent — force HTML/API off the edge cache.
    if (!response.headers.has('cache-control')) {
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'private, no-store');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },

  async scheduled(
    _controller: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(
      (async () => {
        const released = await releaseExpiredHolds(env);
        console.log(`[scheduled] released ${released.released} expired slot hold(s)`);

        // Lazy-load so googleapis/node-fetch are not required at Worker boot
        // (breaks local miniflare; only needed on cron).
        const { enqueueBalanceReminders, processNotificationJobs } = await import(
          '../src/lib/notification-jobs'
        );
        const { reconcilePendingPaypal } = await import('../src/lib/paypal-reconcile');

        const enqueued = await enqueueBalanceReminders(env.DB);
        if (enqueued > 0) {
          console.log(`[scheduled] enqueued ${enqueued} balance reminder job(s)`);
        }

        const jobs = await processNotificationJobs(env);
        if (jobs.processed || jobs.failed) {
          console.log(
            `[scheduled] notification jobs processed=${jobs.processed} failed=${jobs.failed}`
          );
        }

        if (String(env.PAYPAL_BOOKING_ENABLED ?? '') === 'true') {
          const recon = await reconcilePendingPaypal(env);
          if (recon.checked) {
            console.log(
              `[scheduled] paypal reconcile checked=${recon.checked} confirmed=${recon.confirmed}`
            );
          }
        }
      })()
    );
  },
};
