# Releasing: what a push updates, and what needs a new build

| You changed | How it reaches users |
| --- | --- |
| Backend (`src/backend`) | `git push` to `main` - Railway redeploys the API |
| An app's JavaScript, screens, styles, copy, bundled images | `git push` to `main` - the **Publish app updates** workflow publishes an over-the-air update; phones apply it the next time the app is closed and reopened |
| Anything native (new native module or Expo plugin, permissions, icon/splash, package name, `eas.json`, config plugins, an SDK upgrade) | A new `eas build` and a reinstall. A push cannot do this |
| Vendor web (`src/vendor-web`) | Wherever it is hosted - not covered here |

## How phones decide whether an update is for them

Each app's `runtimeVersion` policy is `fingerprint`: a hash of everything native
about the app, worked out for you. A build is stamped with it, and an update is
published for it. A phone only takes an update whose hash matches its own build.

* Change JavaScript only -> the hash does not move -> the update reaches every phone on that build.
* Change anything native -> the hash moves -> the update is published for a hash no installed
  build has, so **nobody receives it**. Build again and install. This is the safety net: an
  update that needs a native module can never be sent to a phone that lacks it.

Check what a project's hash currently is:

```powershell
cd src/user
npx expo-updates fingerprint:generate --platform android
```

The build's own value is on its page at expo.dev ("Runtime version"). If the two differ, an
update would not reach that build.

## One-time setup

1. **Build each app once with the new policy** (the old APKs have a different runtime and, for the
   customer app, no updater at all):

   ```powershell
   cd src/user
   eas build --platform android --profile preview
   ```

   Repeat in `src/vendor` and `src/delivery`, and install the APKs.
2. **Add the `EXPO_TOKEN` secret** so the workflow can publish: create an access token at
   expo.dev -> Account settings -> Access tokens, then GitHub -> Settings -> Secrets and variables
   -> Actions -> New repository secret named `EXPO_TOKEN`.

## Publishing

* **Automatically:** push to `main`. Only apps whose folder changed are published.
* **By hand from GitHub:** Actions -> *Publish app updates* -> Run workflow (pick an app, add a message).
* **By hand from this machine:** `cd src/user` then `npm run ota:preview -- "what changed"`.

Only the `preview` channel is published. The `production` channel uses `https://api.reditoe.com`,
which currently serves Railway's default certificate and fails TLS on phones - do not build or
publish production until that custom domain is attached.

## Things that quietly change the hash

* **Line endings.** The hash covers file contents. `.gitattributes` forces LF so Windows, CI and the
  build servers agree. Don't remove it.
* **The Google Maps key** is deliberately *not* in the app config (it is read from the
  `GOOGLE_MAPS_API_KEY` environment variable by `plugins/with-google-maps-key.js` while the
  app is built), because a key in the config would give the cloud build and CI different hashes.
* **`eas.json`, `plugins/*.js`, `google-services.json`, icons** are part of it. Editing them means a rebuild.
* **`version` and `versionCode` are part of it too** (each changes the hash - checked). Raise them in
  the same commit as the build you are about to make, and leave them alone afterwards: bump either
  one *after* building and every later update is published for a hash the installed build does not
  have, so nothing arrives.
