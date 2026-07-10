export interface MarketingPageData {
  legacyPath: string;
  title: string;
  description: string;
  html: string;
  /** `raw` = hand-authored HTML block with its own CSS (e.g. /about). */
  layout?: 'marketing' | 'raw';
  css?: string;
}

const modules = import.meta.glob<{ default: MarketingPageData }>('../data/pages/*.json', {
  eager: true,
});

const byPath = new Map<string, MarketingPageData>();

for (const mod of Object.values(modules)) {
  const data = 'default' in mod ? mod.default : (mod as unknown as MarketingPageData);
  byPath.set(normalizePath(data.legacyPath), data);
}

function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

export function getMarketingPage(legacyPath: string): MarketingPageData | undefined {
  return byPath.get(normalizePath(legacyPath));
}

export function allMarketingPaths(): string[] {
  return [...byPath.keys()];
}
