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
 */
module.exports = () => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";
  const baseUrl = process.env.EXPO_BASE_URL;

  const expo = {
    ...base.expo,
    android: {
      ...base.expo.android,
      config: {
        ...base.expo.android.config,
        googleMaps: { apiKey },
      },
    },
  };

  if (baseUrl) expo.experiments = { ...expo.experiments, baseUrl };

  return { expo };
};
