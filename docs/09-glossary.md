# Glossary

Naming drift between the domain model and the interface is the most likely failure in this repository. This file is the arbiter.

## The split

| Concept | Code identifier | User-facing word |
|---|---|---|
| Tracked physical object | `Container` | Box |
| Room or area in a location | `Zone` | Room |
| Building, truck, storage unit | `Location` | Place |
| Move-scoped number | `sequenceNumber` | box number |
| Zero-padded number | `displayCode` | the number on the box |
| Person on the move | `MoveMember` | member |

Rule: code never uses the user-facing word. Interface strings never use the code word. A variable named `room` is a bug. A button reading "Add container" is a bug.

Why the split exists: most containers are boxes, but furniture and appliances are tracked in the same collection. Most zones are rooms, but a truck has zones too. The domain needs the general word and the user needs the specific one.

## Terms

**Condition.** A state that coexists with status. `missing` and `damaged`. A box can be loaded and damaged at once. Not a status value.

**Status.** Position in the pipeline. `filling`, `packed`, `staged`, `loaded`, `unloaded`, `opened`, `emptied`. Exactly one at a time.

**filling.** A box record that exists because its number was reserved but has not been sealed. Not a user-facing word. The interface calls it a draft.

**Label instruction.** The block showing what to write with a marker. Number and color name. Not a printed label.

**colorName.** The single word written on the box, such as BLUE. Handwriting-legible.

**colorValue.** The hex value used on screen. Never appears on a physical box.

**Number range.** The disjoint span of `sequenceNumber` values assigned to one member so two offline phones cannot collide.

**searchText.** A lowercased concatenation kept on every container for client-side filtering. Not a Firestore index.

**Move Day mode.** The repeat-action interface for loading and unloading. Optimized for one operation performed many times.

**Open-first.** A box with `unpackPriority` of `immediate` or `first_night`.

**Confirmed text.** Text a person typed or explicitly accepted. Distinct from `aiSummary`, which is a suggestion until accepted.

## Words not to use

- Inventory. This tool tracks boxes, not objects. Using the word invites item-level scope.
- Scan. Nothing is scanned. There is no camera-based identification of a box.
- Tag or label as a noun for a physical object. The physical mark is handwriting.
- Sync as a user-facing verb. The interface says what happened: "Uploading photos", "Offline, changes saved here".
