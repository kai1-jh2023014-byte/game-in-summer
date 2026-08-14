export function PlayFX({ banner }: { banner: { title: string; hint: string } | null }) {
  if (!banner) return null;
  return (
    <div className="fx-layer" aria-live="assertive">
      <div key={banner.title + banner.hint} className="fx-burst">
        <div>{banner.title}</div>
        {banner.hint && <p className="fx-hint">{banner.hint}</p>}
      </div>
    </div>
  );
}

export function EventLog({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <ol className="event-log" aria-label="最近起きたこと">
      {lines.map((line, i) => (
        <li key={`${i}-${line}`}>{line}</li>
      ))}
    </ol>
  );
}

export function HandPop({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="hand-pop" key={text}>
      {text}
    </div>
  );
}
