# @kneox-lab/pretext-widget

React wrapper for the [pretext](https://pretext.kneox-lab.com) chat widget.

Drop a typed `<PretextWidget>` component in your Next.js / Vite / React app
instead of pasting a `<script>` tag. Same iframe under the hood, same security
isolation. You get typed props, a clean lifecycle, and automatic re-mount when
you navigate between scopes (e.g. landing vs in-app).

## Install

```bash
npm install @kneox-lab/pretext-widget
# or
pnpm add @kneox-lab/pretext-widget
# or
yarn add @kneox-lab/pretext-widget
```

If you're not on npm yet:

```bash
npm install github:Kneox-Lab/pretext-widget-react
```

## Quickstart

```tsx
import { PretextWidget } from "@kneox-lab/pretext-widget";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <PretextWidget clientId="your-client-id" />
      </body>
    </html>
  );
}
```

That's it. A floating chat bubble appears in the bottom-right corner. Click it
to open the chat. Get your `clientId` from your pretext dashboard at
`/dashboard/embed`.

> Self-hosted pretext? Add `host="https://your-pretext-deploy.example"`. The
> SaaS deploy at `pretext.kneox-lab.com` is the default.

## Multi-context (Pro+)

If your pretext plan unlocks multi-context knowledge bases, scope the agent
to a subset of your KB by passing `context`:

```tsx
// On your marketing landing
<PretextWidget host="..." clientId="..." context="landing" />

// On your in-app pages
<PretextWidget host="..." clientId="..." context="app" />
```

The agent only sees KB files tagged with this context (plus untagged "shared"
files). Tag your files in `/dashboard/knowledge`.

The component handles re-mounting when the context changes — if a visitor
navigates client-side from a landing-scoped page to an app-scoped page, the
landing widget tears down cleanly before the app widget mounts. No duplicate
bubbles.

## Verified identity (HMAC)

Compute the hash server-side with your widget secret (visible in
`/dashboard/prompt → security` on pretext):

```ts
// On your backend (Next.js route handler / Express / etc.)
import { createHmac } from "node:crypto";

const userHash = createHmac("sha256", process.env.PRETEXT_WIDGET_SECRET!)
  .update(`${clientId}|${userId}`)
  .digest("hex");
```

Then pass it to the component:

```tsx
<PretextWidget
  host="..."
  clientId="..."
  identity={{ userId: user.id, userHash }}
/>
```

The agent now treats `userId` as trustworthy — useful for personal-data API
calls, audit trails, etc.

## Variables

Inject any session info into the agent's context:

```tsx
<PretextWidget
  host="..."
  clientId="..."
  variables={{
    plan: user.plan,
    country: user.country,
    cart_items: cart.length,
  }}
/>
```

Each value is stringified, capped at 200 chars per entry server-side. Without
verified identity, variables are flagged "unverified" to the agent (good for
personalization, not for security decisions).

## Imperative API

For values that change after initial mount (token refresh, async user fetch,
etc.) without remounting the whole widget:

```ts
import {
  setPretextVariables,
  setPretextIdentity,
  setPretextUserToken,
} from "@kneox-lab/pretext-widget";

// After fetching /me asynchronously
setPretextVariables({ plan: "premium" });

// On logout
setPretextIdentity(null);

// After token refresh
setPretextUserToken(newJwt);
```

## All props

| Prop | Type | Required | Description |
|---|---|---|---|
| `clientId` | `string` | yes | Your pretext client id |
| `host` | `string` | no | Pretext host URL. Defaults to `https://pretext.kneox-lab.com`. Override for self-hosted deploys. |
| `context` | `string` | no | KB context tag (Pro+ feature) |
| `identity` | `{ userId, userHash } \| null` | no | HMAC-signed visitor identity |
| `variables` | `Record<string, string \| number \| boolean>` | no | Session context for the agent |
| `userToken` | `string` | no | Bearer token forwarded to `endUserBearer` APIs |

## How it works

The component injects a `<script>` tag pointing at `${host}/widget.js`. That
script creates an iframe pointing back at `${host}/embed/${clientId}` and
mounts a floating bubble in `document.body`. All chat traffic goes through
pretext's `/api/chat` endpoint — your bundle stays small (~3 KB) and your
styles never collide.

The component manages a single global instance via
`window.__pretextChatAgent` so it can de-dup across navigation. If you need
two widgets on the same page (rare), you'd need a different setup.

## Server-side rendering

Safe to import in server components. The `useEffect` only runs in the
browser, so SSR is a no-op. The `"use client"` banner is preserved in the
build for Next 13+ App Router compatibility.

## Working example

A complete Vite + React + TypeScript example is in
[`examples/vite-react/`](./examples/vite-react). Clone the repo and run:

```bash
git clone https://github.com/Kneox-Lab/pretext-widget-react.git
cd pretext-widget-react/examples/vite-react
npm install
npm run dev
```

The example surfaces a live error banner when the widget can't mount
(suspended account, monthly cap reached, origin not whitelisted, etc.) so
you can debug integration issues without guessing.

## License

MIT © kneox lab
