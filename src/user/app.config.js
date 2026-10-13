const base = require("./app.json");

/**
 * Everything lives in app.json — this only fills in what must not be committed.
 *
 * The Google Maps key is read from the environment at build time. An Android
 * Maps key is embedded in the APK and is not really a secret, but it is still
 * billed to whoever owns it, so it stays out of the repository: builds get it
 * from an EAS secret, and local runs from the shell.
 *
 *   eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value AIza…
 *
 * Restrict it in the Google console to the app's package name and signing
 * certificate, or anybody who unpacks the APK can spend against it.
 *
 * The key is deliberately NOT put into the config returned below. It reaches
 * the Android manifest through plugins/with-google-maps-key.js, which reads it
 * from the environment while the app is being built. The runtime version is a
 * fingerprint of the native side of this config, and a key in the config would
 * be part of it: the cloud build has the key, a machine or CI job publishing an
 * over-the-air update does not, so the two would compute different fingerprints
 * and the update would never reach a single phone.
 */
module.exports = () => {
  const baseUrl = process.env.EXPO_BASE_URL;

  const expo = { ...base.expo };

  if (baseUrl) expo.experiments = { ...expo.experiments, baseUrl };

  return { expo };
};
