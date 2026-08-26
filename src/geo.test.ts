import { pointInPolygon, type PolygonRing } from './geo';

// A concave "L" around Santo Domingo-ish coordinates: the notch is the case a bounding box gets
// wrong, which is the whole reason polygons exist here.
const L: PolygonRing = [
  [18.40, -70.00],
  [18.60, -70.00],
  [18.60, -69.90],
  [18.50, -69.90],
  [18.50, -69.80],
  [18.40, -69.80],
];

describe('pointInPolygon', () => {
  it('accepts a point deep inside', () => {
    expect(pointInPolygon(L, 18.45, -69.95)).toBe(true);
  });

  it('rejects a point outside the ring entirely', () => {
    expect(pointInPolygon(L, 18.70, -69.95)).toBe(false);
  });

  it('rejects a point inside the bounding box but in the concave notch', () => {
    // (18.55, -69.85) is inside the L's bbox yet outside the L itself -- the rectangle would have
    // said yes, the polygon must say no.
    expect(pointInPolygon(L, 18.55, -69.85)).toBe(false);
  });

  it('counts the boundary as inside (the rectangle contract)', () => {
    expect(pointInPolygon(L, 18.40, -69.90)).toBe(true); // on the south edge
    expect(pointInPolygon(L, 18.60, -70.00)).toBe(true); // exactly a vertex
  });

  it('handles the lower arm of the L', () => {
    expect(pointInPolygon(L, 18.45, -69.82)).toBe(true);
  });
});
