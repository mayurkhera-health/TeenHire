import type { GeoPoint, Location } from './types';

/* Distance is a core product capability, not a display detail: it decides
   what a student is shown at all. In V1 it is computed client-side over the
   seeded set; the same call moves behind a PostGIS ST_DWithin query without
   the callers changing. */

const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

export function distanceMiles(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

export function formatDistance(miles: number): string {
  if (miles < 0.1) return 'Right here';
  if (miles < 10) return `${miles.toFixed(1)} miles`;
  return `${Math.round(miles)} miles`;
}

/* A small seeded gazetteer. A ZIP a student types that isn't here still
   works — it falls back to the centre of the covered area rather than
   dead-ending them on their second screen. */
const ZIP_TABLE: Record<string, Location> = {
  '95050': { city: 'Santa Clara', zip: '95050', lat: 37.3496, lng: -121.9585 },
  '95051': { city: 'Santa Clara', zip: '95051', lat: 37.3488, lng: -121.9836 },
  '95054': { city: 'Santa Clara', zip: '95054', lat: 37.3924, lng: -121.9623 },
  '95008': { city: 'Campbell', zip: '95008', lat: 37.2872, lng: -121.95 },
  '95014': { city: 'Cupertino', zip: '95014', lat: 37.3229, lng: -122.0322 },
  '95035': { city: 'Milpitas', zip: '95035', lat: 37.4323, lng: -121.8996 },
  '95110': { city: 'San Jose', zip: '95110', lat: 37.3382, lng: -121.8936 },
  '95112': { city: 'San Jose', zip: '95112', lat: 37.3496, lng: -121.8841 },
  '95117': { city: 'San Jose', zip: '95117', lat: 37.3121, lng: -121.9535 },
  '95128': { city: 'San Jose', zip: '95128', lat: 37.3138, lng: -121.9308 },
  '95129': { city: 'San Jose', zip: '95129', lat: 37.3054, lng: -121.9861 },
  '94086': { city: 'Sunnyvale', zip: '94086', lat: 37.3752, lng: -122.0221 },
  '94087': { city: 'Sunnyvale', zip: '94087', lat: 37.3524, lng: -122.0363 },
  '94040': { city: 'Mountain View', zip: '94040', lat: 37.3773, lng: -122.0862 },
  '95070': { city: 'Saratoga', zip: '95070', lat: 37.2638, lng: -122.023 },
  '95030': { city: 'Los Gatos', zip: '95030', lat: 37.2266, lng: -121.9747 },
};

export const DEFAULT_LOCATION: Location = {
  city: 'Santa Clara',
  zip: '95050',
  lat: 37.3496,
  lng: -121.9585,
};

export function lookupZip(zip: string): Location | null {
  return ZIP_TABLE[zip.trim()] ?? null;
}

export function isPlausibleZip(zip: string): boolean {
  return /^\d{5}$/.test(zip.trim());
}

/* Turns a browser geolocation reading into the nearest place we can name,
   so the student sees "Santa Clara" rather than a pair of coordinates. */
export function nearestKnownPlace(point: GeoPoint): Location {
  let best = DEFAULT_LOCATION;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const location of Object.values(ZIP_TABLE)) {
    const d = distanceMiles(point, location);
    if (d < bestDistance) {
      bestDistance = d;
      best = location;
    }
  }

  return { ...best, lat: point.lat, lng: point.lng };
}
