import type { NextRequest } from "next/server";
import { ownerGuard, repoFail } from "@/lib/auth";
import { setCardPos } from "@/lib/repo";

const coord = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6 ? Math.round(v) : null);

/** The owner's board saves where a card sits: `{x, y}` after a drag, or `{ax, ay}` for a branch's start. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/dossiers/[id]/cards/[cid]">) {
  const { id, cid } = await ctx.params;
  const g = await ownerGuard(id, "board");
  if (g instanceof Response) return g;
  const body = await req.json().catch(() => null);
  const x = coord(body?.x), y = coord(body?.y), ax = coord(body?.ax), ay = coord(body?.ay);
  const pos = x != null && y != null ? { x, y, moved: true as const } : ax != null && ay != null ? { ax, ay } : null;
  if (!pos || cid.length > 24) return Response.json({ error: "Send {x, y} or {ax, ay}." }, { status: 400 });
  try {
    return Response.json({ rev: await setCardPos(id, cid, pos) });
  } catch (e) {
    return repoFail(e);
  }
}
