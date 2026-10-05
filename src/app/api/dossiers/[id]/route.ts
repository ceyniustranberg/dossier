import type { NextRequest } from "next/server";
import { owns, ownerGuard, repoFail, viewer } from "@/lib/auth";
import { deleteDossier, loadDossier, meta } from "@/lib/repo";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Public read: the unlisted id is the access control. Boards poll with `?rev=` and get a bodiless
 * 304 until something changes, so an idle board costs one small query per poll.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/dossiers/[id]">) {
  const { id } = await ctx.params;
  try {
    const since = Number(req.nextUrl.searchParams.get("rev"));
    if (Number.isFinite(since) && since > 0) {
      const m = await meta(id);
      if (!m) return Response.json({ error: "No such dossier." }, { status: 404, headers: NO_STORE });
      if (m.rev === since) return new Response(null, { status: 304, headers: NO_STORE });
    }
    const [d, v] = await Promise.all([loadDossier(id), viewer()]);
    if (!d) return Response.json({ error: "No such dossier." }, { status: 404, headers: NO_STORE });
    return Response.json({ dossier: d.dossier, rev: d.rev, updatedAt: d.updatedAt, isOwner: owns(v, d.owner) }, { headers: NO_STORE });
  } catch (e) {
    return repoFail(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/dossiers/[id]">) {
  const { id } = await ctx.params;
  const g = await ownerGuard(id, "board");
  if (g instanceof Response) return g;
  try {
    await deleteDossier(id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return repoFail(e);
  }
}
