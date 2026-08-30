import { GOOGLE_MAPS_API_KEY, MAPS_ENABLED } from './config';
import { markersJs } from './mapMarkersJs';
import { strings, type Locale } from './i18n';

// The only user-visible words the picker document carries: the missing-key placeholder and the
// marker tooltips. Read through strings() when the HTML is generated, so a language switch shows
// on the next map opened.
const S: Record<Locale, { missingKey: string; deliverHere: string; store: string }> = {
  es: {
    missingKey: 'Configura EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.',
    deliverHere: 'Entregar aquí',
    store: 'Comercio',
  },
  en: {
    missingKey: 'Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to see the map.',
    deliverHere: 'Deliver here',
    store: 'Store',
  },
};

// Shared, platform-agnostic pieces for the location-picker map. No React/RN imports here so both the
// web (iframe) and native (WebView) pickers can use them.
//
// The map is Google Maps JavaScript API, loaded inside the document with the browser key. Both hosts
// render the same HTML: the only difference is how the picked point travels back out --
// window.ReactNativeWebView on native, window.parent on web -- and both are posted, so neither host
// needs its own copy of this.

export interface PickedLocation {
  lat: number;
  lng: number;
  address?: string | null;
}

// A merchant's delivery area, as drawn on the office. The picker outlines these and refuses a
// pin outside them.
export interface DeliveryArea {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
  /** The exact area as [lat, lng] vertices, when the office drew a polygon. The rectangle above
   * is then its bounding box; the polygon is what gets outlined and tested. */
  polygon?: [number, number][] | null;
  /** The branch the area belongs to, marked on the map. */
  officeName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

// Where the order comes from (the chosen branch). When given, the picker draws the driving route
// from here to the pin and redraws it on every new pick.
export interface RouteOrigin {
  lat: number;
  lng: number;
  title?: string | null;
}

export interface LocationPickerProps {
  latitude: number;
  longitude: number;
  onPick: (loc: PickedLocation) => void;
  /**
   * Rectangles the order may be delivered inside. Drawn on the map, and a tap outside all of them is
   * refused rather than moving the pin. An empty or omitted list means no restriction, matching how
   * the catalogue filter treats a merchant with no quadrant drawn.
   */
  areas?: DeliveryArea[];
  /** Called when a tap was refused, so the screen can say why. */
  onOutside?: () => void;
  /** The chosen branch. When set, the route from it to the pin is drawn and kept current. */
  origin?: RouteOrigin | null;
}

// Santo Domingo, used when the customer has no saved coordinates yet.
export const DEFAULT_CENTER = { lat: 18.4861, lng: -69.9312 };

// Shown in place of a map when no key is configured. Google would otherwise render a greyed-out map
// under a "for development purposes only" watermark, which looks like a bug rather than a setting.
export function missingKeyHtml(message: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html,body{height:100%;margin:0;display:flex;align-items:center;justify-content:center;
    background:#0b2a6b;color:#fff;font-family:system-ui,-apple-system,sans-serif;text-align:center}
  p{margin:0;padding:24px;font-size:14px;line-height:1.5;opacity:.85}
</style></head>
<body><p>${message}</p></body>
</html>`;
}

// The address the map documents claim to be served from, and the one Google sees.
//
// A WebView handed raw HTML has no URL of its own -- the document is about:blank -- and Google
// reports that as the requesting page. It matches no referrer restriction, so a key that carries
// one is refused and the map comes up as "Oops! Something went wrong". Passing this as the
// WebView's baseUrl gives the document a real origin, which is a referrer a key CAN be restricted
// to. It is never fetched: nothing here loads a relative URL.
export const MAP_BASE_URL = 'https://volao.com.do';

// The shared <script src> that loads the API. `loading=async` is what Google asks for and silences
// its console warning; the callback fires once the library is ready. `libraries=marker` brings in
// AdvancedMarkerElement, which replaced the deprecated google.maps.Marker -- see mapMarkersJs.ts.
//
// gm_authFailure is Google's own hook for "your key was refused" -- a wrong key, a restriction the
// request does not match, an API not enabled, billing off. Without it the map is replaced by a grey
// box telling the user to open a JavaScript console, which nobody holding a phone can do, so the
// failure is posted out to the host instead and the screen says what happened.
function loaderTag(callback: string): string {
  return `<script>
  window.gm_authFailure = function () {
    var s = JSON.stringify({ mapAuthError: true });
    try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); } catch (e) {}
    try { if (window.parent) window.parent.postMessage(s, '*'); } catch (e) {}
  };
</script>`
    + `<script async src="https://maps.googleapis.com/maps/api/js`
    + `?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`
    + `&libraries=marker`
    + `&loading=async&callback=${callback}"></script>`;
}

// A Google map with one draggable pin. Tapping the map or dragging the pin posts the coordinates
// back, then reverse-geocodes them (Google Geocoding, same key) and posts again with a readable
// address -- so the caller gets the point immediately and the address a moment later.
export function locationPickerHtml(
  lat: number, lng: number, areas: DeliveryArea[] = [], origin: RouteOrigin | null = null,
): string {
  const tx = strings(S);
  if (!MAPS_ENABLED) {
    return missingKeyHtml(tx.missingKey);
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body,#map{height:100%;margin:0;padding:0}</style>
</head>
<body>
<div id="map"></div>
<script>
${markersJs()}
  var lat = ${lat}, lng = ${lng};
  var areas = ${JSON.stringify(areas)};
  var origin = ${JSON.stringify(origin)};
  var marker, geocoder, map;

  // The office -> pin driving route, redrawn on every pick. Same cascade as the driver's route
  // map: Google Directions, then the public OSRM router, then a dashed straight hop. The sequence
  // number discards answers that arrive after the pin has already moved again, so a slow response
  // can never paint a stale route over a fresh one.
  var routeSeq = 0, routeLine = null, routeRenderer = null;

  function clearRoute() {
    if (routeLine) { routeLine.setMap(null); routeLine = null; }
    if (routeRenderer) { routeRenderer.setMap(null); routeRenderer = null; }
  }

  function straightRoute(dest) {
    routeLine = new google.maps.Polyline({
      path: [{ lat: origin.lat, lng: origin.lng }, dest], map: map, strokeOpacity: 0, geodesic: true,
      icons: [{
        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#2563eb', strokeWeight: 3, scale: 3 },
        offset: '0', repeat: '14px',
      }],
    });
  }

  function osrmRoute(dest, seq) {
    var url = 'https://router.project-osrm.org/route/v1/driving/'
      + origin.lng + ',' + origin.lat + ';' + dest.lng + ',' + dest.lat
      + '?overview=full&geometries=geojson';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (seq !== routeSeq) return;
        var coords = d && d.routes && d.routes[0] && d.routes[0].geometry
          && d.routes[0].geometry.coordinates;
        if (!coords || !coords.length) { straightRoute(dest); return; }
        routeLine = new google.maps.Polyline({
          path: coords.map(function (c) { return { lat: c[1], lng: c[0] }; }),
          map: map, strokeColor: '#2563eb', strokeWeight: 5, strokeOpacity: 0.9,
        });
      })
      .catch(function () { if (seq === routeSeq) straightRoute(dest); });
  }

  function drawRoute(dest) {
    if (!origin || !map) return;
    var seq = ++routeSeq;
    new google.maps.DirectionsService().route({
      origin: { lat: origin.lat, lng: origin.lng }, destination: dest,
      travelMode: google.maps.TravelMode.DRIVING,
    }, function (result, status) {
      if (seq !== routeSeq) return;
      clearRoute();
      if (status === 'OK' && result && result.routes && result.routes[0]) {
        routeRenderer = new google.maps.DirectionsRenderer({
          // preserveViewport: this map is for picking a point -- the route must not yank the
          // camera away from where the person is about to tap.
          map: map, directions: result, suppressMarkers: true, preserveViewport: true,
          polylineOptions: { strokeColor: '#2563eb', strokeWeight: 5, strokeOpacity: 0.9 },
        });
      } else {
        osrmRoute(dest, seq);
      }
    });
  }

  // Inclusive on every edge: a pin dropped exactly on the boundary is inside the area the merchant
  // drew, and the server's catalogue filter is inclusive too -- disagreeing would let someone place
  // a pin the merchant is then told it cannot serve. The polygon test mirrors src/geo.ts and the
  // API's DeliveryAreas.cs (ray casting, even-odd, boundary inside) -- change the three together.
  function inPolygon(ring, la, ln) {
    var EPS = 1e-9, inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
      var cross = (xj - xi) * (la - yi) - (yj - yi) * (ln - xi);
      if (Math.abs(cross) <= EPS
          && ln >= Math.min(xi, xj) - EPS && ln <= Math.max(xi, xj) + EPS
          && la >= Math.min(yi, yj) - EPS && la <= Math.max(yi, yj) + EPS) return true;
      if (((yi > la) !== (yj > la)) && ln < (xj - xi) * (la - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function inside(la, ln) {
    if (!areas.length) return true;
    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      if (a.polygon && a.polygon.length >= 3) {
        if (inPolygon(a.polygon, la, ln)) return true;
      } else if (la >= a.minLatitude && la <= a.maxLatitude &&
          ln >= a.minLongitude && ln <= a.maxLongitude) return true;
    }
    return false;
  }

  function post(obj) {
    var s = JSON.stringify(obj);
    try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); } catch (e) {}
    try { if (window.parent) window.parent.postMessage(s, '*'); } catch (e) {}
  }

  function pick(la, ln) {
    // The point first, so the caller is never waiting on the network to know where the pin is.
    post({ lat: la, lng: ln });
    if (!geocoder) return;
    geocoder.geocode({ location: { lat: la, lng: ln } }, function (results, status) {
      if (status === 'OK' && results && results[0]) {
        post({ lat: la, lng: ln, address: results[0].formatted_address });
      }
    });
  }

  function initPicker() {
    markersReady();
    map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: lat, lng: lng },
      zoom: 16,
      mapId: mapIdOption(),
      // Nothing here navigates elsewhere: this map exists to drop one pin.
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      clickableIcons: false,
    });
    geocoder = new google.maps.Geocoder();
    // Above the office dot: the one you can move must never end up hidden under one you cannot.
    marker = mkDraggablePin(map, { lat: lat, lng: lng }, { title: ${JSON.stringify(tx.deliverHere)}, zIndex: 2 });

    // The served area, outlined so the limit is visible before it is hit rather than only when a
    // tap is refused. Not editable and not clickable -- clicks must reach the map underneath, or
    // tapping inside the very area you are allowed to pick would do nothing.
    if (areas.length) {
      var bounds = new google.maps.LatLngBounds();
      for (var i = 0; i < areas.length; i++) {
        var a = areas[i];
        // The exact shape when a polygon was drawn, the rectangle otherwise -- outlining the box
        // around a polygon would promise coverage the exact test then refuses.
        if (a.polygon && a.polygon.length >= 3) {
          var path = a.polygon.map(function (v) { return { lat: v[0], lng: v[1] }; });
          new google.maps.Polygon({
            map: map, clickable: false, paths: path,
            strokeColor: '#2563eb', strokeOpacity: 0.9, strokeWeight: 2,
            fillColor: '#2563eb', fillOpacity: 0.10,
          });
          for (var p = 0; p < path.length; p++) bounds.extend(path[p]);
        } else {
          new google.maps.Rectangle({
            map: map, clickable: false,
            bounds: { south: a.minLatitude, north: a.maxLatitude, west: a.minLongitude, east: a.maxLongitude },
            strokeColor: '#2563eb', strokeOpacity: 0.9, strokeWeight: 2,
            fillColor: '#2563eb', fillOpacity: 0.10,
          });
          bounds.extend({ lat: a.minLatitude, lng: a.minLongitude });
          bounds.extend({ lat: a.maxLatitude, lng: a.maxLongitude });
        }

        // The shop itself, as a dot rather than a teardrop so it never reads as a second draggable
        // pin, and passing taps through so it cannot swallow one meant for the map beneath.
        if (a.latitude != null && a.longitude != null) {
          mkDot(map, { lat: a.latitude, lng: a.longitude }, {
            title: a.officeName || ${JSON.stringify(tx.store)}, zIndex: 1,
          });
          bounds.extend({ lat: a.latitude, lng: a.longitude });
        }
      }
      // Frame the area unless the pin already sits in it -- someone with a saved address inside the
      // zone should keep their own view rather than be zoomed out to the whole rectangle.
      if (!inside(lat, lng)) map.fitBounds(bounds, 32);
    }

    // The chosen branch, when it is not already dotted by its own area above (an office with no
    // quadrant never enters areas, yet the route still needs its endpoint visible).
    if (origin) {
      var dotted = areas.some(function (a) {
        return a.latitude === origin.lat && a.longitude === origin.lng;
      });
      if (!dotted) {
        mkDot(map, { lat: origin.lat, lng: origin.lng }, {
          title: origin.title || ${JSON.stringify(tx.store)}, zIndex: 1,
        });
      }
      // The pin the picker opened on already is a picked location; route to it straight away.
      drawRoute({ lat: lat, lng: lng });
    }

    map.addListener('click', function (e) {
      var la = e.latLng.lat(), ln = e.latLng.lng();
      if (!inside(la, ln)) { post({ outside: true }); return; }
      marker.setPos({ lat: la, lng: ln });
      pick(la, ln);
      drawRoute({ lat: la, lng: ln });
    });
    marker.onDragEnd(function () {
      var p = marker.getPos();
      var la = p.lat, ln = p.lng;
      if (!inside(la, ln)) {
        // Snap back rather than leave the pin somewhere that cannot be ordered to.
        marker.setPos({ lat: lat, lng: lng });
        post({ outside: true });
        return;
      }
      lat = la; lng = ln;
      pick(la, ln);
      drawRoute({ lat: la, lng: ln });
    });
  }
</script>
${loaderTag('initPicker')}
</body>
</html>`;
}

export { loaderTag };
