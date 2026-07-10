#!/usr/bin/env node
/**
 * Migrate SP Page Builder marketing pages from the site archiver into
 * src/data/pages/*.json for MarketingPage.astro.
 *
 * Usage:
 *   node scripts/migrate-archiver-pages.mjs --dry-run
 *   node scripts/migrate-archiver-pages.mjs --fresh
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { cleanRawHtmlPage, extractRawHtmlContent, stripEmbeddedForms, stripSppb } from './strip-sppb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ARCHIVER_DIR =
  process.env.ARCHIVER_DIR ??
  path.resolve(ROOT, '../../panoramic-site-archiver/screenshots-2026-07-01');

const OUTPUT_DIR = path.resolve(ROOT, 'src/data/pages');
const MANIFEST_PATH = path.join(ARCHIVER_DIR, 'manifest.json');
const SITE_ORIGIN = 'https://panoramicireland.com';

const BLOG_PREFIXES = [
  'photo-tours-blog',
  'blog-ireland-guide',
  'miscellaneous-blog-category',
  'photography-photoshop-post-processing',
];

/** Paths handled elsewhere or not wanted as full marketing pages. */
const SKIP_PATHS = new Set([
  '', // homepage — custom index.astro
  'darren-articles',
  'blog', // custom blog index
]);

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);

const dryRun = Boolean(args['dry-run']);
const fresh = Boolean(args.fresh);
const onlyPath = args.path ? String(args.path).replace(/^\//, '') : undefined;

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function isBlogPath(pathKey) {
  if (BLOG_PREFIXES.includes(pathKey)) return true;
  return BLOG_PREFIXES.some((p) => pathKey.startsWith(`${p}/`));
}

function pathToFileKey(legacyPath) {
  const key = legacyPath.replace(/^\//, '').replace(/\/$/, '');
  return key.replace(/\//g, '__') || 'home';
}

function cleanTitle(raw) {
  return decodeEntities(raw ?? '')
    .replace(/\s*[—–|-]\s*Panoramic Ireland\s*$/i, '')
    .replace(/\s*\|\s*520:.*$/i, '')
    .trim();
}

function metaDescription(html, fallback) {
  const desc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)?.[1];
  return decodeEntities(desc ?? fallback ?? '').trim();
}

function extractPageStyles(html) {
  const styles = [];
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (/section-id-|column-wrap-id-|sp-page-builder/.test(m[1])) {
      styles.push(m[1]);
    }
  }
  return styles;
}

function extractBuilderFragment(html) {
  const doc = parse(html, { comment: false });
  const builder = doc.querySelector('#sp-page-builder');
  if (!builder) return null;
  return `<div id="sp-page-builder">${builder.innerHTML}</div>`;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  if (fresh && !dryRun) {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  }
  if (!dryRun) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  }

  let written = 0;
  let skipped = 0;

  for (const page of manifest.pages) {
    const legacyPath = page.url.replace(SITE_ORIGIN, '').replace(/\/$/, '') || '/';
    const pathKey = legacyPath.replace(/^\//, '');

    if (onlyPath && pathKey !== onlyPath) continue;
    if (SKIP_PATHS.has(pathKey) || isBlogPath(pathKey)) continue;
    if (page.status === 404 || (page.html_bytes ?? 0) < 3000) {
      skipped++;
      continue;
    }
    if (!page.html_file) {
      skipped++;
      continue;
    }

    const htmlPath = path.join(ARCHIVER_DIR, page.html_file.replace(/\\/g, '/'));
    let html;
    try {
      html = await fs.readFile(htmlPath, 'utf8');
    } catch {
      skipped++;
      continue;
    }

    const fragment = extractBuilderFragment(html);
    if (!fragment) {
      skipped++;
      continue;
    }

    const pageStyles = extractPageStyles(html);
    const rawInner = extractRawHtmlContent(fragment);

    let record;
    if (rawInner) {
      const { html: rawHtml, css } = cleanRawHtmlPage(rawInner);
      if (!rawHtml.trim()) {
        skipped++;
        continue;
      }
      record = {
        legacyPath,
        title: cleanTitle(page.title) || pathKey.split('/').pop()?.replace(/-/g, ' ') || 'Page',
        description: metaDescription(html, page.description),
        html: rawHtml,
        css,
        layout: 'raw',
      };
    } else {
      const { html: bodyHtml, hadBuilder } = stripSppb(fragment, pageStyles);
      if (!hadBuilder || !bodyHtml.trim()) {
        skipped++;
        continue;
      }

      const title = cleanTitle(page.title) || pathKey.split('/').pop()?.replace(/-/g, ' ') || 'Page';
      const description = metaDescription(html, page.description);
      const stripForms = pathKey === 'contact';
      const finalHtml = stripForms ? stripEmbeddedForms(bodyHtml) : bodyHtml;

      record = {
        legacyPath,
        title,
        description,
        html: finalHtml,
        layout: 'marketing',
      };
    }

    const fileKey = pathToFileKey(legacyPath);
    const outPath = path.join(OUTPUT_DIR, `${fileKey}.json`);

    if (dryRun) {
      console.log(`[dry-run] ${legacyPath} → ${fileKey}.json (${record.layout}, ${record.html.length} chars)`);
    } else {
      await fs.writeFile(outPath, JSON.stringify(record, null, 2) + '\n', 'utf8');
      console.log(`wrote ${fileKey}.json`);
    }
    written++;
  }

  console.log(`\nDone: ${written} pages written, ${skipped} skipped${dryRun ? ' (dry run)' : ''}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
