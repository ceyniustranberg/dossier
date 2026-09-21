# Dossier

Type a topic, get an in-depth research board.

You enter a high-level query such as "flying cars". If the query is broad or ambiguous ("US"), the research desk asks which angle you want and offers tappable options. The model then searches the web and lays out a dossier as cards on a Miro-like canvas: a central summary, clusters under folder tabs, and cards for findings, figures, timelines, players, real articles, debates, open questions and charts. Any card can be expanded with **Dig deeper**, which branches new cards from it.

Status: prototype. Sign-in is handled by Supabase; boards are still per-browser.

## Run it

Requires Node 20 or newer and an [OpenRouter API key](https://openrouter.ai/settings/keys). Models are called through OpenRouter, so any model it lists works; web search uses its `openrouter:web_search` server tool.

```bash
npm install
cp .env.example .env.local   # then add your OPENROUTER_API_KEY
npm run dev                  # http://localhost:3000
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | none | Required |
| `DOSSIER_MODEL` | `anthropic/claude-sonnet-5` | Writes the dossier. Any [OpenRouter model id](https://openrouter.ai/models) that supports tool calling |
| `DOSSIER_FAST_MODEL` | `anthropic/claude-haiku-4.5` | Intake triage (angle questions) |
| `DOSSIER_WEB_SEARCH` | `on` | `off` writes from model knowledge only |
| `NEXT_PUBLIC_SUPABASE_URL` | none | Turns auth on (with the key below) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | none | Publishable key; `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works |
| `DOSSIER_ALLOWED_EMAILS` | none | Comma-separated allowlist. Empty means any signed-in user |

Each dossier makes one long model request with up to 8 web searches; Dig deeper uses up to 3. Both are billed to your OpenRouter credits, searches at the search engine's per-request rate on top of tokens.

## How it works

```
browser                                   server (Next.js route handlers)
Desk (chat, files, streaming)   --POST--> /api/triage    fast model -> ready | question + options
Board (pan, zoom, drag, links)  --POST--> /api/research  model + web search -> NDJSON card stream
CardView                        --POST--> /api/dig       same, scoped to one card
```

- **Streaming.** The model is asked to write JSON Lines, one card per line. `src/lib/llm.ts` reads the OpenRouter stream, parses each line as it completes, validates it (`src/lib/cards.ts`) and forwards it to the browser as NDJSON, so cards land on the board while the rest is still being written. Web searches show up as status lines.
- **No invented links.** The server records every URL the web search tool actually cited (OpenRouter `url_citation` annotations). A card that links to a URL not yet cited is held back until the stream ends and checked again, since citations can arrive after the text that uses them. A card's `url` or `sources` survive only if they are on that list; an article card without a real URL is downgraded to an unverified "coverage lead" that links to a news search instead.
- **Layout.** `src/lib/layout.ts` is a pure function: measured card sizes in, positions out. Cards you drag are marked `moved` and never auto-placed again.
- **Storage.** `src/lib/store.ts` keeps files in the browser's localStorage. It is the one module to replace when a database arrives. Auth is in place, so the Supabase project is already there to put it behind.
- **Prompts** live in `src/lib/prompts.ts`.

## Auth

Sign-in is a Supabase magic link: enter an email, click the link, land back signed in. There are no passwords to store and no sign-up form.

With `NEXT_PUBLIC_SUPABASE_URL` and the publishable key set, auth is enforced. Without them the app runs unauthenticated in development — so `npm run dev` still works on a fresh clone — but **a production build refuses every API request** rather than silently shipping an open app.

Set `DOSSIER_ALLOWED_EMAILS` to the addresses that may sign in. Without it, anyone who can create an account on your Supabase project can spend your OpenRouter credits. The allowlist is checked twice: before a link is mailed, and again when the link is redeemed.

Deploying somewhere other than localhost means adding that origin under **Authentication -> URL Configuration** in the Supabase dashboard, or the magic link will refuse to redirect back.

- `src/proxy.ts` refreshes the session cookie and bounces signed-out visitors to `/login`. Next.js 16 renamed `middleware.ts` to `proxy.ts`; most Supabase guides still show the old name.
- `src/lib/auth.ts` is the data access layer and the thing that actually enforces access. `verifySession()` calls `getUser()`, which revalidates the JWT — `getSession()` only reads the cookie and is not trustworthy on the server.
- Every API route calls `guard()` before spending a token. API routes return a JSON `401` rather than redirecting, so `fetch` gets an error it can read instead of an HTML login page.

There is still **no rate limiting**: a signed-in user can spend your API key freely. Keep the allowlist short.

## Deploying

Deployed on Vercel.

1. Import the repo at [vercel.com/new](https://vercel.com/new). Next.js 16 needs no build configuration.
2. Under **Settings -> Environment Variables**, set `OPENROUTER_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, the Supabase publishable key, and `DOSSIER_ALLOWED_EMAILS`. The `NEXT_PUBLIC_*` values are inlined at build time, so set them *before* the build you intend to ship and redeploy after changing them.
3. Optionally keep **Settings -> Deployment Protection** on **Vercel Authentication**, scoped to **All Deployments**, as a second layer in front of the app's own login. Note that the default scope, Standard Protection, deliberately leaves production domains public. Vercel Authentication at this scope is free on every plan; Password Protection is Pro-only.

Research requests run for one to three minutes, so the routes declare `maxDuration = 300`. Fluid compute makes 300s both the default and the maximum on Hobby, so the free tier is enough. The NDJSON stream emits a blank-line heartbeat every 15s, because a web-search turn can produce no output for a minute and idle connections get closed in transit.

Supabase pauses free projects after 7 days without a database request, and the free plan allows 2 active projects at a time.

## Roadmap

- A database behind `store.ts` so boards follow the account rather than the browser; shareable read-only boards
- Real pictures on picture cards (Open Graph images from cited articles)
- Multi-select angles, and follow-up questions from the chat that add to an existing board
- Scheduled refresh of a dossier, with new cards flagged
- Export to PDF / Markdown

## Scripts

`npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm test`

`npm test` runs the unit tests on Node's built-in runner, which executes the TypeScript directly — there is no test framework to install. `src/lib/cards.test.mts` covers `sanitizeCard`, the function that enforces the URL allow-list behind the "no invented links" guarantee above.
