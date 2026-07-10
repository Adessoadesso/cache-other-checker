import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const tours = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tours' }),
  schema: z.object({
    title: z.string(),
    region: z.string(),
    slug: z.string(),
    durationHours: z.number(),
    basePriceEur: z.number(),
    maxGuests: z.number().default(6),
    summary: z.string(),
    heroImage: z.string(),
    gallery: z.array(z.string()).default([]),
    highlights: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const galleryImage = z.object({
  src: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    // Small eyebrow label above the headline — carried over from the old
    // blog-wrap kicker/standfirst structure (e.g. "Dublin", "Field Notes").
    kicker: z.string().optional(),
    // The intro paragraph shown under the headline, before body copy.
    // Distinct from `description`, which is meta/social only and may
    // read a little differently for SEO purposes.
    standfirst: z.string().optional(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    heroImageCaption: z.string().optional(),
    gallery: z.array(galleryImage).default([]),
    tags: z.array(z.string()).default([]),
    region: z.string().optional(),
    author: z.string().default('Darren McLoughlin'),
    draft: z.boolean().default(false),
    // Exact live-site path, e.g. /photo-tours-blog/sunset-west-ireland-panoramic.
    // Required for published posts; articles are served at this URL (not /blog/{slug}).
    legacyPath: z.string().optional(),
    // Alternate historic URLs (index.php?option=…, bare alias) that should 301
    // to legacyPath. The canonical public URL is always legacyPath.
    redirectFrom: z.array(z.string()).default([]),
  }),
});

export const collections = { tours, blog };
