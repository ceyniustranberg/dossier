import "server-only";
import { admin } from "./supabase/admin";
import { hashToken, looksLikeId, looksLikeToken, newId, newToken } from "./token";
import type { CardContent } from "./cards";
import type { Card, Dossier } from "./types";

/**
 * The one module that talks to the dossier tables. Callers check ownership; these functions
 * only refuse when the database is not configured or the id is malformed.
 */

export const LIMITS = { cardsPerDossier: 250, dossiersPerUser: 100 } as const;

export class RepoError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function db() {
  const c = admin();
  if (!c) throw new RepoError(503, "SUPABASE_SECRET_KEY is not set, so dossiers cannot be stored.");
  return c;
}

const fail = (e: { message: string } | null) => { if (e) throw new RepoError(500, e.message); };

// ---- dossiers --------------------------------------------------------------------------

export interface DossierMeta { id: string; owner: string; rev: number; updatedAt: number }
export interface LoadedDossier extends DossierMeta { dossier: Dossier }

type DossierRow = {
  id: string; owner: string; title: string; query: string; brief: string; angle: string;
  clusters: string[]; summary: { body?: string; takeaways?: string[] }; rev: number; created_at: string; updated_at: string;
};
type CardRow = { id: string; content: CardContent; x: number | null; y: number | null; moved: boolean; ax: number | null; ay: number | null };

export async function createDossier(owner: string, d: { query: string; brief: string; title: string; angle: string; clusters: string[] }): Promise<string> {
  const c = db();
  const { count, error: ce } = await c.from("dossiers").select("id", { count: "exact", head: true }).eq("owner", owner);
  fail(ce);
  if ((count ?? 0) >= LIMITS.dossiersPerUser) throw new RepoError(429, `You have ${count} dossiers, the limit is ${LIMITS.dossiersPerUser}. Delete some from the website first.`);
  const id = newId();
  const { error } = await c.from("dossiers").insert({ id, owner, ...d });
  fail(error);
  // The summary card's position lives in a card row like any other, so a drag of it persists the same way.
  const { error: re } = await c.from("cards").insert({ dossier_id: id, id: "root", content: { t: "summary" } });
  fail(re);
  return id;
}

export async function meta(id: string): Promise<DossierMeta | null> {
  if (!looksLikeId(id)) return null;
  const { data, error } = await db().from("dossiers").select("id, owner, rev, updated_at").eq("id", id).maybeSingle();
  fail(error);
  return data ? { id: data.id, owner: data.owner, rev: Number(data.rev), updatedAt: Date.parse(data.updated_at) } : null;
}

/** The whole dossier in the shape the board already uses. */
export async function loadDossier(id: string): Promise<LoadedDossier | null> {
  if (!looksLikeId(id)) return null;
  const c = db();
  const [{ data: d, error: de }, { data: rows, error: re }] = await Promise.all([
    c.from("dossiers").select("*").eq("id", id).maybeSingle<DossierRow>(),
    c.from("cards").select("id, content, x, y, moved, ax, ay").eq("dossier_id", id).order("seq").returns<CardRow[]>(),
  ]);
  fail(de); fail(re);
  if (!d) return null;
  const place = (r: CardRow) => ({
    x: r.x ?? 0, y: r.y ?? 0,
    ...(r.moved ? { moved: true } : {}),
    ...(r.ax != null && r.ay != null ? { ax: r.ax, ay: r.ay } : {}),
  });
  const rootRow = rows?.find((r) => r.id === "root");
  const root: Card = {
    id: "root", t: "summary", c: 0, title: d.title, angle: d.angle || undefined,
    body: d.summary?.body ?? "", takeaways: d.summary?.takeaways,
    ...(rootRow ? place(rootRow) : { x: 0, y: 0 }),
  };
  const cards: Card[] = (rows ?? []).filter((r) => r.id !== "root").map((r) => ({ ...r.content, id: r.id, ...place(r) }));
  return {
    id: d.id, owner: d.owner, rev: Number(d.rev), updatedAt: Date.parse(d.updated_at),
    dossier: { id: d.id, query: d.query, brief: d.brief, title: d.title, createdAt: Date.parse(d.created_at), clusters: d.clusters ?? [], tabs: [], cards: [root, ...cards] },
  };
}

export async function updateDossier(id: string, patch: Partial<{ title: string; angle: string; summary: { body: string; takeaways: string[] } }>) {
  const c = db();
  const { error } = await c.from("dossiers").update(patch).eq("id", id);
  fail(error);
  return bump(id);
}

export async function listDossiers(owner: string) {
  const { data, error } = await db().from("dossiers")
    .select("id, title, created_at, updated_at, cards(count)").eq("owner", owner).order("created_at", { ascending: false }).limit(LIMITS.dossiersPerUser);
  fail(error);
  return (data ?? []).map((d) => ({
    id: d.id as string, title: d.title as string, createdAt: Date.parse(d.created_at), updatedAt: Date.parse(d.updated_at),
    // the summary's own row is not a card the user wrote
    cards: Math.max(0, ((d.cards as { count: number }[])?.[0]?.count ?? 1) - 1),
  }));
}

export async function deleteDossier(id: string) {
  const { error } = await db().from("dossiers").delete().eq("id", id);
  fail(error);
}

async function bump(id: string): Promise<number> {
  const { data, error } = await db().rpc("bump", { p_dossier: id });
  fail(error);
  return Number(data);
}

// ---- cards -----------------------------------------------------------------------------

export async function cardCount(id: string): Promise<number> {
  const { count, error } = await db().from("cards").select("id", { count: "exact", head: true }).eq("dossier_id", id).neq("id", "root");
  fail(error);
  return count ?? 0;
}

/** Card titles and ids for an existing dossier, to resolve `parent`/`rel` references. */
export async function cardIds(id: string): Promise<Set<string>> {
  const { data, error } = await db().from("cards").select("id").eq("dossier_id", id);
  fail(error);
  return new Set((data ?? []).map((r) => r.id as string));
}

/** Insert cards (content only, plus an optional branch anchor) and bump the dossier's rev, atomically. */
export async function addCards(id: string, rows: { id: string; content: CardContent; ax?: number; ay?: number }[]): Promise<number> {
  if (!rows.length) return (await meta(id))?.rev ?? 0;
  const { data, error } = await db().rpc("add_cards", {
    p_dossier: id,
    p_rows: rows.map(({ id: cid, content, ax, ay }) => {
      const { id: _i, x: _x, y: _y, moved: _m, ax: _ax, ay: _ay, ...rest } = content as CardContent & Partial<Card>;
      void [_i, _x, _y, _m, _ax, _ay];
      return { id: cid, content: rest, ax: ax ?? null, ay: ay ?? null };
    }),
  });
  fail(error);
  return Number(data);
}

/** The owner's board moved a card, or chose where a branch starts. */
export async function setCardPos(id: string, cid: string, pos: { x: number; y: number; moved: true } | { ax: number; ay: number }): Promise<number> {
  const { data, error } = await db().from("cards").update(pos).eq("dossier_id", id).eq("id", cid).select("id");
  fail(error);
  if (!data?.length) throw new RepoError(404, "No such card.");
  return bump(id);
}

// ---- tokens ----------------------------------------------------------------------------

export interface TokenOwner { tokenId: string; userId: string; email: string; lastUsedAt: number | null }

/** Issue a fresh token for the user, revoking any earlier one. Returns the token, which is never stored. */
export async function issueToken(userId: string, email: string): Promise<string> {
  const c = db();
  await revokeTokens(userId);
  const token = newToken();
  const { error } = await c.from("api_tokens").insert({ user_id: userId, email, token_hash: hashToken(token) });
  fail(error);
  return token;
}

export async function revokeTokens(userId: string) {
  const { error } = await db().from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
  fail(error);
}

export async function findToken(token: string | undefined): Promise<TokenOwner | null> {
  if (!looksLikeToken(token)) return null;
  const { data, error } = await db().from("api_tokens").select("id, user_id, email, last_used_at")
    .eq("token_hash", hashToken(token)).is("revoked_at", null).maybeSingle();
  fail(error);
  return data ? { tokenId: data.id, userId: data.user_id, email: data.email, lastUsedAt: data.last_used_at ? Date.parse(data.last_used_at) : null } : null;
}

export async function touchToken(tokenId: string) {
  await db().from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenId);
}

export async function activeToken(userId: string): Promise<{ createdAt: number; lastUsedAt: number | null } | null> {
  const { data, error } = await db().from("api_tokens").select("created_at, last_used_at").eq("user_id", userId).is("revoked_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  fail(error);
  return data ? { createdAt: Date.parse(data.created_at), lastUsedAt: data.last_used_at ? Date.parse(data.last_used_at) : null } : null;
}
