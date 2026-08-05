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

export interface LocationPickerProps {
  latitude: number;
  longitude: number;
  onPick: (loc: PickedLocation) => void;
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
export function locationPickerHtml(lat: number, lng: number): string {
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
  var marker, geocoder;

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
    marker = new google.maps.Marker({ position: { lat: lat, lng: lng }, map: map, draggable: true });

    map.addListener('click', function (e) {
      marker.setPosition(e.latLng);
      pick(e.latLng.lat(), e.latLng.lng());
    });
    marker.addListener('dragend', function () {
      var p = marker.getPosition();
      pick(p.lat(), p.lng());
    });
  }
</script>
${loaderTag('initPicker')}
</body>
</html>`;
}

export { loaderTag };
