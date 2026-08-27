import { workshopsMenu } from '../data/workshops-menu';
import type { NavNode } from '../data/nav-node';

export const EXPERIENCES_HUB_PATH = '/photography-experiences-ireland';

export type DestinationLayout = 'feature' | 'standard' | 'offset' | 'compact';

export interface DestinationTileData {
  id: string;
  name: string;
  blurb: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
  layout: DestinationLayout;
  featured: boolean;
}

/**
 * Priority destinations (business order) with editorial layout roles.
 * Each href is an existing destination / booking page.
 */
const FEATURED: DestinationTileData[] = [
  {
    id: 'dublin',
    name: 'Dublin',
    blurb: 'Historic streets, Georgian architecture and Dublin Bay.',
    // Booking/masterclass page — distinct from the /dublin marketing page.
    href: '/photography-workshops-ireland/book-a-photo-tour-in-dublin',
    imageSrc: '/images/2016/03/15/panoramic-ireland-dublin-3513.jpg',
    imageAlt: 'Samuel Beckett Bridge and the Dublin skyline at dusk',
    layout: 'feature',
    featured: true,
  },
  {
    id: 'wicklow',
    name: 'Wicklow',
    blurb: 'Mountains, lakes and Glendalough — a quiet hour from the city.',
    href: '/photography-workshops-ireland/book-a-wicklow-ireland-photo-tour',
    imageSrc:
      '/images/blogWM/2022/November-2022/panoramic-ireland-C2A1786-wicklow-mountains-green-landscape-using-polariser-full.jpg',
    imageAlt: 'Green mountain landscape in the Wicklow Mountains',
    layout: 'standard',
    featured: true,
  },
  {
    id: 'dingle',
    name: 'Dingle',
    blurb: 'Atlantic light, wild headlands and the western edge of Ireland.',
    href: '/photography-workshops-ireland/book-a-dingle-ireland-photo-tour',
    imageSrc: '/images/dingle-peninsula-kerry-ireland-0149.jpg',
    imageAlt: 'Dramatic coastline on the Dingle Peninsula, County Kerry',
    layout: 'standard',
    featured: true,
  },
  {
    id: 'causeway',
    name: 'Causeway Coast',
    blurb: 'Basalt columns, storm light and the Antrim shoreline.',
    href: '/photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours/book-a-photo-tour-in-northern-ireland-causeway-coast',
    imageSrc:
      '/images/blogWM/2024/August-2024/x_C2A9099_DxO-HDR-panoramic-ireland-giants-causeway-antrim-coast.jpg',
    imageAlt: "Basalt columns of the Giant's Causeway on the Antrim coast",
    layout: 'feature',
    featured: true,
  },
  {
    id: 'galway',
    name: 'Galway',
    blurb: 'Bay light, harbour walks and the character of the west.',
    href: '/photography-workshops-ireland/book-a-galway-city-ireland-photography-workshop',
    imageSrc: '/images/2016/03/15/panoramic-ireland-galway-4601.jpg',
    imageAlt: 'Galway Bay and the west of Ireland coastline',
    layout: 'standard',
    featured: true,
  },
  {
    id: 'cork',
    name: 'Cork',
    blurb: 'River quays, harbour towns and the colour of the south.',
    href: '/photography-workshops-ireland/book-a-cork-ireland-photo-tour',
    imageSrc:
      '/images/review2022/colourful-cobh-cork-deck-cards-houses-saint-colmans-cathedral-panoramic-ireland-C2A7982.jpg',
    imageAlt: "Colourful harbour houses and St Colman's Cathedral in Cobh, Cork",
    layout: 'standard',
    featured: true,
  },
  {
    id: 'belfast',
    name: 'Belfast',
    blurb: 'City streets, dockland views and Northern Ireland\u2019s urban edge.',
    href: '/photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours/book-a-photo-tour-in-northern-ireland-belfast',
    imageSrc:
      '/images/gallery-belfast-photography-workshop/panoramic-ireland-city-hall-belfast-MG_5308.jpg',
    imageAlt: 'Belfast City Hall',
    layout: 'offset',
    featured: true,
  },
  {
    id: 'mayo',
    name: 'County Mayo',
    blurb: 'Clew Bay, Croagh Patrick and Atlantic weather systems.',
    href: '/photography-workshops-ireland/county-mayo',
    imageSrc:
      '/images/blogWM/2024/February-2024/x_MG_5683-view-over-clew-bay-from-croagh-patrick-mayo-panoramic-ireland.jpg',
    imageAlt: 'View over Clew Bay from Croagh Patrick, County Mayo',
    layout: 'feature',
    featured: true,
  },
];

/** Manual images / blurbs for destinations not in the featured set. */
const SECONDARY_OVERRIDES: Record<
  string,
  Partial<Pick<DestinationTileData, 'name' | 'blurb' | 'imageSrc' | 'imageAlt'>>
> = {
  '/photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours/book-a-photo-tour-in-northern-ireland-armagh':
    {
      name: 'Armagh',
      blurb: 'Quiet lanes, orchard country and South Armagh’s hills.',
      imageSrc:
        '/images/blogWM/2023/September-2023/Slieve-Gullion-Panorama-02-panoramic-ireland-landscape-armagh.jpg',
      imageAlt: 'Panoramic landscape near Slieve Gullion, County Armagh',
    },
  '/photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours/book-a-county-down-northern-ireland-photo-tour':
    {
      name: 'County Down',
      blurb: 'The Mournes, lighthouses and a coast that turns toward the sea.',
      imageSrc:
        '/images/blogWM/2026/March-2026/saint-johns-point-lighthouse-county-down-C2A9267-HDR-Pano-panoramic-ireland-1200.jpg',
      imageAlt: "Saint John's Point lighthouse, County Down",
    },
  '/photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours/book-a-derry-city-photography-tour':
    {
      name: 'Derry',
      blurb: 'City walls, riverside views and Atlantic-facing architecture.',
      imageSrc:
        '/images/blogWM/2025/December-2025/x_C2A3318-mussenden-temple-derry-architecture-causeway-coast-panoramic-ireland-1200.jpg',
      imageAlt: 'Mussenden Temple on the cliffs near Derry',
    },
  '/photography-workshops-ireland/book-a-kilkenny-ireland-photo-tour': {
    name: 'Kilkenny',
    blurb: 'Medieval streets, castle stone and lantern-lit alleys.',
    imageSrc:
      '/images/blogWM/2025/August-2025/kilkenny-castle-panoramic-ireland-irish-travel-photography.jpg',
    imageAlt: 'Kilkenny Castle and grounds',
  },
  '/photography-workshops-ireland/coastal-photography-course/galway-connemara-coastal-workshop': {
    name: 'Connemara',
    blurb: 'Bog, mountain and Atlantic weather on the Galway coast.',
    imageSrc: '/images/2016/03/15/panoramic-ireland-connemara-7585-3.jpg',
    imageAlt: 'Rolling hills and mist over the Connemara landscape',
  },
  '/photography-workshops-ireland/coastal-photography-course/copper-coast-waterford-photography-workshop':
    {
      name: 'Copper Coast',
      blurb: 'Waterford’s volcanic shoreline and open Atlantic light.',
      imageSrc:
        '/images/aer-lingus-deals-to-ireland/winter-seascape-waterford-panoramic-ireland-_MG_6550-Edit-.jpg',
      imageAlt: 'Winter seascape along the Waterford coast',
    },
  '/photography-workshops-ireland/book-a-waterford-city-street-photography-session': {
    name: 'Waterford',
    blurb: 'Street colour, Viking quays and a compact historic centre.',
    imageSrc:
      '/images/review2022/waterford-walls-ireland-colour-street-art-panoramic-ireland-1740.jpg',
    imageAlt: 'Colourful street art on the Waterford Walls',
  },
  '/photography-workshops-ireland/photo-tours-photography-workshops-in-the-rest-of-ireland': {
    name: 'Rest of Ireland',
    blurb: 'Bespoke routes anywhere the light and the brief suggest.',
    imageSrc: '/images/2016/03/15/panoramic-ireland-coast--2.jpg',
    imageAlt: 'Atlantic coast at golden hour, Ireland',
  },
  '/photography-workshops-ireland/online-photography-class-tutorial-professional-photographer': {
    name: 'Online Class',
    blurb: 'One-to-one tuition wherever you are — craft, critique and workflow.',
    imageSrc: '/images/2016/03/10/panoramic-ireland-dublin-5521.jpg',
    imageAlt: 'Dublin architecture photographed for tuition and critique',
  },
};

const FEATURED_HREFS = new Set(FEATURED.map((tile) => tile.href));

function titleFromNode(node: NavNode): string {
  return node.title
    .replace(/^Book (a |an )/i, '')
    .replace(/\s+Photo(graphy)?\s+(Tour|Workshop).*$/i, '')
    .replace(/\s+Photography\s+(Tour|Workshop|Masterclass).*$/i, '')
    .replace(/\s+Tour$/i, '')
    .replace(/\s+Workshop$/i, '')
    .replace(/,\s*Ireland$/i, '')
    .trim();
}

function collectSecondaryLeaves(): DestinationTileData[] {
  const tiles: DestinationTileData[] = [];

  const pushLeaf = (node: NavNode & { path: string }) => {
    const href = `/${node.path}`;
    if (FEATURED_HREFS.has(href)) return;

    const override = SECONDARY_OVERRIDES[href];
    tiles.push({
      id: node.path.replace(/\//g, '--'),
      name: override?.name || titleFromNode(node),
      blurb:
        override?.blurb ||
        `A private photography experience with Panoramic Ireland in ${titleFromNode(node)}.`,
      href,
      imageSrc: override?.imageSrc || '/images/2016/03/15/panoramic-ireland-coast--2.jpg',
      imageAlt: override?.imageAlt || override?.name || titleFromNode(node),
      layout: 'compact',
      featured: false,
    });
  };

  for (const node of workshopsMenu) {
    const kids = (node.children ?? []).filter(
      (child): child is NavNode & { path: string } => Boolean(child.path),
    );

    if (kids.length > 0) {
      for (const child of kids) pushLeaf(child);
      continue;
    }

    if (node.path) pushLeaf(node as NavNode & { path: string });
  }

  return tiles;
}

export function listFeaturedDestinations(): DestinationTileData[] {
  return FEATURED;
}

export function listSecondaryDestinations(): DestinationTileData[] {
  return collectSecondaryLeaves();
}

export interface HubTileFigure {
  src: string;
  alt: string;
}

/** Hub mosaic image for a workshop/destination path, if one is defined. */
export function getHubTileFigure(href: string): HubTileFigure | null {
  const path = href.endsWith('/') && href !== '/' ? href.slice(0, -1) : href;

  const featured = FEATURED.find((tile) => tile.href === path);
  if (featured) {
    return { src: featured.imageSrc, alt: featured.imageAlt };
  }

  const secondary = SECONDARY_OVERRIDES[path];
  if (secondary?.imageSrc) {
    return {
      src: secondary.imageSrc,
      alt: secondary.imageAlt || secondary.name || 'Photography experience',
    };
  }

  return null;
}

/** @deprecated Prefer listFeaturedDestinations / listSecondaryDestinations */
export function listExperienceCards() {
  return [...FEATURED, ...collectSecondaryLeaves()].map((tile) => ({
    title: tile.name,
    href: tile.href,
    excerpt: tile.blurb,
    imageSrc: tile.imageSrc,
    imageAlt: tile.imageAlt,
    meta: null as string | null,
  }));
}
