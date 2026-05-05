import { useEffect, useMemo, useState } from "react";
import { PretextWidget } from "@kneox-lab/pretext-widget";

// `host` defaults to the SaaS pretext deploy in the package itself,
// so a customer's <PretextWidget> doesn't need to repeat it. We
// only need it here for the independent /api/widget-config probe
// that powers the status banner — that fetch is host-agnostic on
// our side and could just as easily target a self-hosted deploy if
// the user changed it in their /dashboard/embed setup. Kept hard-
// coded for the example because it's clear enough as a teaching
// reference.
const HOST = "https://pretext.kneox-lab.com";
const STORAGE_ID = "pretext-example-client-id";
const STORAGE_CTX = "pretext-example-context";
const STORAGE_VARS = "pretext-example-variables";
const STORAGE_USER = "pretext-example-user-id";
const STORAGE_SECRET = "pretext-example-widget-secret";

/**
 * Compute HMAC-SHA256(secret, `${clientId}|${userId}`) in the
 * browser using Web Crypto. In production this MUST happen on your
 * backend — keeping the widget secret in client-side code defeats
 * the whole point. We only do it here because it's a localhost test
 * app the operator runs themselves.
 */
async function computeUserHash(secret: string, clientId: string, userId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${clientId}|${userId}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Live status of the widget mount. We probe `/api/widget-config`
 * independently from the widget itself so the page can show a real
 * error banner when the agent is suspended, capped, banned, or the
 * origin isn't whitelisted. Without this probe, the widget just
 * silently bails out (no bubble) and the dev wonders why.
 */
type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ready" }
  | { kind: "unavailable"; reason: string }
  | { kind: "origin-blocked" }
  | { kind: "unknown-client" }
  | { kind: "network-error"; detail: string };

export function App() {
  const [clientId, setClientId] = useState<string>(
    () => window.localStorage.getItem(STORAGE_ID) ?? "",
  );
  const [context, setContext] = useState<string>(
    () => window.localStorage.getItem(STORAGE_CTX) ?? "",
  );
  // Free-form JSON the operator pastes (or types) to test what
  // ends up in conversations.last_visitor_variables on the dashboard.
  const [variablesText, setVariablesText] = useState<string>(
    () => window.localStorage.getItem(STORAGE_VARS) ?? "",
  );
  // HMAC-verified identity (optional). The widget secret must match
  // the one shown in /dashboard/prompt → security on pretext. We
  // compute the hash in-browser via Web Crypto for this test app
  // ONLY — never do this in real customer code, the secret would
  // leak. Production: hash on your backend, send (userId, userHash)
  // to your frontend, pass to PretextWidget.
  const [userId, setUserId] = useState<string>(
    () => window.localStorage.getItem(STORAGE_USER) ?? "",
  );
  const [widgetSecret, setWidgetSecret] = useState<string>(
    () => window.localStorage.getItem(STORAGE_SECRET) ?? "",
  );
  const [computedHash, setComputedHash] = useState<string>("");
  const [hashError, setHashError] = useState<string>("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Persist inputs so a refresh keeps the same setup.
  useEffect(() => {
    window.localStorage.setItem(STORAGE_ID, clientId);
    window.localStorage.setItem(STORAGE_CTX, context);
    window.localStorage.setItem(STORAGE_VARS, variablesText);
    window.localStorage.setItem(STORAGE_USER, userId);
    window.localStorage.setItem(STORAGE_SECRET, widgetSecret);
  }, [clientId, context, variablesText, userId, widgetSecret]);

  // Recompute the HMAC hash whenever the inputs change. Async via
  // Web Crypto, debounced naturally because subtle.sign returns
  // quickly enough on a single short string.
  useEffect(() => {
    const trimmedSecret = widgetSecret.trim();
    const trimmedUser = userId.trim();
    const trimmedClient = clientId.trim();
    if (!trimmedSecret || !trimmedUser || !trimmedClient) {
      setComputedHash("");
      setHashError("");
      return;
    }
    let cancelled = false;
    computeUserHash(trimmedSecret, trimmedClient, trimmedUser)
      .then((hash) => {
        if (cancelled) return;
        setComputedHash(hash);
        setHashError("");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setComputedHash("");
        setHashError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [widgetSecret, userId, clientId]);

  // Parse the variables JSON. Empty input = undefined (no variables
  // sent). Invalid JSON = error shown next to the input but we don't
  // unmount the widget — it still works without variables.
  const { parsedVariables, variablesError } = useMemo(() => {
    const raw = variablesText.trim();
    if (!raw) return { parsedVariables: undefined, variablesError: null };
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { parsedVariables: undefined, variablesError: "Must be a JSON object." };
      }
      // Coerce all values to strings (the widget API accepts string |
      // number | boolean; pretext stringifies server-side anyway).
      const coerced: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        coerced[k] = String(v);
      }
      return { parsedVariables: coerced, variablesError: null };
    } catch (e) {
      return {
        parsedVariables: undefined,
        variablesError: `Invalid JSON: ${(e as Error).message}`,
      };
    }
  }, [variablesText]);

  // Independent probe of /api/widget-config. Same endpoint the
  // widget hits internally on mount; we ping it ourselves so the
  // banner can distinguish "ready" from "silently bailed out".
  useEffect(() => {
    if (!clientId.trim()) {
      setStatus({ kind: "idle" });
      return;
    }
    setStatus({ kind: "checking" });
    const ctrl = new AbortController();
    const url = `${HOST}/api/widget-config?clientId=${encodeURIComponent(clientId.trim())}`;
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 403) {
          setStatus({ kind: "origin-blocked" });
          return;
        }
        if (res.status === 404) {
          setStatus({ kind: "unknown-client" });
          return;
        }
        if (!res.ok) {
          setStatus({
            kind: "network-error",
            detail: `HTTP ${res.status}`,
          });
          return;
        }
        const data = (await res.json()) as {
          available?: boolean;
          unavailableReason?: string;
        };
        if (data.available === false) {
          setStatus({
            kind: "unavailable",
            reason: data.unavailableReason ?? "unknown",
          });
          return;
        }
        setStatus({ kind: "ready" });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : String(err);
        setStatus({ kind: "network-error", detail: msg });
      });
    return () => ctrl.abort();
  }, [clientId]);

  const trimmedClientId = clientId.trim();
  const trimmedContext = context.trim();
  const widgetActive = status.kind === "ready" && trimmedClientId.length > 0;

  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "64px 24px",
      }}
    >
      <header style={{ marginBottom: 40 }}>
        <code
          style={{
            fontSize: 12,
            letterSpacing: "0.04em",
            color: "#71717a",
            textTransform: "uppercase",
          }}
        >
          @kneox-lab/pretext-widget
        </code>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "8px 0 0",
          }}
        >
          Embed example
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#52525b",
            margin: "10px 0 0",
            lineHeight: 1.55,
          }}
        >
          Paste your pretext client id below. The chat bubble appears in the
          bottom-right corner once the config check passes. Use this page as a
          template for your own React or Next.js app.
        </p>
      </header>

      <section style={{ display: "grid", gap: 16 }}>
        <Input
          label="client id"
          value={clientId}
          onChange={setClientId}
          placeholder="paste from /dashboard/embed"
        />
        <Input
          label="context (optional, Pro+)"
          value={context}
          onChange={setContext}
          placeholder='e.g. "app" or "landing"'
          hint="Filters retrieval to KB files tagged with this context. Leave empty to use the full knowledge base."
        />
        <VariablesInput
          value={variablesText}
          onChange={setVariablesText}
          error={variablesError}
        />
      </section>

      <IdentitySection
        userId={userId}
        setUserId={setUserId}
        widgetSecret={widgetSecret}
        setWidgetSecret={setWidgetSecret}
        computedHash={computedHash}
        hashError={hashError}
      />

      <StatusBanner status={status} />

      <ProductionExample
        clientId={trimmedClientId || "your-client-id"}
        variables={parsedVariables}
      />

      {widgetActive && (
        // `host` is omitted on purpose — the package defaults to the
        // SaaS deploy. Set it explicitly only when you self-host
        // pretext on your own domain.
        <PretextWidget
          clientId={trimmedClientId}
          context={trimmedContext || undefined}
          variables={parsedVariables}
          identity={
            computedHash && userId.trim()
              ? { userId: userId.trim(), userHash: computedHash }
              : null
          }
        />
      )}
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.04em",
          color: "#71717a",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        style={{
          width: "100%",
          padding: "10px 12px",
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 13,
          color: "#18181b",
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 6,
          outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#65a30d")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#e4e4e7")}
      />
      {hint && (
        <span
          style={{
            display: "block",
            fontSize: 11.5,
            color: "#a1a1aa",
            marginTop: 4,
            lineHeight: 1.45,
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function IdentitySection({
  userId,
  setUserId,
  widgetSecret,
  setWidgetSecret,
  computedHash,
  hashError,
}: {
  userId: string;
  setUserId: (v: string) => void;
  widgetSecret: string;
  setWidgetSecret: (v: string) => void;
  computedHash: string;
  hashError: string;
}) {
  return (
    <section
      style={{
        marginTop: 32,
        padding: 16,
        background: "#fef9c3",
        border: "1px solid #fde047",
        borderRadius: 6,
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <code
          style={{
            fontSize: 11,
            letterSpacing: "0.04em",
            color: "#854d0e",
            textTransform: "uppercase",
          }}
        >
          verified identity (HMAC) · test only
        </code>
        <p
          style={{
            fontSize: 12,
            color: "#713f12",
            margin: "6px 0 0",
            lineHeight: 1.5,
          }}
        >
          The agent treats `userId` as authoritative when a valid
          HMAC hash accompanies it. We compute the hash in-browser
          here for testing convenience. In production, hash on your
          backend so the secret never leaves your server.
        </p>
      </header>
      <div style={{ display: "grid", gap: 12 }}>
        <Input
          label="user id (your visitor's id)"
          value={userId}
          onChange={setUserId}
          placeholder="e.g. user-42, alice@example.com"
        />
        <Input
          label="widget secret (from /dashboard/prompt → security)"
          value={widgetSecret}
          onChange={setWidgetSecret}
          placeholder="paste the 64-char hex secret"
          hint="Visible in your pretext dashboard. Stored in localStorage on this test page only."
        />
        <div>
          <span
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: "#854d0e",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            computed userHash (HMAC-SHA256)
          </span>
          <code
            style={{
              display: "block",
              padding: "8px 10px",
              background: "#fff",
              border: "1px solid #fde047",
              borderRadius: 4,
              fontSize: 11.5,
              wordBreak: "break-all",
              color: hashError ? "#991b1b" : computedHash ? "#166534" : "#a1a1aa",
              minHeight: "1.5em",
            }}
          >
            {hashError || computedHash || "fill in user id + widget secret"}
          </code>
        </div>
      </div>
    </section>
  );
}

function VariablesInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.04em",
          color: "#71717a",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        variables (optional, JSON)
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='{ "plan": "premium", "country": "FR" }'
        spellCheck={false}
        rows={4}
        style={{
          width: "100%",
          padding: "10px 12px",
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 13,
          color: "#18181b",
          background: "#fff",
          border: `1px solid ${error ? "#dc2626" : "#e4e4e7"}`,
          borderRadius: 6,
          outline: "none",
          resize: "vertical",
        }}
      />
      <span
        style={{
          display: "block",
          fontSize: 11.5,
          color: error ? "#dc2626" : "#a1a1aa",
          marginTop: 4,
          lineHeight: 1.45,
        }}
      >
        {error
          ? error
          : "Forwarded to the agent's context. Each value gets stringified server-side. Visible on the conversation detail page (visitor metadata block)."}
      </span>
    </label>
  );
}

function StatusBanner({ status }: { status: Status }) {
  const cfg = useMemo(() => describeStatus(status), [status]);
  if (!cfg) return null;
  return (
    <div
      role={cfg.tone === "error" ? "alert" : undefined}
      style={{
        marginTop: 32,
        padding: "12px 14px",
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 6,
        color: cfg.fg,
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <strong style={{ display: "block", marginBottom: cfg.detail ? 4 : 0 }}>
        {cfg.title}
      </strong>
      {cfg.detail && (
        <span style={{ display: "block", color: cfg.fg, opacity: 0.85 }}>
          {cfg.detail}
        </span>
      )}
    </div>
  );
}

type StatusUI = {
  tone: "neutral" | "ok" | "warn" | "error";
  bg: string;
  border: string;
  fg: string;
  title: string;
  detail?: string;
};

function describeStatus(status: Status): StatusUI | null {
  switch (status.kind) {
    case "idle":
      return null;
    case "checking":
      return {
        tone: "neutral",
        bg: "#fafafa",
        border: "#e4e4e7",
        fg: "#52525b",
        title: "Checking widget config…",
      };
    case "ready":
      return {
        tone: "ok",
        bg: "#f0fdf4",
        border: "#86efac",
        fg: "#166534",
        title: "Widget mounted.",
        detail: "Look for the floating bubble in the bottom-right corner.",
      };
    case "unavailable":
      return {
        tone: "warn",
        bg: "#fff7ed",
        border: "#fdba74",
        fg: "#9a3412",
        title: humanizeReason(status.reason),
        detail:
          "The widget will silently hide on a real visitor's page. Resolve the underlying issue in your dashboard, then refresh.",
      };
    case "origin-blocked":
      return {
        tone: "error",
        bg: "#fef2f2",
        border: "#fca5a5",
        fg: "#991b1b",
        title: "Origin not allowed.",
        detail:
          "Add localhost:5173 to your allowed origins in /dashboard/prompt → security, or clear the list to allow any origin during testing.",
      };
    case "unknown-client":
      return {
        tone: "error",
        bg: "#fef2f2",
        border: "#fca5a5",
        fg: "#991b1b",
        title: "Unknown client id.",
        detail: "Check /dashboard/embed for the right value.",
      };
    case "network-error":
      return {
        tone: "error",
        bg: "#fef2f2",
        border: "#fca5a5",
        fg: "#991b1b",
        title: "Network error.",
        detail: status.detail,
      };
  }
}

/**
 * Production-ready integration example. Three numbered code blocks
 * showing how to wire the widget on a real Next.js / React site
 * with verified identity. The current page above is a TEST harness
 * (web-crypto in browser, secret in localStorage) — do not copy
 * that for a real customer deploy. Copy what's below instead.
 *
 * Reflects the actual variable keys the user tested above (when any)
 * so the copied code maps 1:1 to their experiment. Default sample
 * (plan / country / cart_items) shows up only when no variables
 * are set on the test page.
 */
function ProductionExample({
  clientId,
  variables,
}: {
  clientId: string;
  variables: Record<string, string> | undefined;
}) {
  // Build the `variables: { ... }` block in the backend code,
  // reusing the keys the user typed in the test page above. Shows
  // the connection between "what I just tested" and "what I'd
  // write in production". Falls back to a generic example when no
  // variables were entered.
  const variablesBlock = (() => {
    const keys = variables ? Object.keys(variables) : [];
    if (keys.length === 0) {
      return `      // Anything you want the agent to see. Strings only.
      plan: session.plan ?? "free",
      country: session.country ?? "FR",
      cart_items: String(session.cart?.length ?? 0),`;
    }
    // Identifier-safe keys can be written without quotes; otherwise
    // we'd need to quote them. Same shape either way works in JS.
    const lines = keys.map((k) => {
      const safe = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k);
      const left = safe ? k : JSON.stringify(k);
      return `      ${left}: session.${safe ? k : `[${JSON.stringify(k)}]`} ?? "",`;
    });
    return `      // Keys taken from your test above. Replace the right side
      // with whatever you actually have on \`session\` / your DB.
${lines.join("\n")}`;
  })();

  const backendCode =
`// app/api/widget-identity/route.ts (Next.js App Router)
import { createHmac } from "node:crypto";

const PRETEXT_CLIENT_ID = process.env.PRETEXT_CLIENT_ID!;
const PRETEXT_WIDGET_SECRET = process.env.PRETEXT_WIDGET_SECRET!;

export async function GET() {
  // Replace with your real auth (next-auth, custom session, JWT, etc.)
  const session = await getSession();
  if (!session) {
    // Anonymous visitor: no verified identity, no variables.
    return Response.json({ identity: null, variables: {} });
  }

  // HMAC-SHA256(secret, "<clientId>|<userId>") in hex.
  const userHash = createHmac("sha256", PRETEXT_WIDGET_SECRET)
    .update(\`\${PRETEXT_CLIENT_ID}|\${session.userId}\`)
    .digest("hex");

  return Response.json({
    identity: { userId: session.userId, userHash },
    variables: {
${variablesBlock}
    },
  });
}`;

  const componentCode =
`// components/ChatWidget.tsx
"use client";

import { useEffect, useState } from "react";
import { PretextWidget } from "@kneox-lab/pretext-widget";

type Identity = { userId: string; userHash: string } | null;
type Vars = Record<string, string>;

export function ChatWidget() {
  const [identity, setIdentity] = useState<Identity>(null);
  const [variables, setVariables] = useState<Vars>({});

  useEffect(() => {
    fetch("/api/widget-identity")
      .then((r) => r.json())
      .then((data: { identity: Identity; variables: Vars }) => {
        setIdentity(data.identity);
        setVariables(data.variables);
      })
      .catch(() => {
        // Anon fallback: widget still mounts, just without
        // verified identity / variables.
      });
  }, []);

  return (
    <PretextWidget
      clientId="${clientId}"
      identity={identity}
      variables={variables}
    />
  );
}`;

  const layoutCode =
`// app/layout.tsx
import { ChatWidget } from "@/components/ChatWidget";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}`;

  return (
    <details
      style={{
        marginTop: 32,
        background: "#fafafa",
        border: "1px solid #e4e4e7",
        borderRadius: 8,
      }}
    >
      <summary
        style={{
          padding: "14px 18px",
          cursor: "pointer",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: 12,
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.04em",
            color: "#71717a",
            textTransform: "uppercase",
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          }}
        >
          production-ready code · copy / paste
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "#a1a1aa",
          }}
        >
          click to expand
        </span>
      </summary>
      <div style={{ padding: "0 20px 20px", borderTop: "1px solid #e4e4e7" }}>
        <p
          style={{
            fontSize: 13,
            color: "#52525b",
            margin: "16px 0 0",
            lineHeight: 1.55,
          }}
        >
          The form above runs the HMAC in your browser for testing.
          Production must compute the hash server-side so the widget
          secret never reaches the browser. Three pieces below for a
          Next.js App Router site. Adapt to your stack as needed.
        </p>
        <p
          style={{
            fontSize: 12,
            color: "#71717a",
            margin: "8px 0 16px",
            lineHeight: 1.5,
          }}
        >
          Set <code>PRETEXT_CLIENT_ID</code> and{" "}
          <code>PRETEXT_WIDGET_SECRET</code> in your env (server-side
          only, never expose to the client). The secret comes from
          your pretext dashboard at{" "}
          <code>/dashboard/prompt → security</code>.
        </p>

        <NumberedCode
          n={1}
          title="Backend route — computes the HMAC"
          language="ts"
          code={backendCode}
        />
        <NumberedCode
          n={2}
          title="React component — fetches identity, mounts the widget"
          language="tsx"
          code={componentCode}
        />
        <NumberedCode
          n={3}
          title="Use it in your layout"
          language="tsx"
          code={layoutCode}
        />
      </div>
    </details>
  );
}

function NumberedCode({
  n,
  title,
  code,
  language,
}: {
  n: number;
  title: string;
  code: string;
  language: string;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            width: 22,
            height: 22,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
            background: "#dcfce7",
            color: "#166534",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {n}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>
          {title}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            letterSpacing: "0.04em",
            color: "#a1a1aa",
            textTransform: "uppercase",
          }}
        >
          {language}
        </span>
      </div>
      <CopyableCode code={code} />
    </div>
  );
}

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // clipboard API can fail on insecure origins or denied perms.
        // Ignore silently — the user can still ctrl-c manually.
      });
  }

  return (
    <div style={{ position: "relative" }}>
      <pre
        style={{
          background: "#18181b",
          color: "#e4e4e7",
          padding: "14px 16px",
          paddingTop: 38,
          borderRadius: 6,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 12,
          lineHeight: 1.5,
          overflowX: "auto",
          margin: 0,
          whiteSpace: "pre",
        }}
      >
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          padding: "4px 10px",
          fontSize: 11,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          background: copied ? "#166534" : "#27272a",
          color: copied ? "#bbf7d0" : "#e4e4e7",
          border: "1px solid #3f3f46",
          borderRadius: 4,
          cursor: "pointer",
          transition: "background 0.15s, color 0.15s",
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

/** Map server-side `unavailableReason` codes to human sentences. */
function humanizeReason(code: string): string {
  switch (code) {
    case "suspended":
      return "Account suspended.";
    case "not_activated":
      return "Account not activated yet.";
    case "monthly_cap_reached":
      return "Monthly message limit reached.";
    case "over_cap_files":
      return "Too many KB files for this plan.";
    case "over_cap_apis":
      return "Too many APIs for this plan.";
    case "banned":
      return "Visitor banned.";
    default:
      return `Widget unavailable: ${code}`;
  }
}
