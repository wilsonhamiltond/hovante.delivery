import { GOOGLE_MAPS_API_KEY, MAPS_ENABLED } from './config';

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

// A merchant's delivery quadrant, as drawn on the office. The picker outlines these and refuses a
// pin outside them.
export interface DeliveryArea {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
  /** The branch the rectangle belongs to, marked on the map. */
  officeName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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

// The shared <script src> that loads the API. `loading=async` is what Google asks for and silences
// its console warning; the callback fires once the library is ready.
function loaderTag(callback: string): string {
  return `<script async src="https://maps.googleapis.com/maps/api/js`
    + `?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`
    + `&loading=async&callback=${callback}"></script>`;
}

// A Google map with one draggable pin. Tapping the map or dragging the pin posts the coordinates
// back, then reverse-geocodes them (Google Geocoding, same key) and posts again with a readable
// address -- so the caller gets the point immediately and the address a moment later.
export function locationPickerHtml(lat: number, lng: number, areas: DeliveryArea[] = []): string {
  if (!MAPS_ENABLED) {
    return missingKeyHtml('Configura EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.');
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
  var lat = ${lat}, lng = ${lng};
  var areas = ${JSON.stringify(areas)};
  var marker, geocoder;

  // Inclusive on every edge: a pin dropped exactly on the boundary is inside the area the merchant
  // drew, and the server's catalogue filter uses >= / <= too -- disagreeing would let someone place
  // a pin the merchant is then told it cannot serve.
  function inside(la, ln) {
    if (!areas.length) return true;
    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      if (la >= a.minLatitude && la <= a.maxLatitude &&
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
    var map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: lat, lng: lng },
      zoom: 16,
      // Nothing here navigates elsewhere: this map exists to drop one pin.
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      clickableIcons: false,
    });
    geocoder = new google.maps.Geocoder();
    marker = new google.maps.Marker({
      position: { lat: lat, lng: lng }, map: map, draggable: true,
      // Above the office dot: the one you can move must never end up hidden under one you cannot.
      zIndex: 2,
      title: 'Entregar aquí',
    });

    // The served area, outlined so the limit is visible before it is hit rather than only when a
    // tap is refused. Not editable and not clickable -- clicks must reach the map underneath, or
    // tapping inside the very area you are allowed to pick would do nothing.
    if (areas.length) {
      var bounds = new google.maps.LatLngBounds();
      for (var i = 0; i < areas.length; i++) {
        var a = areas[i];
        new google.maps.Rectangle({
          map: map, clickable: false,
          bounds: { south: a.minLatitude, north: a.maxLatitude, west: a.minLongitude, east: a.maxLongitude },
          strokeColor: '#2563eb', strokeOpacity: 0.9, strokeWeight: 2,
          fillColor: '#2563eb', fillOpacity: 0.10,
        });
        bounds.extend({ lat: a.minLatitude, lng: a.minLongitude });
        bounds.extend({ lat: a.maxLatitude, lng: a.maxLongitude });

        // The shop itself. A filled dot rather than a teardrop, so it never reads as a second
        // draggable pin, and clickable:false so it cannot swallow a tap meant for the map beneath.
        if (a.latitude != null && a.longitude != null) {
          new google.maps.Marker({
            map: map, clickable: false, zIndex: 1,
            position: { lat: a.latitude, lng: a.longitude },
            title: a.officeName || 'Comercio',
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#0b2a6b', fillOpacity: 1,
              strokeColor: '#ffffff', strokeWeight: 3,
            },
          });
          bounds.extend({ lat: a.latitude, lng: a.longitude });
        }
      }
      // Frame the area unless the pin already sits in it -- someone with a saved address inside the
      // zone should keep their own view rather than be zoomed out to the whole rectangle.
      if (!inside(lat, lng)) map.fitBounds(bounds, 32);
    }

    map.addListener('click', function (e) {
      var la = e.latLng.lat(), ln = e.latLng.lng();
      if (!inside(la, ln)) { post({ outside: true }); return; }
      marker.setPosition(e.latLng);
      pick(la, ln);
    });
    marker.addListener('dragend', function () {
      var p = marker.getPosition();
      var la = p.lat(), ln = p.lng();
      if (!inside(la, ln)) {
        // Snap back rather than leave the pin somewhere that cannot be ordered to.
        marker.setPosition({ lat: lat, lng: lng });
        post({ outside: true });
        return;
      }
      lat = la; lng = ln;
      pick(la, ln);
    });
  }
</script>
${loaderTag('initPicker')}
</body>
</html>`;
}

export { loaderTag };
