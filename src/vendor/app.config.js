const base = require("./app.json");

/**
 * Everything still lives in app.json — this only layers on the one setting
 * that has to vary per build.
 *
 * `EXPO_BASE_URL` sets `experiments.baseUrl`, which prefixes every route and
 * asset path in a web export. That is what lets the app be hosted under a
 * sub-path (`https://host/vendor`) rather than at the domain root, which
 * matters when it shares a tunnel or domain with another app.
 *
 *   EXPO_BASE_URL=/vendor npx expo export --platform web
 *
 * Unset — the normal case, including local dev — the export targets `/` and
 * this file changes nothing.
 */
module.exports = () => {
  const baseUrl = process.env.EXPO_BASE_URL;

  if (!baseUrl) return base;

  return {
    ...base,
    expo: {
      ...base.expo,
      experiments: { ...base.expo.experiments, baseUrl },
    },
  };
};
