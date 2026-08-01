# 12. Firebase project setup

A record of how the Firebase project is actually configured. This is not a walkthrough. The console work is finished. This file exists so that a surprise in October has somewhere to start.

Console account: the personal Google account. Nothing here touches a Zahner-adjacent account.

## Project

| Item | Value |
| --- | --- |
| Project ID | `move-ledger` |
| Auth domain | `move-ledger.firebaseapp.com` |
| Storage bucket | `move-ledger.firebasestorage.app` |
| Messaging sender ID | `1012528589337` |
| Google Analytics | Off |
| Firestore location | CONFIRM |
| Storage location | CONFIRM |

The project ID carries no random suffix, which means `move-ledger` was still free at creation. `.firebaserc` points at it.

The two location rows need one glance at the console. Firestore location is permanent once set, so it is worth having written down rather than remembered.

## Billing

Blaze, with a budget alert at $10 per month. Blaze is required for Cloud Storage on projects created after late 2024, and again for the Cloud Function that APPLY-04 adds. Expected real cost for two people and a few hundred boxes is a few dollars across the whole move.

The alert is a notification, not a cap. Google does not offer a hard spending cap on Firebase. If the alert fires, check the vision function first, because a retry loop there is the only component in this app capable of spending money quickly. Doc 11 holds the limits and the per-move cap.

## Authentication

Google is the only enabled provider. Email/password and phone are off deliberately. See `decisions/0005-google-sign-in-two-accounts.md`, which lands with APPLY-02.

Two accounts, one per household member, each holding a disjoint number range. This is a hard requirement rather than a preference. Offline number reservation reads the local cache for the highest number inside the signed-in member's range, so two phones sharing one account become one member and can issue the same box number twice. That is the documented collision failure mode in doc 02.

## Firestore

Production mode from creation. The database stays empty until the first write from the app.

Rules ship from `firestore.rules`, copied verbatim from doc 10. They deploy during APPLY-02 before any UI exists, so the production database is locked correctly from its first minute. A deliberate rules change goes to doc 10 first, then to the file, and it requires a matching rules test per AGENTS.md.

## Storage

One bucket. Rules in `storage.rules` restrict reads and writes to members of the move, cap uploads at 2 MB, and require an image content type. Photo bytes never enter Firestore.

## What is secret and what is not

The web config above is committed on purpose, in `src/lib/firebase-config.ts`. It identifies the project and authorizes nothing. Authorization lives entirely in the two rules files, which is why they carry tests.

The Anthropic API key is the opposite kind of value. It stays in the password manager until APPLY-04, then enters through `firebase functions:secrets:set ANTHROPIC_API_KEY` from PowerShell. It never appears in this repository or in a chat session. The difference between these two values is the entire reason the Cloud Function exists.

One caveat on the web API key. It is not a credential, but an unrestricted key can be used by a third party to consume quota billed to this project. The mitigation is an API key restriction in the Google Cloud console, under APIs and Services then Credentials: restrict the browser key by HTTP referrer to the Hosting domain. Do this after the vertical slice deploys, since the domain does not exist before then.

## Hosting

Not configured in the console, deliberately. `firebase init hosting` handles it during APPLY-02. Setting it up in both places produces two configurations that disagree.
