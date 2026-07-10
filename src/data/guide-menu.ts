export interface NavNode {
  title: string;
  path: string;
  children?: NavNode[];
}

// Sourced from the live panoramicireland.com Joomla menu export — do not
// rewrite titles or paths here; they're preserved 1:1 for SEO continuity.
// Each becomes a thin placeholder page at the SAME url until real content
// is migrated (see scripts/migrate-joomla-blog.mjs for the pattern this
// will eventually follow for these too).
export const guideMenu: NavNode[] = [
  {
    "title": "360 Panorama",
    "path": "guide-to-ireland/360-degree-panoramas-of-ireland",
    "children": [
      {
        "title": "Trinity College Panorama",
        "path": "guide-to-ireland/360-degree-panoramas-of-ireland/trinity-college-360-degree-panorama"
      }
    ]
  },
  {
    "title": "Geography",
    "path": "guide-to-ireland/the-geography-of-ireland",
    "children": [
      {
        "title": "Weather",
        "path": "guide-to-ireland/the-geography-of-ireland/irelands-weather-climate"
      }
    ]
  },
  {
    "title": "Images of the Year",
    "path": "guide-to-ireland/images-of-the-year",
    "children": [
      {
        "title": "Review of 2022 - Panoramic Ireland's Favourite Images - Best of the Year",
        "path": "guide-to-ireland/images-of-the-year/panoramic-ireland-images-review-2022"
      }
    ]
  },
  {
    "title": "Review 2014",
    "path": "guide-to-ireland/review-2014"
  },
  {
    "title": "Pubs of Ireland",
    "path": "guide-to-ireland/favourite-pubs-in-ireland"
  },
  {
    "title": "Guide to Ireland",
    "path": "guide-to-ireland/irish-travel-guide",
    "children": [
      {
        "title": "Kilkenny Guide",
        "path": "guide-to-ireland/irish-travel-guide/kilkenny"
      }
    ]
  },
  {
    "title": "Coffee",
    "path": "guide-to-ireland/my-favourite-coffee-shops-in-ireland"
  },
  {
    "title": "Getting to Ireland",
    "path": "guide-to-ireland/getting-to-ireland",
    "children": [
      {
        "title": "Getting to Ireland by Air",
        "path": "guide-to-ireland/getting-to-ireland/getting-to-ireland-by-air"
      },
      {
        "title": "Getting to Ireland by Sea",
        "path": "guide-to-ireland/getting-to-ireland/getting-to-ireland-by-sea"
      }
    ]
  }
];
