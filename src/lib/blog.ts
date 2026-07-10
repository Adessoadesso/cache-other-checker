import { getCollection, type CollectionEntry } from 'astro:content';

/** Live-site blog category URL prefixes (hidden Joomla menu → SEF paths). */
export const BLOG_CATEGORIES = [
  { prefix: 'photo-tours-blog', title: 'Photo Tours', href: '/photo-tours-blog' },
  { prefix: 'blog-ireland-guide', title: 'Guide', href: '/blog-ireland-guide' },
  { prefix: 'miscellaneous-blog-category', title: 'Miscellaneous', href: '/miscellaneous-blog-category' },
  {
    prefix: 'photography-photoshop-post-processing',
    title: 'Photography & Post-processing',
    href: '/photography-photoshop-post-processing',
  },
] as const;

export type BlogCategoryPrefix = (typeof BLOG_CATEGORIES)[number]['prefix'];

export type BlogPost = CollectionEntry<'blog'>;

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
  return (post.data.updatedDate ?? post.data.pubDate).valueOf();
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
