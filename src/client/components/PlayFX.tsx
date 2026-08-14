export function PlayFX({ title }: { title: string | null }) {
  if (!title) return null;
  return (
    <div className="fx-layer" aria-live="assertive">
      <div key={title} className="fx-burst">
        {title}
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
