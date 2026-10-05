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

export function imagesPrompt(o: { subject: string; file: string }) {
  return (
    `Run ONE web search for pages that show photographs or illustrations of: ${o.subject}` +
    (o.file && o.file !== o.subject ? ` (in the context of "${o.file}")` : "") +
    ". Prefer encyclopedia entries, museum and archive pages, and news articles about it, over shops and stock-photo sites. After the search, reply with the single word: done."
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
