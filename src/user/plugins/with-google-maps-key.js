const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Puts the Google Maps key into the Android manifest.
 *
 * `react-native-maps` reads its key from a manifest meta-data entry, not from
 * the JavaScript bundle - so EXPO_PUBLIC_GOOGLE_MAPS_API_KEY, which the web
 * build uses, does nothing here. Without this the tracking map builds and
 * installs quite happily and then renders as a blank grey square on the
 * phone, which is the sort of failure nobody notices until a customer is
 * watching for their rider.
 *
 * Written as a plugin rather than edited into the manifest by hand because
 * `expo prebuild --clean` regenerates that file: a hand edit survives exactly
 * until the next build.
 */
const KEY_NAME = "com.google.android.geo.API_KEY";

module.exports = function withGoogleMapsKey(config) {
  return withAndroidManifest(config, (mod) => {
    /*
     * Read from the environment, not from app.json.
     *
     * app.json is committed; the .env files are not. Putting the key in the
     * former would publish it to anyone with the repository.
     */
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      // Louder than a silent skip: a build with no key produces a blank map.
      console.warn(
        "[with-google-maps-key] No Google Maps key found. The map will be blank."
      );
      return mod;
    }

    const application = mod.modResults.manifest.application?.[0];
    if (!application) return mod;

    application["meta-data"] = application["meta-data"] ?? [];
    const existing = application["meta-data"].find(
      (entry) => entry.$?.["android:name"] === KEY_NAME
    );

    if (existing) {
      existing.$["android:value"] = apiKey;
    } else {
      application["meta-data"].push({
        $: { "android:name": KEY_NAME, "android:value": apiKey },
      });
    }

    return mod;
  });
};
