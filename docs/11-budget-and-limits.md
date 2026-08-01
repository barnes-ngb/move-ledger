# Budget and Limits

Verified against Firebase pricing documentation on 2026-07-25. Pricing changes. Re-check before enabling billing.

## The one surprise

Cloud Storage for Firebase requires the Blaze pay-as-you-go plan. Since 3 February 2026 this applies to every project, including ones that stay entirely inside the free allowance. A credit card is required to store a single photo.

Blaze is not a price increase here. Buckets in `US-CENTRAL1`, `US-EAST1`, or `US-WEST1` sit under the Google Cloud Always Free tier of 5 GB-months of storage and 100 GB per month of egress to North America. This project will use roughly one percent of that.

What Blaze does remove is a hard stop. There is no spend cap. Set a budget alert.

```text
Google Cloud Console -> Billing -> Budgets & alerts
Budget: $5/month
Alerts at 50%, 90%, 100%
```

Create the bucket in `us-central1`. A bucket in another region loses the Always Free tier and starts billing immediately.

## Expected usage

Assume 300 boxes and 2 photos each.

### Cloud Storage

| Item | Value |
|---|---|
| Photos | 600 |
| Size after client-side resize to 1600px at quality 0.8 | ~200 KB |
| Total stored | ~120 MB |
| Free allowance | 5 GB-months |
| Headroom | 40x |

Without client-side resize, 600 photos at 4 MB each is 2.4 GB. Still under the free tier, but uploads over a phone hotspot become the slowest part of the app and the 20-second target dies. Resize is a performance requirement first and a cost measure second.

### Firestore

| Item | Value |
|---|---|
| Documents | ~300 containers, 600 photos, 2000 activity events, plus setup |
| Storage | well under 10 MB |
| Free allowance | 1 GiB |
| Writes on a heavy packing day | 100 boxes at ~8 writes each, ~800 |
| Free allowance | 20,000 writes/day |
| Reads | the persistent cache serves repeat reads at no cost |
| Free allowance | 50,000 reads/day |

The read allowance is the one to watch, and the local cache is what protects it. A screen that re-subscribes on every render can burn 50,000 reads faster than expected. Any `onSnapshot` inside a component body without a stable dependency array is a bug.

### Hosting

10 GB storage and 360 MB per day of transfer, free. A PWA shell is a few hundred KB. Not a concern.

### Auth

Google sign-in is free. Do not enable phone authentication, which bills per SMS.

## Cloud Functions

Not used in Phase 1 or Phase 2. If Phase 3 adds the summary function, it is one invocation per box, so roughly 300 total against a 2 million per month allowance. The model API is billed separately by the provider and is capped in the function.

## Rules that keep this near zero

1. Resize every image to a 1600px long edge at quality 0.8 before upload.
2. Never upload an original camera file.
3. Never re-upload an unchanged photo.
4. Never call the summary function twice for the same `storagePath`.
5. Subscribe with `onSnapshot` at the route level, not the component level.
6. Query the local cache for number reservation rather than the server.
7. Keep the bucket in `us-central1`.

## Realistic monthly cost

Zero, with a budget alert in place as insurance against a mistake rather than against normal use.
