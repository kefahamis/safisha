import { distanceMeters } from "./geo";
import type { LatLng } from "./types";

/*
 * Orders a day's stops to shorten the drive: nearest-neighbour from the
 * truck's position, then 2-opt swaps until no reversal shortens the tour.
 * Straight-line distance stands in for road distance — good enough to fix the
 * zig-zags a fixed estate-by-estate order produces, with no routing service.
 */

export interface Stop extends LatLng {
  id: string;
}

export function tourLength(start: LatLng, stops: LatLng[]): number {
  let total = 0;
  let prev = start;
  for (const s of stops) {
    total += distanceMeters(prev, s);
    prev = s;
  }
  return total;
}

export function optimiseRoute(start: LatLng, stops: Stop[]): { order: string[]; distanceM: number } {
  if (stops.length < 2) return { order: stops.map((s) => s.id), distanceM: tourLength(start, stops) };

  // Nearest neighbour.
  const left = [...stops];
  const tour: Stop[] = [];
  let at: LatLng = start;
  while (left.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = distanceMeters(at, left[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    at = left[best];
    tour.push(left.splice(best, 1)[0]);
  }

  // 2-opt: reverse any segment that shortens the path (open tour from `start`).
  const point = (i: number): LatLng => (i < 0 ? start : tour[i]);
  let improved = true;
  let passes = 0;
  while (improved && passes < 50) {
    improved = false;
    passes++;
    for (let i = 0; i < tour.length - 1; i++) {
      for (let k = i + 1; k < tour.length; k++) {
        const a = point(i - 1);
        const b = tour[i];
        const c = tour[k];
        const d = k + 1 < tour.length ? tour[k + 1] : null;
        const before = distanceMeters(a, b) + (d ? distanceMeters(c, d) : 0);
        const after = distanceMeters(a, c) + (d ? distanceMeters(b, d) : 0);
        if (after + 0.5 < before) {
          tour.splice(i, k - i + 1, ...tour.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }

  return { order: tour.map((s) => s.id), distanceM: tourLength(start, tour) };
}
