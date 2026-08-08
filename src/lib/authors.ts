/** Author profile used on journal bylines and /darren-articles (live Joomla contact page). */
export const SITE_AUTHOR = {
  name: 'Darren McLoughlin',
  href: '/darren-articles',
  website: 'https://darrenmcloughlin.com',
  address: 'Ireland',
  image: '/images/Users/darren-mcloughlin_MG_7589-Edit.jpg',
  imageAlt: 'An image of a photographer holding a camera, the camera is a Mamiya 7ii.',
  bio: 'Irishman and International travel photographer in search of the best bits of Ireland. Leading photography tours and experiences in Ireland.',
  contributions: 'New York Times / Sunday Times / Irish Times / Echtra and Eonmusic',
  note: 'Cancer survivor.',
} as const;

/** Live author profile URL when the byline matches the site author; otherwise null. */
export function authorProfileHref(author: string | undefined | null): string | null {
  if (!author) return null;
  const normalized = author.replace(/\r/g, '').trim().toLowerCase();
  return normalized === SITE_AUTHOR.name.toLowerCase() ? SITE_AUTHOR.href : null;
}
