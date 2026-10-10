# Home banner + fixed cart bar update

## Admin-uploaded homepage banners
- The user app now normalizes admin banner media URLs before rendering.
- Legacy relative `/uploads/...` URLs are resolved against the configured API origin.
- Legacy `localhost` / `127.0.0.1` upload URLs are remapped to the current API origin so a physical phone can load old admin uploads.
- If an invalid remote banner has no usable image URL, it is ignored and the built-in promotion carousel remains available.

## Cart / checkout bar
- The cart bar is explicitly positioned as a fixed overlay at the bottom of the screen.
- On tab screens it sits above the Android/iOS bottom navigation area using the platform tab-bar height and safe-area inset.
- It has a high z-index/elevation and does not move with the Home `ScrollView`.
- Home content retains bottom padding so the fixed cart bar does not hide the last content.
