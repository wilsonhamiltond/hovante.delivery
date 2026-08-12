import Constants from 'expo-constants';
import * as Application from 'expo-application';

// What build the person is actually holding, as one string to show in a footer or quote in a bug
// report. Two numbers, because they answer different questions and only one of them moves on its
// own:
//
//   version  -- the marketing version ("1.0.0") from app.json. eas.json sets appVersionSource
//               "remote", and autoIncrement explicitly does NOT cover this field, so it changes
//               only when a person bumps it in app.json for a release.
//   build    -- android.versionCode / ios.buildNumber. THIS is what the production profile's
//               autoIncrement raises on every prod build, so it is the number that distinguishes
//               two binaries shipped as the same version.
//
// Read once at module level: neither can change while the app is running.

// nativeApplicationVersion is null on web and in some dev contexts, where app.json's value is still
// the right answer -- so the native one leads and the config is the fallback.
const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;

// Null on web, which has no native build number at all. The version alone is shown there.
const build = Application.nativeBuildVersion ?? null;

/** "1.0.0 (42)", or "1.0.0" where there is no build number, or null when neither is known. */
export const APP_VERSION_LABEL: string | null =
  version ? (build ? `${version} (${build})` : version) : null;
