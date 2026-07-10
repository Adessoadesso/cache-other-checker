import { handle } from '@astrojs/cloudflare/handler';
import { releaseExpiredHolds } from '../src/lib/release-expired-holds';

export default {
  fetch: handle,

  async scheduled(
    controller: ScheduledController,
    env: { DB: D1Database },
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(
      releaseExpiredHolds(env).then((result) => {
        console.log(`[scheduled] released ${result.released} expired slot hold(s)`);
      })
    );
  },
};
