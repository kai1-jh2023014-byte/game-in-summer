export function Home({
  name,
  setName,
  code,
  setCode,
  busy,
  ready,
  onCreate,
  onJoin,
}: {
  name: string;
  setName: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  busy: string | null;
  ready: boolean;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <main className="screen home">
      <div className="hero">
        <p className="eyebrow">FAMILY CARD PARTY</p>
        <h1>NANAIRO</h1>
        <p className="tagline">七色のカードで、家族対戦。</p>
      </div>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          onJoin();
        }}
      >
        <label>
          ニックネーム
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: Kabuya"
            maxLength={16}
            autoComplete="nickname"
            enterKeyHint="done"
          />
        </label>
        <button type="button" className="btn primary xl" onClick={onCreate} disabled={!!busy || !ready}>
          🎮 ゲームを作る
        </button>
        <div className="or">または参加</div>
        <label>
          ルームコード
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="AB7K"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="btn secondary xl" disabled={!!busy || !ready}>
          🚀 ルームに入る
        </button>
      </form>
      {busy && <p className="status-msg">{busy}</p>}
    </main>
  );
}
