# Dossier

Ask your agent for a dossier, get a live research board.

Dossier is an MCP server with a board attached. You connect it to Claude Code, Cursor or any agent that speaks MCP, then ask for research the way you normally would ("make me a dossier on deep-sea mining"). If the topic is broad, the agent asks which angle you want. It starts a dossier, gives you a link, and files what it finds as cards while it researches: findings, figures, timelines, players, articles, debates, open questions and charts, grouped into clusters under folder tabs. The board updates live. You can drag cards around, and pull **Dig deeper** out of any card, or **Find images** on a picture card, to branch new cards off it, either from the board or by asking your agent.

Status: prototype, invite-only (an email allowlist).

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
| `list_dossiers` | The user's dossiers with links |
| `find_images` | Places real images next to a card (runs one web search on the server's OpenRouter key) |

The server's MCP `instructions` give the agent the workflow and the card shapes.

## Run it locally

Requires Node 20 or newer, a Supabase project, and optionally an [OpenRouter API key](https://openrouter.ai/settings/keys) for the board's own Dig deeper and Find images.

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
| `DOSSIER_ALLOWED_EMAILS` | none | Comma-separated allowlist. Required in production, where an empty list lets nobody in |
| `NEXT_PUBLIC_SITE_URL` | request origin | Public URL used in the connect command and dossier links |
| `OPENROUTER_API_KEY` | none | Board-side Dig deeper and Find images |
| `DOSSIER_MODEL` | `anthropic/claude-sonnet-5` | Model for board-side Dig deeper |
| `DOSSIER_FAST_MODEL` | `anthropic/claude-haiku-4.5` | Model for image search |
| `DOSSIER_WEB_SEARCH` | `on` | `off` makes Dig deeper write from model knowledge, and disables Find images |
| `DOSSIER_AUTH` | none | `off` skips sign-in under `npm run dev`; ignored in production. Tokens still need a real account |

## How it works

```
your agent ──MCP + Bearer token──▶ /api/mcp ─────────┐
                                                     ▼
browser /d/<id> ──poll ?rev=──▶ /api/dossiers/<id> ◀── Supabase: dossiers, cards, api_tokens
owner's board ──drag / dig / images──▶ /api/dossiers/<id>/cards/<cid>, /api/dig, /api/images
```

- **Storage.** Dossiers and cards live in Supabase (`src/lib/repo.ts`). Row level security is on with no policies, so only the server, holding `SUPABASE_SECRET_KEY`, can read or write them. Each card row keeps the agent's content and the owner's positions in separate columns, so an agent write and a drag can never overwrite each other.
- **Live boards.** Every write bumps the dossier's `rev` in the same statement. A board polls `GET /api/dossiers/<id>?rev=N` every 2 seconds while the dossier changed in the last 10 minutes, then every 15. It gets a bodiless 304 until something changes. A card being dragged keeps its local position until its save lands.
- **Access.** A dossier's 22-character random id is its access control: anyone with the link can view the board. Boards are `noindex` and sent with `Referrer-Policy: no-referrer`, so the link doesn't leak to the sites cards point at. Only the owner can move, dig, add images or delete. Everyone else gets the board read-only.
- **Tokens.** `dsr_` plus 32 random bytes, stored only as a sha256 (`src/lib/token.ts`). Every MCP request re-checks the token's email against the allowlist, so removing an address cuts its agent off at once.
- **Links.** Cards from the agent keep a URL only if it's an ordinary public http(s) address (`sanitizeAgentCard` in `src/lib/cards.ts`). The server never saw the agent's searches, so those links are labelled "agent-cited". Dig deeper from the board still runs the original server pipeline, where a link survives only if OpenRouter's web search really cited it. An article card without a usable URL becomes a "coverage lead". Every href is re-checked when rendered.
- **Images.** Find images runs one web search, fetches the start of each cited page and takes its Open Graph or Twitter preview image (`src/lib/og.ts`), skipping logos and placeholders. Page fetches go only to public hostnames, with each redirect re-checked.
- **Layout.** `src/lib/layout.ts` is a pure function: measured card sizes in, positions out. The summary sits on the left and clusters run to its right. Branches dropped at a spot start there. Branches the agent adds (it knows nothing of the canvas) get a lane each to the right of the clusters. Auto-placed cards never land on another card.
- **Prompts** for board-side Dig deeper live in `src/lib/prompts.ts`. The agent's playbook is `INSTRUCTIONS` in `src/lib/mcp.ts`.

## Deploying

Deployed on Vercel; pushes to `main` deploy to production.

1. Apply the migration to the production Supabase project.
2. Under **Settings → Environment Variables**, set the variables above; at minimum the two `NEXT_PUBLIC_SUPABASE_*` values, `SUPABASE_SECRET_KEY` (mark it Sensitive) and `DOSSIER_ALLOWED_EMAILS`. `NEXT_PUBLIC_*` values are inlined at build time, so redeploy after changing them. Without the secret key the dossier, token and MCP routes answer 503.
3. **Settings → Deployment Protection** decides who can reach the app at all. Agents can't get through Vercel's login wall, so to use the MCP server, production has to be public (Standard Protection), leaving the app's own sign-in and the allowlist as the gate. Protecting all deployments keeps the board usable in your own browser, but no agent can connect.
4. Add the production origin under **Authentication → URL Configuration** in Supabase, or magic links won't redirect back.

Supabase pauses free projects after 7 days without a database request.

## Scripts

`npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm test`

`npm test` runs the unit tests on Node's built-in runner, which executes the TypeScript directly. They cover card sanitizing (both the server's search allow-list and agent links), tokens and ids, preview-image extraction and the private-address filter, and the layout's no-overlap and lane guarantees.
