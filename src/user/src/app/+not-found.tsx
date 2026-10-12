import React from "react";
import { Redirect, usePathname } from "expo-router";

/**
 * Where a path that matches no screen ends up.
 *
 * Without this file Expo Router draws its own "Unmatched Route - page could
 * not be found" screen, which is a dead end with a developer's sitemap on it.
 * Several things can send the app to a path it has no screen for - a banner the
 * admin pointed at an address the app does not have, a notification carrying a
 * link from another app, a deep link from an old build - and none of them is
 * something the customer did wrong or can do anything about. They are put back
 * on the home screen instead.
 */
export default function NotFound() {
  const pathname = usePathname();

  React.useEffect(() => {
    // Quiet for the customer, loud for whoever is building: a path that gets
    // here is a link somewhere that points at nothing.
    if (__DEV__) console.warn(`[router] No screen for "${pathname}". Sending the customer home.`);
  }, [pathname]);

  return <Redirect href="/" />;
}
