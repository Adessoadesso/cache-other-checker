import type { CollectionEntry } from 'astro:content';
import { EXPERIENCES_HUB_PATH } from './experiences-hub';
import { postCategoryLink } from './blog-hub';
import { BLOG_CATEGORIES, type BlogCategoryPrefix, type BlogPost } from './blog';

export type BreadcrumbItem = {
  name: string;
  /** Omit on the current page (and on section roots with no landing URL). */
  url?: string;
};

export const GUIDE_SECTION_CRUMB: BreadcrumbItem = {
  name: 'Guide to Ireland',
  // Hub added for BreadcrumbList / GSC (live had unlinked “Guide”; path was 403).
  url: '/guide-to-ireland',
};

export const EXPERIENCES_SECTION_CRUMB: BreadcrumbItem = {
  name: 'Photography Experiences',
  url: EXPERIENCES_HUB_PATH,
};

export function homeCrumb(): BreadcrumbItem {
  return { name: 'Home', url: '/' };
}

/** Slashless absolute URL for JSON-LD. */
export function absoluteUrl(path: string, site: URL | string): string {
  const normalized =
    path === '/' ? '/' : path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  return new URL(normalized, site).href;
}

/** BreadcrumbList JSON-LD — omit `item` on the last entry (live archiver parity). */
export function breadcrumbJsonLd(
  items: BreadcrumbItem[],
  site: URL | string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => {
      const entry: Record<string, unknown> = {
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
      };
      const isLast = index === items.length - 1;
      if (!isLast && item.url) {
        entry.item = absoluteUrl(item.url, site);
      }
      return entry;
    }),
  };
}

export function blogPostCrumbs(post: BlogPost | CollectionEntry<'blog'>): BreadcrumbItem[] {
  const category = postCategoryLink(post);
  const crumbs: BreadcrumbItem[] = [homeCrumb()];
  if (category) {
    crumbs.push({ name: category.title, url: category.href });
  }
  crumbs.push({ name: post.data.title });
  return crumbs;
}

export function blogHubCrumbs(categoryPrefix?: BlogCategoryPrefix): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [homeCrumb()];
  if (!categoryPrefix) {
    crumbs.push({ name: 'Journal' });
    return crumbs;
  }
  const cat = BLOG_CATEGORIES.find((c) => c.prefix === categoryPrefix);
  if (cat) {
    crumbs.push({ name: cat.title });
  }
  return crumbs;
}

export function navPageCrumbs(opts: {
  section: BreadcrumbItem;
  ancestors?: { title: string; href: string }[];
  title: string;
}): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [homeCrumb(), opts.section];
  for (const ancestor of opts.ancestors ?? []) {
    crumbs.push({ name: ancestor.title, url: ancestor.href });
  }
  crumbs.push({ name: opts.title });
  return crumbs;
}

/** Dedicated guide pages (pubs / coffee) outside the catch-all. */
export function guideLeafCrumbs(title: string): BreadcrumbItem[] {
  return navPageCrumbs({ section: GUIDE_SECTION_CRUMB, title });
}

export function experiencesLeafCrumbs(title: string, ancestors?: { title: string; href: string }[]): BreadcrumbItem[] {
  return navPageCrumbs({
    section: EXPERIENCES_SECTION_CRUMB,
    ancestors,
    title,
  });
}
