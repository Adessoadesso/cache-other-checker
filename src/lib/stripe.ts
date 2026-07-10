import Stripe from 'stripe';

/**
 * Cloudflare Workers run on a non-Node runtime, so the Stripe SDK must be
 * configured with fetch-based networking and no Node crypto dependency.
 */
export function getStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    // Pin this to whatever apiVersion string the installed `stripe` package
    // reports as current when you run `npm install` — don't hardcode a guess here.
    httpClient: Stripe.createFetchHttpClient(),
  });
}
