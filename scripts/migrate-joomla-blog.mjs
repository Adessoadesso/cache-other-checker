#!/usr/bin/env node
/**
 * Migrate blog articles from the (restored, clean) Joomla `#__content` table
 * into Astro content-collection markdown files matching the schema in
 * `src/content.config.ts`.
 *
 * WHAT THIS ASSUMES
 * ------------------
 * Standard Joomla 5 `#__content` / `#__categories` / `#__tags` /
 * `#__contentitem_tag_map` tables. If your blog articles use Joomla Custom
 * Fields (com_fields) to store a kicker/standfirst rather than encoding them
 * in `introtext`, see `--fields-kicker` / `--fields-standfirst` below.
 *
 * WHAT THIS DOES NOT DO
 * ----------------------
 * - Does not run images through the mozjpeg/TrustMark/C2PA pipeline. It
 *   downloads originals into `content-assets/blog/<slug>/` and writes
 *   frontmatter/body image paths pointing at where the *processed* output
 *   should end up (`/images/blog/<slug>/...`). Run the existing image
 *   pipeline against `content-assets/blog/` afterwards, outputting into
 *   `public/images/blog/`.
 * - Does not guess your old SEF (search-engine-friendly) URLs. It writes
 *   both the raw `index.php?option=com_content...` form and the bare alias
 *   as `redirectFrom` candidates. Cross-check the real historic paths
 *   against the Google Search Console URL export before finalising the
 *   redirect map — GSC is the authoritative list of what's actually indexed.
 *
 * USAGE
 * -----
 *   cp .env.migration.example .env.migration   # fill in DB creds
 *   node scripts/migrate-joomla-blog.mjs --category=12,15 --dry-run
 *   node scripts/migrate-joomla-blog.mjs --category=12,15
 *
 * FLAGS
 * -----
 *   --category=<id,id,...>   Required. Joomla catid(s) that hold blog articles
 *                            (not tour pages — those likely live in different
 *                            categories and probably want a separate script
 *                            targeting the `tours` collection instead).
 *   --limit=<n>               Only process the first n articles (testing).
 *   --dry-run                 Print what would be written; write nothing.
 *   --fields-kicker=<name>    Custom field name to use for `kicker`, if set.
 *   --fields-standfirst=<name> Custom field name to use for `standfirst`, if set.
 *   --author=<name>            Default author (defaults to "Darren McLoughlin").
 */

import mysql from 'mysql2/promise';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import yaml from 'js-yaml';
import slugify from 'slugify';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  })
);

if (!args.category) {
  console.error('Missing required --category=<id,id,...>. See the file header for usage.');
  process.exit(1);
}

const categoryIds = String(args.category).split(',').map((s) => s.trim());
const dryRun = Boolean(args['dry-run']);
const limit = args.limit ? Number(args.limit) : undefined;
const defaultAuthor = args.author ?? 'Darren McLoughlin';
const kickerFieldName = args['fields-kicker'];
const standfirstFieldName = args['fields-standfirst'];

// ---------------------------------------------------------------------------
// Config — reads DB creds from env, not from committed files
// ---------------------------------------------------------------------------

const DB_CONFIG = {
  host: process.env.JOOMLA_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.JOOMLA_DB_PORT ?? 3306),
  user: process.env.JOOMLA_DB_USER,
  password: process.env.JOOMLA_DB_PASSWORD,
  database: process.env.JOOMLA_DB_NAME,
};

const TABLE_PREFIX = process.env.JOOMLA_TABLE_PREFIX ?? 'jos_';
const JOOMLA_SITE_ORIGIN = process.env.JOOMLA_SITE_ORIGIN ?? 'https://panoramicireland.com';

// Joomla category id → live SEF prefix (hidden menu categories).
const CATEGORY_PREFIX_BY_CATID = {
  8: 'photo-tours-blog',
  9: 'blog-ireland-guide',
  10: 'miscellaneous-blog-category',
  11: 'photography-photoshop-post-processing',
};
const REGION_BY_CATEGORY_TITLE = {
  Connemara: 'Connemara & Mayo',
  Mayo: 'Connemara & Mayo',
  'Causeway Coast': 'Causeway Coast',
  Antrim: 'Causeway Coast',
  Dublin: 'Dublin & the Pale',
};

const OUTPUT_DIR = path.resolve('src/content/blog');
const ASSET_STAGING_DIR = path.resolve('content-assets/blog');
const REDIRECT_MAP_PATH = path.resolve('content-assets/blog-redirect-map.json');

// ---------------------------------------------------------------------------
// HTML → Markdown
// ---------------------------------------------------------------------------

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});
turndown.use(gfm);

// SP Page Builder (and similar builders) tend to leave empty wrapper divs
// and spans with builder-only classes. Strip elements that carry no visible
// text so they don't turn into stray blank lines in the markdown output.
turndown.addRule('drop-empty-builder-wrappers', {
  filter: (node) =>
    ['div', 'span'].includes(node.nodeName.toLowerCase()) && !node.textContent?.trim() && !node.querySelector('img'),
  replacement: () => '',
});

function htmlToMarkdown(html) {
  if (!html) return '';
  return turndown.turndown(html).trim();
}

function stripHtml(html) {
  return (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function firstParagraphText(html) {
  const match = (html ?? '').match(/<p[^>]*>(.*?)<\/p>/is);
  return match ? stripHtml(match[1]) : stripHtml(html).slice(0, 220);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function resolveImageUrl(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  return new URL(src, JOOMLA_SITE_ORIGIN).toString();
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, buf);
}

/**
 * Downloads an image into the staging area and returns the FINAL public
 * path it should have once it's run through the existing mozjpeg/TrustMark
 * pipeline — i.e. what you write into frontmatter now, not the staging path.
 */
async function stageImage(slug, originalSrc, indexHint) {
  const resolved = resolveImageUrl(originalSrc);
  if (!resolved) return null;
  const ext = path.extname(new URL(resolved).pathname) || '.jpg';
  const filename = indexHint === 'hero' ? `hero${ext}` : `${String(indexHint).padStart(2, '0')}${ext}`;
  const stagingPath = path.join(ASSET_STAGING_DIR, slug, filename);
  try {
    await downloadImage(resolved, stagingPath);
  } catch (err) {
    console.warn(`  ! image download failed for ${resolved}: ${err.message}`);
    return null;
  }
  return `/images/blog/${slug}/${filename}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log(`Connected to ${DB_CONFIG.database}@${DB_CONFIG.host}`);

  const placeholders = categoryIds.map(() => '?').join(',');
  const [rows] = await conn.query(
    `SELECT c.id, c.title, c.alias, c.introtext, c.fulltext, c.images, c.metadesc,
            c.created, c.modified, c.catid, cat.title AS category_title
     FROM ${TABLE_PREFIX}content c
     JOIN ${TABLE_PREFIX}categories cat ON cat.id = c.catid
     WHERE c.catid IN (${placeholders}) AND c.state = 1
     ORDER BY c.created DESC
     ${limit ? 'LIMIT ' + Number(limit) : ''}`,
    categoryIds
  );

  console.log(`Found ${rows.length} published article(s) in category ${categoryIds.join(', ')}\n`);

  // Custom fields (only queried if the site actually stores kicker/standfirst
  // that way — see the header comment).
  let fieldValuesByArticle = new Map();
  if (kickerFieldName || standfirstFieldName) {
    const [fieldRows] = await conn.query(
      `SELECT fv.item_id, f.name, fv.value
       FROM ${TABLE_PREFIX}fields_values fv
       JOIN ${TABLE_PREFIX}fields f ON f.id = fv.field_id
       WHERE f.name IN (?)`,
      [[kickerFieldName, standfirstFieldName].filter(Boolean)]
    );
    for (const row of fieldRows) {
      const map = fieldValuesByArticle.get(row.item_id) ?? {};
      map[row.name] = row.value;
      fieldValuesByArticle.set(row.item_id, map);
    }
  }

  const redirectMap = [];
  let migrated = 0;

  for (const row of rows) {
    const slug = slugify(row.alias || row.title, { lower: true, strict: true });
    console.log(`→ ${row.title}  (id ${row.id})  →  ${slug}`);

    // Tags
    const [tagRows] = await conn.query(
      `SELECT t.title FROM ${TABLE_PREFIX}contentitem_tag_map m
       JOIN ${TABLE_PREFIX}tags t ON t.tag_id = m.tag_id
       WHERE m.content_item_id = ? AND m.type_alias = 'com_content.article'`,
      [row.id]
    );
    const tags = tagRows.map((t) => t.title);

    // Images metadata (Joomla stores this as a JSON string)
    let imagesMeta = {};
    try {
      imagesMeta = row.images ? JSON.parse(row.images) : {};
    } catch {
      imagesMeta = {};
    }

    const bodyHtml = row.fulltext?.trim() ? row.fulltext : row.introtext;
    const customFields = fieldValuesByArticle.get(row.id) ?? {};

    const kicker = customFields[kickerFieldName] || row.category_title;
    const standfirst = customFields[standfirstFieldName] || firstParagraphText(row.introtext);
    const description = stripHtml(row.metadesc) || firstParagraphText(row.introtext).slice(0, 155);
    const region = REGION_BY_CATEGORY_TITLE[row.category_title];

    let heroImage;
    let heroImageAlt;
    const heroSrc = imagesMeta.image_intro || imagesMeta.image_fulltext;
    if (heroSrc && !dryRun) {
      heroImage = await stageImage(slug, heroSrc, 'hero');
      heroImageAlt = imagesMeta.image_intro_alt || imagesMeta.image_fulltext_alt || row.title;
    } else if (heroSrc) {
      heroImage = `/images/blog/${slug}/hero${path.extname(heroSrc) || '.jpg'}`;
      heroImageAlt = imagesMeta.image_intro_alt || imagesMeta.image_fulltext_alt || row.title;
    }

    let bodyMarkdown = htmlToMarkdown(bodyHtml);

    // Rewrite any remaining inline <img> references (from fulltext) to the
    // final expected public path and stage the originals alongside the hero.
    const inlineImages = [...bodyHtml.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
    let imgIndex = 1;
    for (const src of inlineImages) {
      if (src === heroSrc) continue; // already staged as hero
      const finalPath = dryRun
        ? `/images/blog/${slug}/${String(imgIndex).padStart(2, '0')}${path.extname(src) || '.jpg'}`
        : await stageImage(slug, src, imgIndex);
      if (finalPath) {
        bodyMarkdown = bodyMarkdown.split(src).join(finalPath);
      }
      imgIndex += 1;
    }

    const categoryPrefix = CATEGORY_PREFIX_BY_CATID[row.catid];
    if (!categoryPrefix) {
      console.warn(`  ! skipping id ${row.id}: unknown catid ${row.catid}`);
      continue;
    }
    const legacyPath = `/${categoryPrefix}/${row.alias}`;

    const frontmatter = {
      title: row.title,
      kicker,
      standfirst,
      description,
      pubDate: row.created.toISOString().slice(0, 10),
      ...(row.modified &&
        row.modified.getTime() !== row.created.getTime() && {
          updatedDate: row.modified.toISOString().slice(0, 10),
        }),
      ...(heroImage && { heroImage, heroImageAlt }),
      gallery: [],
      tags,
      ...(region && { region }),
      author: defaultAuthor,
      draft: false,
      legacyPath,
      redirectFrom: [
        `/${row.alias}`,
        `/index.php?option=com_content&view=article&id=${row.id}&catid=${row.catid}`,
      ],
    };

    const fileContents = `---\n${yaml.dump(frontmatter, { lineWidth: 100 })}---\n\n${bodyMarkdown}\n`;
    const outPath = path.join(OUTPUT_DIR, `${slug}.md`);

    if (dryRun) {
      console.log(`  (dry run) would write ${outPath}`);
      console.log(fileContents.split('\n').slice(0, 12).join('\n') + '\n  ...\n');
    } else {
      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(outPath, fileContents, 'utf-8');
      console.log(`  wrote ${outPath}`);
    }

    redirectMap.push({ from: frontmatter.redirectFrom, to: legacyPath });
    migrated += 1;
  }

  if (!dryRun) {
    await mkdir(path.dirname(REDIRECT_MAP_PATH), { recursive: true });
    await writeFile(REDIRECT_MAP_PATH, JSON.stringify(redirectMap, null, 2), 'utf-8');
    console.log(`\nWrote redirect map for ${redirectMap.length} article(s) → ${REDIRECT_MAP_PATH}`);
    console.log('Cross-check these against the real indexed URLs from Google Search Console before');
    console.log('feeding them into the existing redirect-mapping script — aliases here are a best guess,');
    console.log('not a guarantee of the exact historic SEF path.');
  }

  console.log(`\n${migrated} article(s) processed${dryRun ? ' (dry run — nothing written)' : ''}.`);
  console.log('Next: run the mozjpeg/TrustMark/C2PA pipeline against content-assets/blog/');
  console.log('to produce the final files in public/images/blog/, then eyeball each .md file —');
  console.log('turndown does a solid job on plain prose but SP Page Builder markup can leave');
  console.log('artifacts worth a manual pass.');

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
