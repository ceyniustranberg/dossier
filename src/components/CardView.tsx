import { memo } from "react";
import { CARD_LABELS, fileNo, fmtDate, type Card } from "@/lib/types";

interface Props {
  card: Card;
  example: boolean;
  createdAt: number;
  fileTitle: string;
  canDig: boolean;
  dragging: boolean;
  z?: number;
  onDig: (id: string) => void;
  measure: (id: string, el: HTMLElement | null) => void;
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

function CardViewInner({ card: c, example, createdAt, fileTitle, canDig, dragging, z, onDig, measure }: Props) {
  const file = { example, createdAt, title: fileTitle };
  const style = { left: c.x, top: c.y, zIndex: z };
  const cls = `card ${c.t}${dragging ? " dragging" : ""}`;

  if (c.t === "summary") {
    const paras = (c.body || "").split(/\n+/).filter(Boolean);
    return (
      <article className={cls} style={style} data-id={c.id} ref={(el) => measure(c.id, el)}>
        <div className="kind">
          <span>{fileNo(file)} · opened {fmtDate(file.createdAt)}</span>
          {file.example && <span className="stamp">Example</span>}
        </div>
        <h2>{c.title || file.title}</h2>
        {c.angle && <div className="angle">{c.angle}</div>}
        {paras.length ? paras.map((p, i) => <p key={i}>{p}</p>) : <p className="sub">Writing the summary…</p>}
        {!!c.takeaways?.length && <ul>{c.takeaways.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        <div className="foot"><span className="sub">Written by Claude. Check the linked sources before relying on it.</span></div>
      </article>
    );
  }

  const bars = c.bars ?? [], max = Math.max(1, ...bars.map((b) => b.value));
  const link =
    c.t === "article" && c.url ? { href: c.url, text: "Read article" }
    : c.t === "lead" ? { href: "https://news.google.com/search?q=" + encodeURIComponent(c.q || c.title || ""), text: "Find coverage" }
    : c.t === "picture" ? { href: "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(c.q || c.title || ""), text: "Find images" }
    : null;

  return (
    <article className={cls} style={style} data-id={c.id} ref={(el) => measure(c.id, el)}>
      <div className="kind">
        <span>{CARD_LABELS[c.t]}</span>
        {(c.t === "lead" || c.t === "picture") && <em>unverified</em>}
      </div>
      {c.t === "picture" && <div className="pic">picture slot</div>}
      {c.t === "stat" && <div className="num">{c.num}</div>}
      {c.title && <h3>{c.title}</h3>}
      {c.t === "article" && <p className="sub">{[c.outlet || (c.url && host(c.url)), c.date].filter(Boolean).join(" · ")}</p>}
      {c.role && <p className="sub">{c.role}</p>}
      {c.t === "timeline" && <ul className="tl">{(c.items ?? []).map((i, k) => <li key={k}><b>{i.when}</b>{i.what}</li>)}</ul>}
      {c.t === "debate" && (
        <div className="sides">
          <div><h4>For</h4><ul>{(c.pro ?? []).map((x, k) => <li key={k}>{x}</li>)}</ul></div>
          <div><h4>Against</h4><ul>{(c.con ?? []).map((x, k) => <li key={k}>{x}</li>)}</ul></div>
        </div>
      )}
      {c.t === "chart" && (
        <>
          <div className="bars">
            {bars.map((b, k) => (
              <div className="row" key={k}>
                <span>{b.label}</span><span className="v">{b.value.toLocaleString("en")} {c.unit}</span>
                <div className="track"><div className="fill" style={{ width: `${Math.max(0, (b.value / max) * 100).toFixed(1)}%` }} /></div>
              </div>
            ))}
          </div>
          {c.note && <p className="sub">{c.note}</p>}
        </>
      )}
      {c.body && <p>{c.body}</p>}
      {!!c.sources?.length && (
        <ul className="srcs">{c.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>{host(s.url)}</a></li>)}</ul>
      )}
      <div className="foot">
        {link ? <a href={link.href} target="_blank" rel="noopener noreferrer">{link.text}</a> : <span />}
        <button type="button" disabled={!canDig} onClick={() => onDig(c.id)}>Dig deeper</button>
      </div>
    </article>
  );
}

export const CardView = memo(CardViewInner);
