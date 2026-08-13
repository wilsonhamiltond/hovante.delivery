// The map documents are JavaScript assembled inside template literals, which means a syntax error
// in them is invisible to the compiler and only shows up as a blank map on someone's phone. So each
// document is generated here and its inline script handed to new Function(), which parses it
// without running it -- a stray backtick or an accidental ${...} fails the build instead.

// Rendered with a key (the generators return a "configure the key" placeholder without one) and
// once per marker branch, since the Map ID decides which one the document is built for.
function render(mapId: string) {
  jest.resetModules();
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID = mapId;
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { locationPickerHtml } = require('./mapHtml');
  const { pointsMapHtml } = require('./pointsMapHtml');
  const { routeMapHtml } = require('./routeMapHtml');
  const stop = (label: string) => ({
    lat: 18.48, lng: -69.93, label, title: 'Parada ' + label, color: '#2563eb',
  });
  return {
    picker: locationPickerHtml(18.48, -69.93, [{
      minLatitude: 18.4, maxLatitude: 18.5, minLongitude: -70, maxLongitude: -69.9,
      officeName: 'Sucursal', latitude: 18.45, longitude: -69.95,
    }], { lat: 18.45, lng: -69.95, title: 'Sucursal' }),
    points: pointsMapHtml([stop('1'), stop('2')], true),
    route: routeMapHtml(stop('1'), stop('2')),
  };
}

// Everything between the inline <script> tags: the loader is a separate <script src>, so this is
// exactly the code the document runs.
function inlineScript(html: string): string {
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('no inline script in the document');
  return m[1];
}

describe.each([['without a Map ID', ''], ['with a Map ID', 'test-map-id']])('map documents %s', (_name, mapId) => {
  const docs = render(mapId as string);

  it.each(Object.keys(docs))('%s parses as JavaScript', (which) => {
    const src = inlineScript((docs as Record<string, string>)[which]);
    expect(() => new Function(src)).not.toThrow();
  });

  it('loads the marker library AdvancedMarkerElement lives in', () => {
    Object.values(docs).forEach((html) => expect(html).toContain('libraries=marker'));
  });

  it('hands the Map ID to every map, since advanced markers do not render without one', () => {
    Object.values(docs).forEach((html) => {
      expect(html).toContain(`var MAP_ID = ${JSON.stringify(mapId)}`);
      expect(html).toContain('mapId: mapIdOption()');
    });
  });
});
