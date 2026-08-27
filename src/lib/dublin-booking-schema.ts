import { DUBLIN_BOOKING_PAGE_PATH } from './booking-urls';

const BOOKING_URL = `https://panoramicireland.com${DUBLIN_BOOKING_PAGE_PATH}`;

/** Structured data for the Dublin booking page — mirrors live site JSON-LD. */
export function getDublinBookingStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://panoramicireland.com/#organization',
        name: 'Panoramic Ireland',
        url: 'https://panoramicireland.com/',
        logo: 'https://panoramicireland.com/images/logo.png',
        telephone: '+353862461890',
        founder: {
          '@type': 'Person',
          name: 'Darren McLoughlin',
          jobTitle: 'Professional Travel Photographer',
          url: 'https://panoramicireland.com/about',
        },
      },
      {
        '@type': ['LocalBusiness', 'TravelAgency'],
        '@id': 'https://panoramicireland.com/#dublin-photo-tours',
        name: 'Dublin Photo Tours by Panoramic Ireland',
        url: BOOKING_URL,
        telephone: '+353862461890',
        priceRange: '€€€',
        areaServed: { '@type': 'City', name: 'Dublin' },
      },
      {
        '@type': 'TouristTrip',
        '@id': `${BOOKING_URL}#trip`,
        name: 'Private Dublin Photography Tour',
        description:
          "A private 4.5-hour guided photography tour of Dublin City with Irish professional travel photographer Darren McLoughlin.",
        url: BOOKING_URL,
        touristType: ['Photography enthusiasts', 'Couples', 'Families', 'Small groups'],
        offers: {
          '@type': 'Offer',
          priceCurrency: 'EUR',
          price: 500,
          url: BOOKING_URL,
          availability: 'https://schema.org/InStock',
          validFrom: '2026-01-01T00:00:00+00:00',
          validThrough: '2026-12-31T23:59:59+00:00',
        },
      },
    ],
  };
}
