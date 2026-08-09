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
