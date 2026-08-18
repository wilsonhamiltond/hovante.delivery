# Building Volao on EAS (Expo cloud)

Builds run on Expo's servers, so no Android SDK or JDK is needed locally.

The project is already linked to an EAS project (`extra.eas.projectId` in `app.json`), and
`eas.json` defines three profiles. What is left is signing in and supplying the API keys.

## One-time setup

**1. Sign in.** Only you can do this — it opens an interactive prompt for your Expo credentials.

```bash
npx eas-cli login
```

**2. Put the Google Maps keys on EAS.**

**No key belongs in this repo.** `eas.json` holds only the API URL, which is not a credential; the
keys live on EAS servers and are injected at build time.

A Google key carries exactly one application restriction, so Android, iOS and web each need their
own key to be restricted at all. EAS environment variables are scoped to `development` / `preview` /
`production` and cannot tell Android from iOS -- and per-platform *custom* environments require a
Production plan. So the platform is encoded in the **variable name** instead, and `src/config.ts`
picks the right one at runtime.

```bash
npx eas-cli env:set --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID --value "<android key>" --visibility sensitive --environment preview --environment production
```

```bash
npx eas-cli env:set --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS --value "<ios key>" --visibility sensitive --environment preview --environment production
```

```bash
npx eas-cli env:set --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_WEB --value "<web key>" --visibility sensitive --environment preview --environment production
```

With none of the three set, the app falls back to a single `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` -- set
that one instead to run one key everywhere for now.

> **The trade-off:** all three keys are compiled into every build, because Expo inlines each
> `process.env.EXPO_PUBLIC_*` it sees literally. An Android APK therefore also carries the iOS and
> web keys. Every key is extractable from any build regardless, so what the split still buys is
> real: separate quotas, separate restrictions, and revoking one without breaking the others. To
> ship only one key per binary you would need `app.config.js` selecting on `EAS_BUILD_PLATFORM`,
> with `expo-constants` in place of `EXPO_PUBLIC_*`.

A note on `--visibility sensitive`: it keeps the value out of build logs and the dashboard. It does
not make the key private -- every `EXPO_PUBLIC_*` value is readable from the finished APK. What
protects a key is restricting it in Google Cloud Console and capping its daily quota.

**3. Confirm what the cloud will see.**

```bash
npx eas-cli env:list --environment production
```

```bash
npx eas-cli config --platform android --profile production
```


## Building

| Profile | Produces | For |
|---|---|---|
| `preview` | APK, internal distribution | Hand a download link to a tester |
| `production` | App Bundle (.aab) | Upload to Google Play |
| `development` | Dev client | Debugging against local Metro |

```bash
npx eas-cli build --platform android --profile preview
```

```bash
npx eas-cli build --platform android --profile production
```

The first Android build asks whether to generate a keystore. Let EAS create and store it — losing
it later means Play will not accept an update to the same app.

`appVersionSource: "remote"` means EAS owns `versionCode`, and `autoIncrement` on the production
profile bumps it per build, so `app.json` does not need editing between releases.

## APK from an AAB

Only needed when you already have the `.aab` and want that exact artifact installable — an `.aab`
cannot be sideloaded, because Play splits it into per-device APKs on its own servers.

**If you just want an installable APK, don't convert anything** — the `preview` profile builds one
directly, correctly signed, in one command:

```bash
npx eas-cli build --platform android --profile preview
```

Needs `bundletool-all-<version>.jar` in `scripts/` — a 31 MB Google release binary from
[bundletool releases](https://github.com/google/bundletool/releases), gitignored, fetched on demand.

Fetch an EAS-built bundle first if it is not on disk:

```bash
npx eas-cli build:download --platform android
```

**Signing is required, not optional.** bundletool does *not* fall back to a debug key — with no
keystore it emits an unsigned APK that Android refuses to install. Download the app's keystore with
`npx eas-cli credentials` (Android → keystore), then:

```bash
KEYSTORE=/path/to/keystore.jks KEYSTORE_PASS=... KEY_ALIAS=... KEY_PASS=... node scripts/aab-to-apk.mjs path/to/app.aab
```

Using the app's real keystore also means the APK upgrades cleanly over a Play install.

The result is a **universal** APK — every ABI and density in one file, so it is noticeably larger
than what Play serves a real device. Fine for testing, wrong for shipping.

Java 25 prints several `sun.misc.Unsafe` deprecation warnings when bundletool starts. They come from
a Guava dependency, not from your bundle, and are harmless.

## Why `development` has no `env`

A development build loads its JavaScript from the Metro server on your machine at runtime, not from
a bundle baked in at build time. So `EXPO_PUBLIC_*` comes from the local `.env` when you run
`expo start` — pinning values into that profile would be misleading.

## Submitting to Play

```bash
npx eas-cli submit --platform android --profile production
```

Needs a Google Play service-account JSON the first time; `eas submit` walks through it. See
[TESTERS.md](TESTERS.md) for the internal-testing tester list.

## iOS

Same EAS project, same profiles — no Mac needed, the build runs on Expo's macOS workers. What
differs from Android is signing: Apple requires a paid Developer Program membership
(Team ID `KR9RTTNT37`) before any certificate can exist, and it decides *how* a build can be
installed.

**The iOS Maps key.** Same split as Android, different variable:

```bash
npx eas-cli env:set --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS --value "<ios key>" --visibility sensitive --environment preview --environment production
```

**Do not give that key an iOS-app restriction.** The maps are not the native Maps SDK -- they are
the Maps JavaScript API inside a `WebView` (`mapHtml.ts`), and the reverse geocode is a plain
`fetch` (`profileForm.ts`). Neither sends a bundle identifier, and `LocationPicker` passes
`source={{ html }}` with no `baseUrl`, so the WebView document is `about:blank` and sends no
referer either. A bundle-id restriction and a referrer restriction both reject every request the
app makes.

What can be locked down instead:

- **API restrictions** -- limit the key to *Maps JavaScript API* and *Geocoding API*, nothing else.
- **A daily quota cap** per API, so a leaked key cannot run up a bill.

Application restriction stays *None*. That is a real exposure, and the mitigation is the quota cap,
not a restriction that would break the app. Giving the WebView a `baseUrl` (e.g.
`https://volao.com.do`) would make an HTTP-referrer restriction possible -- worth doing, but it is a
code change across all three map components, not a console setting.

**Credentials.** Let EAS generate and hold the distribution certificate, the provisioning profile
and the APNs key on the first build — it signs into App Store Connect, creates all three, and
stores them. Doing it by hand buys nothing and a lost certificate is a nuisance to rotate.

```bash
npx eas-cli build --platform ios --profile production
```

**Why there is no ad-hoc APK equivalent.** An `.ipa` cannot be sideloaded the way an APK can. iOS
only installs a build whose provisioning profile names the target device, so the `preview` profile
on iOS needs every tester's device UDID registered first:

```bash
npx eas-cli device:create
```

That is worth doing for one or two phones. For anything wider, TestFlight is the path — a
`production` build submitted to App Store Connect, which needs no UDIDs and holds up to 10,000
external testers.

## Submitting to App Store Connect

```bash
npx eas-cli submit --platform ios --profile production
```

`eas.json` carries only `appleTeamId`; `eas submit` prompts for the Apple ID and the App Store
Connect app id on the first run and can write them back. The build lands in TestFlight, not on the
store — releasing it is a separate step in App Store Connect.

Two review requirements the code already has to satisfy:

- **Guideline 4.8** — an app offering third-party sign-in must also offer Sign in with Apple.
  `app/login.tsx` renders `AppleSignInButton` alongside Google for this reason. That button drives
  the API's `/auth/apple/start`, so the API's `Apple` configuration section has to be filled in or
  the endpoint answers `400` and the button visibly fails in review.
- **Guideline 5.1.1** — every permission prompt needs a purpose string. The `expo-location` and
  `expo-image-picker` plugin entries in `app.json` supply them; a permission added later without one
  is an automatic rejection.
- **Export compliance** — `ios.infoPlist.ITSAppUsesNonExemptEncryption` is `false` in `app.json`,
  which is what stops App Store Connect asking about encryption on every upload. That answer is
  accurate only while the app's sole encryption is the OS's: HTTPS to the API, and `expo-secure-store`
  writing to the Keychain. `expo-crypto` is present as a dependency of `expo-auth-session` but is
  never imported. Bundling a crypto library, or hand-rolling an algorithm, makes the declaration
  false and requires filing a year-end self-classification report with the US BIS. It must be a
  JSON boolean -- the string `"false"` is truthy in a plist and declares the opposite.

`supportsTablet` is `false`. iPad support means App Review runs the app on an iPad and the store
listing needs iPad screenshots, and the layouts have never been tried at that size. Flip it to
`true` when someone has actually looked at it there.
