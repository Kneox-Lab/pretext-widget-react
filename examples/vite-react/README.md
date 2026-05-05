# vite-react example

Minimal Vite + React + TypeScript app showing how to integrate
`@kneox-lab/pretext-widget` on your own site.

## Run it

```bash
cd examples/vite-react
npm install
npm run dev
```

Open `http://localhost:5173`. The page renders two inputs (client id +
optional context tag). Paste your pretext client id from
`/dashboard/embed` and the chat bubble appears in the bottom-right
corner.

## What the example covers

- The bare-minimum `<PretextWidget>` mount.
- Live config check via `/api/widget-config` so the page can show a
  real error banner when the agent is suspended, banned, capped, or
  the host origin isn't whitelisted. Without this probe, the widget
  silently hides — the example shows you what to do for a debug-
  friendly UI.
- Re-mount on `context` change (the dependency array inside
  `PretextWidget` handles it; just change the input value and watch
  the bubble cycle).
- Free-form `variables` JSON to test what ends up in the agent's
  context (and on the conversation detail page in your dashboard
  under "visitor metadata").
- HMAC-verified `identity` with the user hash computed in-browser
  via Web Crypto. **This is for testing only** — see below for the
  production pattern.
- Below the test interface, three ready-to-copy snippets showing
  the **production-ready integration** for a Next.js App Router
  site: backend route that computes the HMAC server-side, React
  component that fetches identity + variables, and how to mount it
  in the layout.

## Test mode vs production mode

The page above the "production-ready" code block runs the HMAC in
your browser using Web Crypto. **Don't ever do that in real
customer code** — the widget secret would leak to anyone who can
view-source on your page. Use it only on a localhost test page you
control.

The production pattern (the three numbered snippets at the bottom)
keeps the secret on your backend, exposes only `(userId, userHash)`
through an authenticated API route, and the React component fetches
that on mount.

## What it doesn't cover

- Imperative API (`setPretextVariables`, `setPretextIdentity`,
  `setPretextUserToken`). Useful when values land asynchronously
  after the initial mount. See the main README.

## Adapting to Next.js

The component is identical. Drop it in your root layout instead of
`App.tsx`:

```tsx
// app/layout.tsx
import { PretextWidget } from "@kneox-lab/pretext-widget";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PretextWidget clientId="..." />
      </body>
    </html>
  );
}
```

`"use client"` is preserved in the package's bundle, so the App
Router treats the component as a client component automatically.

> Self-hosting pretext on your own domain? Add
> `host="https://your-deploy.example"`. The default points at the
> SaaS deploy at `pretext.kneox-lab.com`.
