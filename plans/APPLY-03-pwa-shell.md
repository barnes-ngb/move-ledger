# APPLY-03: Tailwind, PWA shell, auth gate, first deploy

For Claude Code. Read the whole file before running anything. APPLY-01 and APPLY-02 are merged on `main`.

## What this does

Turns the repository into an installable app that two people can sign into on their phones. Tailwind v4, a service worker and manifest, a Google sign-in gate, the sync indicator from doc 04 screen 9, and a first deploy to Firebase Hosting.

It also fixes a real bug in `watchMoves` and puts the signed-in user's uid on screen, which is the missing piece of the onboarding step in `decisions/0005-google-sign-in-two-accounts.md`.

## What this does not do

No Add box, no Find, no box detail, no first-run setup. Those are APPLY-04. No photos, no Cloud Function. Do not start them.

The app after this file does exactly one useful thing: it proves sign-in, install, and offline shell work on the real devices.

## Verified against

**NOT built or run before delivery.** Unlike APPLY-01 and APPLY-02, none of this was compiled before it reached you. It is written against React 19.2, Vite 8, Tailwind 4, and vite-plugin-pwa 1.x as resolved on this machine.

Treat a typecheck failure as expected rather than alarming, report it, and fix it in place. That permission applies to this file only, and only to compile errors. A behavior change still needs a conversation.

## Governing docs

- `docs/04-screen-specifications.md` section 9 governs the sync indicator, including the rule that unsynced data is never presented as lost or provisional.
- `decisions/0005-google-sign-in-two-accounts.md` governs auth.
- `docs/05-system-architecture.md` for layer boundaries. UI never imports `firebase/firestore` directly.
- `AGENTS.md` for everything else.

## Preconditions. Stop if any fails.

1. On `main`, clean tree, `git pull` done.
2. `npm run verify` green.
3. `src/lib/firebase-config.ts` contains real values, no `FILL_ME`.
4. `firebase login` has been completed by the human.

```powershell
git checkout -b feat/pwa-shell
```

## Step 1: dependencies

```powershell
npm install firebase
npm install -D tailwindcss @tailwindcss/vite vite-plugin-pwa sharp
```

`firebase` is already present; the line is harmless and guards against a partial install. `sharp` rasterizes the app icons and pulls a prebuilt binary, so it needs no compiler and no administrator rights.

## Step 2: the watchMoves fix

`src/repositories/moves.ts` currently subscribes to the whole `moves` collection unfiltered, with a comment claiming the security rules narrow the result. That is wrong. Firestore rules are not filters. A list query is evaluated per document and the whole query fails if any returned document would be denied. It works today only because every move in the database belongs to the signed-in user.

Change the import line to include `where`:

```ts
import { collection, deleteDoc, doc, where } from "firebase/firestore";
```

Replace the `watchMoves` function and its comment with:

```ts
/**
 * Filtered on memberUids rather than relying on the rules to narrow the
 * result. Firestore rules are not filters: an unfiltered list query fails
 * outright the moment it touches a document the caller cannot read. The
 * query and firestore.rules now assert the same thing.
 */
export function watchMoves(uid: string, onData: (m: Move[]) => void): () => void {
  return subscribeValidated(moves(), moveSchema, onData, undefined, where("memberUids", "array-contains", uid));
}
```

`array-contains` on a single field needs no composite index. Nothing calls `watchMoves` yet, so the signature change breaks nothing.

## Step 3: package.json

Add to `scripts`:

```json
"icons": "node scripts/icons.mjs"
```

## Step 4: write these files

`vite.config.ts`, `src/App.tsx`, and `src/index.css` REPLACE what the Vite template left. Everything else is new.

Then delete the template leftovers:

```powershell
Remove-Item -ErrorAction SilentlyContinue src\App.css
Remove-Item -ErrorAction SilentlyContinue -Recurse src\assets
```

### `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Move Ledger",
        short_name: "Boxes",
        description: "Box tracking for one household move.",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        // Firestore and Storage traffic must never be intercepted. The SDK
        // has its own offline layer and a cached response would fight it.
        navigateFallbackDenylist: [/^\/__/],
      },
    }),
  ],
});
```

### `scripts/icons.mjs`

```js
/**
 * Rasterizes public/icon.svg into the PNG sizes Android and iOS require for
 * an install prompt. Run once, or after editing the SVG. The outputs are
 * committed so a clean clone does not need sharp to build.
 */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const src = "public/icon.svg";
const targets = [
  ["public/pwa-192.png", 192],
  ["public/pwa-512.png", 512],
  ["public/pwa-512-maskable.png", 512],
  ["public/apple-touch-icon.png", 180],
];

await mkdir("public", { recursive: true });
for (const [out, size] of targets) {
  await sharp(src).resize(size, size).png().toFile(out);
  console.log(`wrote ${out}`);
}
```

### `public/icon.svg`

Full bleed on purpose, so the same image works as a maskable icon without a safe-area crop eating the number.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#0f172a"/>
  <rect x="116" y="152" width="280" height="220" rx="14" fill="none" stroke="#38bdf8" stroke-width="18"/>
  <path d="M116 214 h280" stroke="#38bdf8" stroke-width="18"/>
  <text x="256" y="330" font-family="Helvetica, Arial, sans-serif" font-size="112" font-weight="700"
        fill="#e2e8f0" text-anchor="middle">042</text>
</svg>
```

### `index.html`

Replace the template's file. The viewport line matters: `viewport-fit=cover` plus the safe-area padding in the shell keeps the primary action clear of the home indicator.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0f172a" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>Move Ledger</title>
  </head>
  <body class="bg-slate-900">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `src/index.css`

```css
@import "tailwindcss";

/* Tailwind v4 takes theme values from CSS, not a JS config file. */
@theme {
  --color-ink: #0f172a;
  --color-paper: #e2e8f0;
}

html,
body,
#root {
  height: 100%;
}

body {
  /* The app is a tool used standing up in a garage. No rubber-band scroll. */
  overscroll-behavior: none;
  -webkit-tap-highlight-color: transparent;
}
```

### `src/hooks/useAuth.ts`

```ts
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { watchAuth } from "../auth";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User };

/**
 * The gate every screen sits behind. `loading` is a real state rather than a
 * flash of the sign-in screen, because Firebase resolves the persisted
 * session asynchronously on every cold start.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  useEffect(
    () => watchAuth((user) => setState(user ? { status: "signedIn", user } : { status: "signedOut" })),
    []
  );
  return state;
}
```

### `src/hooks/useOnline.ts`

```ts
import { useEffect, useState } from "react";

/**
 * Connectivity as the browser reports it. This is not Firestore's sync state,
 * which the SDK does not expose. It is honest about what it knows: whether
 * the device has a network, not whether every write has landed.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return online;
}
```

### `src/ui/SyncIndicator.tsx`

```tsx
import { useOnline } from "../hooks/useOnline";

/**
 * Doc 04 screen 9. The wording is deliberate: offline data is held, not lost,
 * not pending, not unsaved. A user who believes their work might vanish will
 * stop trusting the app, and that costs more than any bug.
 */
export function SyncIndicator() {
  const online = useOnline();
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium " +
        (online ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200")
      }
    >
      <span className={"size-2 rounded-full " + (online ? "bg-emerald-400" : "bg-amber-300")} />
      {online ? "Synced" : "Offline, changes held here"}
    </span>
  );
}
```

### `src/ui/SignIn.tsx`

```tsx
import { useState } from "react";
import { signInWithGoogle } from "../auth";

/**
 * One button. Doc 04 has no sign-in screen because ADR-0005 reduced it to
 * this. The error line exists because a closed or blocked popup is silent
 * otherwise, and a user who taps and sees nothing taps again forever.
 */
export function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
      setError(
        code === "auth/popup-blocked"
          ? "The browser blocked the sign-in window. Allow popups for this site and try again."
          : code === "auth/popup-closed-by-user"
            ? "Sign-in was cancelled."
            : "Sign-in failed. Check the connection and try again."
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 p-8 text-center">
      <div>
        <h1 className="text-3xl font-semibold text-slate-100">Move Ledger</h1>
        <p className="mt-2 text-slate-400">Boxes for the move to DFW.</p>
      </div>
      <button
        onClick={onSignIn}
        disabled={busy}
        className="min-h-16 w-full max-w-xs rounded-2xl bg-sky-500 px-6 text-lg font-semibold text-slate-950 disabled:opacity-60"
      >
        {busy ? "Signing in" : "Sign in with Google"}
      </button>
      {error ? <p className="max-w-xs text-sm text-amber-300">{error}</p> : null}
    </div>
  );
}
```

### `src/ui/Account.tsx`

```tsx
import { useState } from "react";
import type { User } from "firebase/auth";
import { signOut } from "../auth";

/**
 * Exists for one reason. ADR-0005 onboards the second member by having the
 * first add her uid to the move, and there is otherwise no way to see a uid
 * without a console. This is the couch step.
 */
export function Account({ user }: { user: User }) {
  const [copied, setCopied] = useState(false);

  async function copyUid() {
    await navigator.clipboard.writeText(user.uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <p className="text-sm text-slate-400">Signed in as</p>
        <p className="text-lg text-slate-100">{user.displayName ?? user.email ?? "Unknown"}</p>
      </div>

      <div>
        <p className="text-sm text-slate-400">Your account id</p>
        <p className="mt-1 break-all rounded-lg bg-slate-800 p-3 font-mono text-sm text-slate-200">{user.uid}</p>
        <button
          onClick={copyUid}
          className="mt-3 min-h-12 rounded-xl bg-slate-700 px-5 font-medium text-slate-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="text-sm text-slate-400">
        Boxes, rooms, and search arrive in the next build. This one exists to prove sign-in and installation
        work on this phone.
      </p>

      <button onClick={() => void signOut()} className="min-h-12 self-start text-slate-400 underline">
        Sign out
      </button>
    </div>
  );
}
```

### `src/App.tsx`

```tsx
import { useAuth } from "./hooks/useAuth";
import { Account } from "./ui/Account";
import { SignIn } from "./ui/SignIn";
import { SyncIndicator } from "./ui/SyncIndicator";

export default function App() {
  const auth = useAuth();

  return (
    <div
      className="flex h-full flex-col bg-slate-900 text-slate-100"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <span className="font-semibold">Move Ledger</span>
        {auth.status === "signedIn" ? <SyncIndicator /> : null}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {auth.status === "loading" ? (
          <div className="flex min-h-full items-center justify-center text-slate-500">Loading</div>
        ) : auth.status === "signedOut" ? (
          <SignIn />
        ) : (
          <Account user={auth.user} />
        )}
      </main>
    </div>
  );
}
```

### `src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

## Step 5: generate icons

```powershell
npm run icons
```

Four PNGs land in `public/`. They are committed, so a clean clone builds without running sharp.

## Step 6: verify and build

```powershell
npm run verify
npm run build
```

`verify` must stay at 47 tests. If `tsc` reports errors in the new files, fix them and report what you changed. If it reports errors in `src/domain`, stop, because nothing here should have touched it.

## Step 7: deploy

```powershell
firebase deploy --only hosting
```

Report the Hosting URL.

## Step 8: commit

```powershell
git add -A
git commit -m "feat(pwa): Tailwind, service worker, auth gate, sync indicator, first deploy"
```

Push and give the compare URL. Do not merge.

## Step 9: doc updates, same branch

- `plans/README.md`: add an APPLY-03 row.
- `plans/STATUS.md`: record that the slice is split into APPLY-03 and APPLY-04, that the photo pipeline is now APPLY-05 and the Cloud Function APPLY-06, and add the `watchMoves` bug and its fix under Known drift.
- `plans/APPLY-02-firebase-repositories.md` references the old numbering in its comments. Leave the file alone and note the renumbering in `plans/README.md` instead. A spent plan is a record, not a document to maintain.

## What the human does after this

Not the agent's work. Listed so the agent does not attempt it.

1. Open the Hosting URL on both phones in Chrome or Safari.
2. Sign in. **This is the real test of this file.** Popup sign-in inside an installed PWA is the one thing here most likely to misbehave, and it is better to find out now than with four screens on top of it.
3. Install to the home screen. Android offers a prompt; iOS needs Share then Add to Home Screen.
4. Open from the home screen and sign in again if asked.
5. Turn on airplane mode and reopen. The shell should load and the indicator should read the offline wording.
6. Copy Shelly's uid from her phone. Nathan needs it for the first-run setup in APPLY-04.

If sign-in fails inside the installed app specifically, that is a finding, not a bug to work around. ADR-0005 chose popup over redirect deliberately and reversing it is a decision, not a patch.
