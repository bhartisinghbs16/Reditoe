# Reditoe 10 km Location Serviceability

- User location is detected with Expo Location when permission is available.
- A manually selected saved address overrides GPS for discovery and checkout.
- Restaurant discovery passes the active latitude/longitude to the backend.
- The backend enforces a hard platform maximum of 10 km. A vendor may configure a smaller radius, never a larger one.
- Home/category/catalogue results contain only serviceable restaurants.
- A failed catalogue request does not fall back to bundled/sample restaurants.
- Search uses the active coordinates and customer city. Same-city matches outside 10 km can return a `Not serviceable` explanation; other-city matches are not exposed.
- Restaurant menu and checkout remain server-side serviceability protected.
