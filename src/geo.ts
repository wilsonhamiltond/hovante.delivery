// Point-in-polygon (ray casting, even-odd rule), with points on an edge or vertex counted
// INSIDE -- the polygon inherits the rectangle's inclusive-edges contract. The ring is treated
// as closed; it need not repeat its first vertex.
//
// This mirrors the API's DeliveryAreas.PointInPolygon and the picker's inline copy in mapHtml.ts:
// the three must agree, or the app offers a branch/pin the server then refuses. Change together.

export type PolygonRing = [number, number][]; // vertices as [lat, lng]

const EPS = 1e-9;

function onSegment(y1: number, x1: number, y2: number, x2: number, lat: number, lng: number): boolean {
  const cross = (x2 - x1) * (lat - y1) - (y2 - y1) * (lng - x1);
  if (Math.abs(cross) > EPS) return false;
  return lng >= Math.min(x1, x2) - EPS && lng <= Math.max(x1, x2) + EPS
    && lat >= Math.min(y1, y2) - EPS && lat <= Math.max(y1, y2) + EPS;
}

export function pointInPolygon(ring: PolygonRing, lat: number, lng: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0]; const xi = ring[i][1];
    const yj = ring[j][0]; const xj = ring[j][1];
    if (onSegment(yi, xi, yj, xj, lat, lng)) return true;
    const crosses = (yi > lat) !== (yj > lat)
      && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}
