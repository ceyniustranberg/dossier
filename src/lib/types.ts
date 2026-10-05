export type CardType =
  | "summary" | "fact" | "stat" | "timeline" | "player" | "article"
  | "lead" | "debate" | "question" | "chart" | "picture" | "gallery";

export interface Source { title: string; url: string }

/** An image found on a real web page: `src` is the page's own preview image, `page` is where it came from. */
export interface FoundImage { src: string; page: string; title: string; alt?: string }

/** What a card's action buttons do. Each can be clicked, or dragged to choose where the result lands. */
export type Action = "dig" | "images";

export interface Card {
  id: string;
  t: CardType;
  /** zero-based cluster index */
  c: number;
  x: number;
  y: number;
  /** true once the user has dragged the card; auto-layout then leaves it alone */
  moved?: boolean;
  /** set on "dig deeper" cards: the card they branch from, and where the branch column starts */
  parent?: string;
  ax?: number;
  ay?: number;
  /** id of a related card in another cluster */
  rel?: string;
  title?: string;
  body?: string;
  angle?: string;
  takeaways?: string[];
  num?: string;
  role?: string;
  items?: { when: string; what: string }[];
  pro?: string[];
  con?: string[];
  unit?: string;
  note?: string;
  bars?: { label: string; value: number }[];
  /** search query for lead / picture cards */
  q?: string;
  /** article cards: a real URL returned by web search */
  url?: string;
  outlet?: string;
  date?: string;
  sources?: Source[];
  /** gallery cards: images found for the parent card */
  images?: FoundImage[];
  /** "agent" when the user's own agent wrote the card over MCP, so its links are the agent's citations */
  via?: "agent";
}

export interface Tab { x: number; y: number; top: boolean }

export interface Dossier {
  id: string;
  query: string;
  brief: string;
  title: string;
  createdAt: number;
  clusters: string[];
  tabs: Tab[];
  cards: Card[];
  example?: boolean;
}

export type Size = { w: number; h: number };
export type Sizes = Record<string, Size>;

/** Events streamed from /api/research and /api/dig as NDJSON. */
export type StreamEvent =
  | { e: "status"; text: string }
  | { e: "plan"; title: string; angle: string; clusters: string[] }
  | { e: "summary"; body: string; takeaways: string[] }
  | { e: "card"; card: Omit<Card, "x" | "y"> }
  | { e: "error"; message: string }
  | { e: "done"; searches: number };

export const CARD_LABELS: Record<Exclude<CardType, "summary">, string> = {
  fact: "Finding", stat: "Figure", timeline: "Timeline", player: "Player", article: "Article",
  lead: "Coverage lead", debate: "Debate", question: "Open question", chart: "Chart", picture: "Picture lead", gallery: "Images",
};

export const fileNo = (d: Pick<Dossier, "example" | "createdAt">) =>
  d.example ? "DOS-0000" : "DOS-" + String(d.createdAt % 10000).padStart(4, "0");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
