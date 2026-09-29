"use client";

import { useState, type FormEvent } from "react";

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("Sign in to run development actions.");
  const [pending, setPending] = useState(false);

  async function request(path: string, body?: unknown) {
    setPending(true);
    try {
      const response = await fetch(path, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json() as { error?: string };
      setMessage(response.ok ? (path.endsWith("login") ? "Signed in." : JSON.stringify(result)) : (result.error ?? "Request failed."));
    } catch {
      setMessage("Request failed. Check the network and try again.");
    } finally { setPending(false); }
  }

  function login(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void request("/api/admin/login", { secret }); }

  return <><h1>Development admin</h1><p>Serverless crawl requests are bounded and may time out. Use <code>npm run crawl</code> for reliable long crawls, then <code>npm run reindex</code> if needed.</p><form onSubmit={login}><label htmlFor="secret">Admin secret</label><input id="secret" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} required /><button disabled={pending}>Sign in</button></form><p aria-live="polite" className="notice">{message}</p><p><button disabled={pending} onClick={() => void request("/api/admin/crawl")}>Run bounded crawl</button> <button disabled={pending} onClick={() => void request("/api/admin/reindex")}>Re-index stored pages</button></p></>;
}
