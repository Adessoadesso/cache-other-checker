import type { NavNode } from './nav-node';

// Hand-maintained until `npm run export:menus` is run against the Joomla DB.
// Rules: only published menu items with real targets get `path`. Grouping
// headings (void links, category hubs) are title-only — see scripts/export-joomla-menus.mjs.
export const workshopsMenu: NavNode[] = [
  {
    "title": "Book a Private Dublin Photography Masterclass — Panoramic Ireland",
    "path": "photography-workshops-ireland/book-a-photo-tour-in-dublin"
  },
  {
    "title": "Northern Ireland",
    "path": "photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours",
    "children": [
      {
        "title": "Book a Belfast Tour",
        "path": "photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours/book-a-photo-tour-in-northern-ireland-belfast"
      },
      {
        "title": "Book a Causeway Coast Photography Workshop",
        "path": "photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours/book-a-photo-tour-in-northern-ireland-causeway-coast"
      },
      {
        "title": "Book an Armagh Tour",
        "path": "photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours/book-a-photo-tour-in-northern-ireland-armagh"
      },
      {
        "title": "Book a County Down Photography Tour",
        "path": "photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours/book-a-county-down-northern-ireland-photo-tour"
      },
      {
        "title": "Book a Derry City Photo Tour",
        "path": "photography-workshops-ireland/northern-ireland-photography-workshops-photo-tours/book-a-derry-city-photography-tour"
      }
    ]
  },
  {
    "title": "Book a Dingle, Ireland Photo Tour",
    "path": "photography-workshops-ireland/book-a-dingle-ireland-photo-tour"
  },
  {
    "title": "Book a Kilkenny, Ireland Photo Tour",
    "path": "photography-workshops-ireland/book-a-kilkenny-ireland-photo-tour"
  },
  {
    "title": "Book a Cork, Ireland Photo Tour",
    "path": "photography-workshops-ireland/book-a-cork-ireland-photo-tour"
  },
  {
    "title": "Coastal Landscape Photography Workshops",
    "path": "photography-workshops-ireland/coastal-photography-course",
    "children": [
      {
        "title": "Galway (Connemara) Coastal Workshop",
        "path": "photography-workshops-ireland/coastal-photography-course/galway-connemara-coastal-workshop"
      },
      {
        "title": "Copper Coast (Waterford) Photography Workshop",
        "path": "photography-workshops-ireland/coastal-photography-course/copper-coast-waterford-photography-workshop"
      }
    ]
  },
  {
    "title": "Rest of Ireland",
    "path": "photography-workshops-ireland/photo-tours-photography-workshops-in-the-rest-of-ireland"
  },
  {
    "title": "County Mayo",
    "path": "photography-workshops-ireland/county-mayo"
  },
  {
    "title": "Wicklow Photography Workshops",
    "path": "photography-workshops-ireland/book-a-wicklow-ireland-photo-tour"
  },
  {
    "title": "Online Photography Class",
    "path": "photography-workshops-ireland/online-photography-class-tutorial-professional-photographer"
  },
  {
    "title": "Waterford Street Photography",
    "path": "photography-workshops-ireland/book-a-waterford-city-street-photography-session"
  },
  {
    "title": "Book a Galway City Photography Workshop",
    "path": "photography-workshops-ireland/book-a-galway-city-ireland-photography-workshop"
  }
];
