#!/usr/bin/env node
/**
 * Migrate blog articles from the site archiver (rendered HTML + manifest.json)
 * into src/content/blog/*.md with exact live legacyPath URLs.
 *
 * Usage:
 *   node scripts/migrate-archiver-blog.mjs --dry-run
 *   node scripts/migrate-archiver-blog.mjs --fresh
 *   node scripts/migrate-archiver-blog.mjs --limit=10
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ARCHIVER_DIR =
  process.env.ARCHIVER_DIR ??
  path.resolve(ROOT, '../../panoramic-site-archiver/screenshots-2026-07-01');

const OUTPUT_DIR = path.resolve(ROOT, 'src/content/blog');
const MANIFEST_PATH = path.join(ARCHIVER_DIR, 'manifest.json');
const SITE_ORIGIN = 'https://panoramicireland.com';

const BLOG_PREFIXES = new Set([
  'photo-tours-blog',
  'blog-ireland-guide',
  'miscellaneous-blog-category',
  'photography-photoshop-post-processing',
]);

const KICKER_BY_PREFIX = {
  'photo-tours-blog': 'Photo Tours',
  'blog-ireland-guide': 'Guide',
  'miscellaneous-blog-category': 'Miscellaneous',
  'photography-photoshop-post-processing': 'Photography & Post-processing',
};

/** Markdown files to keep when using --fresh (not in archiver). */
const MANUAL_KEEP = new Set(['saint-audoens-arch.md']);

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);

const dryRun = Boolean(args['dry-run']);
const fresh = Boolean(args.fresh);
const limit = args.limit ? Number(args.limit) : undefined;
const slugFilter = typeof args.slug === 'string' ? args.slug : undefined;

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
turndown.use(gfm);
turndown.addRule('drop-empty-wrappers', {
  filter: (node) =>
    ['div', 'span'].includes(node.nodeName.toLowerCase()) && !node.textContent?.trim() && !node.querySelector('img'),
  replacement: () => '',
});

function stripHtml(html) {
  return (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function cleanAssetUrl(raw) {
  if (!raw) return null;
  let u = decodeEntities(raw.trim()).replace(/#joomlaImage:[^"'\s]*/gi, '');
  if (u.startsWith('//')) u = `https:${u}`;
  if (u.startsWith('/')) u = `${SITE_ORIGIN}${u}`;
  return u;
}

function publicAssetPath(url) {
  if (!url) return undefined;
  if (url.startsWith(SITE_ORIGIN)) return url.slice(SITE_ORIGIN.length);
  return url;
}

function pathnameFromUrl(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return null;
  }
}

function findMatchingDivEnd(html, divStart) {
  let depth = 0;
  let i = divStart;
  while (i < html.length) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      i = nextClose + 6;
    }
  }
  return -1;
}

function extractArticleBody(html) {
  const marker = html.search(/class="com-content-article__body"/i);
  if (marker === -1) return '';
  const divStart = html.lastIndexOf('<div', marker);
  const contentStart = html.indexOf('>', divStart) + 1;
  const contentEnd = findMatchingDivEnd(html, divStart);
  if (contentEnd === -1) return '';
  return html.slice(contentStart, contentEnd).trim();
}

function extractSigplusGallery(bodyHtml, fallbackTitle) {
  const gallery = [];
  for (const m of bodyHtml.matchAll(/class="sigplus-image"\s+href="([^"]+)"(?:[^>]*title="([^"]*)")?/gi)) {
    const src = publicAssetPath(cleanAssetUrl(m[1]));
    if (!src) continue;
    gallery.push({
      src,
      alt: stripHtml(m[2] || '') || fallbackTitle,
    });
  }
  return gallery;
}

/** Replace sigplus carousel markup with inline figures; keep trailing body copy. */
function replaceSigplusGallery(bodyHtml, gallery) {
  const sigMarker = bodyHtml.search(/<div id="sigplus/i);
  if (sigMarker === -1) return bodyHtml;
  const divStart = bodyHtml.lastIndexOf('<div', sigMarker);
  const divEnd = findMatchingDivEnd(bodyHtml, divStart);
  if (divEnd === -1) return bodyHtml.replace(/<div id="sigplus[\s\S]*$/i, '').trim();

  const inlineImages =
    gallery.length > 0
      ? gallery
          .map(
            (img) =>
              `<figure><img src="${img.src}" alt="${(img.alt || '').replace(/"/g, '&quot;')}" loading="lazy" /></figure>`,
          )
          .join('\n')
      : '';

  return `${bodyHtml.slice(0, divStart)}${inlineImages}${bodyHtml.slice(divEnd + 6)}`.trim();
}

function stripJoomlaModules(bodyHtml) {
  return bodyHtml
    .replace(/<!-- START: Modules Anywhere -->[\s\S]*?<!-- END: Modules Anywhere -->/gi, '')
    .replace(/<p>\s*\{\s*<!--[\s\S]*?-->\s*\}\s*<\/p>/gi, '')
    .replace(/<p>\s*&nbsp;\s*<\/p>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '');
}

function cleanBodyMarkdown(md) {
  return md
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\{\}\s*$/gm, '')
    .replace(/^#{1,6}\s*$/gm, '')
    .replaceAll(SITE_ORIGIN, '')
    .trim();
}

function firstMatch(html, re) {
  const m = re.exec(html);
  return m ? m[1].trim() : '';
}

function parseArticle(html, manifestMeta) {
  const headline = decodeEntities(
    firstMatch(html, /<h1[^>]*itemprop="headline"[^>]*>([\s\S]*?)<\/h1>/i) ||
      manifestMeta.title ||
      '',
  );
  const title = stripHtml(headline) || manifestMeta.title || 'Untitled';

  let description = decodeEntities(firstMatch(html, /<meta\s+name="description"\s+content="([^"]*)"/i));
  description = stripHtml(description) || manifestMeta.description || '';
  description = description.slice(0, 300);

  const created =
    firstMatch(html, /<time[^>]*itemprop="dateCreated"[^>]*datetime="([^"]+)"/i) ||
    firstMatch(html, /<meta\s+property="article:published_time"\s+content="([^"]+)"/i);
  const modified =
    firstMatch(html, /<time[^>]*itemprop="dateModified"[^>]*datetime="([^"]+)"/i) ||
    firstMatch(html, /<meta\s+property="article:modified_time"\s+content="([^"]+)"/i);

  const categoryLabel = decodeEntities(
    stripHtml(firstMatch(html, /<dd class="category-name"[\s\S]*?itemprop="genre"[^>]*>([\s\S]*?)<\/a>/i)),
  );

  const tagSection = html.match(/<div class="tags[\s\S]*?<\/div>/i)?.[0] ?? '';
  const tags = [...tagSection.matchAll(/rel="tag"[^>]*>([^<]+)</gi)]
    .map((m) => decodeEntities(stripHtml(m[1])))
    .filter(Boolean);

  // Hero image (full-width intro image above body)
  let heroImage;
  let heroImageAlt;
  const heroBlock = html.match(/class="item-image full-image"[\s\S]*?<\/div>\s*<div class="entry-header/is);
  if (heroBlock) {
    const imgM = heroBlock[0].match(/<img[^>]+src="([^"]+)"[^>]*>/i);
    if (imgM) {
      heroImage = cleanAssetUrl(imgM[1]);
      const altM = imgM[0].match(/alt="([^"]*)"/i);
      heroImageAlt = altM ? decodeEntities(altM[1]) : '';
      const capM = heroBlock[0].match(/class="img_caption"[^>]*>([\s\S]*?)<\//i);
      if (capM && !heroImageAlt) heroImageAlt = stripHtml(capM[1]);
    }
  }

  let bodyHtml = extractArticleBody(html);
  const gallery = extractSigplusGallery(bodyHtml, title);
  bodyHtml = replaceSigplusGallery(bodyHtml, gallery);
  const galleryInlined = gallery.length > 0;
  bodyHtml = stripJoomlaModules(bodyHtml);
  bodyHtml = bodyHtml.replace(/\sclass="[^"]*"/gi, '').replace(/\sstyle="[^"]*"/gi, '');

  // Joomla body h1 is a lead line, not the page title — demote for markdown
  bodyHtml = bodyHtml.replace(/<h1([^>]*)>/gi, '<h2$1>').replace(/<\/h1>/gi, '</h2>');

  // Drop leading duplicate h2 if it mirrors the page title
  bodyHtml = bodyHtml.replace(/^\s*<h2[^>]*>[\s\S]*?<\/h2>\s*/i, (h2) => {
    return stripHtml(h2).toLowerCase() === title.toLowerCase() ? '' : h2;
  });

  // Normalise image src (keep live URLs until local mirror)
  bodyHtml = bodyHtml.replace(/(<img[^>]+src=")([^"]+)(")/gi, (_m, pre, src, post) => {
    const cleaned = cleanAssetUrl(src);
    return cleaned ? `${pre}${cleaned}${post}` : _m;
  });

  bodyHtml = bodyHtml.replace(/(<img[^>]+srcset=")([^"]+)(")/gi, (_m, pre, srcset, post) => {
    const cleaned = srcset
      .split(',')
      .map((part) => {
        const bits = part.trim().split(/\s+/);
        bits[0] = cleanAssetUrl(bits[0]) ?? bits[0];
        return bits.join(' ');
      })
      .join(', ');
    return `${pre}${cleaned}${post}`;
  });

  let standfirst = '';
  const firstP = bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (firstP) {
    standfirst = stripHtml(firstP[1]).slice(0, 320);
    if (standfirst.length < 40) standfirst = '';
  }
  if (!standfirst) {
    const firstH = bodyHtml.match(/<h[2-3][^>]*>([\s\S]*?)<\/h[2-3]>/i);
    if (firstH) {
      standfirst = stripHtml(firstH[1]).slice(0, 320);
      if (standfirst.length < 40) standfirst = '';
    }
  }

  let bodyMarkdown = cleanBodyMarkdown(turndown.turndown(bodyHtml).trim());

  const pubDate = (created || manifestMeta.captured_at || '').slice(0, 10);
  const updatedDate =
    modified && created && modified.slice(0, 10) !== created.slice(0, 10) ? modified.slice(0, 10) : undefined;

  return {
    title,
    description: description || standfirst.slice(0, 155) || title,
    pubDate,
    updatedDate,
    kicker: categoryLabel || undefined,
    standfirst: standfirst || undefined,
    heroImage,
    heroImageAlt: heroImageAlt || title,
    tags,
    bodyMarkdown,
    gallery: galleryInlined ? [] : gallery,
  };
}

function mdFilename(prefix, slug) {
  return `${prefix}__${slug}.md`;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf-8'));
  let pages = manifest.pages.filter((p) => p.ok && p.html_file);

  pages = pages.filter((p) => {
    const pathname = pathnameFromUrl(p.url);
    if (!pathname || pathname === '/') return false;
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return false;
    return BLOG_PREFIXES.has(parts[0]);
  });

  pages.sort((a, b) => a.url.localeCompare(b.url));
  if (limit) pages = pages.slice(0, limit);

  console.log(`Archiver: ${ARCHIVER_DIR}`);
  console.log(`Found ${pages.length} blog article(s) to migrate${dryRun ? ' (dry run)' : ''}\n`);

  if (fresh && !dryRun) {
    const existing = await fs.readdir(OUTPUT_DIR).catch(() => []);
    for (const f of existing) {
      if (!f.endsWith('.md')) continue;
      if (MANUAL_KEEP.has(f)) continue;
      await fs.unlink(path.join(OUTPUT_DIR, f));
    }
    console.log(`Cleared ${OUTPUT_DIR} (kept: ${[...MANUAL_KEEP].join(', ')})\n`);
  }

  let ok = 0;
  let skipped = 0;
  const errors = [];

  for (const page of pages) {
    const legacyPath = pathnameFromUrl(page.url);
    const [prefix, slug] = legacyPath.split('/').filter(Boolean);
    if (slugFilter && slug !== slugFilter) continue;
    const htmlPath = path.join(ARCHIVER_DIR, page.html_file.replace(/\\/g, path.sep));
    const outFile = mdFilename(prefix, slug);

    try {
      const outPath = path.join(OUTPUT_DIR, outFile);
      if (!fresh && !args.force) {
        try {
          await fs.access(outPath);
          continue;
        } catch {
          /* not yet migrated */
        }
      }

      const html = await fs.readFile(htmlPath, 'utf-8');
      const parsed = parseArticle(html, page);

      if (!parsed.pubDate) {
        throw new Error('missing pubDate');
      }
      if (!parsed.bodyMarkdown && !parsed.standfirst && parsed.gallery.length === 0) {
        throw new Error('empty body');
      }

      const frontmatter = {
        title: parsed.title,
        kicker: parsed.kicker || KICKER_BY_PREFIX[prefix],
        ...(parsed.standfirst && { standfirst: parsed.standfirst }),
        description: parsed.description,
        pubDate: parsed.pubDate,
        ...(parsed.updatedDate && { updatedDate: parsed.updatedDate }),
        ...(parsed.heroImage && {
          heroImage: publicAssetPath(parsed.heroImage),
          heroImageAlt: parsed.heroImageAlt,
        }),
        gallery: parsed.gallery,
        tags: parsed.tags,
        author: 'Darren McLoughlin',
        draft: false,
        legacyPath,
        redirectFrom: [],
      };

      const fileContents = `---\n${yaml.dump(frontmatter, { lineWidth: 100, quotingType: '"', forceQuotes: false })}---\n\n${parsed.bodyMarkdown}\n`;

      if (dryRun) {
        console.log(`→ ${legacyPath}`);
        console.log(`  would write ${outFile} (${parsed.bodyMarkdown.length} chars body)\n`);
      } else {
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        await fs.writeFile(path.join(OUTPUT_DIR, outFile), fileContents, 'utf-8');
        if (ok < 3 || ok % 100 === 0) console.log(`  wrote ${outFile}`);
      }
      ok += 1;
    } catch (err) {
      skipped += 1;
      errors.push({ legacyPath, error: err.message });
      console.warn(`  ! skip ${legacyPath}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${ok} migrated, ${skipped} skipped${dryRun ? ' (dry run)' : ''}.`);
  if (errors.length && errors.length <= 10) {
    for (const e of errors) console.log(`  - ${e.legacyPath}: ${e.error}`);
  } else if (errors.length) {
    console.log(`  (${errors.length} errors — first 5 shown)`);
    errors.slice(0, 5).forEach((e) => console.log(`  - ${e.legacyPath}: ${e.error}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
