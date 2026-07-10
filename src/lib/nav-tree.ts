import type { NavNode } from '../data/guide-menu';

export interface FlatNavEntry {
  title: string;
  fullPath: string; // e.g. 'guide-to-ireland/the-geography-of-ireland'
  slug: string; // fullPath with the section prefix stripped, e.g. 'the-geography-of-ireland'
  parent: { title: string; href: string } | null;
  children: { title: string; href: string }[];
}

/**
 * Flattens a NavNode tree (see src/data/guide-menu.ts / workshops-menu.ts)
 * into per-page entries, stripping `sectionPrefix` (e.g. 'guide-to-ireland')
 * off each path to get the slug Astro's [...slug] route needs.
 */
export function flattenNavTree(tree: NavNode[], sectionPrefix: string): FlatNavEntry[] {
  const out: FlatNavEntry[] = [];

  function walk(nodes: NavNode[], parent: { title: string; href: string } | null) {
    for (const node of nodes) {
      const slug = node.path.startsWith(sectionPrefix + '/')
        ? node.path.slice(sectionPrefix.length + 1)
        : node.path;
      const href = `/${node.path}`;
      const children = (node.children ?? []).map((c) => ({ title: c.title, href: `/${c.path}` }));

      out.push({ title: node.title, fullPath: node.path, slug, parent, children });

      if (node.children) {
        walk(node.children, { title: node.title, href });
      }
    }
  }

  walk(tree, null);
  return out;
}
