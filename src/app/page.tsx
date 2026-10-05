import Link from "next/link";
import { headers } from "next/headers";
import { Connect } from "@/components/Connect";
import { MyDossiers } from "@/components/MyDossiers";
import { SignOut } from "@/components/SignOut";
import { viewer } from "@/lib/auth";
import { activeToken, listDossiers } from "@/lib/repo";

/** Where agents should connect: the configured public URL, else this request's own origin. */
async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function Home() {
  const [v, origin] = await Promise.all([viewer(), siteOrigin()]);
  const user = v.user;
  let token: Awaited<ReturnType<typeof activeToken>> = null, files: Awaited<ReturnType<typeof listDossiers>> = [], dbError: string | null = null;
  if (user) {
    try { [token, files] = await Promise.all([activeToken(user.id), listDossiers(user.id)]); }
    catch (e) { dbError = e instanceof Error ? e.message : "The database is unavailable."; }
  }

  return (
    <div className="landing">
      <header className="bar">
        <span className="mark"><i />Dossier</span>
        <div className="fileline">research boards, written by your agent</div>
        {!user && !v.bypass && <Link className="btn" href="/login">Sign in</Link>}
      </header>

      <main className="land">
        <section className="hero">
          <h1>Ask your agent for a dossier.<br />Get a live research board.</h1>
          <p>
            Dossier is an MCP server. Connect it to Claude Code, Cursor or any agent that speaks MCP, then ask for research
            the way you normally would. Your agent searches the web, and files what it finds as cards on a board you can
            open, rearrange and share: findings, figures, timelines, players, articles, debates and open questions.
          </p>
          <p className="sub"><Link href="/d/example">Open the example board →</Link></p>
        </section>

        <section className="steps">
          <h2>&gt; How it works</h2>
          <ol>
            <li><b>Connect.</b> One command adds Dossier to your agent.</li>
            <li><b>Ask.</b> &ldquo;Make me a dossier on deep-sea mining.&rdquo; If the topic is broad, your agent asks which angle you want.</li>
            <li><b>Watch.</b> Your agent replies with a link. Cards land on the board while it researches.</li>
            <li><b>Explore.</b> Drag cards around and share the link. Ask your agent to dig deeper into any card, or to add images of it, and the new cards branch off it.</li>
          </ol>
        </section>

        <section className="connect">
          <h2>&gt; Connect your agent</h2>
          {user ? (
            dbError ? <p className="login-error">{dbError}</p>
              : <Connect origin={origin} hasToken={!!token} tokenCreatedAt={token?.createdAt ?? null} tokenLastUsedAt={token?.lastUsedAt ?? null} />
          ) : (
            <>
              <pre className="cmd">claude mcp add --transport http dossier {origin}/api/mcp \{"\n"}  --header &quot;Authorization: Bearer &lt;your token&gt;&quot;</pre>
              {v.bypass ? (
                <p className="note">Sign-in is switched off locally (<code>DOSSIER_AUTH=off</code>), and a token belongs to a real account. Turn sign-in back on to issue one.</p>
              ) : (
                <p className="note">Dossier is invite-only for now. <Link href="/login">Sign in</Link> to get your personal token.</p>
              )}
            </>
          )}
        </section>

        {user && !dbError && (
          <section className="files">
            <h2>&gt; Your dossiers</h2>
            <MyDossiers files={files} />
          </section>
        )}
      </main>
      <SignOut />
    </div>
  );
}
