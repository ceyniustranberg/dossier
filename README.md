# Dossier

Type a topic, get an in-depth research board.

You enter a high-level query such as "flying cars". If the query is broad or ambiguous ("US"), the research desk asks which angle you want and offers tappable options. Claude then searches the web and lays out a dossier as cards on a Miro-like canvas: a central summary, clusters under folder tabs, and cards for findings, figures, timelines, players, real articles, debates, open questions and charts. Any card can be expanded with **Dig deeper**, which branches new cards from it.

Status: prototype, single user, no accounts.

## Run it

Requires Node 20 or newer and an [Anthropic API key](https://console.anthropic.com/). Web search must be enabled for your organisation in the Anthropic Console.

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | Required |
| `DOSSIER_MODEL` | `claude-sonnet-5` | Writes the dossier |
| `DOSSIER_FAST_MODEL` | `claude-haiku-4-5` | Intake triage (angle questions) |
| `DOSSIER_WEB_SEARCH` | `on` | `off` writes from model knowledge only |

Each dossier makes one long Claude request with up to 8 web searches; Dig deeper uses up to 3. Both are billed to your API key.

## How it works

```
browser                                   server (Next.js route handlers)
Desk (chat, files, streaming)   --POST--> /api/triage    fast model -> ready | question + options
Board (pan, zoom, drag, links)  --POST--> /api/research  Claude + web search -> NDJSON card stream
CardView                        --POST--> /api/dig       same, scoped to one card
```

- **Streaming.** Claude is asked to write JSON Lines, one card per line. `src/lib/anthropic.ts` parses each line as it completes, validates it (`src/lib/cards.ts`) and forwards it to the browser as NDJSON, so cards land on the board while the rest is still being written. Web searches show up as status lines.
- **No invented links.** The server records every URL the web search tool actually returned. A card's `url` or `sources` survive only if they are on that list; an article card without a real URL is downgraded to an unverified "coverage lead" that links to a news search instead.
- **Layout.** `src/lib/layout.ts` is a pure function: measured card sizes in, positions out. Cards you drag are marked `moved` and never auto-placed again.
- **Storage.** `src/lib/store.ts` keeps files in the browser's localStorage. It is the one module to replace when a database arrives.
- **Prompts** live in `src/lib/prompts.ts`.

## Deploying

Deployed on Vercel. The app itself still has **no authentication or rate limiting** in code: any request that reaches `/api/research` spends your API key, and each run is one long Claude request plus up to 8 web searches. Access is therefore controlled at the platform edge, not in the app.

1. Import the repo at [vercel.com/new](https://vercel.com/new). Next.js 16 needs no build configuration.
2. Set `ANTHROPIC_API_KEY` under **Settings -> Environment Variables**.
3. Under **Settings -> Deployment Protection**, turn on **Vercel Authentication** and set the scope to **All Deployments**. The default scope, Standard Protection, deliberately leaves production public. Vercel Authentication at this scope is free on every plan; Password Protection is Pro-only.

If you ever remove that protection, add auth and rate limiting to the routes first.

Research requests run for one to three minutes, so the routes declare `maxDuration = 300`. Fluid compute makes 300s both the default and the maximum on Hobby, so the free tier is enough. The NDJSON stream emits a blank-line heartbeat every 15s, because a web-search turn can produce no output for a minute and idle connections get closed in transit.

## Roadmap

- Accounts and a database behind `store.ts`; shareable read-only boards
- Real pictures on picture cards (Open Graph images from cited articles)
- Multi-select angles, and follow-up questions from the chat that add to an existing board
- Scheduled refresh of a dossier, with new cards flagged
- Export to PDF / Markdown

## Scripts

`npm run dev`, `npm run build`, `npm run start`, `npm run lint`
