---
title: Lord Ardilaun (Sir Arthur Edward Guinness) and Saint Stephen's Green, Dublin
kicker: Guide
description: >-
  Lord Ardilaun statue in Saint Stephen's Green, Dublin. Sir Arthur Edward Guinness bought the
  Dublin park for the public and now it is one of the finest city parks.
pubDate: "2020-02-29"
updatedDate: "2026-01-14"
heroImage: /media/k2/items/cache/78afaacbba3bca41a1ce9f675afbba4f_XL.jpg
heroImageAlt: Statue of Lord Ardilaun surrounded by crocus flowers in Dublin
gallery: []
tags:
  - dublin
  - ireland
  - statues of dublin
  - travel guide dublin
  - saint stephens green
author: Darren McLoughlin
draft: false
legacyPath: /blog-ireland-guide/lord-ardilaun-saint-stephens-green-dublin-ireland-statue-sir-arthur-guinness
redirectFrom: []
---

\`)) .addTo(statueMap); // Add a circle around the statue statueMap.addSource('statue-circle', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: \[-6.261414182202449, 53.33865916950854\] } } }); statueMap.addLayer({ id: 'statue-circle', type: 'circle', source: 'statue-circle', paint: { 'circle-radius': 60, 'circle-color': '#8B4513', 'circle-opacity': 0.2, 'circle-stroke-width': 3, 'circle-stroke-color': '#8B4513', 'circle-stroke-opacity': 0.8 } }); // Add a circle around the tour meeting point statueMap.addSource('tour-circle', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: \[-6.260513589501505, 53.339732149849944\] } } }); statueMap.addLayer({ id: 'tour-circle', type: 'circle', source: 'tour-circle', paint: { 'circle-radius': 50, 'circle-color': '#e74c3c', 'circle-opacity': 0.2, 'circle-stroke-width': 2, 'circle-stroke-color': '#e74c3c', 'circle-stroke-opacity': 0.8 } }); // Add a line connecting the two locations statueMap.addSource('connection-line', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: \[ \[-6.261414182202449, 53.33865916950854\], // Statue \[-6.260513589501505, 53.339732149849944\] // Tour meeting point \] } } }); statueMap.addLayer({ id: 'connection-line', type: 'line', source: 'connection-line', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#666', 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': \[2, 2\] } }); });
