---
name: Ticket
about: A unit of work for a coding agent or for me
title: ''
labels: ''
---

## Goal

One sentence. What is true after this ticket that is not true now.

## Context

Links to the relevant doc sections and decision records. An agent should not have to guess which doc governs this work.

- Doc:
- Decision record:

## Acceptance criteria

Written before implementation starts. Each line is verifiable by someone who did not write the code.

- [ ]
- [ ]
- [ ]

## States to handle

- [ ] Loading
- [ ] Empty
- [ ] Error
- [ ] Offline

Mark a state "not applicable" explicitly rather than leaving it unchecked.

## Tests required

- [ ] Domain unit tests, if domain logic changed
- [ ] Rules tests, if `firestore.rules` or `storage.rules` changed
- [ ] Component tests, if a new interactive screen was added

## Docs to update

Which file changes in this same pull request. If none, say so and why.

## Out of scope

What a reasonable person might add while in here, and should not.
