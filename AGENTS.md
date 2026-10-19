## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

### Go-live checklist (HTML + images)

`/images/*` and `/media/*` are served from **Cloudflare R2** (`panoramicireland-media`) via the Worker — **not** from cPanel. Uploading photos only in File Manager leaves live URLs as 404.

When shipping a post or page with **new** images:

1. Put files under `public/images/...` (and generate responsive variants if needed: `npm run generate:responsive-images`).
2. **Sync to R2** (scoped prefix preferred):
   ```
   node scripts/sync-media-to-r2.mjs --prefix=images/blogWM/2026/October-2026/Your-Folder
   ```
   Or full tree: `node scripts/sync-media-to-r2.mjs`
3. Build / publish HTML as usual (`npm run build`, then `.\publish.ps1` / `.\publish.ps1 -SkipBuild`).
4. Spot-check one image URL returns **200** (not plain-text CF 404).
5. Optional: `npm run warm:cache` for key URLs.

cPanel is still fine for **HTML** (`dist/`). New **media** always needs step 2.

### Joomla SIGE galleries (marketing pages)

Live site embeds galleries as `{gallery}FolderName,caption=0{/gallery}` shortcodes.
The archiver saves the image list in `public/images/{FolderName}/sige_turbo_html-en-GB.txt`.

**Do not read the filesystem at page-request time** (Cloudflare Workers has no `fs`).

After migrating pages or adding images, regenerate static manifests:

```
npm run sync:galleries
```

This reads each SIGE manifest, downloads any missing files from panoramicireland.com,
and writes `src/data/galleries/*.ts` plus `index.ts` for `MarketingGallery.astro`.

`npm run migrate:pages` and `npm run build` run this automatically.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
