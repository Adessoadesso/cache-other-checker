/**
 * Same-origin booking widget path (live PHP on panoramicireland.com).
 * Absolute live URLs fail in iframes on localhost (X-Frame-Options: SAMEORIGIN).
 * Dev: Vite proxies this path; production: same-host PHP serves it.
 */
export const DUBLIN_BOOKING_WIDGET_URL = '/book-tours-experiences/widget.php?v=2';

export const DUBLIN_BOOKING_PAGE_PATH =
  '/photography-workshops-ireland/book-a-photo-tour-in-dublin';

/** Catch-all workshop routes that have their own dedicated `.astro` page. */
export const WORKSHOP_DEDICATED_PAGE_SLUGS = new Set(['book-a-photo-tour-in-dublin']);
