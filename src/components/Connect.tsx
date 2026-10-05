"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/types";

interface Props { origin: string; hasToken: boolean; tokenCreatedAt: number | null; tokenLastUsedAt: number | null }

/** The connect command, with the personal token filled in the one time it is visible. */
export function Connect({ origin, hasToken, tokenCreatedAt, tokenLastUsedAt }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [active, setActive] = useState(hasToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const url = `${origin}/api/mcp`, shown = token ?? "<your token>";
  const cli = `claude mcp add --transport http dossier ${url} \\\n  --header "Authorization: Bearer ${shown}"`;
  const json = JSON.stringify({ mcpServers: { dossier: { type: "http", url, headers: { Authorization: `Bearer ${shown}` } } } }, null, 2);

  async function call(method: "POST" | "DELETE") {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/token", { method });
      const j = method === "POST" ? await res.json().catch(() => ({})) : {};
      if (!res.ok) throw new Error(j.error || "The server returned an error.");
      if (method === "POST") { setToken(j.token); setActive(true); } else { setToken(null); setActive(false); }
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="connect-panel">
      <p className="label">Claude Code</p>
      <div className="cmd-row">
        <pre className="cmd">{cli}</pre>
        <button className="btn" type="button" onClick={() => copy("cli", cli)} disabled={!token}>{copied === "cli" ? "Copied" : "Copy"}</button>
      </div>
      <details>
        <summary>Other agents (JSON config)</summary>
        <div className="cmd-row">
          <pre className="cmd">{json}</pre>
          <button className="btn" type="button" onClick={() => copy("json", json)} disabled={!token}>{copied === "json" ? "Copied" : "Copy"}</button>
        </div>
      </details>

      {token ? (
        <p className="note warn">This is the only time the token is shown. Copy the command now; if you lose it, generate a new one.</p>
      ) : active ? (
        <p className="note">
          You have a token{tokenCreatedAt ? ` from ${fmtDate(tokenCreatedAt)}` : ""}
          {tokenLastUsedAt ? `, last used ${fmtDate(tokenLastUsedAt)}` : ", not used yet"}. It isn’t shown again; generate a new one to see a token (the old one stops working).
        </p>
      ) : (
        <p className="note">Generate a token to fill in the command.</p>
      )}
      <div className="row">
        <button className="btn primary" type="button" disabled={busy} onClick={() => call("POST")}>{active ? "Generate a new token" : "Generate token"}</button>
        {active && <button className="btn" type="button" disabled={busy} onClick={() => call("DELETE")}>Revoke</button>}
      </div>
      {error && <p className="login-error">{error}</p>}
    </div>
  );
}
