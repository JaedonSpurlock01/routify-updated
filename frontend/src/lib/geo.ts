const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

/** Great-circle distance between two lat/lon points, in metres. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Web-Mercator X in kilometres. */
export function mercatorX(lon: number): number {
  return (lon + 180) * DEG * EARTH_RADIUS_KM;
}

/** Web-Mercator Y in kilometres. */
export function mercatorY(lat: number): number {
  return EARTH_RADIUS_KM * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
}
