import {
  BLOG_CATEGORIES,
  allPublishedPosts,
  blogDate,
  postCategoryPrefix,
  postUrl,
  postsInCategory,
  type BlogCategoryPrefix,
  type BlogPost,
} from './blog';

export const BLOG_PAGE_SIZE = 15;
export const BLOG_CATEGORY_PAGE_SIZE = 5;

/** Live /blog hub order (page 1) from panoramicireland.com/blog at archive time. */
export const BLOG_HUB_FEATURED_PATHS = [
  '/blog-ireland-guide/saint-audoens-arch-dublin-city-medieval-walls',
  '/blog-ireland-guide/doolough-mayo-west-valley-famine-gorta-mor-tragedy-starving-irish',
  '/miscellaneous-blog-category/crashing-waves-atlantic-west-ireland-exhilaration',
  '/blog-ireland-guide/green-road-atlantic-ireland-west-scenery-stormy-day-stone-walls-fences-irelands-edge',
  '/miscellaneous-blog-category/mussenden-temple-county-derry-golden-hour-thank-you-happy-new-year-from-panoramic-ireland',
  '/blog-ireland-guide/moydrum-castle-westmeath-black-white-infrared-marsden-u2-album',
  '/blog-ireland-guide/storm-bram-passed-ireland-wind-warnings-effect-galway-mayo-kerry-wild-atlantic-way',
  '/blog-ireland-guide/double-rainbow-over-the-green-fields-and-lake-west-of-ireland-landscape-scenery-photography-weather',
  '/photo-tours-blog/photographing-colourful-irish-landscapes-weather-west-october-scenes-panoramic-ireland',
  '/miscellaneous-blog-category/mussenden-temple-county-derry-golden-hour-thank-you-happy-new-year-from-panoramic-ireland',
  '/blog-ireland-guide/ireland-national-tree-day-scots-pine-2025-pine-island-connemara-reflection',
  '/photo-tours-blog/autumn-colour-scenery-woodlands-irish-landscape-photography-september-october',
  '/blog-ireland-guide/ireland-etape-du-tour-2025-experience-irelands-cycling-capital',
  '/blog-ireland-guide/four-donkeys-field-sunshine-warming',
  '/photo-tours-blog/crosan-alca-torda-razorbill-irish-north-atlantic-seabird-auk-puffin-guillemot',
] as const;

const BLOG_CATEGORY_FEATURED_PATHS: Partial<Record<BlogCategoryPrefix, readonly string[]>> = {
  'blog-ireland-guide': [
    '/blog-ireland-guide/saint-audoens-arch-dublin-city-medieval-walls',
    '/blog-ireland-guide/doolough-mayo-west-valley-famine-gorta-mor-tragedy-starving-irish',
    '/blog-ireland-guide/green-road-atlantic-ireland-west-scenery-stormy-day-stone-walls-fences-irelands-edge',
    '/blog-ireland-guide/moydrum-castle-westmeath-black-white-infrared-marsden-u2-album',
    '/blog-ireland-guide/storm-bram-passed-ireland-wind-warnings-effect-galway-mayo-kerry-wild-atlantic-way',
    '/blog-ireland-guide/double-rainbow-over-the-green-fields-and-lake-west-of-ireland-landscape-scenery-photography-weather',
    '/blog-ireland-guide/ireland-national-tree-day-scots-pine-2025-pine-island-connemara-reflection',
    '/blog-ireland-guide/ireland-etape-du-tour-2025-experience-irelands-cycling-capital',
    '/blog-ireland-guide/four-donkeys-field-sunshine-warming',
  ],
};

/** Sidebar keyword cloud mirrors the live blog hub ordering where possible. */
export const FEATURED_BLOG_KEYWORDS = [
  'ireland',
  'dublin',
  'landscape',
  'landscape photography',
  'photography',
  'photo tours',
  'photo tour',
  'photography workshop',
  'photography workshops',
  'northern ireland',
  'sunset',
  'panoramic ireland',
  'west of ireland',
  'weather',
  'wild atlantic way',
  'coast',
  'seascape',
  'winter',
  'architecture',
  'woodland',
  'scenery',
  'green',
  'galway',
  'autumn',
  'snow',
  'travel',
  'nature',
  'mountains',
  'antrim',
  'wicklow',
] as const;

export interface CategoryStat {
  prefix: BlogCategoryPrefix;
  title: string;
  href: string;
  count: number;
}

export interface BlogSearchEntry {
  title: string;
  url: string;
  kicker?: string;
  excerpt: string;
  heroImage?: string;
  heroImageAlt?: string;
  pubDate: string;
  categoryTitle?: string;
  categoryHref?: string;
  author: string;
  tags: string[];
}

export async function postsForHub(categoryPrefix?: BlogCategoryPrefix) {
  const posts = categoryPrefix ? await postsInCategory(categoryPrefix) : await allPublishedPosts();
  return categoryPrefix ? sortCategoryPosts(posts, categoryPrefix) : sortHubPosts(posts);
}

function sortCategoryPosts(posts: BlogPost[], categoryPrefix: BlogCategoryPrefix): BlogPost[] {
  const featured = BLOG_CATEGORY_FEATURED_PATHS[categoryPrefix] ?? [];
  if (featured.length === 0) return posts;

  const byPath = new Map(posts.map((p) => [postUrl(p), p]));
  const used = new Set<string>();
  const ordered: BlogPost[] = [];

  for (const path of featured) {
    const post = byPath.get(path);
    if (post) {
      ordered.push(post);
      used.add(post.id);
    }
  }

  ordered.push(...posts.filter((p) => !used.has(p.id)));
  return ordered;
}

/** Round-robin remaining posts by category when pubDates are tied (migration fallback). */
function interleaveByCategory(posts: BlogPost[]): BlogPost[] {
  const buckets = BLOG_CATEGORIES.map((cat) =>
    posts
      .filter((p) => postCategoryPrefix(p) === cat.prefix)
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const result: BlogPost[] = [];
  const indices = buckets.map(() => 0);

  while (result.length < posts.length) {
    let added = false;
    for (let i = 0; i < buckets.length; i++) {
      const post = buckets[i][indices[i]];
      if (post) {
        result.push(post);
        indices[i]++;
        added = true;
      }
    }
    if (!added) break;
  }

  return result;
}

/** Main blog hub: live featured order first, then category mix for the rest. */
export function sortHubPosts(posts: BlogPost[]): BlogPost[] {
  const byPath = new Map(posts.map((p) => [postUrl(p), p]));
  const used = new Set<string>();
  const ordered: BlogPost[] = [];

  for (const path of BLOG_HUB_FEATURED_PATHS) {
    const post = byPath.get(path);
    if (post) {
      ordered.push(post);
      used.add(post.id);
    }
  }

  const rest = posts.filter((p) => !used.has(p.id));
  ordered.push(...interleaveByCategory(rest));
  return ordered;
}

export function paginatePosts(posts: BlogPost[], page: number, pageSize = BLOG_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    posts: posts.slice(start, start + pageSize),
    currentPage,
    totalPages,
    totalPosts: posts.length,
  };
}

export function categoryStats(posts: BlogPost[]): CategoryStat[] {
  return BLOG_CATEGORIES.map((cat) => ({
    prefix: cat.prefix,
    title: cat.title,
    href: cat.href,
    count: posts.filter((p) => postCategoryPrefix(p) === cat.prefix).length,
  }));
}

export function postExcerpt(post: BlogPost, maxLen = 220): string {
  const raw = post.data.standfirst ?? post.data.description ?? '';
  const plain = raw
    .replace(/\s*\.blog-wrap[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen).replace(/\s+\S*$/, '')}...`;
}

export function postCategoryLink(post: BlogPost) {
  const prefix = postCategoryPrefix(post);
  if (!prefix) return null;
  return BLOG_CATEGORIES.find((c) => c.prefix === prefix) ?? null;
}

export function postDisplayDate(post: BlogPost): Date {
  return blogDate(post);
}

export function formatBlogDate(date: Date): string {
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function hubBasePath(categoryPrefix?: BlogCategoryPrefix): string {
  if (!categoryPrefix) return '/blog';
  return BLOG_CATEGORIES.find((c) => c.prefix === categoryPrefix)?.href ?? '/blog';
}

export function hubPagePath(categoryPrefix: BlogCategoryPrefix | undefined, page: number): string {
  const base = hubBasePath(categoryPrefix);
  return page <= 1 ? base : `${base}/page/${page}`;
}

export async function getBlogHubStaticPaths(categoryPrefix?: BlogCategoryPrefix) {
  const posts = await postsForHub(categoryPrefix);
  const pageSize = categoryPrefix ? BLOG_CATEGORY_PAGE_SIZE : BLOG_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
  const paths = [];
  for (let page = 2; page <= totalPages; page++) {
    paths.push({ params: { page: String(page) } });
  }
  return paths;
}

export function toSearchEntry(post: BlogPost): BlogSearchEntry {
  const category = postCategoryLink(post);
  return {
    title: post.data.title,
    url: postUrl(post),
    kicker: post.data.kicker,
    excerpt: postExcerpt(post),
    heroImage: post.data.heroImage,
    heroImageAlt: post.data.heroImageAlt,
    pubDate: postDisplayDate(post)?.toISOString() ?? '',
    categoryTitle: category?.title,
    categoryHref: category?.href,
    author: post.data.author,
    tags: post.data.tags,
  };
}

export async function buildSearchIndex(): Promise<BlogSearchEntry[]> {
  const posts = await allPublishedPosts();
  return posts.map(toSearchEntry);
}