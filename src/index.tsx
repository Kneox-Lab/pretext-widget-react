"use client";

import { useEffect } from "react";

/**
 * Props for the PretextWidget component.
 *
 * Most apps only need `host` + `clientId`. Everything else is
 * optional and matches what you can pass on a plain `<script>` tag
 * (data-context, data-user-*, data-var-*).
 */
export type PretextWidgetProps = {
  /**
   * Where the pretext API is hosted. Use the value pretext gives you
   * on /dashboard/embed (typically `https://pretext.kneox-lab.com`
   * for SaaS customers, or your own host for self-deployed clients).
   * No trailing slash needed.
   */
  host: string;

  /**
   * Your pretext client id. Visible at the bottom of /dashboard/embed.
   */
  clientId: string;

  /**
   * Optional KB context tag. When set, the agent only sees knowledge-
   * base files tagged with this value (plus untagged "shared" files).
   * Useful when you embed pretext on multiple sections of your site
   * that need different scopes (e.g. landing vs in-app).
   *
   * Plan-gated server-side: requires Pro+ on the pretext side.
   * Free / Starter clients can pass it but it's silently ignored —
   * full KB used.
   */
  context?: string;

  /**
   * Verified visitor identity. The agent treats userId as trustworthy
   * (e.g. for personal-data API calls) when this is set. The hash
   * MUST be computed server-side with HMAC-SHA256 over
   * `${clientId}|${userId}` using your widget secret.
   *
   * Without identity, variables (below) are still passed but flagged
   * "unverified" to the agent.
   */
  identity?: { userId: string; userHash: string } | null;

  /**
   * Free-form key/value pairs forwarded to the agent's context. Each
   * value is stringified; keys / values are capped server-side at 200
   * chars per entry. Pick whatever names match how you think about
   * your visitors (e.g. `{ plan: "premium", country: "FR" }`).
   */
  variables?: Record<string, string | number | boolean>;

  /**
   * Optional userToken forwarded to APIs configured in `endUserBearer`
   * mode. The agent sends it as the visitor's auth token when calling
   * those tools. Never persisted server-side (the visitor's session
   * controls its lifetime).
   */
  userToken?: string;
};

type WidgetInstance = {
  root?: Element;
  context?: string | null;
  teardown?: () => void;
};

const SLOT_KEY = "__pretextChatAgent";

/**
 * Mounts the pretext chat widget on the host page.
 *
 * Behavior:
 *   - Renders nothing in the React tree. The widget is a floating
 *     bubble injected into `document.body` by the underlying
 *     `widget.js` script.
 *   - Re-mounts whenever `clientId` or `context` changes, tearing
 *     down the previous instance first to avoid duplicate bubbles
 *     when navigating between scopes (e.g. landing → app).
 *   - Tears down the widget when the component unmounts.
 *
 * Implementation note: we inject a `<script async={false}>` tag
 * dynamically rather than using <Script> from next/script. Next
 * dedups <Script> tags by `src`, which prevents the widget IIFE
 * from re-running on client-side navigation. async={false} also
 * keeps `document.currentScript` defined for the IIFE that reads
 * data attributes off the script tag.
 */
export function PretextWidget({
  host,
  clientId,
  context,
  identity,
  variables,
  userToken,
}: PretextWidgetProps) {
  // Stringify object props for the deps array so referential identity
  // doesn't trigger spurious re-mounts (Next/React render with new
  // object literals every render in many app patterns).
  const variablesKey = variables ? JSON.stringify(variables) : "";
  const identityKey = identity ? `${identity.userId}|${identity.userHash}` : "";

  useEffect(() => {
    if (!host || !clientId) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const wAny = window as unknown as Record<string, WidgetInstance | undefined>;
    const prev = wAny[SLOT_KEY];
    const desired = context ?? null;

    // If the existing instance matches the requested context, keep it
    // — avoids flicker on a re-render with the same props.
    if (prev && (prev.context ?? null) === desired) {
      return;
    }

    // Otherwise tear down the previous instance and mount fresh.
    if (prev) {
      try {
        prev.teardown?.();
      } catch {
        /* ignore */
      }
      if (prev.root && prev.root.parentNode) {
        prev.root.parentNode.removeChild(prev.root);
      }
      wAny[SLOT_KEY] = undefined;
    }

    const cleanHost = host.replace(/\/$/, "");
    const script = document.createElement("script");
    script.src = `${cleanHost}/widget.js`;
    // async = false keeps document.currentScript defined inside the
    // widget IIFE, which is how it reads its own data-* attributes.
    script.async = false;
    script.setAttribute("data-client-id", clientId);
    if (context) script.setAttribute("data-context", context);
    if (identity) {
      script.setAttribute("data-user-id", identity.userId);
      script.setAttribute("data-user-hash", identity.userHash);
    }
    if (userToken) script.setAttribute("data-user-token", userToken);
    if (variables) {
      for (const [k, v] of Object.entries(variables)) {
        script.setAttribute(`data-var-${k}`, String(v));
      }
    }
    document.body.appendChild(script);

    return () => {
      // On unmount: tear down only if our instance is still the
      // current one. If a fresher remount (different context) has
      // already replaced us, leave it alone — that one owns the
      // teardown.
      const cur = wAny[SLOT_KEY];
      if (!cur || (cur.context ?? null) !== desired) return;
      try {
        cur.teardown?.();
      } catch {
        /* ignore */
      }
      if (cur.root && cur.root.parentNode) {
        cur.root.parentNode.removeChild(cur.root);
      }
      wAny[SLOT_KEY] = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, clientId, context, identityKey, variablesKey, userToken]);

  return null;
}

/**
 * Imperative escape hatch: rotate variables on an already-mounted
 * widget without re-mounting the whole instance. Useful when the
 * visitor's identity becomes available after the widget loaded
 * (e.g. you fetch /me asynchronously after page mount).
 *
 * No-op if the widget script hasn't initialized yet.
 */
export function setPretextVariables(variables: Record<string, string>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    ChatAgent?: { setVariables?: (v: Record<string, string>) => void };
  };
  w.ChatAgent?.setVariables?.(variables);
}

/**
 * Imperative escape hatch: rotate the verified identity on an
 * already-mounted widget. Pass null to clear (e.g. on logout).
 */
export function setPretextIdentity(
  identity: { userId: string; userHash: string } | null,
): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    ChatAgent?: {
      setIdentity?: (i: { userId: string; userHash: string } | null) => void;
    };
  };
  w.ChatAgent?.setIdentity?.(identity);
}

/**
 * Imperative escape hatch: rotate the userToken on an already-mounted
 * widget (e.g. after a token refresh).
 */
export function setPretextUserToken(token: string | null): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    ChatAgent?: { setUserToken?: (t: string | null) => void };
  };
  w.ChatAgent?.setUserToken?.(token);
}
