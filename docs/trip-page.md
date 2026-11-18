# Public Thanksgiving trip page

## Scope
A standalone trip dashboard at `/trip/` for the November 21, 2026 drive from Kansas City to Alvarado. It is static and public so household members can open the same link in Android Messages without installing anything or signing in.

## Acceptance criteria
1. `https://move-ledger.web.app/trip/` loads without signing into Firebase or exposing the private packing app.
2. The page provides a concise mobile layout with three sections: drive, packing, and preparation. Existing tabs, notes and checklists still work offline after the document is loaded.
3. Route passes through China Go on East 13th in Wichita, Buc-ee's at 15901 N Freeway, then Razzoo's Alliance at 2950 Texas Sage Trail in Fort Worth. Dinner is Shelly's familiar Razzoo's takeout order, not assumed automatically gluten-free; call to confirm the item and handling.
4. Changing departure updates Buc-ee's, suggested Razzoo's order/pickup times, and estimated arrival. Google Maps includes the selected Wichita branch, Buc-ee's and Razzoo's Alliance as ordered waypoints.
5. Copy trip link provides a normal webpage URL to send in Messages. Personal notes and checkmarks remain per-browser in local storage rather than being sent to a server.
6. This page must not embed a private residential street address, private Drive link, account information, or Firestore data. Search engines are asked not to index it, but the URL is still public.
7. Existing `/rentals/` and the authenticated Move Ledger app remain unaffected; public pages are excluded from the PWA's SPA navigation fallback.
8. A test checks page script syntax, presence of the itinerary and public link, and the service-worker public-page route exclusions. `npm run build` runs the test.

## Delivery/operation
Static HTML in `public/trip/index.html` is copied by Vite into `dist/trip/index.html` and served by Firebase Hosting. No new dependencies or backend permissions. If a shared checklist is desired later, it requires a separate decision about authentication/access control. This iteration stores each person's state on their device.

## Notes
Route times are approximations, not live routing. The private destination is described as Alvarado. The public route avoids the family's street address. Outside links open Google Maps or public restaurant pages.
