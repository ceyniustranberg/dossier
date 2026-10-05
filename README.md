# Dossier

Ask your agent for a dossier, get a live research board.

Dossier is an MCP server with a board attached. You connect it to Claude Code, Cursor or any agent that speaks MCP, then ask for research the way you normally would ("make me a dossier on deep-sea mining"). If the topic is broad, the agent asks which angle you want. It starts a dossier, gives you a link, and files what it finds as cards while it researches: findings, figures, timelines, players, articles, debates, open questions and charts, grouped into clusters under folder tabs. The board updates live. You can drag cards around and share the link. To go further, ask your agent to dig deeper into a card or to add images of it, and the new cards branch off that card.

The server never calls a model. All research runs on your agent, so Dossier itself costs nothing per request beyond hosting.

Status: prototype. Sign-up is open or invite-only depending on `DOSSIER_ALLOWED_EMAILS`.

## Connect an agent

Sign in on the site, generate a token, and run the command it shows:

```bash
claude mcp add --transport http dossier https://<your-host>/api/mcp \
  --header "Authorization: Bearer <token>"
```

Other agents take the same URL and header as JSON (the site shows that too). A token is shown once; generating a new one revokes the old one.

### Tools

| Tool | What it does |
| --- | --- |
| `start_dossier` | Creates an empty board with a title, brief, angle and 5–6 clusters; returns its link |
| `add_cards` | Files up to 25 cards. The agent's own ids (`c1`…) map to stored ids for `rel` / `parent` links |
| `update_dossier` | Writes the summary card and takeaways, or changes the title or angle |
| `get_dossier` | Lists a dossier's cards, to avoid repeats or pick one to dig into |
| `dig_deeper` | Returns one card in full plus what's already on the board; the agent researches and files branches with `add_cards` |
| `list_dossiers` | The user's dossiers with links |
| `add_images` | The agent passes up to 10 page URLs it found; the server takes each page's preview image and places them next to a card |

The server's MCP `instructions` give the agent the workflow and the card shapes.

## Run it locally

Requires Node 20 or newer and a Supabase project.

```bash
npm install
cp .env.example .env.local   # fill in the Supabase keys, SUPABASE_SECRET_KEY and your email
npm run dev                  # http://localhost:3000
```

The Supabase keys are under **Project Settings → API Keys**: the publishable key (`sb_publishable_…`) and a secret key (`sb_secret_…`, create one if none is listed). Apply `supabase/migrations/0001_mcp.sql` to the project once (SQL editor or `supabase db push`). Point your agent at `http://localhost:3000/api/mcp` with a token generated from the local site.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | none | Required |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | none | Required for sign-in; `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works |
| `SUPABASE_SECRET_KEY` | none | Required. Server-only key for the dossier and token tables |
| `DOSSIER_ALLOWED_EMAILS` | none | Comma-separated allowlist, or `*` to let anyone sign up. Required in production, where an empty list lets nobody in |
| `NEXT_PUBLIC_SITE_URL` | request origin | Public URL used in the connect command and dossier links |
| `DOSSIER_AUTH` | none | `off` skips sign-in under `npm run dev`; ignored in production. Tokens still need a real account |

## How it works

```
your agent ──MCP + Bearer token──▶ /api/mcp ─────────┐
                                                     ▼
browser /d/<id> ──poll ?rev=──▶ /api/dossiers/<id> ◀── Supabase: dossiers, cards, api_tokens
owner's board ──drag──▶ /api/dossiers/<id>/cards/<cid>
```

- **Storage.** Dossiers and cards live in Supabase (`src/lib/repo.ts`). Row level security is on with no policies, so only the server, holding `SUPABASE_SECRET_KEY`, can read or write them. Each card row keeps the agent's content and the owner's positions in separate columns, so an agent write and a drag can never overwrite each other.
- **Live boards.** Every write bumps the dossier's `rev` in the same statement. A board polls `GET /api/dossiers/<id>?rev=N` every 2 seconds while the dossier changed in the last 10 minutes, then every 15. It gets a bodiless 304 until something changes. A card being dragged keeps its local position until its save lands.
- **Access.** A dossier's 22-character random id is its access control: anyone with the link can view the board. Boards are `noindex` and sent with `Referrer-Policy: no-referrer`, so the link doesn't leak to the sites cards point at. Only the owner can move, dig, add images or delete. Everyone else gets the board read-only.
- **Tokens.** `dsr_` plus 32 random bytes, stored only as a sha256 (`src/lib/token.ts`). Every MCP request re-checks the token's email against the allowlist, so removing an address cuts its agent off at once.
- **Links.** Cards from the agent keep a URL only if it's an ordinary public http(s) address (`sanitizeAgentCard` in `src/lib/cards.ts`). The server never saw the agent's searches, so those links are labelled "agent-cited". An article card without a usable URL becomes a "coverage lead". Every href is re-checked when rendered.
- **Images.** `add_images` fetches the start of each page the agent passed and takes its Open Graph or Twitter preview image (`src/lib/og.ts`), skipping logos and placeholders. So every image comes from a real page and links back to it. Page fetches go only to public hostnames, with each redirect re-checked.
- **Layout.** `src/lib/layout.ts` is a pure function: measured card sizes in, positions out. The summary sits on the left and clusters run to its right. Branches the agent adds (it knows nothing of the canvas) get a lane each to the right of the clusters. Auto-placed cards never land on another card.
- **Prompts.** The agent's playbook is `INSTRUCTIONS` in `src/lib/mcp.ts`, plus each tool's description.

## Deploying

Deployed on Vercel; pushes to `main` deploy to production.

1. Apply the migration to the production Supabase project.
2. Under **Settings → Environment Variables**, set the variables above; at minimum the two `NEXT_PUBLIC_SUPABASE_*` values, `SUPABASE_SECRET_KEY` (mark it Sensitive) and `DOSSIER_ALLOWED_EMAILS`. `NEXT_PUBLIC_*` values are inlined at build time, so redeploy after changing them. Without the secret key the dossier, token and MCP routes answer 503.
3. **Settings → Deployment Protection** decides who can reach the app at all. Agents can't get through Vercel's login wall, so to use the MCP server, production has to be public (Standard Protection), leaving the app's own sign-in and the allowlist as the gate. Protecting all deployments keeps the board usable in your own browser, but no agent can connect.
4. **For open sign-up** (`DOSSIER_ALLOWED_EMAILS=*`), set up custom SMTP under **Authentication → Emails** in Supabase (Resend, Postmark and the like). The built-in sender allows only a few emails an hour for the whole project, so public sign-in links would soon stop arriving. Each account is capped at 100 dossiers of 250 cards, and tool calls are rate-limited per user.
5. Add the production origin under **Authentication → URL Configuration** in Supabase, or magic links won't redirect back.

Supabase pauses free projects after 7 days without a database request.

## Scripts

`npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm test`

`npm test` runs the unit tests on Node's built-in runner, which executes the TypeScript directly. They cover card sanitizing and agent links, tokens and ids, preview-image extraction and the private-address filter, and the layout's no-overlap and lane guarantees.
