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
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Persist inputs so a refresh keeps the same setup.
  useEffect(() => {
    window.localStorage.setItem(STORAGE_ID, clientId);
    window.localStorage.setItem(STORAGE_CTX, context);
  }, [clientId, context]);

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
      </section>

      <StatusBanner status={status} />

      {widgetActive && (
        // `host` is omitted on purpose — the package defaults to the
        // SaaS deploy. Set it explicitly only when you self-host
        // pretext on your own domain.
        <PretextWidget
          clientId={trimmedClientId}
          context={trimmedContext || undefined}
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
