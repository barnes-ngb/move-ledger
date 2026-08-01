# User Flows

Each flow lists the taps that matter. The 20-second target in flow 3 is measured from tapping Add box to tapping Save and next, including writing on the physical box.

## 1. Create the move

1. Sign in with Google.
2. Enter a move name.
3. Enter origin and destination names. These become two Locations.
4. App creates the move and assigns the signer number range 1 to 499.
5. App routes to zone setup.

## 2. Configure zones

1. Open Rooms.
2. Add a room: name, short code, color.
3. App warns if a color is already used but allows the override.
4. Room appears in the color chart.

```text
BLUE    Kitchen
GREEN   Primary Bedroom
YELLOW  Office
RED     Garage
WHITE   Storage
```

## 3. Create and pack a box

Target: under 20 seconds.

1. Tap Add box.
2. App writes a `filling` container with the next number and shows it in large type.
3. User taps a destination zone. Label instruction updates immediately.
4. Screen shows:

```text
WRITE ON TWO SIDES

042
BLUE
```

5. User writes on the box.
6. User taps the camera and photographs the open contents.
7. User types or dictates a short note. Optional.
8. User taps handling flags. Optional.
9. User taps Save and next. This sets `labelConfirmedAt`, sets status to `packed`, and opens a fresh box with the next number.

Priority defaults to `normal` and is only changed when it matters. Anything that is not required to find the box later is optional.

## 4. Find a known box

1. Open Find.
2. Numeric keypad is already focused.
3. Type `42`.
4. App opens Box 042 as soon as exactly one match exists.
5. Detail shows photo, destination, status, note, current location.

## 5. Find an unknown box

1. Open Search.
2. Type or dictate a description: coffee maker, medicine, Lincoln.
3. App filters `searchText` on the local cache.
4. Results show which field matched.
5. A match from `aiSummary` is marked as a suggestion rather than confirmed text.

## 6. Stage boxes

1. Filter to packed.
2. Multi-select.
3. Assign a staging location.
4. App records one status change and one activity event per box.

## 7. Load the truck

1. Open Move Day.
2. Select the truck location. It stays selected.
3. Type a box number.
4. Tap Load.
5. App records location, time, actor, and previous location, then clears and refocuses the number field.

Steps 3 through 5 repeat without navigation. This is the whole point of Move Day mode.

## 8. Unload at the destination

1. Tap Unload.
2. Type the box number.
3. App shows the destination zone color in full-bleed color so it is readable from across a room.
4. Tap Confirm.
5. App sets `currentLocationId` to the destination and status to `unloaded`.

## 9. Report a condition

1. Open the box, or use Report damage in Move Day.
2. Take one or more photos.
3. Add a note.
4. App writes `conditions.damaged` and leaves status untouched.

A damaged box that is still on the truck stays `loaded`. Conditions and status are independent.

## 10. Open a box

1. Open the box record.
2. Tap Opened.
3. Later, tap Emptied.
4. Unopened counts update.

## 11. Pack offline

1. Connectivity drops.
2. Number assignment continues from the local cache.
3. Photos are written to IndexedDB and the photo record shows `pending`.
4. Firestore queues writes internally. The app shows an offline indicator.
5. When connectivity returns, Firestore flushes its own queue and the photo uploader drains IndexedDB.
6. Photos that fail permanently show a retry action rather than disappearing.
