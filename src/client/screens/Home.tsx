export function Home({
  name,
  setName,
  code,
  setCode,
  busy,
  ready,
  intro,
  onCreate,
  onJoin,
  onDemo,
  onDismissIntro,
}: {
  name: string;
  setName: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  busy: string | null;
  ready: boolean;
  intro: boolean;
  onCreate: () => void;
  onJoin: () => void;
  onDemo: () => void;
  onDismissIntro: (skipNext: boolean) => void;
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
          {!ready ? "🎮 接続中..." : "🎮 ゲームを作る"}
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
        <button type="button" className="btn ghost xl" onClick={onDemo} style={{ marginTop: 10 }}>
          👀 デモプレイを見る
        </button>
      </form>
      {busy && <p className="status-msg">{busy}</p>}
      {!ready && !busy && <p className="status-msg">🎮 サーバーに接続しています...</p>}
      {ready && !busy && <p className="status-msg ok">接続OK</p>}

      {intro && (
        <div className="overlay" role="dialog" aria-label="はじめて遊びますか？">
          <div className="overlay-card">
            <h2>はじめて遊びますか？</h2>
            <p className="hint">出し方・+2・UNO を、自分のペースで確認できます。</p>
            <button type="button" className="btn primary xl" onClick={onDemo}>
              👀 デモプレイを見る
            </button>
            <button type="button" className="btn secondary xl" onClick={() => onDismissIntro(false)}>
              🎮 すぐ遊ぶ
            </button>
            <label className="hint" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                onChange={(e) => {
                  if (e.target.checked) onDismissIntro(true);
                }}
              />{" "}
              次から自動的にデモを表示しない
            </label>
          </div>
        </div>
      )}
    </main>
  );
}
