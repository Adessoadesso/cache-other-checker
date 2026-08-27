export interface TourMapSpot {
  name: string;
  coordinates: [number, number];
  color: string;
  description: string;
}

export const dublinTourMapSpots: TourMapSpot[] = [
  {
    name: "Meeting Point — St Stephen's Green",
    coordinates: [-6.2614, 53.3387],
    color: '#e74c3c',
    description:
      "Tour starting point — one of Europe's largest enclosed parks, surrounded by Georgian architecture.",
  },
  {
    name: 'Trinity College Dublin',
    coordinates: [-6.2546, 53.3438],
    color: '#3498db',
    description:
      "Ireland's oldest university — centuries of architectural history in a single courtyard.",
  },
  {
    name: "Ha'penny Bridge",
    coordinates: [-6.2631, 53.3463],
    color: '#2ecc71',
    description:
      "Dublin's most iconic cast-iron bridge — spectacular at blue hour with the city lights reflected in the Liffey.",
  },
  {
    name: 'Dublin Castle',
    coordinates: [-6.2675, 53.3429],
    color: '#f39c12',
    description:
      'Historic Dublin Castle complex — courtyards, stone textures and changing light make this a strong stop on the route.',
  },
  {
    name: 'Temple Bar',
    coordinates: [-6.2642, 53.3455],
    color: '#9b59b6',
    description:
      "Dublin's cultural quarter — cobbled streets, colourful facades and the energy of the city's most photogenic neighbourhood.",
  },
  {
    name: 'The Custom House',
    coordinates: [-6.2539, 53.3484],
    color: '#1abc9c',
    description:
      "James Gandon's neoclassical masterpiece — its reflection in the Liffey on a still morning is extraordinary.",
  },
  {
    name: 'Famine Memorial',
    coordinates: [-6.25, 53.348],
    color: '#16a085',
    description:
      "One of Dublin's most moving public sculptures on Custom House Quay — haunting bronze figures at the river's edge.",
  },
  {
    name: 'River Liffey & Bridges',
    coordinates: [-6.2603, 53.3474],
    color: '#e67e22',
    description:
      "Dublin's defining waterway — the quays, bridges and reflections form the backbone of every photography tour.",
  },
];
