import { getCollection, type CollectionEntry } from 'astro:content';

/** Live-site blog category URL prefixes (hidden Joomla menu → SEF paths). */
export const BLOG_CATEGORIES = [
  { prefix: 'photo-tours-blog', title: 'Photo Tours Blog', href: '/photo-tours-blog' },
  { prefix: 'blog-ireland-guide', title: 'Guide to Ireland', href: '/blog-ireland-guide' },
  { prefix: 'miscellaneous-blog-category', title: 'Miscellaneous', href: '/miscellaneous-blog-category' },
  {
    prefix: 'photography-photoshop-post-processing',
    title: 'Photography & Editing',
    href: '/photography-photoshop-post-processing',
  },
] as const;

export type BlogCategoryPrefix = (typeof BLOG_CATEGORIES)[number]['prefix'];

export type BlogPost = CollectionEntry<'blog'>;

/** Joomla NULL_DATE (-001-11-29) coerces to 2029-01-11 in JS — treat as missing. */
export function isInvalidBlogDate(date: Date | undefined): boolean {
  if (!date || !Number.isFinite(date.valueOf())) return true;
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  // Coerced Joomla NULL_DATE
  if (y === 2029 && m === 0 && d === 11) return true;
  // Migrator placeholders (not real publish dates)
  if (y === 2000 && m === 0 && d === 1) return true;
  if (y === 2001 && m === 10 && d === 29) return true;
  return false;
}

/** Display/sort date for posts with no valid pubDate or updatedDate (legacy Joomla NULL_DATE). */
export const BLOG_FALLBACK_DATE = new Date('2010-04-12T12:00:00Z');

/** Prefer updatedDate when valid; otherwise fall back to pubDate, then the legacy fallback date. */
export function blogDate(post: BlogPost): Date {
  for (const candidate of [post.data.updatedDate, post.data.pubDate]) {
    if (candidate && !isInvalidBlogDate(candidate)) return candidate;
  }
  return BLOG_FALLBACK_DATE;
}

/**
 * Chronological publish date (newest-first listings for author pages).
 * Prefers pubDate; falls back to updatedDate only when pubDate is missing/invalid.
 */
export function blogPublishDate(post: BlogPost): Date {
  for (const candidate of [post.data.pubDate, post.data.updatedDate]) {
    if (candidate && !isInvalidBlogDate(candidate)) return candidate;
  }
  return BLOG_FALLBACK_DATE;
}

/** Canonical public URL — always the exact live-site path. */
export function postUrl(post: BlogPost): string {
  if (!post.data.legacyPath) {
    throw new Error(`Post "${post.id}" has no legacyPath — set the live URL before publishing.`);
  }
  return post.data.legacyPath;
}

export function postSlug(post: BlogPost): string {
  const parts = (post.data.legacyPath ?? '').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? post.id;
}

export function postCategoryPrefix(post: BlogPost): BlogCategoryPrefix | null {
  const parts = (post.data.legacyPath ?? '').split('/').filter(Boolean);
  const prefix = parts[0];
  return BLOG_CATEGORIES.some((c) => c.prefix === prefix) ? (prefix as BlogCategoryPrefix) : null;
}

export async function getBlogArticlePaths(categoryPrefix: BlogCategoryPrefix) {
  const posts = await getCollection(
    'blog',
    ({ data }) => !data.draft && !!data.legacyPath?.startsWith(`/${categoryPrefix}/`),
  );
  return posts.map((post) => ({
    params: { slug: postSlug(post) },
    props: { post },
  }));
}

function sortDateValue(post: BlogPost): number {
  return blogDate(post)?.valueOf() ?? 0;
}

function sortPublishDateValue(post: BlogPost): number {
  return blogPublishDate(post)?.valueOf() ?? 0;
}

function normalizeAuthor(author: string | undefined | null): string {
  return (author ?? '').replace(/\r/g, '').trim().toLowerCase();
}

export async function postsInCategory(categoryPrefix: BlogCategoryPrefix) {
  return (
    await getCollection(
      'blog',
      ({ data }) => !data.draft && !!data.legacyPath?.startsWith(`/${categoryPrefix}/`),
    )
  ).sort((a, b) => sortDateValue(b) - sortDateValue(a));
}

export async function allPublishedPosts() {
  return (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => sortDateValue(b) - sortDateValue(a),
  );
}

/** Published posts by author, newest publish date first (rebuild picks up new posts automatically). */
export async function postsByAuthor(authorName: string) {
  const needle = normalizeAuthor(authorName);
  return (await getCollection('blog', ({ data }) => !data.draft && normalizeAuthor(data.author) === needle)).sort(
    (a, b) => sortPublishDateValue(b) - sortPublishDateValue(a),
  );
}

export interface BlogPostNeighbors {
  /** Chronologically older post in the same category. */
  prev: BlogPost | null;
  /** Chronologically newer post in the same category. */
  next: BlogPost | null;
}

/** Previous/next posts within the same category (newest-first listing order). */
export async function getAdjacentPosts(post: BlogPost): Promise<BlogPostNeighbors> {
  const prefix = postCategoryPrefix(post);
  if (!prefix) return { prev: null, next: null };

  const posts = await postsInCategory(prefix);
  const index = posts.findIndex((candidate) => candidate.id === post.id);
  if (index === -1) return { prev: null, next: null };

  return {
    prev: posts[index + 1] ?? null,
    next: posts[index - 1] ?? null,
  };
}
