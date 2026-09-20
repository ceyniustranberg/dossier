const CARD_SPEC = (web: boolean) => [
  '{"id":"c1","c":0,"t":"fact","title":"...","body":"2-4 sentences"}',
  '{"id":"c2","c":1,"t":"stat","num":"short figure with unit","title":"what the figure measures","body":"context, and say if approximate"}',
  '{"id":"c3","c":0,"t":"timeline","title":"...","items":[{"when":"1956","what":"..."}]}  (4-7 items)',
  '{"id":"c4","c":2,"t":"player","title":"name of person, company, institution or place","role":"what they are","body":"why they matter"}',
  web
    ? '{"id":"c5","c":3,"t":"article","title":"exact headline of a real search result","outlet":"publication","date":"date if known","body":"what the piece reports and why it matters","url":"exact URL from your search results"}'
    : '{"id":"c5","c":3,"t":"lead","title":"a news thread worth following (NOT an invented article headline)","body":"what to look for","q":"news search query"}',
  '{"id":"c6","c":4,"t":"debate","title":"the contested claim, as a question","pro":["..."],"con":["..."]}',
  '{"id":"c7","c":5,"t":"question","title":"an open question","body":"why it is unresolved"}',
  '{"id":"c8","c":1,"t":"chart","title":"...","unit":"km","note":"source caveat","bars":[{"label":"...","value":123}]}  (3-6 bars, only for numbers you are reasonably sure of)',
  '{"id":"c9","c":0,"t":"picture","title":"an iconic image of the topic","body":"what it shows and why it matters","q":"image search query"}',
].join("\n");

const RULES = (web: boolean) =>
  "Rules: be accurate and specific, with names, dates and numbers where you know them. Never invent quotes, URLs, article titles or statistics; when a number is approximate say so. Plain text only inside strings, no markdown. Write in the language of the request." +
  (web
    ? ' On any card whose facts came from a search result, add "sources":["<exact result URL>"] (at most 2). Only use URLs that appeared in your search results, copied exactly; any other URL will be discarded.'
    : " You have no web access here: when events may have moved on since your knowledge ends, say so in the card.");

const today = () => new Date().toISOString().slice(0, 10);

export function triagePrompt(query: string, asked: { q: string; a: string }[]) {
  const qa = asked.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n");
  return (
    "You are the intake desk of a research app that builds in-depth dossiers on a topic. Decide whether the request is specific enough to research well, or so broad that the user should first choose an angle.\n\n" +
    `Request: ${JSON.stringify(query)}\n` + (qa ? `Clarifications so far:\n${qa}\n` : "") +
    '\nGuidance: a request like "flying cars", "deep-sea mining" or "history of espresso" is specific enough. A request like "US", "AI", "Apple", "music" or a bare name with several meanings is too broad or ambiguous: ask ONE short question with 3 to 6 short tappable options (2-4 words each). If clarifications already narrow it enough, it is ready. Reply in the language of the request.\n\n' +
    'Reply with only JSON: {"ready":true,"brief":"one sentence stating exactly what to research"} or {"ready":false,"question":"...","options":["...","..."]}'
  );
}

export function researchPrompt(query: string, brief: string, web: boolean, searches: number) {
  return (
    "You are the research engine of Dossier, an app that lays out an in-depth briefing on a topic as cards on a whiteboard.\n\n" +
    `Today is ${today()}.\nResearch brief: ${brief}\n(Original request: ${JSON.stringify(query)})\n\n` +
    (web
      ? `Step 1: run up to ${searches} web searches to gather recent developments, news coverage, key numbers and anything you are unsure of. Do not write commentary between searches.\nStep 2: write the dossier, combining what you found with your own knowledge.\n\n`
      : "Write the dossier from your own knowledge.\n\n") +
    "Output format for the dossier: JSON Lines. One complete JSON object per line, no code fences, no text outside the objects, no line breaks inside an object.\n" +
    'Line 1: {"t":"plan","title":"short file title","angle":"one line on the scope taken","clusters":["...", "..."]}  (5 or 6 clusters, 1-3 words each, covering the topic from distinct sides)\n' +
    'Line 2: {"t":"summary","body":"two short paragraphs separated by \\n\\n","takeaways":["4 or 5 one-line takeaways"]}\n' +
    `Then 18 to 22 card lines. "c" is the zero-based cluster index. Give each cluster 3 or 4 cards and mix the types; include at least one timeline, two stats, ${web ? "four articles" : "two leads"}, one debate, two questions, one picture, and a chart only if you have solid numbers. Optionally add "rel":"<id of an earlier card in another cluster>" on up to 4 cards that are strongly connected. Card shapes:\n` +
    CARD_SPEC(web) + "\n\n" + RULES(web)
  );
}

export function digPrompt(o: { title: string; brief: string; card: unknown; others: string[]; web: boolean; searches: number }) {
  return (
    "You are the research engine of Dossier, an app that lays out research as cards on a whiteboard. " +
    `Today is ${today()}. The user is reading the file "${o.title}"${o.brief ? ` (brief: ${o.brief})` : ""} and wants to go deeper on ONE card:\n${JSON.stringify(o.card)}\n\n` +
    `Cards already on the board (do not repeat them):\n${o.others.map((t) => "- " + t).join("\n").slice(0, 3000)}\n\n` +
    (o.web ? `First run up to ${o.searches} web searches on the specifics of that card, without commentary. Then write ` : "Write ") +
    "3 or 4 new cards that go a level deeper on that one card: mechanisms, specifics, numbers, people, counter-arguments, what to read next. Output JSON Lines: one JSON object per line, no code fences, nothing else. Card shapes (ignore the id and c values):\n" +
    CARD_SPEC(o.web) + "\n\n" + RULES(o.web)
  );
}
