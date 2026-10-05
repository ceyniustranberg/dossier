"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/types";

interface File { id: string; title: string; createdAt: number; cards: number }

export function MyDossiers({ files: initial }: { files: File[] }) {
  const [files, setFiles] = useState(initial);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function del(id: string) {
    if (confirm !== id) return setConfirm(id);
    setConfirm(null); setError(null);
    const res = await fetch(`/api/dossiers/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setFiles((f) => f.filter((d) => d.id !== id));
    else setError((await res?.json().catch(() => null))?.error || "Couldn’t delete that dossier.");
  }

  if (!files.length) return <p className="note">No dossiers yet. Once your agent is connected, ask it for one.</p>;
  return (
    <div className="liblist">
      {files.map((d) => (
        <div className="file" key={d.id}>
          <div className="t"><b>{d.title}</b><small>{fmtDate(d.createdAt)} · {d.cards} cards</small></div>
          <Link href={`/d/${d.id}`}>Open</Link>
          <button type="button" className="del" onClick={() => del(d.id)}>{confirm === d.id ? "Really delete?" : "Delete"}</button>
        </div>
      ))}
      {error && <p className="login-error">{error}</p>}
    </div>
  );
}
