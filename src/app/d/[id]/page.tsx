import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DossierView } from "@/components/DossierView";
import { owns, viewer } from "@/lib/auth";
import { EXAMPLE } from "@/lib/example";
import { loadDossier } from "@/lib/repo";

// Unlisted links: keep them out of search engines, whatever the dossier says about itself.
export const metadata: Metadata = { title: "Dossier", robots: { index: false, follow: false } };

export default async function DossierPage({ params }: PageProps<"/d/[id]">) {
  const { id } = await params;
  if (id === "example") return <DossierView initial={EXAMPLE} rev={0} updatedAt={0} isOwner={false} example />;
  const [loaded, v] = await Promise.all([loadDossier(id), viewer()]);
  if (!loaded) notFound();
  return <DossierView initial={loaded.dossier} rev={loaded.rev} updatedAt={loaded.updatedAt} isOwner={owns(v, loaded.owner)} />;
}
