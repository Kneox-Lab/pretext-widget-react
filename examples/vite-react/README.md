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

## What it doesn't cover

- Verified identity (HMAC). See the main README for the snippet.
- Imperative API (`setPretextVariables`, `setPretextIdentity`,
  `setPretextUserToken`). Useful when values land asynchronously
  after the initial mount.

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
