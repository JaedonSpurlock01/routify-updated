import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as THREE from "three";

/**
 * A utility function that wraps `clsx` and `twMerge` to conditionally join
 * class names together.
 *
 * @param inputs - The class names to conditionally join.
 * @returns The merged class name string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert miles to kilometers.
 *
 * @param number The number of miles to convert.
 * @returns The equivalent number of kilometers.
 */
export function milesToKilometers(number: number) {
  return number * 1.60934;
}

/**
 * Convert kilometers to miles.
 *
 * @param number The number of kilometers to convert.
 * @returns The equivalent number of miles.
 */
export function kilometersToMiles(number: number) {
  return number * 0.621371;
}

/**
 * Convert a latitude and longitude to a Mercator projection (XY) that is
 * suitable for a 2D map.
 *
 * @param lat The latitude of the point to project.
 * @param lon The longitude of the point to project.
 * @returns An array containing the X and Y coordinates of the projected point
 * in the order [x, y].
 */
export function convertToXY(lat: number, lon: number): [number, number] {
  const earthRadius = 6371; // Radius of the Earth in kilometers

  const x = (lon + 180) * ((earthRadius * 2 * Math.PI) / 360);
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = earthRadius * mercN;

  return [x, y];
}

/**
 * Calculates the distance between two points on a sphere (such as the Earth) using the Haversine formula.
 *
 * @param lat1 The latitude of the first point in degrees.
 * @param lon1 The longitude of the first point in degrees.
 * @param lat2 The latitude of the second point in degrees.
 * @param lon2 The longitude of the second point in degrees.
 * @returns The distance between the two points in kilometers.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  // Radius of the Earth in kilometers
  const R = 6371;

  // Convert coordinates from degrees to radians
  const lonR1 = lon1 * (Math.PI / 180);
  const latR1 = lat1 * (Math.PI / 180);
  const lonR2 = lon2 * (Math.PI / 180);
  const latR2 = lat2 * (Math.PI / 180);

  // Calculate delta between points
  const lonD = lonR2 - lonR1;
  const latD = latR2 - latR1;

  // Haversine formula from https://en.wikipedia.org/wiki/Haversine_formula
  const a =
    Math.sin(latD / 2) * Math.sin(latD / 2) +
    Math.cos(latR1) * Math.cos(latR2) * Math.sin(lonD / 2) * Math.sin(lonD / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Distance in kilometers
  return R * c;
}

/**
 * Converts a screen point (in Normalized Device Coordinates: -1 to 1 range)
 * into world/scene coordinates using the given camera.
 *
 * @param screenPoint - The NDC point { x, y } in range [-1, 1]
 * @param camera - The THREE.js camera (Perspective or Orthographic)
 * @returns A THREE.Vector3 representing the world position
 */
export function worldPointFromScreenPoint(
  screenPoint: { x: number; y: number },
  camera: THREE.Camera
): THREE.Vector3 {
  const cameraPosition = new THREE.Vector3(screenPoint.x, screenPoint.y, 0.5);
  cameraPosition.unproject(camera);

  // Create a direction vector from camera towards that point
  cameraPosition.sub(camera.position).normalize();

  const distance = -camera.position.z / cameraPosition.z;

  return new THREE.Vector3()
    .copy(camera.position)
    .add(cameraPosition.multiplyScalar(distance));
}
